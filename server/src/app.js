import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import healthRoutes from "./routes/health.routes.js";
import authRoutes from "./routes/auth.routes.js";
import documentRoutes from "./routes/document.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import auditRoutes from "./routes/audit.routes.js";
import sharingRoutes from "./routes/sharing.routes.js";
import { notFoundHandler, errorHandler } from "./middleware/error.middleware.js";

const app = express();

// 1. Secure HTTP Headers with Helmet
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

// 2. CORS configuration with credentials and dynamic local development origins
const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";
const allowedOrigins = [
  clientUrl,
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, server-to-server)
      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        (process.env.NODE_ENV !== "production" &&
          /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))
      ) {
        return callback(null, true);
      }
      return callback(new Error(`CORS blocked for origin: ${origin}`), false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    exposedHeaders: ["Set-Cookie"],
  })
);

// 3. Request Body Size Limits (max 10kb) to prevent payload abuse
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

// 4. Cookie parser for HTTP-only JWT and Refresh tokens
app.use(cookieParser());

// 5. API Routes
app.get("/", (_req, res) => res.json({ success: true, message: "SecureVault API is running" }));
app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/documents", sharingRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/audit-logs", auditRoutes);

// 6. 404 Handler for undefined API routes
app.use(notFoundHandler);

// 7. Centralized Express Error Handling Middleware
app.use(errorHandler);

export default app;
