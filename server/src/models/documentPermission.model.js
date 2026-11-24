import mongoose from "mongoose";

const documentPermissionSchema = new mongoose.Schema(
  {
    document: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Document",
      required: [true, "Document reference is required"],
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User reference is required"],
    },
    grantedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Grantor reference is required"],
    },
    permission: {
      type: String,
      enum: {
        values: ["EDITOR", "VIEWER"],
        message: "Permission must be either EDITOR or VIEWER",
      },
      required: [true, "Permission level is required"],
    },
    status: {
      type: String,
      enum: {
        values: ["ACTIVE", "REVOKED"],
        message: "Status must be either ACTIVE or REVOKED",
      },
      default: "ACTIVE",
      required: [true, "Permission status is required"],
    },
    expiresAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound unique index ensuring one permission record per document-user pair
documentPermissionSchema.index({ document: 1, user: 1 }, { unique: true });

// Indexes for fast lookup of a user's active permissions and document collaborators
documentPermissionSchema.index({ user: 1, status: 1 });
documentPermissionSchema.index({ document: 1, status: 1 });

const DocumentPermission = mongoose.model("DocumentPermission", documentPermissionSchema);

export { DocumentPermission };
export default DocumentPermission;
