import rateLimit from "express-rate-limit";

/**
 * Rate limiter for sensitive authentication endpoints (register, login)
 * Limits brute-force attacks and credential stuffing
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Allow 50 attempts per 15-minute window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many authentication attempts. Please try again after 15 minutes.",
  },
});
