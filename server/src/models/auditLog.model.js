import mongoose from "mongoose";

const AUDIT_ACTIONS = [
  "LOGIN_SUCCESS",
  "LOGIN_FAILURE",
  "LOGOUT",
  "DOCUMENT_UPLOAD",
  "DOCUMENT_VIEW",
  "DOCUMENT_DOWNLOAD",
  "DOCUMENT_UPDATE",
  "DOCUMENT_DELETE",
  "DOCUMENT_SHARE",
  "PERMISSION_REVOKE",
  "ACCESS_DENIED",
  "INTEGRITY_CHECK",
  "ADMIN_ACTION",
];

const auditLogSchema = new mongoose.Schema(
  {
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null, // Nullable for unauthenticated/pre-auth events (e.g. LOGIN_FAILURE)
    },
    action: {
      type: String,
      enum: {
        values: AUDIT_ACTIONS,
        message: "{VALUE} is not a valid audit action",
      },
      required: [true, "Audit action is required"],
    },
    resourceType: {
      type: String,
      enum: {
        values: ["USER", "DOCUMENT", "SYSTEM"],
        message: "Resource type must be USER, DOCUMENT, or SYSTEM",
      },
      required: [true, "Resource type is required"],
    },
    resourceId: {
      type: String,
      default: null,
      trim: true,
    },
    outcome: {
      type: String,
      enum: {
        values: ["SUCCESS", "FAILURE", "DENIED"],
        message: "Outcome must be SUCCESS, FAILURE, or DENIED",
      },
      required: [true, "Audit outcome is required"],
    },
    ipAddress: {
      type: String,
      default: null,
      trim: true,
    },
    userAgent: {
      type: String,
      default: null,
      trim: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for security audit log filtering, forensics, and chronological reporting
auditLogSchema.index({ actor: 1 });
auditLogSchema.index({ action: 1 });
auditLogSchema.index({ resourceId: 1 });
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

// Audit records are immutable through normal Mongoose model operations.
for (const operation of ["updateOne", "updateMany", "findOneAndUpdate", "replaceOne", "deleteOne", "deleteMany", "findOneAndDelete", "findOneAndReplace"]) {
  auditLogSchema.pre(operation, function rejectAuditMutation() {
    throw new Error("Audit records are append-only and cannot be modified or deleted");
  });
}
auditLogSchema.pre("save", function rejectAuditResave() {
  if (!this.isNew) throw new Error("Audit records are append-only and cannot be modified");
});

const AuditLog = mongoose.model("AuditLog", auditLogSchema);

export { AuditLog, AUDIT_ACTIONS };
export default AuditLog;
