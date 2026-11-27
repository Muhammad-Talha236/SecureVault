import { Router } from "express";
import { authenticate, requireRole } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../middleware/error.middleware.js";
import { getAuditLogById, getAuditLogs, getAuditStats } from "../controllers/audit.controller.js";

const router = Router();
router.use(authenticate, requireRole("ADMIN"));
router.get("/stats", asyncHandler(getAuditStats));
router.get("/", asyncHandler(getAuditLogs));
router.get("/:id", asyncHandler(getAuditLogById));
export default router;
