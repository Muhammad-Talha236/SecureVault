import { Router } from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../middleware/error.middleware.js";

const router = Router();

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const dbStatus = mongoose.connection.readyState === 1 ? "connected" : "disconnected";
    res.status(200).json({
      success: true,
      message: "SecureVault backend is healthy",
      database: dbStatus,
    });
  })
);

export default router;
