import crypto from "crypto";
import User from "../models/user.model.js";
import RefreshToken from "../models/refreshToken.model.js";
import { hashPassword, comparePassword } from "../utils/password.utils.js";
import {
  signAccessToken,
  generateRefreshToken,
  hashToken,
  getCookieOptions,
  getClearCookieOptions,
} from "../utils/token.utils.js";
import { AppError } from "../middleware/error.middleware.js";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Register a new user
 * POST /api/auth/register
 */
export const register = async (req, res) => {
  const { name, email, password } = req.body || {};

  // 1. Validate inputs
  if (!name || typeof name !== "string" || name.trim().length < 2) {
    throw new AppError("Full name is required and must be at least 2 characters.", 400);
  }

  if (!email || typeof email !== "string" || !emailRegex.test(email.trim())) {
    throw new AppError("A valid email address is required.", 400);
  }

  if (!password || typeof password !== "string" || password.length < 8) {
    throw new AppError("Password must be at least 8 characters long.", 400);
  }

  // Password complexity: at least 1 uppercase, 1 lowercase, 1 number
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  if (!hasUppercase || !hasLowercase || !hasNumber) {
    throw new AppError(
      "Password must contain at least one uppercase letter, one lowercase letter, and one number.",
      400
    );
  }

  const normalizedEmail = email.trim().toLowerCase();

  // 2. Check for duplicate email
  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    throw new AppError("An account with this email address already exists.", 409);
  }

  // 3. Hash password using existing bcrypt utility
  const passwordHash = await hashPassword(password);

  // 4. Create user with strictly enforced USER role (never accept role from body)
  const newUser = await User.create({
    name: name.trim(),
    email: normalizedEmail,
    passwordHash,
    role: "USER",
  });

  res.status(201).json({
    success: true,
    message: "Registration successful. You can now sign in.",
    user: {
      id: newUser._id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
    },
  });
};

/**
 * Login user and issue access/refresh tokens in HTTP-only cookies
 * POST /api/auth/login
 */
export const login = async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password || typeof email !== "string" || typeof password !== "string") {
    throw new AppError("Email and password are required.", 400);
  }

  const normalizedEmail = email.trim().toLowerCase();

  // 1. Find user with passwordHash
  const user = await User.findOne({ email: normalizedEmail }).select("+passwordHash");
  if (!user) {
    throw new AppError("Invalid email or password.", 401);
  }

  // 2. Compare password
  const isMatch = await comparePassword(password, user.passwordHash);
  if (!isMatch) {
    throw new AppError("Invalid email or password.", 401);
  }

  // 3. Issue short-lived JWT access token (15 mins)
  const accessToken = signAccessToken({
    id: user._id,
    email: user.email,
    role: user.role,
  });

  // 4. Issue cryptographically secure refresh token (7 days)
  const { rawToken, tokenHash } = generateRefreshToken();
  const familyId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  // 5. Store hashed refresh token in MongoDB
  await RefreshToken.create({
    user: user._id,
    tokenHash,
    familyId,
    expiresAt,
  });

  // 6. Set HTTP-only cookies
  res.cookie("accessToken", accessToken, getCookieOptions(false));
  res.cookie("refreshToken", rawToken, getCookieOptions(true));

  res.status(200).json({
    success: true,
    message: "Sign in successful.",
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  });
};

/**
 * Refresh access token using refresh token rotation and replay detection
 * POST /api/auth/refresh
 */
export const refreshToken = async (req, res) => {
  const rawToken = req.cookies?.refreshToken || req.body?.refreshToken;

  if (!rawToken || typeof rawToken !== "string") {
    throw new AppError("Refresh token is required.", 401);
  }

  const tokenHash = hashToken(rawToken);

  // 1. Find token record
  const tokenRecord = await RefreshToken.findOne({ tokenHash });

  if (!tokenRecord) {
    // Clear cookies if token is completely unknown
    res.clearCookie("accessToken", getClearCookieOptions(false));
    res.clearCookie("refreshToken", getClearCookieOptions(true));
    throw new AppError("Invalid refresh session. Please sign in again.", 401);
  }

  // 2. Replay / Reuse Detection: If already revoked, invalidate entire family!
  if (tokenRecord.revokedAt) {
    await RefreshToken.updateMany(
      { familyId: tokenRecord.familyId },
      { revokedAt: new Date() }
    );
    res.clearCookie("accessToken", getClearCookieOptions(false));
    res.clearCookie("refreshToken", getClearCookieOptions(true));
    throw new AppError(
      "Session terminated due to suspected token reuse. Please sign in again.",
      401
    );
  }

  // 3. Check expiration
  if (new Date(tokenRecord.expiresAt) < new Date()) {
    tokenRecord.revokedAt = new Date();
    await tokenRecord.save();
    res.clearCookie("accessToken", getClearCookieOptions(false));
    res.clearCookie("refreshToken", getClearCookieOptions(true));
    throw new AppError("Session expired. Please sign in again.", 401);
  }

  // 4. Token Rotation: Revoke current token and issue successor
  const { rawToken: newRawToken, tokenHash: newTokenHash } = generateRefreshToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  tokenRecord.revokedAt = new Date();
  tokenRecord.replacedByTokenHash = newTokenHash;
  await tokenRecord.save();

  // Create successor token within the same family
  await RefreshToken.create({
    user: tokenRecord.user,
    tokenHash: newTokenHash,
    familyId: tokenRecord.familyId,
    expiresAt,
  });

  // 5. Fetch user and sign fresh access token
  const user = await User.findById(tokenRecord.user).select("-passwordHash");
  if (!user) {
    throw new AppError("User account no longer exists.", 401);
  }

  const accessToken = signAccessToken({
    id: user._id,
    email: user.email,
    role: user.role,
  });

  // 6. Set rotated cookies
  res.cookie("accessToken", accessToken, getCookieOptions(false));
  res.cookie("refreshToken", newRawToken, getCookieOptions(true));

  res.status(200).json({
    success: true,
    message: "Session refreshed successfully.",
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  });
};

/**
 * Logout user by revoking refresh token and clearing cookies
 * POST /api/auth/logout
 */
export const logout = async (req, res) => {
  const rawToken = req.cookies?.refreshToken || req.body?.refreshToken;

  if (rawToken && typeof rawToken === "string") {
    try {
      const tokenHash = hashToken(rawToken);
      await RefreshToken.updateOne({ tokenHash }, { revokedAt: new Date() });
    } catch (_err) {
      // Ignore hashing or db error during logout
    }
  }

  res.clearCookie("accessToken", getClearCookieOptions(false));
  res.clearCookie("refreshToken", getClearCookieOptions(true));

  res.status(200).json({
    success: true,
    message: "Signed out successfully.",
  });
};

/**
 * Return authenticated user's safe profile
 * GET /api/auth/me
 */
export const getMe = async (req, res) => {
  res.status(200).json({
    success: true,
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      createdAt: req.user.createdAt,
    },
  });
};
