import crypto from "crypto";
import jwt from "jsonwebtoken";

const DEFAULT_ACCESS_EXPIRY = "15m";

/**
 * Signs a short-lived JWT access token
 * @param {Object} payload - User claims { id, email, role }
 * @returns {string} Signed JWT
 */
export const signAccessToken = (payload) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not defined");
  }

  return jwt.sign(payload, secret, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || DEFAULT_ACCESS_EXPIRY,
  });
};

/**
 * Verifies and decodes a JWT access token
 * @param {string} token
 * @returns {Object} Decoded payload
 */
export const verifyAccessToken = (token) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not defined");
  }

  return jwt.verify(token, secret);
};

/**
 * Generates a cryptographically secure random refresh token and its SHA-256 hash
 * @returns {{ rawToken: string, tokenHash: string }}
 */
export const generateRefreshToken = () => {
  const rawToken = crypto.randomBytes(40).toString("hex");
  const tokenHash = hashToken(rawToken);
  return { rawToken, tokenHash };
};

/**
 * Hashes a raw token with SHA-256 for safe database storage
 * @param {string} token
 * @returns {string} SHA-256 hex digest
 */
export const hashToken = (token) => {
  if (typeof token !== "string" || token.length === 0) {
    throw new Error("Token must be a non-empty string");
  }
  return crypto.createHash("sha256").update(token).digest("hex");
};

/**
 * Returns hardened cookie configuration options
 * @param {boolean} [isRefresh=false]
 * @returns {import("express").CookieOptions}
 */
export const getCookieOptions = (isRefresh = false) => {
  const isProduction = process.env.NODE_ENV === "production";

  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "strict" : "lax",
    path: isRefresh ? "/api/auth" : "/",
    maxAge: isRefresh
      ? 7 * 24 * 60 * 60 * 1000 // 7 days
      : 15 * 60 * 1000, // 15 minutes
  };
};

/**
 * Returns cookie options for clearing cookies (omits maxAge per Express standard)
 * @param {boolean} [isRefresh=false]
 * @returns {import("express").CookieOptions}
 */
export const getClearCookieOptions = (isRefresh = false) => {
  const isProduction = process.env.NODE_ENV === "production";

  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "strict" : "lax",
    path: isRefresh ? "/api/auth" : "/",
  };
};
