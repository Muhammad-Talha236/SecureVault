import path from "node:path";
import crypto from "node:crypto";
import mongoose from "mongoose";
import Document from "../models/document.model.js";
import DocumentPermission from "../models/documentPermission.model.js";
import AuditLog from "../models/auditLog.model.js";
import User from "../models/user.model.js";
import { encryptBuffer, decryptBuffer, computeSha256 } from "../utils/encryption.utils.js";
import { supabase, SUPABASE_BUCKET } from "../config/supabase.js";
import { logAuditEvent } from "../utils/audit.utils.js";
import { AppError } from "../middleware/error.middleware.js";

/**
 * Format bytes into human-readable strings (e.g. 2.4 MB)
 */
export const formatBytes = (bytes) => {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

/**
 * Uploads, encrypts with AES-256-GCM, stores ciphertext in Supabase,
 * and persists document metadata in MongoDB.
 *
 * POST /api/documents
 */
export const uploadDocument = async (req, res, next) => {
  const file = req.file;

  if (!file) {
    throw new AppError("No file uploaded. Please select a document.", 400);
  }

  const userId = req.user._id;
  let uploadedStorageKey = null;

  try {
    // 1. Calculate SHA-256 integrity hash of original plaintext before encryption
    const integrityHash = computeSha256(file.buffer);

    // 2. Encrypt original file Buffer using AES-256-GCM
    const encryptionResult = encryptBuffer(file.buffer);

    // 3. Generate server-side unpredictable, collision-resistant storage key
    const uniqueFileId = crypto.randomUUID();
    const storageKey = `${userId}/${uniqueFileId}.enc`;
    uploadedStorageKey = storageKey;

    // 4. Upload ONLY the ciphertext buffer to private Supabase bucket
    const { error: uploadError } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .upload(storageKey, encryptionResult.ciphertext, {
        contentType: "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      throw new AppError(
        `Failed to store encrypted document: ${uploadError.message}`,
        502
      );
    }

    // 5. Persist document metadata in MongoDB (owner strictly from req.user._id)
    let savedDocument;
    try {
      savedDocument = await Document.create({
        owner: userId,
        originalName: file.originalname.trim(),
        storageKey,
        mimeType: file.mimetype.toLowerCase(),
        sizeBytes: file.size,
        encryption: {
          algorithm: encryptionResult.algorithm,
          iv: encryptionResult.iv,
          authTag: encryptionResult.authTag,
          keyVersion: encryptionResult.keyVersion,
        },
        integrity: {
          algorithm: "SHA-256",
          hash: integrityHash,
        },
        status: "ACTIVE",
      });
    } catch (mongoError) {
      // 6. Rollback / cleanup ciphertext from Supabase if MongoDB persistence fails
      console.error(
        `[UPLOAD_ROLLBACK] MongoDB persistence failed for storageKey: ${storageKey}. Attempting cleanup...`
      );
      try {
        const { error: cleanupError } = await supabase.storage
          .from(SUPABASE_BUCKET)
          .remove([storageKey]);
        if (cleanupError) {
          console.error(
            `[CLEANUP_FAILURE] Could not remove orphaned file "${storageKey}": ${cleanupError.message}`
          );
        }
      } catch (cleanupEx) {
        console.error(
          `[CLEANUP_FAILURE] Exception removing orphaned file "${storageKey}": ${cleanupEx.message}`
        );
      }
      throw mongoError;
    }

    // 7. Record successful audit log
    await logAuditEvent({
      actor: userId,
      action: "DOCUMENT_UPLOAD",
      resourceType: "DOCUMENT",
      resourceId: savedDocument._id,
      outcome: "SUCCESS",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: {
        originalName: savedDocument.originalName,
        sizeBytes: savedDocument.sizeBytes,
        mimeType: savedDocument.mimeType,
        keyVersion: encryptionResult.keyVersion,
      },
    });

    // 8. Return safe response without leaking encryption keys or ciphertext
    return res.status(201).json({
      success: true,
      message: "Document uploaded, encrypted, and saved successfully.",
      document: {
        id: savedDocument._id,
        originalName: savedDocument.originalName,
        mimeType: savedDocument.mimeType,
        sizeBytes: savedDocument.sizeBytes,
        formattedSize: formatBytes(savedDocument.sizeBytes),
        createdAt: savedDocument.createdAt,
      },
    });
  } catch (err) {
    // Record audit failure
    await logAuditEvent({
      actor: userId,
      action: "DOCUMENT_UPLOAD",
      resourceType: "DOCUMENT",
      resourceId: null,
      outcome: "FAILURE",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: {
        originalName: file?.originalname,
        sizeBytes: file?.size,
        errorMessage: err.message,
      },
    });

    next(err);
  }
};

/**
 * Retrieves dashboard telemetry, recent files, and recent audit activity
 * for the authenticated user (or platform-wide for Admin).
 *
 * GET /api/documents/dashboard
 */
export const getDashboardData = async (req, res) => {
  const isAdmin = req.user.role === "ADMIN";
  const userId = req.user._id;

  // Filter documents by ownership for standard users
  const docFilter = isAdmin ? { status: "ACTIVE" } : { owner: userId, status: "ACTIVE" };

  // 1. Fetch total document count
  const totalDocuments = await Document.countDocuments(docFilter);

  // 2. Fetch aggregate storage used
  const storageAgg = await Document.aggregate([
    { $match: docFilter },
    { $group: { _id: null, totalBytes: { $sum: "$sizeBytes" } } },
  ]);
  const totalSizeBytes = storageAgg[0]?.totalBytes || 0;

  // 3. Fetch 5 most recent documents (metadata only, no encryption keys)
  const recentDocs = await Document.find(docFilter)
    .sort({ createdAt: -1 })
    .limit(5)
    .select("_id originalName mimeType sizeBytes createdAt updatedAt")
    .lean();

  const formattedRecentFiles = recentDocs.map((doc) => ({
    id: doc._id,
    name: doc.originalName,
    size: formatBytes(doc.sizeBytes),
    rawBytes: doc.sizeBytes,
    type: doc.mimeType,
    createdAt: doc.createdAt,
  }));

  // 4. Role-specific telemetry
  if (isAdmin) {
    // Admin metrics: Registered users, platform documents, storage, security events
    const [totalUsers, securityEventsCount, recentUsers, rawAuditLogs, rawSecurityEvents] = await Promise.all([
      User.countDocuments({}),
      AuditLog.countDocuments({
        $or: [
          { outcome: { $in: ["DENIED", "FAILURE"] } },
          { action: { $in: ["ACCESS_DENIED", "LOGIN_FAILURE"] } },
        ],
      }),
      User.find({})
        .sort({ createdAt: -1 })
        .limit(5)
        .select("_id name email role createdAt")
        .lean(),
      AuditLog.find({})
        .populate("actor", "name email role")
        .sort({ createdAt: -1 })
        .limit(8)
        .lean(),
      AuditLog.find({
        $or: [
          { outcome: { $in: ["DENIED", "FAILURE"] } },
          { action: { $in: ["ACCESS_DENIED", "LOGIN_FAILURE"] } },
        ],
      })
        .populate("actor", "name email role")
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
    ]);

    const formattedActivities = rawAuditLogs.map((log) => {
      let title = log.action;
      if (log.action === "DOCUMENT_UPLOAD") {
        title = `Uploaded ${log.metadata?.originalName || "document"}`;
      } else if (log.action === "LOGIN_SUCCESS") {
        title = "Signed in securely";
      } else if (log.action === "LOGIN_FAILURE") {
        title = "Failed sign-in attempt";
      } else if (log.action === "DOCUMENT_DOWNLOAD") {
        title = `Downloaded ${log.metadata?.originalName || "document"}`;
      } else if (log.action === "DOCUMENT_DELETE") {
        title = `Deleted ${log.metadata?.originalName || "document"}`;
      } else if (log.action === "ACCESS_DENIED") {
        title = "Unauthorized access attempt blocked";
      }

      return {
        id: log._id,
        title,
        action: log.action,
        actorName: log.actor?.name || "System / Unauthenticated",
        actorEmail: log.actor?.email || null,
        actorRole: log.actor?.role || null,
        resourceType: log.resourceType,
        outcome: log.outcome,
        time: log.createdAt,
      };
    });

    const formattedSecurityEvents = rawSecurityEvents.map((log) => ({
      id: log._id,
      action: log.action,
      resourceType: log.resourceType,
      outcome: log.outcome,
      actorName: log.actor?.name || "Unauthenticated Client",
      ipAddress: log.ipAddress || "Unknown IP",
      time: log.createdAt,
    }));

    return res.status(200).json({
      success: true,
      stats: {
        totalDocuments,
        totalSizeBytes,
        formattedStorage: formatBytes(totalSizeBytes),
        totalUsers,
        securityEvents: securityEventsCount,
      },
      recentFiles: formattedRecentFiles,
      activities: formattedActivities,
      recentUsers: recentUsers.map((u) => ({
        id: u._id,
        name: u.name,
        email: u.email,
        role: u.role,
        createdAt: u.createdAt,
      })),
      securityEvents: formattedSecurityEvents,
    });
  }

  // Standard User metrics: User documents, shared files count, user storage
  const [sharedFilesCount, rawUserLogs] = await Promise.all([
    DocumentPermission.countDocuments({ user: userId, status: "ACTIVE" }),
    AuditLog.find({ actor: userId })
      .sort({ createdAt: -1 })
      .limit(6)
      .lean(),
  ]);

  const formattedActivities = rawUserLogs.map((log) => {
    let title = log.action;
    if (log.action === "DOCUMENT_UPLOAD") {
      title = `Uploaded ${log.metadata?.originalName || "document"}`;
    } else if (log.action === "LOGIN_SUCCESS") {
      title = "Signed in securely";
    } else if (log.action === "DOCUMENT_DOWNLOAD") {
      title = `Downloaded ${log.metadata?.originalName || "document"}`;
    } else if (log.action === "DOCUMENT_DELETE") {
      title = `Deleted ${log.metadata?.originalName || "document"}`;
    }

    return {
      id: log._id,
      title,
      action: log.action,
      outcome: log.outcome,
      time: log.createdAt,
    };
  });

  return res.status(200).json({
    success: true,
    stats: {
      totalDocuments,
      sharedFiles: sharedFilesCount,
      totalSizeBytes,
      formattedStorage: formatBytes(totalSizeBytes),
    },
    recentFiles: formattedRecentFiles,
    activities: formattedActivities,
  });
};

/**
 * Sanitizes a filename to prevent path traversal and control character attacks.
 *
 * @param {string} originalName - Filename from the document record.
 * @returns {string} Safe, basename filename.
 */
const sanitizeDownloadFilename = (originalName) => {
  if (!originalName || typeof originalName !== "string") {
    return "securevault-document.bin";
  }
  // Strip null bytes and ASCII control characters
  const sanitized = originalName.replace(/[\x00-\x1f\x80-\x9f]/g, "").trim();
  // Extract base name to block directory traversal sequences (../, ..\)
  const basename = path.basename(sanitized).replace(/[/\\]/g, "_");
  return basename || "securevault-document.bin";
};

/**
 * Checks whether an authenticated user is authorized to access/download a document.
 * Follows zero-trust access control:
 * - Document Owner always has full access.
 * - Active DocumentPermission holders (VIEWER/EDITOR) have access (compatible with sharing module).
 * - There is strictly NO automatic ADMIN bypass for confidential documents.
 *
 * @param {Object} document - The MongoDB document record.
 * @param {string|mongoose.Types.ObjectId} userId - Authenticated user's ObjectId.
 * @returns {Promise<{ authorized: boolean, reason?: string, role?: string }>}
 */
export const checkDocumentAccess = async (document, userId) => {
  if (!document || !userId) {
    return { authorized: false, reason: "Invalid document or user reference." };
  }

  // 1. Direct Ownership Check
  if (document.owner.toString() === userId.toString()) {
    return { authorized: true, role: "OWNER" };
  }

  // 2. DocumentPermission Check (compatible with sharing/collaboration module)
  const permission = await DocumentPermission.findOne({
    document: document._id,
    user: userId,
    status: "ACTIVE",
    $or: [
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } },
    ],
  }).lean();

  if (permission && ["VIEWER", "EDITOR"].includes(permission.permission)) {
    return { authorized: true, role: permission.permission };
  }

  // Explicitly: No automatic ADMIN bypass without explicit ownership or granted permission
  return {
    authorized: false,
    reason: "Access denied. You do not have permission to download this document.",
  };
};

/**
 * Retrieves document records for the authenticated user with search, filtering, and pagination.
 *
 * GET /api/documents
 */
export const getDocuments = async (req, res) => {
  const isAdmin = req.user.role === "ADMIN";
  const userId = req.user._id;

  // By default, strictly scope to documents owned by the authenticated user.
  // Only if an administrator explicitly requests platform-wide records with scope=all do we omit the owner filter.
  const filter = { status: "ACTIVE" };
  if (!(isAdmin && req.query.scope === "all")) {
    filter.owner = userId;
  }

  // 1. Search by document originalName (case-insensitive)
  if (req.query.search && typeof req.query.search === "string" && req.query.search.trim()) {
    const escapedSearch = req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.originalName = { $regex: escapedSearch, $options: "i" };
  }

  // 2. Filter by file type category or specific mimeType
  if (req.query.type && typeof req.query.type === "string" && req.query.type.trim() && req.query.type !== "all") {
    const type = req.query.type.toLowerCase().trim();
    if (type === "pdf") {
      filter.mimeType = "application/pdf";
    } else if (type === "image") {
      filter.mimeType = { $regex: "^image/", $options: "i" };
    } else if (type === "document" || type === "doc") {
      filter.mimeType = {
        $in: [
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ],
      };
    } else if (type === "spreadsheet" || type === "excel") {
      filter.mimeType = {
        $in: [
          "application/vnd.ms-excel",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "text/csv",
        ],
      };
    } else if (type === "presentation" || type === "powerpoint") {
      filter.mimeType = {
        $in: [
          "application/vnd.ms-powerpoint",
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        ],
      };
    } else if (type === "archive" || type === "zip") {
      filter.mimeType = { $in: ["application/zip", "application/x-zip-compressed"] };
    } else if (type === "text") {
      filter.mimeType = "text/plain";
    } else {
      filter.mimeType = type;
    }
  }

  // 3. Pagination support
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const total = await Document.countDocuments(filter);
  const documents = await Document.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    // Return only necessary, safe metadata. Exclude encryption keys, IVs, authTags, storage credentials.
    .select("_id originalName mimeType sizeBytes status createdAt updatedAt")
    .lean();

  return res.status(200).json({
    success: true,
    count: documents.length,
    documents: documents.map((d) => ({
      id: d._id,
      originalName: d.originalName,
      mimeType: d.mimeType,
      sizeBytes: d.sizeBytes,
      formattedSize: formatBytes(d.sizeBytes),
      status: d.status,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    })),
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    },
  });
};

/**
 * Securely downloads and decrypts an encrypted document attachment.
 * - Authenticates every download request.
 * - Enforces zero-trust ownership / permission check (no automatic admin bypass).
 * - Downloads ciphertext from private Supabase Storage.
 * - Verifies AES-256-GCM authentication tag before releasing plaintext.
 * - Recalculates SHA-256 integrity hash against stored seal.
 * - Sets nosniff security headers and safe attachment disposition.
 *
 * GET /api/documents/:id/download
 */
export const downloadDocument = async (req, res) => {
  const { id } = req.params;
  const userId = req.user._id;

  // 1. Validate ObjectId
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid document identifier format.", 400);
  }

  // 2. Fetch document record from MongoDB
  const document = await Document.findById(id);
  if (!document || document.status === "DELETED") {
    throw new AppError("Document not found or has been deleted.", 404);
  }

  // 3. Authorization check (Owner or active VIEWER/EDITOR DocumentPermission)
  const accessResult = await checkDocumentAccess(document, userId);
  if (!accessResult.authorized) {
    // Record audit event for unauthorized download attempt
    await logAuditEvent({
      actor: userId,
      action: "DOCUMENT_DOWNLOAD",
      resourceType: "DOCUMENT",
      resourceId: document._id,
      outcome: "DENIED",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: {
        documentId: document._id,
        reason: accessResult.reason || "Unauthorized download attempt",
      },
    });

    throw new AppError(
      accessResult.reason || "Access denied. You do not have permission to download this document.",
      403
    );
  }

  // 4. Retrieve ciphertext from private Supabase Storage bucket
  const { data: storageBlob, error: downloadError } = await supabase.storage
    .from(SUPABASE_BUCKET)
    .download(document.storageKey);

  if (downloadError || !storageBlob) {
    await logAuditEvent({
      actor: userId,
      action: "DOCUMENT_DOWNLOAD",
      resourceType: "DOCUMENT",
      resourceId: document._id,
      outcome: "FAILURE",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: {
        reason: `Storage object retrieval failed: ${downloadError?.message || "Object not found"}`,
      },
    });

    throw new AppError("Encrypted document file could not be retrieved from storage.", 502);
  }

  const ciphertextBuffer = Buffer.from(await storageBlob.arrayBuffer());

  // 5. Decrypt ciphertext using existing AES-256-GCM utility
  let decryptedBuffer;
  try {
    decryptedBuffer = decryptBuffer(ciphertextBuffer, {
      iv: document.encryption.iv,
      authTag: document.encryption.authTag,
      algorithm: document.encryption.algorithm,
      keyVersion: document.encryption.keyVersion,
    });
  } catch (_decErr) {
    // GCM authentication tag mismatch or corrupted ciphertext
    await logAuditEvent({
      actor: userId,
      action: "INTEGRITY_CHECK",
      resourceType: "DOCUMENT",
      resourceId: document._id,
      outcome: "FAILURE",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: { check: "AES-256-GCM authentication tag" },
    });
    await logAuditEvent({
      actor: userId,
      action: "DOCUMENT_DOWNLOAD",
      resourceType: "DOCUMENT",
      resourceId: document._id,
      outcome: "FAILURE",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: {
        reason: "GCM Authentication Tag verification failure or ciphertext corruption",
      },
    });

    throw new AppError(
      "Document decryption failed: Authentication tag verification failed. The ciphertext may have been corrupted or tampered with.",
      500
    );
  }

  // 6. Recalculate SHA-256 on the decrypted content and compare with stored integrity hash
  const computedHash = computeSha256(decryptedBuffer);
  if (computedHash !== document.integrity.hash) {
    await logAuditEvent({
      actor: userId,
      action: "INTEGRITY_CHECK",
      resourceType: "DOCUMENT",
      resourceId: document._id,
      outcome: "FAILURE",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: { check: "SHA-256 document integrity" },
    });
    await logAuditEvent({
      actor: userId,
      action: "DOCUMENT_DOWNLOAD",
      resourceType: "DOCUMENT",
      resourceId: document._id,
      outcome: "FAILURE",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: {
        reason: "SHA-256 cryptographic integrity hash mismatch",
      },
    });

    throw new AppError(
      "Cryptographic integrity verification failed. The document content does not match the stored integrity seal.",
      500
    );
  }

  await logAuditEvent({
    actor: userId,
    action: "INTEGRITY_CHECK",
    resourceType: "DOCUMENT",
    resourceId: document._id,
    outcome: "SUCCESS",
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
    metadata: { checks: ["AES-256-GCM authentication tag", "SHA-256 document integrity"] },
  });

  // 7. Record successful audit event
  await logAuditEvent({
    actor: userId,
    action: "DOCUMENT_DOWNLOAD",
    resourceType: "DOCUMENT",
    resourceId: document._id,
    outcome: "SUCCESS",
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
    metadata: {
      originalName: document.originalName,
      sizeBytes: document.sizeBytes,
      accessRole: accessResult.role || "OWNER",
    },
  });

  // 8. Sanitize filename and set secure response headers
  const safeFilename = sanitizeDownloadFilename(document.originalName);
  const encodedFilename = encodeURIComponent(safeFilename);

  res.setHeader("Content-Type", document.mimeType || "application/octet-stream");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodedFilename}`
  );
  res.setHeader("Content-Length", decryptedBuffer.length);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  // 9. Send authenticated, verified decrypted content
  return res.status(200).send(decryptedBuffer);
};

/**
 * Permanently deletes an encrypted document:
 * - Authentication is strictly required.
 * - Only the document owner can delete the document (No automatic admin bypass).
 * - Validates document ID and ensures document status is ACTIVE.
 * - Removes ciphertext from private Supabase bucket.
 * - Updates document status to DELETED and revokes active DocumentPermissions.
 * - Audits the deletion event.
 *
 * DELETE /api/documents/:id
 */
export const deleteDocument = async (req, res) => {
  const { id } = req.params;
  const userId = req.user._id;

  // 1. Validate ObjectId format
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid document identifier format.", 400);
  }

  // 2. Locate active document record
  const document = await Document.findById(id);
  if (!document || document.status === "DELETED") {
    throw new AppError("Document not found or has already been deleted.", 404);
  }

  // 3. Enforce strict ownership check (No admin bypass)
  if (document.owner.toString() !== userId.toString()) {
    // Record audit denial
    await logAuditEvent({
      actor: userId,
      action: "DOCUMENT_DELETE",
      resourceType: "DOCUMENT",
      resourceId: document._id,
      outcome: "DENIED",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: {
        documentId: document._id,
        reason: "Access denied: Only the document owner can delete this document",
      },
    });

    throw new AppError("Access denied. Only the document owner can delete this document.", 403);
  }

  // 4. Secure Storage Cleanup: Delete ciphertext from private Supabase bucket
  const { error: storageError } = await supabase.storage
    .from(SUPABASE_BUCKET)
    .remove([document.storageKey]);

  if (storageError) {
    await logAuditEvent({
      actor: userId,
      action: "DOCUMENT_DELETE",
      resourceType: "DOCUMENT",
      resourceId: document._id,
      outcome: "FAILURE",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: {
        reason: `Supabase storage deletion failure: ${storageError.message}`,
      },
    });

    throw new AppError("Failed to delete encrypted document from storage. Deletion aborted.", 502);
  }

  // 5. Update MongoDB metadata status to DELETED with retry handling
  try {
    document.status = "DELETED";
    await document.save();

    // Revoke any active shared DocumentPermission records
    await DocumentPermission.updateMany(
      { document: document._id, status: "ACTIVE" },
      { status: "REVOKED" }
    );
  } catch (_dbError) {
    try {
      await Document.findByIdAndUpdate(document._id, { status: "DELETED" });
      await DocumentPermission.updateMany(
        { document: document._id, status: "ACTIVE" },
        { status: "REVOKED" }
      );
    } catch (retryError) {
      console.error(
        `[CRITICAL_DB_SYNC] Storage purged but database update failed for doc ${document._id}: ${retryError.message}`
      );
      await logAuditEvent({
        actor: userId,
        action: "DOCUMENT_DELETE",
        resourceType: "DOCUMENT",
        resourceId: document._id,
        outcome: "FAILURE",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        metadata: {
          criticalInconsistency: true,
          error: retryError.message,
        },
      });
      throw new AppError("Storage object deleted but database status sync encountered an error.", 500);
    }
  }

  // 6. Record successful audit event
  await logAuditEvent({
    actor: userId,
    action: "DOCUMENT_DELETE",
    resourceType: "DOCUMENT",
    resourceId: document._id,
    outcome: "SUCCESS",
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
    metadata: {
      originalName: document.originalName,
      sizeBytes: document.sizeBytes,
      mimeType: document.mimeType,
      storagePurged: true,
    },
  });

  // 7. Return safe 200 response
  return res.status(200).json({
    success: true,
    message: "Document and encrypted storage object deleted successfully.",
    documentId: document._id,
  });
};
