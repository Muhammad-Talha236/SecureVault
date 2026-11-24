import path from "node:path";
import multer from "multer";
import { AppError } from "./error.middleware.js";

export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

export const ALLOWED_FILE_TYPES = {
  // Documents
  "application/pdf": [".pdf"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/vnd.ms-excel": [".xls", ".csv"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "application/vnd.ms-powerpoint": [".ppt"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
  "text/plain": [".txt"],
  "text/csv": [".csv"],
  // Images
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  // Archives
  "application/zip": [".zip"],
  "application/x-zip-compressed": [".zip"],
};

const ALLOWED_EXTENSIONS = new Set(
  Object.values(ALLOWED_FILE_TYPES).flat()
);

/**
 * Validates file extension and MIME type against the strict allowlist.
 */
const fileFilter = (_req, file, cb) => {
  if (!file || !file.originalname) {
    return cb(new AppError("Invalid file payload.", 400), false);
  }

  const ext = path.extname(file.originalname).toLowerCase();
  const mime = file.mimetype.toLowerCase();

  // Validate extension is in allowlist
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return cb(
      new AppError(
        `Unsupported file extension "${ext}". Allowed types: PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT, CSV, PNG, JPG, ZIP.`,
        400
      ),
      false
    );
  }

  // Validate MIME type is in allowlist and matches extension
  const validExtensionsForMime = ALLOWED_FILE_TYPES[mime];
  if (!validExtensionsForMime || !validExtensionsForMime.includes(ext)) {
    return cb(
      new AppError(
        `File format mismatch or unsupported MIME type "${mime}".`,
        400
      ),
      false
    );
  }

  cb(null, true);
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 1,
  },
  fileFilter,
});

/**
 * Express middleware to handle single file upload with robust error translation.
 */
export const uploadSingleDocument = (req, res, next) => {
  const handler = upload.single("file");

  handler(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return next(
            new AppError("File exceeds the maximum upload limit of 25 MB.", 413)
          );
        }
        if (err.code === "LIMIT_UNEXPECTED_FILE") {
          return next(
            new AppError(`Unexpected field "${err.field}". File must be sent under the "file" field name.`, 400)
          );
        }
        return next(new AppError(`Upload error: ${err.message}`, 400));
      }
      return next(err);
    }

    if (!req.file) {
      return next(new AppError("Please select a file to upload.", 400));
    }

    if (!req.file.buffer || req.file.buffer.length === 0 || req.file.size === 0) {
      return next(
        new AppError("File is empty or corrupt. Empty files cannot be uploaded.", 400)
      );
    }

    next();
  });
};
