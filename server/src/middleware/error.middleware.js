/**
 * Custom application error class for operational errors
 */
export class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Async handler wrapper to forward rejected promises to the centralized error handler in Express 4
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Sanitizes strings, errors, or stack traces to prevent leaking credentials, connection strings, JWTs, or secrets
 */
export const sanitizeMessage = (text) => {
  if (typeof text !== "string") return "An error occurred";
  return text
    .replace(/mongodb(\+srv)?:\/\/[^\s@]+@/gi, "mongodb://***:***@")
    .replace(/eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g, "***JWT***")
    .replace(/(password|token|secret|authorization|key|apiKey|access_token|refresh_token)\s*[:=]\s*["']?([^"',\s&]+)["']?/gi, "$1=***")
    .replace(/bearer\s+[a-zA-Z0-9_\-\.]+/gi, "Bearer ***");
};

/**
 * 404 Handler for undefined API routes
 */
export const notFoundHandler = (req, res, _next) => {
  res.status(404).json({
    success: false,
    message: `Resource not found: ${req.method} ${req.originalUrl}`,
  });
};

/**
 * Centralized Express error handling middleware
 */
export const errorHandler = (err, req, res, _next) => {
  let statusCode = err.statusCode || err.status || 500;
  let message = err.message || "Internal server error";

  // Handle malformed JSON body
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    statusCode = 400;
    message = "Malformed JSON payload";
  }

  // Handle file upload size limit (Multer)
  if (err.code === "LIMIT_FILE_SIZE") {
    statusCode = 413;
    message = "File exceeds the allowed size limit of 25 MB";
  } else if (err.type === "entity.too.large") {
    statusCode = 413;
    message = "Request payload exceeds allowed limit (max 10kb)";
  } else if (statusCode === 413) {
    message = err.message || "Payload exceeds allowed limit";
  }

  // Handle Mongoose Bad ObjectId / CastError
  if (err.name === "CastError") {
    statusCode = 400;
    message = `Invalid format for field: ${err.path}`;
  }

  // Handle Mongoose Validation Error
  if (err.name === "ValidationError") {
    statusCode = 400;
    const errors = Object.values(err.errors || {}).map((e) => e.message);
    message = errors.length > 0 ? errors.join(", ") : "Validation failed";
  }

  // Handle MongoDB Duplicate Key Error (E11000)
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {})[0] || "field";
    message = `A record with this ${field} already exists`;
  }

  const isProduction = process.env.NODE_ENV === "production";

  // In production, mask unexpected 500 errors to prevent leaking internal error details
  let safeMessage;
  if (isProduction && statusCode >= 500 && !err.isOperational) {
    safeMessage = "Internal server error";
  } else {
    safeMessage = sanitizeMessage(message);
  }

  // Safe logging without leaking sensitive data
  if (statusCode >= 500) {
    console.error(`[ERROR] [${new Date().toISOString()}] ${req.method} ${req.originalUrl} - ${sanitizeMessage(message)}`);
  }

  const response = {
    success: false,
    message: safeMessage,
  };

  // Stack traces are strictly excluded in production; in development, sanitized before inclusion
  if (!isProduction && err.stack) {
    response.stack = sanitizeMessage(err.stack);
  }

  res.status(statusCode).json(response);
};
