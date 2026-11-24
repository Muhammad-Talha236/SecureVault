import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { uploadSingleDocument } from "../middleware/upload.middleware.js";
import {
  uploadDocument,
  getDashboardData,
  getDocuments,
  downloadDocument,
  deleteDocument,
} from "../controllers/document.controller.js";
import { asyncHandler } from "../middleware/error.middleware.js";

const router = Router();

// All document routes require authentication
router.use(authenticate);

// POST /api/documents - Upload and encrypt a document
router.post("/", uploadSingleDocument, asyncHandler(uploadDocument));

// GET /api/documents/dashboard - Live dashboard metrics, recent files & activities
router.get("/dashboard", asyncHandler(getDashboardData));

// GET /api/documents - List documents for the user (with search, filtering & pagination)
router.get("/", asyncHandler(getDocuments));

// GET /api/documents/:id/download - Secure download and decryption
router.get("/:id/download", asyncHandler(downloadDocument));

// DELETE /api/documents/:id - Secure document deletion
router.delete("/:id", asyncHandler(deleteDocument));

export default router;
