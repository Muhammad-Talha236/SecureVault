import mongoose from "mongoose";
import Document from "../models/document.model.js";
import DocumentPermission from "../models/documentPermission.model.js";
import User from "../models/user.model.js";
import { AppError } from "../middleware/error.middleware.js";
import { logAuditEvent, getRequestAuditContext } from "../utils/audit.utils.js";

const validPermissions = new Set(["VIEWER", "EDITOR"]);

export const validateExpiration = (expiresAt, { allowNull = true } = {}) => {
  if (expiresAt === undefined) return undefined;
  if (expiresAt === null) {
    if (!allowNull) throw new AppError("Expiration cannot be null.", 400);
    return null;
  }
  if (typeof expiresAt !== "string" && !(expiresAt instanceof Date)) {
    throw new AppError("expiresAt must be a valid ISO 8601 timestamp.", 400);
  }
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) throw new AppError("expiresAt must be a valid timestamp.", 400);
  if (date.getTime() <= Date.now()) throw new AppError("expiresAt must be a future timestamp.", 400);
  return date;
};

export const shareDocument = async (documentId, actorId, recipientEmail, permission, expiresAt, req) => {
  if (!mongoose.Types.ObjectId.isValid(documentId)) throw new AppError("Invalid document identifier.", 400);
  const doc = await Document.findOne({ _id: documentId, status: "ACTIVE" });
  if (!doc) throw new AppError("Document not found.", 404);
  if (doc.owner.toString() !== actorId.toString()) {
    await logAuditEvent({
      actor: actorId, action: "ACCESS_DENIED", resourceType: "DOCUMENT", resourceId: documentId,
      outcome: "DENIED", ...getRequestAuditContext(req),
      metadata: { reason: "Only the document owner can manage sharing", recipientEmail, attemptedPermission: permission },
    });
    throw new AppError("Access denied. Only the document owner can manage sharing.", 403);
  }
  if (!validPermissions.has(permission)) throw new AppError("Permission must be VIEWER or EDITOR.", 400);
  const normalizedEmail = typeof recipientEmail === "string" ? recipientEmail.trim().toLowerCase() : "";
  if (!normalizedEmail) throw new AppError("Recipient email is required.", 400);
  const recipient = await User.findOne({ email: normalizedEmail });
  if (!recipient) throw new AppError("No registered user found with that email address.", 404);
  if (recipient._id.toString() === actorId.toString()) throw new AppError("The document owner cannot share the document with themselves.", 400);
  const expiration = validateExpiration(expiresAt);

  const existing = await DocumentPermission.findOne({ document: doc._id, user: recipient._id });
  let grant;
  if (existing) {
    const previousPermission = existing.permission;
    existing.permission = permission;
    existing.status = "ACTIVE";
    existing.grantedBy = actorId;
    existing.expiresAt = expiration === undefined ? null : expiration;
    if (existing.expiresAt && existing.expiresAt.getTime() <= Date.now()) {
      throw new AppError("expiresAt must be a future timestamp.", 400);
    }
    grant = await existing.save();
    await logAuditEvent({
      actor: actorId, action: "DOCUMENT_SHARE", resourceType: "DOCUMENT", resourceId: doc._id,
      outcome: "SUCCESS", ...getRequestAuditContext(req),
      metadata: { recipientId: recipient._id, recipientEmail: recipient.email, previousPermission, permission, expiresAt: grant.expiresAt, reactivated: true },
    });
    await logAuditEvent({
      actor: actorId, action: "PERMISSION_UPDATE", resourceType: "DOCUMENT", resourceId: doc._id,
      outcome: "SUCCESS", ...getRequestAuditContext(req),
      metadata: { recipientId: recipient._id, recipientEmail: recipient.email, previousPermission, permission, expiresAt: grant.expiresAt },
    });
  } else {
    try {
      grant = await DocumentPermission.create({
        document: doc._id, user: recipient._id, grantedBy: actorId,
        permission, status: "ACTIVE", expiresAt: expiration ?? null,
      });
    } catch (error) {
      if (error?.code === 11000) {
        throw new AppError("A permission record for this recipient already exists.", 409);
      }
      throw error;
    }
    await logAuditEvent({
      actor: actorId, action: "DOCUMENT_SHARE", resourceType: "DOCUMENT", resourceId: doc._id,
      outcome: "SUCCESS", ...getRequestAuditContext(req),
      metadata: { recipientId: recipient._id, recipientEmail: recipient.email, permission, expiresAt: grant.expiresAt },
    });
  }

  return {
    id: grant._id, documentId: doc._id,
    recipient: { name: recipient.name, email: recipient.email },
    permission: grant.permission, status: "ACTIVE", expiresAt: grant.expiresAt,
  };
};

export const getDocumentCollaborators = async (documentId, actorId) => {
  if (!mongoose.Types.ObjectId.isValid(documentId)) throw new AppError("Invalid document identifier.", 400);
  const doc = await Document.findOne({ _id: documentId, status: "ACTIVE" });
  if (!doc) throw new AppError("Document not found.", 404);
  if (doc.owner.toString() !== actorId.toString()) throw new AppError("Access denied. Only the document owner can view collaborators.", 403);
  const grants = await DocumentPermission.find({ document: doc._id }).populate("user", "name email").sort({ createdAt: -1 });
  const now = Date.now();
  return grants.filter((grant) => grant.user).map((grant) => ({
    id: grant._id,
    user: { id: grant.user._id, name: grant.user.name, email: grant.user.email },
    permission: grant.permission,
    status: grant.status === "REVOKED" ? "REVOKED" : (grant.expiresAt && grant.expiresAt.getTime() <= now ? "EXPIRED" : "ACTIVE"),
    expiresAt: grant.expiresAt,
  }));
};

export const updatePermission = async (documentId, permissionId, actorId, updates, req) => {
  if (!mongoose.Types.ObjectId.isValid(documentId) || !mongoose.Types.ObjectId.isValid(permissionId)) {
    throw new AppError("Invalid document or permission identifier.", 400);
  }
  const doc = await Document.findOne({ _id: documentId, status: "ACTIVE" });
  if (!doc) throw new AppError("Document not found.", 404);
  if (doc.owner.toString() !== actorId.toString()) throw new AppError("Access denied. Only the document owner can update permissions.", 403);
  const grant = await DocumentPermission.findOne({ _id: permissionId, document: doc._id }).populate("user", "name email");
  if (!grant) throw new AppError("Permission record not found for this document.", 404);
  if (grant.status === "REVOKED") throw new AppError("Revoked permissions cannot be modified. Share the document again.", 409);

  if (updates.permission !== undefined && !validPermissions.has(updates.permission)) {
    throw new AppError("Permission must be VIEWER or EDITOR.", 400);
  }
  if (updates.permission === undefined && updates.expiresAt === undefined) throw new AppError("No permission changes supplied.", 400);
  const previousPermission = grant.permission;
  const previousExpiresAt = grant.expiresAt;
  if (updates.permission !== undefined) grant.permission = updates.permission;
  if (updates.expiresAt !== undefined) grant.expiresAt = validateExpiration(updates.expiresAt);
  await grant.save();
  await logAuditEvent({
    actor: actorId, action: "PERMISSION_UPDATE", resourceType: "DOCUMENT", resourceId: doc._id,
    outcome: "SUCCESS", ...getRequestAuditContext(req),
    metadata: { permissionId: grant._id, recipientId: grant.user?._id, recipientEmail: grant.user?.email,
      previousPermission, permission: grant.permission, previousExpiresAt, expiresAt: grant.expiresAt },
  });
  return grant;
};

export const revokePermission = async (documentId, permissionId, actorId, req) => {
  if (!mongoose.Types.ObjectId.isValid(documentId) || !mongoose.Types.ObjectId.isValid(permissionId)) {
    throw new AppError("Invalid document or permission identifier.", 400);
  }
  const doc = await Document.findOne({ _id: documentId, status: "ACTIVE" });
  if (!doc) throw new AppError("Document not found.", 404);
  if (doc.owner.toString() !== actorId.toString()) throw new AppError("Access denied. Only the document owner can revoke permissions.", 403);
  const grant = await DocumentPermission.findOne({ _id: permissionId, document: doc._id }).populate("user", "name email");
  if (!grant) throw new AppError("Permission record not found for this document.", 404);
  if (grant.status !== "REVOKED") {
    grant.status = "REVOKED";
    await grant.save();
  }
  await logAuditEvent({
    actor: actorId, action: "PERMISSION_REVOKE", resourceType: "DOCUMENT", resourceId: doc._id,
    outcome: "SUCCESS", ...getRequestAuditContext(req),
    metadata: { permissionId: grant._id, revokedUserId: grant.user?._id, revokedEmail: grant.user?.email },
  });
  return grant;
};

export const getSharedWithMe = async (userId) => {
  const now = new Date();
  const grants = await DocumentPermission.find({
    user: userId, status: "ACTIVE",
    $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
  }).populate({
    path: "document",
    populate: { path: "owner", select: "name email" },
  });

  return grants
    .filter((grant) => grant.document && grant.document.status === "ACTIVE" && grant.document.owner)
    .map((grant) => ({
      id: grant.document._id,
      originalName: grant.document.originalName,
      sizeBytes: grant.document.sizeBytes,
      mimeType: grant.document.mimeType,
      owner: { name: grant.document.owner.name, email: grant.document.owner.email },
      myPermission: grant.permission,
      status: "ACTIVE",
      expiresAt: grant.expiresAt,
    }));
};

export const verifyUserAccess = async (documentId, userId, requiredLevel = "VIEWER") => {
  if (!mongoose.Types.ObjectId.isValid(documentId) || !mongoose.Types.ObjectId.isValid(userId)) {
    return { authorized: false, reason: "INVALID_REFERENCE", permission: null };
  }
  if (!["VIEWER", "EDITOR"].includes(requiredLevel)) {
    return { authorized: false, reason: "INVALID_REQUIRED_LEVEL", permission: null };
  }
  const doc = await Document.findById(documentId).select("_id owner status");
  if (!doc || doc.status === "DELETED") return { authorized: false, reason: "DOCUMENT_NOT_FOUND", permission: null };
  if (doc.owner.toString() === userId.toString()) return { authorized: true, reason: "OWNER", permission: "OWNER" };

  const grant = await DocumentPermission.findOne({ document: doc._id, user: userId, status: "ACTIVE" });
  if (!grant) return { authorized: false, reason: "NO_PERMISSION", permission: null };
  if (grant.status === "REVOKED") return { authorized: false, reason: "PERMISSION_REVOKED", permission: grant.permission };
  if (grant.expiresAt && grant.expiresAt.getTime() <= Date.now()) {
    return { authorized: false, reason: "PERMISSION_EXPIRED", permission: grant.permission };
  }
  if (requiredLevel === "EDITOR" && grant.permission !== "EDITOR") {
    return { authorized: false, reason: "INSUFFICIENT_PRIVILEGE", permission: grant.permission };
  }
  return { authorized: true, reason: "PERMISSION", permission: grant.permission };
};
