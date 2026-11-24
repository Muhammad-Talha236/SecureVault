import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import {
  FolderLock,
  CloudUpload,
  Download,
  Trash2,
  AlertTriangle,
  Search,
  X,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Loader2,
  FileText,
  FileSpreadsheet,
  FileImage,
  FileArchive,
  FileCode,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Lock,
  Calendar,
  HardDrive,
  FileCheck2,
} from "lucide-react";
import UploadModal from "../components/UploadModal.jsx";
import { secureFetch } from "../utils/api.js";
import "./MyDocuments.css";

const FILE_TYPE_FILTERS = [
  { id: "all", label: "All Files" },
  { id: "pdf", label: "PDF" },
  { id: "document", label: "Word" },
  { id: "spreadsheet", label: "Spreadsheets" },
  { id: "image", label: "Images" },
  { id: "archive", label: "Archives" },
  { id: "text", label: "Text / Code" },
];

/**
 * Returns a short, clean uppercase extension badge (e.g., PDF, DOCX, XLSX, PNG, ZIP, TXT)
 * Never displays raw MIME types.
 */
export const getFileExtensionBadge = (fileName = "", mimeType = "") => {
  if (fileName && fileName.includes(".")) {
    const ext = fileName.split(".").pop()?.trim().toUpperCase();
    if (ext && ext.length >= 1 && ext.length <= 5) return ext;
  }
  if (mimeType) {
    const lower = mimeType.toLowerCase();
    if (lower.includes("pdf")) return "PDF";
    if (lower.includes("word") || lower.includes("document")) return "DOCX";
    if (lower.includes("sheet") || lower.includes("excel")) return "XLSX";
    if (lower.includes("presentation") || lower.includes("powerpoint")) return "PPTX";
    if (lower.includes("csv")) return "CSV";
    if (lower.includes("png")) return "PNG";
    if (lower.includes("jpeg") || lower.includes("jpg")) return "JPG";
    if (lower.includes("zip")) return "ZIP";
    if (lower.includes("text")) return "TXT";
  }
  return "FILE";
};

/**
 * Returns human-friendly category label and badge styling variant
 */
export const getFileTypeInfo = (fileName = "", mimeType = "") => {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const mime = (mimeType || "").toLowerCase();

  if (ext === "pdf" || mime.includes("pdf")) {
    return { label: "PDF Document", variant: "pdf", Icon: FileText };
  }
  if (["doc", "docx"].includes(ext) || mime.includes("word")) {
    return { label: "Word Document", variant: "word", Icon: FileText };
  }
  if (["xls", "xlsx", "csv"].includes(ext) || mime.includes("spreadsheet") || mime.includes("excel")) {
    return { label: "Spreadsheet", variant: "excel", Icon: FileSpreadsheet };
  }
  if (["ppt", "pptx"].includes(ext) || mime.includes("presentation")) {
    return { label: "Presentation", variant: "ppt", Icon: FileText };
  }
  if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext) || mime.includes("image")) {
    return { label: "Image", variant: "image", Icon: FileImage };
  }
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext) || mime.includes("zip")) {
    return { label: "Archive", variant: "archive", Icon: FileArchive };
  }
  if (["txt", "md", "json", "js", "html", "css", "py", "ts"].includes(ext) || mime.includes("text")) {
    return { label: "Text / Code", variant: "code", Icon: FileCode };
  }
  return { label: "Document", variant: "default", Icon: FileText };
};

const formatDocumentDate = (dateString) => {
  if (!dateString) return "—";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatDocumentTime = (dateString) => {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function MyDocuments() {
  const [documents, setDocuments] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 15, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [search, setSearch] = useState("");
  const [selectedType, setSelectedType] = useState("all");
  const [page, setPage] = useState(1);

  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [openMenuId, setOpenMenuId] = useState(null);

  const searchInputRef = useRef(null);

  // Close three-dot dropdown on click outside or escape
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest(".doc-actions-cell") && !e.target.closest(".doc-mobile-actions")) {
        setOpenMenuId(null);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setOpenMenuId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Fetch documents from backend API
  const fetchDocuments = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const queryParams = new URLSearchParams({
        page: String(page),
        limit: "15",
      });

      if (search.trim()) {
        queryParams.append("search", search.trim());
      }

      if (selectedType !== "all") {
        queryParams.append("type", selectedType);
      }

      const res = await secureFetch(`/api/documents?${queryParams.toString()}`, {
        method: "GET",
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to load documents.");
      }

      const data = await res.json();
      setDocuments(data.documents || []);
      setPagination(
        data.pagination || { total: data.count || (data.documents ? data.documents.length : 0), page, limit: 15, totalPages: 1 }
      );
    } catch (err) {
      setError(err.message || "Unable to connect to SecureVault server.");
    } finally {
      setLoading(false);
    }
  }, [page, search, selectedType]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // Handle Download and In-Memory Decryption
  const handleDownload = async (doc) => {
    if (downloadingId) return;

    try {
      setDownloadingId(doc.id);
      setOpenMenuId(null);
      setError("");
      setSuccessMsg("");

      const response = await secureFetch(`/api/documents/${doc.id}/download`, {
        method: "GET",
      });

      if (!response.ok) {
        let errMsg = "Download failed.";
        try {
          const errBody = await response.json();
          errMsg = errBody.message || errMsg;
        } catch (_jsonErr) {
          errMsg = `Server responded with status ${response.status}`;
        }
        throw new Error(errMsg);
      }

      // Extract filename from Content-Disposition header if available
      const disposition = response.headers.get("Content-Disposition");
      let filename = doc.originalName;
      if (disposition && disposition.includes("filename=")) {
        const match = disposition.match(/filename\*?=['"]?(?:UTF-\d['"]*)?([^;\r\n"']*)['"]?/i);
        if (match && match[1]) {
          try {
            filename = decodeURIComponent(match[1]);
          } catch (_e) {
            filename = match[1];
          }
        }
      }

      // Create blob from decrypted stream and trigger browser download
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const tempLink = document.createElement("a");
      tempLink.href = downloadUrl;
      tempLink.download = filename;
      document.body.appendChild(tempLink);
      tempLink.click();
      document.body.removeChild(tempLink);
      window.URL.revokeObjectURL(downloadUrl);

      setSuccessMsg(`"${filename}" decrypted and downloaded successfully.`);
      setTimeout(() => setSuccessMsg(""), 5000);
    } catch (err) {
      setError(err.message || "An unexpected error occurred during document download.");
    } finally {
      setDownloadingId(null);
    }
  };

  // Handle Secure Deletion
  const handleConfirmDelete = async () => {
    if (!deleteTarget || isDeleting) return;

    try {
      setIsDeleting(true);
      setError("");
      setSuccessMsg("");

      const res = await secureFetch(`/api/documents/${deleteTarget.id}`, {
        method: "DELETE",
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.message || "Failed to delete document.");
      }

      const deletedName = deleteTarget.originalName;
      setDeleteTarget(null);
      setSuccessMsg(`"${deletedName}" and its encrypted storage were permanently deleted.`);
      setTimeout(() => setSuccessMsg(""), 5000);
      fetchDocuments();
    } catch (err) {
      setError(err.message || "An unexpected error occurred during document deletion.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="docs-page-container">
      {/* Upload Modal Dialog */}
      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUploadSuccess={() => {
          fetchDocuments();
          setSuccessMsg("Document encrypted with AES-256-GCM and stored in your vault.");
          setTimeout(() => setSuccessMsg(""), 4500);
        }}
      />

      {/* 2. Page Header */}
      <header className="docs-header">
        <div className="docs-header-copy">
          <div className="docs-header-title-row">
            <div className="docs-header-icon-mark">
              <FolderLock size={22} />
            </div>
            <h1>My Documents</h1>
          </div>
          <p>Secure document storage with AES-256-GCM encryption.</p>
        </div>

        <div className="docs-header-actions">
          <button
            type="button"
            className="docs-refresh-btn"
            onClick={fetchDocuments}
            disabled={loading}
            title="Refresh document list"
          >
            <RefreshCw size={15} className={loading ? "docs-spinner" : ""} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            className="primary-button docs-upload-cta"
            onClick={() => setIsUploadOpen(true)}
            title="Upload and encrypt a new document"
          >
            <CloudUpload size={17} />
            <span>Upload Document</span>
          </button>
        </div>
      </header>

      {/* Feedback Alerts */}
      {error && (
        <div className="docs-alert error" role="alert">
          <div className="docs-alert-inner">
            <AlertCircle size={18} className="alert-icon" />
            <span>{error}</span>
          </div>
          <div className="docs-alert-actions">
            <button
              type="button"
              className="docs-alert-retry"
              onClick={fetchDocuments}
            >
              Retry
            </button>
            <button
              type="button"
              className="docs-alert-close"
              onClick={() => setError("")}
              aria-label="Dismiss error"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {successMsg && (
        <div className="docs-alert success" role="status">
          <div className="docs-alert-inner">
            <CheckCircle2 size={18} className="alert-icon" />
            <span>{successMsg}</span>
          </div>
          <button
            type="button"
            className="docs-alert-close"
            onClick={() => setSuccessMsg("")}
            aria-label="Dismiss message"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* 4. Search and Filters Toolbar */}
      <section className="docs-toolbar">
        <div className="docs-search-wrapper">
          <Search size={16} className="docs-search-icon" />
          <input
            ref={searchInputRef}
            type="text"
            className="docs-search-input"
            placeholder="Search documents by filename..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          {search && (
            <button
              type="button"
              className="docs-search-clear"
              onClick={() => {
                setSearch("");
                setPage(1);
                searchInputRef.current?.focus();
              }}
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="docs-filter-scroller" role="tablist">
          {FILE_TYPE_FILTERS.map((filter) => {
            const isActive = selectedType === filter.id;
            return (
              <button
                key={filter.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`docs-filter-btn ${isActive ? "active" : ""}`}
                onClick={() => {
                  setSelectedType(filter.id);
                  setPage(1);
                }}
              >
                {filter.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* 5. Document Presentation: Modern Table + Mobile Cards */}
      <div className="docs-table-card">
        {loading && documents.length === 0 ? (
          <div className="docs-state-card">
            <div className="docs-state-icon">
              <Loader2 size={32} className="docs-spinner" />
            </div>
            <h3>Loading documents...</h3>
            <p>Accessing your encrypted vault records securely.</p>
          </div>
        ) : documents.length === 0 ? (
          <div className="docs-state-card">
            <div className="docs-state-icon empty">
              <FolderLock size={34} />
            </div>
            <h3>No documents found</h3>
            <p>
              {search || selectedType !== "all"
                ? "No stored documents match your search or filter criteria. Try adjusting your search term."
                : "You haven't uploaded any documents to your secure vault yet."}
            </p>
            {search || selectedType !== "all" ? (
              <button
                type="button"
                className="docs-refresh-btn"
                onClick={() => {
                  setSearch("");
                  setSelectedType("all");
                  setPage(1);
                }}
              >
                Clear Filters
              </button>
            ) : (
              <button
                type="button"
                className="primary-button"
                onClick={() => setIsUploadOpen(true)}
              >
                <CloudUpload size={17} />
                <span>Upload First Document</span>
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop / Tablet Table View */}
            <div className="docs-table-wrapper">
              <table className="docs-table">
                <thead>
                  <tr>
                    <th className="th-doc">Document</th>
                    <th className="th-format">Format</th>
                    <th className="th-size">Size</th>
                    <th className="th-date">Upload Date</th>
                    <th className="th-security">Security</th>
                    <th className="th-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((doc) => {
                    const extBadge = getFileExtensionBadge(doc.originalName, doc.mimeType);
                    const typeInfo = getFileTypeInfo(doc.originalName, doc.mimeType);
                    const FileIcon = typeInfo.Icon;
                    const isDownloadingThis = downloadingId === doc.id;
                    const isMenuOpen = openMenuId === doc.id;

                    return (
                      <tr key={doc.id} className={isDownloadingThis ? "row-downloading" : ""}>
                        {/* 1. File icon + Original Filename + Extension Badge */}
                        <td className="td-doc">
                          <div className="doc-item-cell">
                            <div className={`doc-icon-badge ${typeInfo.variant}`}>
                              <FileIcon size={20} />
                            </div>
                            <div className="doc-item-info">
                              <div className="doc-title-row">
                                <span className="doc-item-name" title={doc.originalName}>
                                  {doc.originalName}
                                </span>
                                <span className={`doc-ext-badge ${typeInfo.variant}`}>
                                  {extBadge}
                                </span>
                              </div>
                              <span className="doc-mobile-meta-sub">
                                {doc.formattedSize || "0 B"} • {formatDocumentDate(doc.createdAt)}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* 2. Format Category (never raw MIME) */}
                        <td className="td-format">
                          <span className="doc-format-label">
                            {typeInfo.label}
                          </span>
                        </td>

                        {/* 3. Human-readable file size */}
                        <td className="td-size">
                          <span className="doc-size-text">
                            {doc.formattedSize || "0 B"}
                          </span>
                        </td>

                        {/* 4. Upload Date */}
                        <td className="td-date">
                          <div className="doc-date-cell">
                            <span className="doc-date-main">
                              {formatDocumentDate(doc.createdAt)}
                            </span>
                            <span className="doc-time-sub">
                              {formatDocumentTime(doc.createdAt)}
                            </span>
                          </div>
                        </td>

                        {/* 5. Encrypted Security Status */}
                        <td className="td-security">
                          <span
                            className="doc-security-badge"
                            title="Encrypted in-memory with AES-256-GCM. Supabase receives ciphertext only."
                          >
                            <ShieldCheck size={13} className="security-icon" />
                            <span>AES-256-GCM</span>
                          </span>
                        </td>

                        {/* 6. Document Actions Menu */}
                        <td className="td-actions">
                          <div className="doc-actions-cell">
                            {/* Direct Download Quick Button on Desktop */}
                            <button
                              type="button"
                              className="doc-quick-action-btn download"
                              onClick={() => handleDownload(doc)}
                              disabled={downloadingId !== null || isDeleting}
                              title="Decrypt and download file"
                              aria-label={`Download ${doc.originalName}`}
                            >
                              {isDownloadingThis ? (
                                <Loader2 size={15} className="docs-spinner" />
                              ) : (
                                <Download size={15} />
                              )}
                            </button>

                            {/* Three-Dot Dropdown Menu */}
                            <div className="doc-menu-wrapper">
                              <button
                                type="button"
                                className={`doc-menu-trigger ${isMenuOpen ? "active" : ""}`}
                                onClick={() => setOpenMenuId(isMenuOpen ? null : doc.id)}
                                aria-label="More document options"
                                aria-expanded={isMenuOpen}
                                title="More options"
                              >
                                <MoreVertical size={16} />
                              </button>

                              {isMenuOpen && (
                                <div className="doc-actions-dropdown" role="menu">
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className="dropdown-item"
                                    onClick={() => handleDownload(doc)}
                                    disabled={downloadingId !== null || isDeleting}
                                  >
                                    <Download size={15} />
                                    <span>Download &amp; Decrypt</span>
                                  </button>
                                  <div className="dropdown-divider" />
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className="dropdown-item danger"
                                    onClick={() => {
                                      setOpenMenuId(null);
                                      setDeleteTarget(doc);
                                    }}
                                    disabled={downloadingId !== null || isDeleting}
                                  >
                                    <Trash2 size={15} />
                                    <span>Delete Document</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Document Cards View (shown on <= 768px screens) */}
            <div className="docs-mobile-cards">
              {documents.map((doc) => {
                const extBadge = getFileExtensionBadge(doc.originalName, doc.mimeType);
                const typeInfo = getFileTypeInfo(doc.originalName, doc.mimeType);
                const FileIcon = typeInfo.Icon;
                const isDownloadingThis = downloadingId === doc.id;
                const isMenuOpen = openMenuId === doc.id;

                return (
                  <div key={doc.id} className="doc-mobile-card">
                    <div className="doc-mobile-header">
                      <div className={`doc-icon-badge ${typeInfo.variant}`}>
                        <FileIcon size={20} />
                      </div>
                      <div className="doc-mobile-title-col">
                        <div className="doc-title-row">
                          <span className="doc-item-name" title={doc.originalName}>
                            {doc.originalName}
                          </span>
                          <span className={`doc-ext-badge ${typeInfo.variant}`}>
                            {extBadge}
                          </span>
                        </div>
                        <span className="doc-format-label">{typeInfo.label}</span>
                      </div>

                      {/* Mobile Three-Dot Menu */}
                      <div className="doc-menu-wrapper">
                        <button
                          type="button"
                          className={`doc-menu-trigger ${isMenuOpen ? "active" : ""}`}
                          onClick={() => setOpenMenuId(isMenuOpen ? null : doc.id)}
                          aria-label="Document options"
                        >
                          <MoreVertical size={16} />
                        </button>
                        {isMenuOpen && (
                          <div className="doc-actions-dropdown" role="menu">
                            <button
                              type="button"
                              role="menuitem"
                              className="dropdown-item"
                              onClick={() => handleDownload(doc)}
                              disabled={downloadingId !== null || isDeleting}
                            >
                              <Download size={15} />
                              <span>Download &amp; Decrypt</span>
                            </button>
                            <div className="dropdown-divider" />
                            <button
                              type="button"
                              role="menuitem"
                              className="dropdown-item danger"
                              onClick={() => {
                                setOpenMenuId(null);
                                setDeleteTarget(doc);
                              }}
                              disabled={downloadingId !== null || isDeleting}
                            >
                              <Trash2 size={15} />
                              <span>Delete Document</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="doc-mobile-metadata">
                      <div className="meta-pill">
                        <HardDrive size={13} />
                        <span>{doc.formattedSize || "0 B"}</span>
                      </div>
                      <div className="meta-pill">
                        <Calendar size={13} />
                        <span>{formatDocumentDate(doc.createdAt)}</span>
                      </div>
                      <div className="meta-pill security">
                        <ShieldCheck size={13} />
                        <span>AES-256-GCM</span>
                      </div>
                    </div>

                    <div className="doc-mobile-actions">
                      <button
                        type="button"
                        className="mobile-action-btn download"
                        onClick={() => handleDownload(doc)}
                        disabled={downloadingId !== null || isDeleting}
                      >
                        {isDownloadingThis ? (
                          <>
                            <Loader2 size={15} className="docs-spinner" />
                            <span>Decrypting...</span>
                          </>
                        ) : (
                          <>
                            <Download size={15} />
                            <span>Download</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        className="mobile-action-btn delete"
                        onClick={() => setDeleteTarget(doc)}
                        disabled={downloadingId !== null || isDeleting}
                        aria-label="Delete document"
                      >
                        <Trash2 size={15} />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination Controls */}
            {pagination.totalPages > 1 && (
              <div className="docs-pagination">
                <span className="pagination-count-label">
                  Showing <strong>{documents.length}</strong> of <strong>{pagination.total}</strong> documents
                </span>
                <div className="docs-pagination-btns">
                  <button
                    type="button"
                    className="pagination-btn"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1 || loading}
                    aria-label="Previous page"
                  >
                    <ChevronLeft size={16} />
                  </button>

                  <span className="pagination-page-indicator">
                    Page {page} of {pagination.totalPages}
                  </span>

                  <button
                    type="button"
                    className="pagination-btn"
                    onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                    disabled={page >= pagination.totalPages || loading}
                    aria-label="Next page"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* 6. Delete Confirmation Modal */}
      {deleteTarget &&
        createPortal(
          <div
            className="delete-modal-overlay"
            onClick={(e) => {
              if (e.target === e.currentTarget && !isDeleting) setDeleteTarget(null);
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-title"
          >
            <div className="delete-modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="delete-modal-header">
                <div className="delete-modal-icon-badge">
                  <AlertTriangle size={22} />
                </div>
                <div className="delete-modal-header-copy">
                  <h3 id="delete-dialog-title">Delete Encrypted Document</h3>
                  <p>Permanent Zero-Knowledge Storage Purge</p>
                </div>
              </div>

              <div className="delete-modal-file-box">
                <div className="delete-file-row">
                  <span className="delete-modal-file-name" title={deleteTarget.originalName}>
                    {deleteTarget.originalName}
                  </span>
                  <span className="delete-modal-file-size">
                    {deleteTarget.formattedSize}
                  </span>
                </div>
                <div className="delete-file-security-note">
                  <Lock size={12} />
                  <span>Ciphertext in Supabase Storage will be purged permanently.</span>
                </div>
              </div>

              <div className="delete-warning-callout">
                <strong>Irreversible Action:</strong> This document and its encrypted storage object will be permanently removed. Neither the ciphertext nor the metadata can be recovered.
              </div>

              <div className="delete-modal-actions">
                <button
                  type="button"
                  className="delete-btn-cancel"
                  onClick={() => setDeleteTarget(null)}
                  disabled={isDeleting}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  className="delete-btn-confirm"
                  onClick={handleConfirmDelete}
                  disabled={isDeleting}
                >
                  {isDeleting ? (
                    <>
                      <Loader2 size={16} className="docs-spinner" />
                      <span>Purging Storage...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 size={16} />
                      <span>Permanently Delete</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
