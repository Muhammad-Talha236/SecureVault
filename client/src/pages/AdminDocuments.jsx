import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import {
  FileText,
  Search,
  X,
  RefreshCw,
  Calendar,
  AlertCircle,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Info,
  FileSpreadsheet,
  FileImage,
  FileArchive,
  FileCode,
  Share2,
  User,
  Clock,
  HardDrive,
  Eye,
} from "lucide-react";
import { secureFetch } from "../utils/api.js";
import "./AdminPages.css";

const FORMAT_FILTERS = [
  { id: "all", label: "All Formats" },
  { id: "pdf", label: "PDF" },
  { id: "doc", label: "Word" },
  { id: "spreadsheet", label: "Spreadsheets" },
  { id: "image", label: "Images" },
  { id: "archive", label: "Archives" },
  { id: "text", label: "Text" },
];

const STATUS_FILTERS = [
  { id: "all", label: "All Statuses" },
  { id: "active", label: "Active" },
  { id: "deleted", label: "Deleted" },
];

const getFileIcon = (mimeType = "", fileName = "") => {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (mimeType.includes("image") || ["png", "jpg", "jpeg", "webp"].includes(ext)) {
    return FileImage;
  }
  if (
    mimeType.includes("spreadsheet") ||
    mimeType.includes("excel") ||
    ["xls", "xlsx", "csv"].includes(ext)
  ) {
    return FileSpreadsheet;
  }
  if (mimeType.includes("zip") || ["zip", "rar", "7z", "tar", "gz"].includes(ext)) {
    return FileArchive;
  }
  if (["txt", "md", "json", "js", "html"].includes(ext)) {
    return FileCode;
  }
  return FileText;
};

const formatShortDate = (dateString) => {
  if (!dateString) return "—";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatShortTime = (dateString) => {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function AdminDocuments() {
  const [documents, setDocuments] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 15, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [selectedFormat, setSelectedFormat] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [page, setPage] = useState(1);

  // Document details modal
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [docPermissions, setDocPermissions] = useState([]);
  const [loadingPermissions, setLoadingPermissions] = useState(false);

  const searchInputRef = useRef(null);

  const fetchDocuments = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const params = new URLSearchParams();
      params.set("page", page.toString());
      params.set("limit", "15");

      if (search.trim()) {
        params.set("search", search.trim());
      }
      if (selectedFormat !== "all") {
        params.set("type", selectedFormat);
      }
      if (selectedStatus !== "all") {
        params.set("status", selectedStatus.toUpperCase());
      }

      const res = await secureFetch(`/api/admin/documents?${params.toString()}`, {
        method: "GET",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to load document records.");
      }

      const data = await res.json();
      setDocuments(data.documents || []);
      setPagination(data.pagination || { total: 0, page: 1, limit: 15, totalPages: 1 });
    } catch (err) {
      setError(err.message || "Unable to retrieve document records.");
    } finally {
      setLoading(false);
    }
  }, [page, search, selectedFormat, selectedStatus]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // Handle opening details modal
  const handleOpenDetails = async (doc) => {
    setSelectedDoc(doc);
    setDocPermissions([]);
    setLoadingPermissions(true);

    try {
      const res = await secureFetch(`/api/admin/documents/${doc.id}/permissions`, {
        method: "GET",
      });
      if (res.ok) {
        const data = await res.json();
        setDocPermissions(data.permissions || []);
      }
    } catch (_err) {
      // Non-critical, ignore permissions fetch error
    } finally {
      setLoadingPermissions(false);
    }
  };

  const handleCloseDetails = () => {
    setSelectedDoc(null);
    setDocPermissions([]);
  };

  const handleClearSearch = () => {
    setSearch("");
    setPage(1);
    searchInputRef.current?.focus();
  };

  return (
    <div className="admin-page-container">
      {/* 1. Page Header */}
      <header className="admin-header">
        <div className="admin-header-copy">
          <div className="admin-header-title-row">
            <div className="admin-header-icon-mark">
              <FileText size={22} />
            </div>
            <h1>Document Records</h1>
            <span className="admin-counter-badge">{pagination.total} Total</span>
          </div>
          <p>Overview of platform-wide stored documents, file sizes, and ownership.</p>
        </div>

        <div className="admin-header-actions">
          <button
            type="button"
            className="admin-refresh-btn"
            onClick={fetchDocuments}
            disabled={loading}
            title="Refresh document records list"
          >
            <RefreshCw size={15} className={loading ? "admin-spinner" : ""} />
            <span>Refresh</span>
          </button>
        </div>
      </header>

      {/* 2. Filter Toolbar (Search & Filter Pills) */}
      <section className="admin-toolbar">
        <div className="admin-search-wrapper">
          <Search size={16} className="admin-search-icon" />
          <input
            ref={searchInputRef}
            type="text"
            className="admin-search-input"
            placeholder="Search by document name or owner..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          {search && (
            <button
              type="button"
              className="admin-search-clear"
              onClick={handleClearSearch}
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="admin-filter-pills" role="tablist">
          {FORMAT_FILTERS.map((f) => {
            const isActive = selectedFormat === f.id;
            return (
              <button
                key={f.id}
                type="button"
                className={`admin-filter-btn ${isActive ? "active" : ""}`}
                onClick={() => {
                  setSelectedFormat(f.id);
                  setPage(1);
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        <div className="admin-filter-pills" role="tablist">
          {STATUS_FILTERS.map((s) => {
            const isActive = selectedStatus === s.id;
            return (
              <button
                key={s.id}
                type="button"
                className={`admin-filter-btn ${isActive ? "active" : ""}`}
                onClick={() => {
                  setSelectedStatus(s.id);
                  setPage(1);
                }}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Feedback Alerts */}
      {error && (
        <div className="admin-alert error" role="alert">
          <div className="admin-alert-inner">
            <AlertCircle size={18} className="alert-icon" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            className="admin-alert-close"
            onClick={() => setError("")}
            aria-label="Dismiss error"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* 3. Main Document Table Surface */}
      <div className="admin-card-container">
        {loading && documents.length === 0 ? (
          <div className="admin-state-card">
            <div className="admin-state-icon">
              <Loader2 size={32} className="admin-spinner" />
            </div>
            <h3>Loading documents...</h3>
            <p>Accessing platform document records from database.</p>
          </div>
        ) : documents.length === 0 ? (
          <div className="admin-state-card">
            <div className="admin-state-icon empty">
              <FileText size={34} />
            </div>
            <h3>No documents found</h3>
            <p>
              {search || selectedFormat !== "all" || selectedStatus !== "all"
                ? "No document records match your current search or filter criteria."
                : "No documents have been uploaded to SecureVault yet."}
            </p>
            {search || selectedFormat !== "all" || selectedStatus !== "all" ? (
              <button
                type="button"
                className="admin-refresh-btn"
                onClick={() => {
                  setSearch("");
                  setSelectedFormat("all");
                  setSelectedStatus("all");
                  setPage(1);
                }}
              >
                Reset Filters
              </button>
            ) : null}
          </div>
        ) : (
          <>
            {/* Desktop / Tablet Table */}
            <div className="admin-table-wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Owner</th>
                    <th>Size</th>
                    <th>Status</th>
                    <th>Upload Date</th>
                    <th className="th-actions">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((doc) => {
                    const IconComponent = getFileIcon(doc.mimeType, doc.originalName);
                    const isDeleted = doc.status === "DELETED";

                    return (
                      <tr key={doc.id} className={isDeleted ? "row-deleted" : ""}>
                        {/* Document Name */}
                        <td>
                          <div className="admin-doc-col">
                            <div className={`admin-doc-icon-wrap ${isDeleted ? "deleted" : ""}`}>
                              <IconComponent size={18} />
                            </div>
                            <div className="admin-doc-text">
                              <span className="admin-doc-name" title={doc.originalName}>
                                {doc.originalName}
                              </span>
                              <span className="admin-doc-mime">{doc.mimeType}</span>
                            </div>
                          </div>
                        </td>

                        {/* Owner */}
                        <td>
                          <div className="admin-owner-col">
                            <span className="admin-owner-name">{doc.owner.name}</span>
                            <span className="admin-owner-email">{doc.owner.email}</span>
                          </div>
                        </td>

                        {/* File Size */}
                        <td>
                          <span className="admin-mono-cell">{doc.formattedSize}</span>
                        </td>

                        {/* Status */}
                        <td>
                          {isDeleted ? (
                            <span className="admin-status-badge deleted">
                              <span className="status-dot grey" />
                              DELETED
                            </span>
                          ) : (
                            <span className="admin-status-badge active">
                              <span className="status-dot green" />
                              ACTIVE
                            </span>
                          )}
                        </td>

                        {/* Upload Date */}
                        <td>
                          <div className="admin-date-col">
                            <span className="date-main">{formatShortDate(doc.createdAt)}</span>
                            <span className="date-sub">{formatShortTime(doc.createdAt)}</span>
                          </div>
                        </td>

                        {/* Inspect Details Action */}
                        <td className="th-actions">
                          <button
                            type="button"
                            className="admin-role-btn"
                            onClick={() => handleOpenDetails(doc)}
                            title="View document details and permissions"
                          >
                            <Eye size={14} />
                            <span>Details</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards (shown on mobile screens) */}
            <div className="admin-mobile-cards">
              {documents.map((doc) => {
                const IconComponent = getFileIcon(doc.mimeType, doc.originalName);
                const isDeleted = doc.status === "DELETED";

                return (
                  <div key={doc.id} className={`admin-mobile-card ${isDeleted ? "deleted" : ""}`}>
                    <div className="admin-card-top">
                      <div className={`admin-doc-icon-wrap ${isDeleted ? "deleted" : ""}`}>
                        <IconComponent size={18} />
                      </div>
                      <div className="admin-card-user-info">
                        <span className="admin-doc-name">{doc.originalName}</span>
                        <span className="admin-doc-mime">{doc.mimeType}</span>
                      </div>
                      <span className={`admin-status-badge ${isDeleted ? "deleted" : "active"}`}>
                        {doc.status}
                      </span>
                    </div>

                    <div className="admin-card-meta-row">
                      <div className="card-meta-item">
                        <User size={13} />
                        <span>{doc.owner.name}</span>
                      </div>
                      <div className="card-meta-item">
                        <HardDrive size={13} />
                        <span className="mono">{doc.formattedSize}</span>
                      </div>
                      <div className="card-meta-item">
                        <Calendar size={13} />
                        <span>{formatShortDate(doc.createdAt)}</span>
                      </div>
                    </div>

                    <div className="admin-card-actions">
                      <button
                        type="button"
                        className="mobile-manage-btn"
                        onClick={() => handleOpenDetails(doc)}
                      >
                        <Eye size={14} />
                        <span>View Details</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination Controls */}
            <div className="admin-pagination">
              <span className="pagination-count-label">
                Showing <strong>{documents.length}</strong> of <strong>{pagination.total}</strong> documents (Page {page} of {pagination.totalPages})
              </span>
              {pagination.totalPages > 1 && (
                <div className="admin-pagination-btns">
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
              )}
            </div>
          </>
        )}
      </div>

      {/* 4. Document Details Modal */}
      {selectedDoc &&
        createPortal(
          <div
            className="admin-modal-overlay"
            onClick={(e) => {
              if (e.target === e.currentTarget) handleCloseDetails();
            }}
            role="dialog"
            aria-modal="true"
          >
            <div className="admin-modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="admin-modal-header">
                <div className="admin-modal-icon-badge blue">
                  <FileText size={22} />
                </div>
                <div className="admin-modal-header-copy">
                  <h3>Document Details</h3>
                  <p>Metadata &amp; Access Overview</p>
                </div>
              </div>

              <div className="admin-inspect-summary-box">
                <div className="summary-field">
                  <span className="field-label">Document Name</span>
                  <strong className="field-value">{selectedDoc.originalName}</strong>
                </div>
                <div className="summary-field">
                  <span className="field-label">File Size</span>
                  <span className="field-value">{selectedDoc.formattedSize}</span>
                </div>
                <div className="summary-field">
                  <span className="field-label">Owner</span>
                  <span className="field-value">
                    {selectedDoc.owner.name} ({selectedDoc.owner.email})
                  </span>
                </div>
                <div className="summary-field">
                  <span className="field-label">Status</span>
                  <span className={`admin-status-badge ${selectedDoc.status.toLowerCase()}`}>
                    {selectedDoc.status}
                  </span>
                </div>
                <div className="summary-field">
                  <span className="field-label">Uploaded At</span>
                  <span className="field-value">
                    {formatShortDate(selectedDoc.createdAt)} {formatShortTime(selectedDoc.createdAt)}
                  </span>
                </div>
                <div className="summary-field">
                  <span className="field-label">Format / MIME</span>
                  <span className="field-value">{selectedDoc.mimeType}</span>
                </div>
              </div>

              {/* Active Sharing Grants */}
              <div className="admin-permissions-section">
                <div className="section-title-row">
                  <Share2 size={16} />
                  <h4>Sharing Grants</h4>
                </div>

                {loadingPermissions ? (
                  <div className="admin-loading-inline">
                    <Loader2 size={16} className="admin-spinner" />
                    <span>Loading permissions...</span>
                  </div>
                ) : docPermissions.length === 0 ? (
                  <div className="admin-no-permissions-box">
                    <p>
                      No active share grants. This file is private to owner{" "}
                      <strong>{selectedDoc.owner.name}</strong>.
                    </p>
                  </div>
                ) : (
                  <div className="admin-permissions-list">
                    {docPermissions.map((perm) => (
                      <div key={perm.id} className="admin-permission-item">
                        <div className="perm-user-info">
                          <strong>{perm.user.name}</strong>
                          <span>{perm.user.email}</span>
                        </div>
                        <div className="perm-meta">
                          <span className={`perm-badge ${perm.permission.toLowerCase()}`}>
                            {perm.permission}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="admin-modal-actions">
                <button
                  type="button"
                  className="modal-btn-cancel"
                  onClick={handleCloseDetails}
                >
                  Close
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
