import mongoose from "mongoose";
import User from "../models/user.model.js";
import Document from "../models/document.model.js";
import DocumentPermission from "../models/documentPermission.model.js";
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
 * GET /api/admin/users
 * Returns actual registered users from MongoDB with search, role filter, pagination, and document counts.
 * Excludes sensitive fields (passwordHash, refresh tokens).
 */
export const getUsers = async (req, res) => {
  const filter = {};

  // 1. Search by name or email
  if (req.query.search && typeof req.query.search === "string" && req.query.search.trim()) {
    const escaped = req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [
      { name: { $regex: escaped, $options: "i" } },
      { email: { $regex: escaped, $options: "i" } },
    ];
  }

  // 2. Filter by role
  if (req.query.role && ["USER", "ADMIN"].includes(req.query.role.toUpperCase())) {
    filter.role = req.query.role.toUpperCase();
  }

  // 3. Pagination
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 15));
  const skip = (page - 1) * limit;

  const total = await User.countDocuments(filter);
  const users = await User.find(filter)
    .select("_id name email role createdAt updatedAt")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  // Aggregate active document counts per user
  const userIds = users.map((u) => u._id);
  const docCounts = await Document.aggregate([
    { $match: { owner: { $in: userIds }, status: "ACTIVE" } },
    { $group: { _id: "$owner", count: { $sum: 1 } } },
  ]);

  const docCountMap = new Map();
  docCounts.forEach((d) => docCountMap.set(d._id.toString(), d.count));

  const formattedUsers = users.map((u) => ({
    id: u._id,
    name: u.name,
    email: u.email,
    role: u.role,
    activeDocuments: docCountMap.get(u._id.toString()) || 0,
    documentCount: docCountMap.get(u._id.toString()) || 0,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  }));

  return res.status(200).json({
    success: true,
    users: formattedUsers,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    },
  });
};

/**
 * PATCH /api/admin/users/:id/role
 * Allows authorized administrator to update a user's role (USER <-> ADMIN).
 * Prevents administrator from accidentally revoking their own administrative access.
 */
export const updateUserRole = async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid user ID format.", 400);
  }

  if (!role || !["USER", "ADMIN"].includes(role.toUpperCase())) {
    throw new AppError("Invalid role. Role must be either USER or ADMIN.", 400);
  }

  const targetRole = role.toUpperCase();
  const targetUser = await User.findById(id);

  if (!targetUser) {
    throw new AppError("User not found.", 404);
  }

  // Guard: Administrator cannot revoke their own administrative access
  if (targetUser._id.toString() === req.user._id.toString() && targetRole !== "ADMIN") {
    throw new AppError(
      "Action blocked: Administrators cannot revoke their own administrative access.",
      400
    );
  }

  const previousRole = targetUser.role;
  targetUser.role = targetRole;
  await targetUser.save();

  // Audit event
  await logAuditEvent({
    actor: req.user._id,
    action: "ADMIN_ACTION",
    resourceType: "USER",
    resourceId: targetUser._id.toString(),
    outcome: "SUCCESS",
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
    metadata: {
      targetEmail: targetUser.email,
      previousRole,
      newRole: targetRole,
      actionNote: `Updated role for ${targetUser.email} from ${previousRole} to ${targetRole}`,
    },
  });

  return res.status(200).json({
    success: true,
    message: `Role for ${targetUser.name} successfully updated to ${targetRole}.`,
    user: {
      id: targetUser._id,
      name: targetUser.name,
      email: targetUser.email,
      role: targetUser.role,
      updatedAt: targetUser.updatedAt,
    },
  });
};

/**
 * GET /api/admin/documents
 * Returns platform-wide document records with owner info, encryption algo/version, and status.
 * Excludes encryption keys, IVs, auth tags, storage keys, and Supabase secrets.
 * Provides NO download or decryption bypass for admin.
 */
export const getDocumentRecords = async (req, res) => {
  const filter = {};

  // 1. Status filter (ACTIVE, DELETED, or all)
  if (req.query.status && req.query.status.toLowerCase() !== "all") {
    const s = req.query.status.toUpperCase();
    if (["ACTIVE", "DELETED"].includes(s)) {
      filter.status = s;
    }
  }

  // 2. File type format filter
  if (req.query.type && req.query.type !== "all") {
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
    }
  }

  // 3. Search by filename or owner
  if (req.query.search && typeof req.query.search === "string" && req.query.search.trim()) {
    const escaped = req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    
    // Find matching user IDs first
    const matchingUsers = await User.find({
      $or: [
        { name: { $regex: escaped, $options: "i" } },
        { email: { $regex: escaped, $options: "i" } },
      ],
    }).select("_id").lean();

    const matchingUserIds = matchingUsers.map((u) => u._id);

    filter.$or = [
      { originalName: { $regex: escaped, $options: "i" } },
      { owner: { $in: matchingUserIds } },
    ];
  }

  // 4. Pagination
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 15));
  const skip = (page - 1) * limit;

  const total = await Document.countDocuments(filter);
  const documents = await Document.find(filter)
    .populate("owner", "_id name email role")
    .select(
      "_id originalName mimeType sizeBytes encryption.algorithm encryption.keyVersion integrity.algorithm status createdAt updatedAt"
    )
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const formattedDocuments = documents.map((doc) => ({
    id: doc._id,
    originalName: doc.originalName,
    mimeType: doc.mimeType,
    sizeBytes: doc.sizeBytes,
    formattedSize: formatBytes(doc.sizeBytes),
    owner: {
      id: doc.owner?._id || null,
      name: doc.owner?.name || "Unknown / Deleted Account",
      email: doc.owner?.email || "—",
      role: doc.owner?.role || "USER",
    },
    encryption: {
      algorithm: doc.encryption?.algorithm || "AES-256-GCM",
      keyVersion: doc.encryption?.keyVersion || "1",
    },
    integrity: {
      algorithm: doc.integrity?.algorithm || "SHA-256",
    },
    status: doc.status || "ACTIVE",
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }));

  return res.status(200).json({
    success: true,
    documents: formattedDocuments,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    },
  });
};

/**
 * GET /api/admin/documents/:id/permissions
 * Fetches existing document sharing permissions from DocumentPermission model.
 */
export const getDocumentPermissions = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid document ID format.", 400);
  }

  const permissions = await DocumentPermission.find({ document: id })
    .populate("user", "name email")
    .populate("grantedBy", "name email")
    .sort({ createdAt: -1 })
    .lean();

  const formattedPermissions = permissions.map((p) => ({
    id: p._id,
    user: {
      id: p.user?._id,
      name: p.user?.name || "Unknown User",
      email: p.user?.email || "—",
    },
    grantedBy: {
      id: p.grantedBy?._id,
      name: p.grantedBy?.name || "System",
      email: p.grantedBy?.email || "—",
    },
    permission: p.permission,
    status: p.status,
    expiresAt: p.expiresAt,
    createdAt: p.createdAt,
  }));

  return res.status(200).json({
    success: true,
    permissions: formattedPermissions,
  });
};

/**
 * GET /api/admin/roles/overview
 * Returns system roles statistics and active permission distribution.
 */
export const getRolesOverview = async (req, res) => {
  const [totalUsers, adminCount, userCount, activePermissionsCount] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments({ role: "ADMIN" }),
    User.countDocuments({ role: "USER" }),
    DocumentPermission.countDocuments({ status: "ACTIVE" }),
  ]);

  return res.status(200).json({
    success: true,
    overview: {
      totalUsers,
      adminCount,
      userCount,
      activePermissionsCount,
    },
  });
};
