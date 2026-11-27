import AuditLog, { AUDIT_ACTIONS } from "../models/auditLog.model.js";

const SECRET_KEY = /(password|token|key|secret|auth|hash|jwt|credential|cookie)/i;
const MAX_DEPTH = 5;
const sanitizeText = (value) => value.slice(0, 2000)
  .replace(/eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g, "[REDACTED_JWT]")
  .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [REDACTED]")
  .replace(/(password|token|secret|authorization|apiKey|access_token|refresh_token)\s*[:=]\s*["']?([^"',\s&]+)["']?/gi, "$1=[REDACTED]")
  .replace(/(mongodb(?:\+srv)?:\/\/)[^\s@]+@/gi, "$1[REDACTED]@");

/** Keep audit metadata small, serializable, and free of credential-like fields. */
export const sanitizeAuditMetadata = (value, depth = 0) => {
  if (value == null) return null;
  if (typeof value === "string") return sanitizeText(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value !== "object" || depth > MAX_DEPTH) return null;
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (value._bsontype === "ObjectId") return value.toString();
  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => sanitizeAuditMetadata(item, depth + 1));
  }

  const safe = {};
  for (const [key, item] of Object.entries(value)) {
    if (SECRET_KEY.test(key) || typeof item === "function") continue;
    if (Buffer.isBuffer(item) || item instanceof Uint8Array) continue;
    if (item && typeof item === "object") {
      safe[key] = sanitizeAuditMetadata(item, depth + 1);
    } else if (typeof item === "string") {
      safe[key] = sanitizeText(item);
    } else if (typeof item === "number" || typeof item === "boolean" || item == null) {
      safe[key] = item;
    }
  }
  return safe;
};

/**
 * Central audit writer. Failures are deliberately swallowed so an audit storage
 * outage does not turn a successful business operation into a failed request.
 */
export const logAuditEvent = async ({
  actor = null,
  action,
  resourceType = "SYSTEM",
  resourceId = null,
  outcome = "SUCCESS",
  ipAddress = null,
  userAgent = null,
  metadata = null,
} = {}) => {
  if (!AUDIT_ACTIONS.includes(action)) throw new TypeError("Invalid audit action");
  if (!["USER", "DOCUMENT", "SYSTEM"].includes(resourceType)) throw new TypeError("Invalid audit resource type");
  if (!["SUCCESS", "FAILURE", "DENIED"].includes(outcome)) throw new TypeError("Invalid audit outcome");
  try {
    return await AuditLog.create({
      actor: actor || null,
      action,
      resourceType,
      resourceId: resourceId == null ? null : String(resourceId).slice(0, 500),
      outcome,
      ipAddress: typeof ipAddress === "string" ? ipAddress.slice(0, 128) : null,
      userAgent: typeof userAgent === "string" ? userAgent.slice(0, 1000) : null,
      metadata: sanitizeAuditMetadata(metadata),
    });
  } catch (error) {
    console.error(`[AUDIT_LOG_ERROR] Failed to record audit event: ${sanitizeText(error.message || "unknown error")}`);
    return null;
  }
};

export const getRequestAuditContext = (req) => ({
  ipAddress: req.ip,
  userAgent: req.get?.("user-agent") || req.headers?.["user-agent"] || null,
});
