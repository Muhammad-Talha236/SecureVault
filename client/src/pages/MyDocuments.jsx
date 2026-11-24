import { useState, useEffect, useCallback } from "react";
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
} from "lucide-react";
import UploadModal, { getFileIcon } from "../components/UploadModal.jsx";
import "./MyDocuments.css";

const FILE_TYPE_FILTERS = [
  { id: "all", label: "All Files" },
  { id: "pdf", label: "PDFs" },
  { id: "document", label: "Word" },
  { id: "spreadsheet", label: "Spreadsheets" },
  { id: "image", label: "Images" },
  { id: "archive", label: "Archives (ZIP)" },
  { id: "text", label: "Text / Code" },
];

const formatDocumentDate = (dateString) => {
  if (!dateString) return "Unknown";
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
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

      const res = await fetch(`/api/documents?${queryParams.toString()}`, {
        method: "GET",
        credentials: "include",
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to load documents.");
      }

      const data = await res.json();
      setDocuments(data.documents || []);
      setPagination(
        data.pagination || { total: data.count || 0, page, limit: 15, totalPages: 1 }
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
    if (downloadingId) return; // Prevent concurrent repeated clicks

    try {
      setDownloadingId(doc.id);
      setError("");
      setSuccessMsg("");

      const response = await fetch(`/api/documents/${doc.id}/download`, {
        method: "GET",
        credentials: "include",
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

      setSuccessMsg(`"${filename}" was decrypted and downloaded successfully.`);
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

      const res = await fetch(`/api/documents/${deleteTarget.id}`, {
        method: "DELETE",
        credentials: "include",
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
          setSuccessMsg("Document encrypted and added to your vault.");
          setTimeout(() => setSuccessMsg(""), 4000);
        }}
      />

      {/* Page Header */}
      <header className="docs-header">
        <div className="docs-header-copy">
          <h1>My Documents</h1>
          <p>End-to-end AES-256-GCM encrypted document vault.</p>
        </div>

        <div className="docs-header-actions">
          <button
            type="button"
            className="docs-refresh-btn"
            onClick={fetchDocuments}
            disabled={loading}
            title="Refresh document list"
          >
            <RefreshCw size={16} className={loading ? "docs-spinner" : ""} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            className="primary-button"
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
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
          <button
            type="button"
            className="docs-alert-close"
            onClick={() => setError("")}
            aria-label="Dismiss error"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="docs-alert success" role="status">
          <div className="docs-alert-inner">
            <CheckCircle2 size={18} />
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

      {/* Search and Filters */}
      <section className="docs-toolbar">
        <div className="docs-search-wrapper">
          <Search size={17} className="docs-search-icon" />
          <input
            type="text"
            className="docs-search-input"
            placeholder="Search documents by name..."
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
                setSearch(e.target.value);
                setPage(1);
              }}
              aria-label="Clear search"
            >
              <X size={15} />
            </button>
          )}
        </div>

        <div className="docs-filter-group" role="tablist">
          {FILE_TYPE_FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              className={`docs-filter-btn ${selectedType === filter.id ? "active" : ""}`}
              onClick={() => {
                setSelectedType(filter.id);
                setPage(1);
              }}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </section>

      {/* Main Table / Grid View */}
      <div className="docs-table-card">
        {loading && documents.length === 0 ? (
          <div className="docs-state-card">
            <div className="docs-state-icon">
              <Loader2 size={32} className="docs-spinner" />
            </div>
            <h3>Loading documents...</h3>
            <p>Retrieving your encrypted vault records securely.</p>
          </div>
        ) : documents.length === 0 ? (
          <div className="docs-state-card">
            <div className="docs-state-icon">
              <FolderLock size={32} />
            </div>
            <h3>No documents found</h3>
            <p>
              {search || selectedType !== "all"
                ? "No stored documents match your search criteria. Try clearing filters."
                : "You have not uploaded any documents yet. Get started by uploading your first encrypted file."}
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
                <span>Upload Document</span>
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="docs-table-container">
              <table className="docs-table">
                <thead>
                  <tr>
                    <th>Document Name</th>
                    <th>File Format</th>
                    <th>Size</th>
                    <th>Upload Date</th>
                    <th>Security Status</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((doc) => {
                    const DocIcon = getFileIcon(doc.mimeType, doc.originalName);
                    const isDownloadingThis = downloadingId === doc.id;

                    return (
                      <tr key={doc.id}>
                        <td>
                          <div className="doc-name-cell">
                            <div className="doc-type-icon">
                              <DocIcon size={20} />
                            </div>
                            <div className="doc-name-meta">
                              <span className="doc-title" title={doc.originalName}>
                                {doc.originalName}
                              </span>
                              <span className="doc-sub">AES-256-GCM Encrypted</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span style={{ textTransform: "uppercase", fontSize: "12px", color: "var(--muted)" }}>
                            {doc.mimeType?.split("/")[1] || "File"}
                          </span>
                        </td>
                        <td>
                          <strong>{doc.formattedSize || "0 B"}</strong>
                        </td>
                        <td>
                          <span style={{ color: "var(--muted)", fontSize: "12.5px" }}>
                            {formatDocumentDate(doc.createdAt)}
                          </span>
                        </td>
                        <td>
                          <span className="doc-status-badge">
                            <span className="status-dot" />
                            {doc.status || "ACTIVE"}
                          </span>
                        </td>
                        <td>
                          <div className="doc-actions-cell">
                            <button
                              type="button"
                              className="doc-download-btn"
                              onClick={() => handleDownload(doc)}
                              disabled={downloadingId !== null || isDeleting}
                              title="Decrypt and download this document"
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
                              className="doc-delete-btn"
                              onClick={() => setDeleteTarget(doc)}
                              disabled={downloadingId !== null || isDeleting}
                              title="Permanently delete this document"
                              aria-label={`Delete ${doc.originalName}`}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {pagination.totalPages > 1 && (
              <div className="docs-pagination">
                <span>
                  Showing {documents.length} of {pagination.total} documents
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
      {/* Delete Confirmation Modal */}
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
                  <p>Permanent Zero-Knowledge Purge</p>
                </div>
              </div>

              <div className="delete-modal-file-box">
                <span className="delete-modal-file-name" title={deleteTarget.originalName}>
                  {deleteTarget.originalName}
                </span>
                <span className="delete-modal-file-size">
                  {deleteTarget.formattedSize}
                </span>
              </div>

              <div className="delete-warning-callout">
                <strong>Warning:</strong> This document will be permanently deleted from the database and its ciphertext completely purged from private cloud storage. This operation cannot be undone.
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
