import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import { verifyAccessToken } from "../utils/token.utils.js";
import { AppError } from "./error.middleware.js";

/**
 * Authentication middleware that verifies JWT access token from cookie or Authorization header
 */
export const authenticate = async (req, res, next) => {
  try {
    let token = null;

    // 1. Check HTTP-only cookie first (supporting both camelCase and snake_case)
    if (req.cookies) {
      if (req.cookies.accessToken) {
        token = req.cookies.accessToken;
      } else if (req.cookies.access_token) {
        token = req.cookies.access_token;
      }
    }
    // 2. Fall back to Authorization Bearer header
    if (!token && req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
      token = req.headers.authorization.slice(7).trim();
    }

    if (!token) {
      throw new AppError("Authentication required. Please log in.", 401);
    }

    // 3. Verify JWT
    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        throw new AppError("Access token expired. Please refresh your session.", 401);
      }
      throw new AppError("Invalid authentication token. Please log in again.", 401);
    }

    // 4. Verify user still exists
    const user = await User.findById(decoded.id).select("-passwordHash");
    if (!user) {
      throw new AppError("The user belonging to this session no longer exists.", 401);
    }

    // 5. Attach user to request
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Authorization guard middleware checking user roles (e.g. "ADMIN")
 * @param  {...string} roles - Permitted roles
 */
export const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new AppError("Access denied. Insufficient permissions.", 403));
    }
    next();
  };
};
