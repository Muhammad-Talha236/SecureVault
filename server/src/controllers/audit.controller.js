import mongoose from "mongoose";
import AuditLog, { AUDIT_ACTIONS } from "../models/auditLog.model.js";
import User from "../models/user.model.js";
import { AppError } from "../middleware/error.middleware.js";
import { sanitizeAuditMetadata } from "../services/audit.service.js";

const OUTCOMES = ["SUCCESS", "FAILURE", "DENIED"];
const safeLimit = (value, fallback = 25) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? Math.min(Math.max(parsed, 1), 100) : fallback;
};
const safePage = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? Math.max(parsed, 1) : 1;
};
const asDate = (value, name, endOfDay = false) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new AppError(`${name} must be a valid date.`, 400);
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(value)) date.setUTCHours(23, 59, 59, 999);
  return date;
};

const formatLog = (entry) => ({
  id: String(entry._id),
  actor: entry.actor ? {
    id: String(entry.actor._id || entry.actor),
    name: entry.actor.name || "Unknown User",
    email: entry.actor.email || null,
  } : null,
  action: entry.action,
  resourceType: entry.resourceType,
  resourceId: entry.resourceId,
  outcome: entry.outcome,
  ipAddress: entry.ipAddress,
  userAgent: entry.userAgent,
  metadata: sanitizeAuditMetadata(entry.metadata),
  createdAt: entry.createdAt,
});

export const getAuditLogs = async (req, res) => {
  const page = safePage(req.query.page);
  const limit = safeLimit(req.query.limit, 25);
  const filter = {};
  if (req.query.action) {
    if (!AUDIT_ACTIONS.includes(req.query.action)) throw new AppError("Invalid audit action filter.", 400);
    filter.action = req.query.action;
  }
  if (req.query.outcome) {
    if (!OUTCOMES.includes(req.query.outcome)) throw new AppError("Invalid audit outcome filter.", 400);
    filter.outcome = req.query.outcome;
  }
  if (req.query.resourceType) {
    if (!["USER", "DOCUMENT", "SYSTEM"].includes(req.query.resourceType)) throw new AppError("Invalid resource type filter.", 400);
    filter.resourceType = req.query.resourceType;
  }
  const startDate = asDate(req.query.startDate, "startDate");
  const endDate = asDate(req.query.endDate, "endDate", true);
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = startDate;
    if (endDate) filter.createdAt.$lte = endDate;
    if (startDate && endDate && startDate > endDate) throw new AppError("startDate must be before endDate.", 400);
  }
  if (req.query.resourceId) filter.resourceId = String(req.query.resourceId).slice(0, 500);
  if (req.query.search) {
    const term = String(req.query.search).trim().slice(0, 200);
    if (term) {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const matchingUsers = await User.find({ $or: [
        { email: { $regex: escaped, $options: "i" } },
        { name: { $regex: escaped, $options: "i" } },
      ] }).select("_id").limit(100).lean();
      filter.$or = [
        { resourceId: { $regex: escaped, $options: "i" } },
        ...(matchingUsers.length ? [{ actor: { $in: matchingUsers.map((user) => user._id) } }] : []),
      ];
    }
  }
  if (req.query.actor) {
    const actor = String(req.query.actor).trim();
    if (mongoose.Types.ObjectId.isValid(actor)) filter.actor = actor;
    else {
      const users = await User.find({ $or: [
        { email: { $regex: actor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } },
        { name: { $regex: actor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } },
      ] }).select("_id").limit(100).lean();
      filter.actor = { $in: users.map((user) => user._id) };
    }
  }

  const [totalRecords, records] = await Promise.all([
    AuditLog.countDocuments(filter),
    AuditLog.find(filter).populate("actor", "name email").sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit).limit(limit).lean(),
  ]);
  res.json({
    success: true,
    pagination: { totalRecords, currentPage: page, totalPages: Math.ceil(totalRecords / limit), limit },
    logs: records.map(formatLog),
  });
};

export const getAuditStats = async (_req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [totalEventsToday, failedLogins, accessDenials, integrityFailures] = await Promise.all([
    AuditLog.countDocuments({ createdAt: { $gte: today } }),
    AuditLog.countDocuments({ action: "LOGIN_FAILURE", outcome: "FAILURE" }),
    AuditLog.countDocuments({ outcome: "DENIED" }),
    AuditLog.countDocuments({ action: "INTEGRITY_CHECK", outcome: "FAILURE" }),
  ]);
  res.json({ success: true, stats: { totalEventsToday, failedLogins, accessDenials, integrityFailures } });
};

export const getAuditLogById = async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) throw new AppError("Invalid audit log ID.", 400);
  const record = await AuditLog.findById(req.params.id).populate("actor", "name email").lean();
  if (!record) throw new AppError("Audit log not found.", 404);
  res.json({ success: true, log: formatLog(record) });
};
