import mongoose from "mongoose";

const refreshTokenSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User reference is required"],
      index: true,
    },
    tokenHash: {
      type: String,
      required: [true, "Token hash is required"],
      unique: true,
      trim: true,
    },
    familyId: {
      type: String,
      required: [true, "Token family ID is required"],
      trim: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: [true, "Expiration date is required"],
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    replacedByTokenHash: {
      type: String,
      default: null,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for querying all active tokens within a rotation family for a user
refreshTokenSchema.index({ user: 1, familyId: 1 });

// TTL index to automatically prune expired tokens from MongoDB (background asynchronous cleanup)
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const RefreshToken = mongoose.model("RefreshToken", refreshTokenSchema);

export { RefreshToken };
export default RefreshToken;
