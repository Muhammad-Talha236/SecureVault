import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  CloudUpload,
  FileText,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldCheck,
  Lock,
  Trash2,
  FileCode,
} from "lucide-react";
import { secureFetch } from "../utils/api.js";
import "./UploadModal.css";

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
const ALLOWED_EXTENSIONS = [
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".txt", ".csv", ".png", ".jpg", ".jpeg", ".zip",
];

export const getFileIcon = (mimeType = "", fileName = "") => {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (mimeType.includes("image") || ["png", "jpg", "jpeg"].includes(ext)) {
    return FileImage;
  }
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || ["xls", "xlsx", "csv"].includes(ext)) {
    return FileSpreadsheet;
  }
  if (mimeType.includes("zip") || ["zip"].includes(ext)) {
    return FileArchive;
  }
  if (["txt", "md", "json", "js", "html"].includes(ext)) {
    return FileCode;
  }
  return FileText;
};

export const formatBytes = (bytes) => {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

export default function UploadModal({ isOpen, onClose, onUploadSuccess }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const fileInputRef = useRef(null);

  // Close on Escape key and lock background scrolling
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === "Escape" && !isUploading) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen, isUploading, onClose]);

  if (!isOpen) return null;

  const validateFile = (file) => {
    if (!file) return "Please select a file to upload.";
    if (file.size === 0) return "File is empty (0 bytes). Empty files cannot be uploaded.";
    if (file.size > MAX_FILE_SIZE) {
      return `File exceeds maximum allowed size of 25 MB (${formatBytes(file.size)}).`;
    }

    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return `Unsupported file format "${ext}". Allowed: PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT, CSV, PNG, JPG, ZIP.`;
    }

    return null;
  };

  const handleFileChange = (file) => {
    setError("");
    setSuccess("");
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      setSelectedFile(null);
      return;
    }
    setSelectedFile(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedFile) {
      setError("Please select a valid document to upload.");
      return;
    }

    const validationError = validateFile(selectedFile);
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setIsUploading(true);
      setError("");

      const formData = new FormData();
      formData.append("file", selectedFile);

      const res = await secureFetch("/api/documents", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to upload document.");
      }

      setSuccess("Document encrypted with AES-256-GCM and stored securely!");
      setSelectedFile(null);

      if (onUploadSuccess) {
        onUploadSuccess(data.document);
      }

      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err) {
      setError(err.message || "An unexpected error occurred during upload.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleClose = () => {
    if (!isUploading) {
      setError("");
      setSuccess("");
      setSelectedFile(null);
      onClose();
    }
  };

  const SelectedIcon = selectedFile
    ? getFileIcon(selectedFile.type, selectedFile.name)
    : FileText;

  const modalContent = (
    <div
      className="sv-upload-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isUploading) handleClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="sv-upload-title"
    >
      <div className="sv-upload-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="sv-upload-header">
          <div className="sv-upload-header-left">
            <div className="sv-upload-header-badge">
              <CloudUpload size={22} />
            </div>
            <div>
              <h2 id="sv-upload-title" className="sv-upload-title">
                Upload &amp; Encrypt Document
              </h2>
              <p className="sv-upload-subtitle">
                Encrypted in-memory with AES-256-GCM before storage
              </p>
            </div>
          </div>
          <button
            type="button"
            className="sv-modal-close-btn"
            onClick={handleClose}
            disabled={isUploading}
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        {/* Feedback alerts */}
        {error && (
          <div className="sv-upload-alert error" role="alert">
            <AlertCircle size={18} className="sv-alert-icon" />
            <div className="sv-alert-content">
              <strong>Upload failed</strong>
              <span>{error}</span>
            </div>
          </div>
        )}

        {success && (
          <div className="sv-upload-alert success" role="status">
            <CheckCircle2 size={18} className="sv-alert-icon" />
            <div className="sv-alert-content">
              <strong>Success</strong>
              <span>{success}</span>
            </div>
          </div>
        )}

        {/* Upload Form */}
        <form onSubmit={handleSubmit} className="sv-upload-form">
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: "none" }}
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFileChange(e.target.files[0]);
              }
            }}
            disabled={isUploading}
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.png,.jpg,.jpeg,.zip"
          />

          {!selectedFile ? (
            <div
              className={`sv-dropzone ${isDragging ? "dragging" : ""}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  fileInputRef.current?.click();
                }
              }}
            >
              <div className="sv-dropzone-icon-ring">
                <CloudUpload size={32} className="sv-dropzone-icon" />
              </div>
              <div className="sv-dropzone-text">
                <h3 className="sv-dropzone-title">
                  Drag &amp; drop your document here
                </h3>
                <p className="sv-dropzone-sub">
                  or <span className="sv-browse-link">browse files</span> from your computer
                </p>
              </div>
              <div className="sv-format-tags">
                <span className="sv-format-tag">PDF</span>
                <span className="sv-format-tag">DOCX</span>
                <span className="sv-format-tag">XLSX</span>
                <span className="sv-format-tag">PPTX</span>
                <span className="sv-format-tag">IMAGES</span>
                <span className="sv-format-tag">ZIP</span>
                <span className="sv-format-tag-limit">Max 25 MB</span>
              </div>
            </div>
          ) : (
            <div className="sv-file-selected-box">
              <div className="sv-file-preview-icon">
                <SelectedIcon size={26} />
              </div>
              <div className="sv-file-preview-details">
                <span className="sv-file-preview-name" title={selectedFile.name}>
                  {selectedFile.name}
                </span>
                <span className="sv-file-preview-meta">
                  {formatBytes(selectedFile.size)} &bull; Ready to encrypt
                </span>
              </div>
              <button
                type="button"
                className="sv-file-remove-btn"
                onClick={() => setSelectedFile(null)}
                disabled={isUploading}
                title="Remove selected file"
                aria-label="Remove selected file"
              >
                <Trash2 size={16} />
              </button>
            </div>
          )}

          {/* Security guarantee pill */}
          <div className="sv-security-banner">
            <div className="sv-security-icon-wrap">
              <Lock size={15} />
            </div>
            <div className="sv-security-copy">
              <strong>AES-256-GCM Zero-Knowledge Security</strong>
              <p>
                Files are sealed with authenticated encryption, a 96-bit unique IV,
                and SHA-256 cryptographic integrity hash.
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="sv-upload-actions">
            <button
              type="button"
              className="sv-btn-cancel"
              onClick={handleClose}
              disabled={isUploading}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="sv-btn-submit"
              disabled={!selectedFile || isUploading}
            >
              {isUploading ? (
                <>
                  <Loader2 size={18} className="sv-spinner" />
                  <span>Encrypting &amp; Uploading...</span>
                </>
              ) : (
                <>
                  <ShieldCheck size={18} />
                  <span>Encrypt &amp; Upload</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
