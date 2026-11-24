import { Router } from "express";
import { authenticate, requireRole } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../middleware/error.middleware.js";
import {
  getUsers,
  updateUserRole,
  getDocumentRecords,
  getDocumentPermissions,
  getRolesOverview,
} from "../controllers/admin.controller.js";

const router = Router();

// Strict security boundary: Authentication + Administrator role required for all admin routes
router.use(authenticate);
router.use(requireRole("ADMIN"));

// User Management Routes
router.get("/users", asyncHandler(getUsers));
router.patch("/users/:id/role", asyncHandler(updateUserRole));

// Document Records Routes
router.get("/documents", asyncHandler(getDocumentRecords));
router.get("/documents/:id/permissions", asyncHandler(getDocumentPermissions));

// Roles & Permissions Overview Route
router.get("/roles/overview", asyncHandler(getRolesOverview));

export default router;
