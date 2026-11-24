import { Router } from "express";
import {
  register,
  login,
  refreshToken,
  logout,
  getMe,
} from "../controllers/auth.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { authLimiter } from "../middleware/rateLimiter.middleware.js";
import { asyncHandler } from "../middleware/error.middleware.js";

const router = Router();

// Public auth routes with rate limiting
router.post("/register", authLimiter, asyncHandler(register));
router.post("/login", authLimiter, asyncHandler(login));

// Session maintenance routes
router.post("/refresh", asyncHandler(refreshToken));
router.post("/logout", asyncHandler(logout));

// Authenticated user profile route
router.get("/me", authenticate, asyncHandler(getMe));

export default router;
