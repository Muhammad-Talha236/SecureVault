import mongoose from "mongoose";

const documentSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Owner reference is required"],
      index: true,
    },
    originalName: {
      type: String,
      required: [true, "Original file name is required"],
      trim: true,
    },
    storageKey: {
      type: String,
      required: [true, "Storage key is required"],
      unique: true,
      trim: true,
    },
    mimeType: {
      type: String,
      required: [true, "MIME type is required"],
      trim: true,
      lowercase: true,
    },
    sizeBytes: {
      type: Number,
      required: [true, "File size in bytes is required"],
      min: [1, "File size must be at least 1 byte"],
    },
    encryption: {
      algorithm: {
        type: String,
        enum: {
          values: ["AES-256-GCM"],
          message: "Encryption algorithm must be AES-256-GCM",
        },
        default: "AES-256-GCM",
        required: [true, "Encryption algorithm is required"],
      },
      iv: {
        type: String,
        required: [true, "Encryption IV is required"],
        trim: true,
      },
      authTag: {
        type: String,
        required: [true, "Encryption auth tag is required"],
        trim: true,
      },
      keyVersion: {
        type: String,
        required: [true, "Key version is required"],
        trim: true,
      },
    },
    integrity: {
      algorithm: {
        type: String,
        enum: {
          values: ["SHA-256"],
          message: "Integrity algorithm must be SHA-256",
        },
        default: "SHA-256",
        required: [true, "Integrity algorithm is required"],
      },
      hash: {
        type: String,
        required: [true, "Integrity hash is required"],
        trim: true,
      },
    },
    status: {
      type: String,
      enum: {
        values: ["ACTIVE", "DELETED"],
        message: "Status must be either ACTIVE or DELETED",
      },
      default: "ACTIVE",
      required: [true, "Status is required"],
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for querying documents by owner and filtering active/deleted documents
documentSchema.index({ owner: 1, status: 1 });
documentSchema.index({ status: 1 });

const Document = mongoose.model("Document", documentSchema);

export { Document };
export default Document;
