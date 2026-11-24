import AuditLog from "../models/auditLog.model.js";

/**
 * Creates an audit log record safely.
 * Errors in audit logging are logged to stderr but will not crash the primary operational flow.
 *
 * @param {Object} params
 * @param {string|mongoose.Types.ObjectId} [params.actor] - User ID who performed the action.
 * @param {string} params.action - One of AUDIT_ACTIONS (e.g. "DOCUMENT_UPLOAD").
 * @param {string} [params.resourceType="DOCUMENT"] - "USER", "DOCUMENT", or "SYSTEM".
 * @param {string} [params.resourceId] - ID of the resource affected.
 * @param {string} [params.outcome="SUCCESS"] - "SUCCESS", "FAILURE", or "DENIED".
 * @param {string} [params.ipAddress] - Request IP address.
 * @param {string} [params.userAgent] - Request user agent.
 * @param {Object} [params.metadata] - Additional safe operational metadata.
 * @returns {Promise<AuditLog|null>}
 */
export const logAuditEvent = async ({
  actor = null,
  action,
  resourceType = "DOCUMENT",
  resourceId = null,
  outcome = "SUCCESS",
  ipAddress = null,
  userAgent = null,
  metadata = null,
}) => {
  try {
    const entry = await AuditLog.create({
      actor: actor || null,
      action,
      resourceType,
      resourceId: resourceId ? String(resourceId) : null,
      outcome,
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
      metadata: metadata || null,
    });
    return entry;
  } catch (err) {
    console.error(`[AUDIT_LOG_ERROR] Failed to record audit event: ${err.message}`);
    return null;
  }
};
