import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import {
  FileText,
  Search,
  X,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Calendar,
  AlertCircle,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Info,
  CheckCircle2,
  FileSpreadsheet,
  FileImage,
  FileArchive,
  FileCode,
  Share2,
  User,
  Clock,
  Layers,
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
      setError(err.message || "Unable to communicate with documents API.");
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

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchDocuments();
  };

  const handleClearSearch = () => {
    setSearch("");
    setPage(1);
  };

  return (
    <div className="admin-page-container">
      {/* 1. Header */}
      <header className="admin-page-header">
        <div className="admin-header-copy">
          <div className="admin-header-title-row">
            <h1>Document Records</h1>
            <span className="admin-counter-badge">{pagination.total} Total</span>
          </div>
          <p className="admin-header-subtitle">
            Platform-wide encrypted catalog, cryptographic metadata, and access governance.
          </p>
        </div>

        <div className="admin-header-actions">
          <button
            type="button"
            className="admin-btn-secondary"
            onClick={fetchDocuments}
            disabled={loading}
            title="Refresh document records"
          >
            <RefreshCw size={15} className={loading ? "admin-spin" : ""} />
            <span>Refresh</span>
          </button>
        </div>
      </header>

      {/* 2. Zero-Knowledge Governance Notice */}
      <div className="admin-security-pill-card">
        <div className="admin-security-pill-icon">
          <Lock size={16} />
        </div>
        <div className="admin-security-pill-text">
          <strong>Zero-Knowledge Cryptographic Isolation:</strong> Document ciphertexts are encrypted
          with AES-256-GCM using isolated user keys. Administrators can inspect governance metadata
          and active sharing grants, but have no administrative decryption or download bypass.
        </div>
      </div>

      {/* 3. Filter Toolbar */}
      <div className="admin-toolbar-card">
        <form onSubmit={handleSearchSubmit} className="admin-search-form">
          <div className="admin-search-input-wrap">
            <Search size={16} className="admin-search-icon" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search by document name or owner..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="admin-search-input"
            />
            {search && (
              <button
                type="button"
                className="admin-search-clear"
                onClick={handleClearSearch}
                aria-label="Clear search query"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <button type="submit" className="admin-btn-primary admin-search-btn">
            Search
          </button>
        </form>

        {/* Filter Pills */}
        <div className="admin-filter-groups">
          <div className="admin-filter-pill-group">
            <span className="admin-filter-label">Format:</span>
            {FORMAT_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`admin-filter-pill ${selectedFormat === f.id ? "active" : ""}`}
                onClick={() => {
                  setSelectedFormat(f.id);
                  setPage(1);
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="admin-filter-pill-group">
            <span className="admin-filter-label">Status:</span>
            {STATUS_FILTERS.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`admin-filter-pill ${selectedStatus === s.id ? "active" : ""}`}
                onClick={() => {
                  setSelectedStatus(s.id);
                  setPage(1);
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="admin-alert-banner error" role="alert">
          <AlertCircle size={18} />
          <div>
            <strong>Error loading records:</strong> {error}
          </div>
        </div>
      )}

      {/* 4. Table / Content Area */}
      <div className="admin-table-surface">
        {loading ? (
          <div className="admin-loading-state">
            <Loader2 size={32} className="admin-spin" />
            <p>Loading document records from database...</p>
          </div>
        ) : documents.length === 0 ? (
          <div className="admin-empty-state">
            <div className="admin-empty-icon-wrap">
              <FileText size={32} />
            </div>
            <h3>No document records found</h3>
            <p>
              {search || selectedFormat !== "all" || selectedStatus !== "all"
                ? "No documents match the specified search or filter criteria. Try adjusting your query."
                : "No documents have been uploaded to SecureVault yet."}
            </p>
            {(search || selectedFormat !== "all" || selectedStatus !== "all") && (
              <button
                type="button"
                className="admin-btn-secondary"
                onClick={() => {
                  setSearch("");
                  setSelectedFormat("all");
                  setSelectedStatus("all");
                  setPage(1);
                }}
              >
                Reset All Filters
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="admin-table-wrapper">
              <table className="admin-data-table">
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Owner</th>
                    <th>Size</th>
                    <th>Encryption</th>
                    <th>Integrity</th>
                    <th>Status</th>
                    <th>Upload Date</th>
                    <th className="text-right">Actions</th>
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

                        {/* Size */}
                        <td>
                          <span className="admin-mono-cell">{doc.formattedSize}</span>
                        </td>

                        {/* Encryption */}
                        <td>
                          <div className="admin-crypto-badge">
                            <ShieldCheck size={13} className="text-green" />
                            <span>{doc.encryption.algorithm}</span>
                            <span className="admin-key-ver">v{doc.encryption.keyVersion}</span>
                          </div>
                        </td>

                        {/* Integrity */}
                        <td>
                          <span className="admin-hash-pill">
                            {doc.integrity.algorithm}
                          </span>
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
                            <span>{formatShortDate(doc.createdAt)}</span>
                            <span className="admin-time-sub">{formatShortTime(doc.createdAt)}</span>
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="text-right">
                          <button
                            type="button"
                            className="admin-action-btn view-details"
                            onClick={() => handleOpenDetails(doc)}
                            title="Inspect metadata and access permissions"
                          >
                            <Info size={15} />
                            <span>Inspect</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List */}
            <div className="admin-cards-mobile">
              {documents.map((doc) => {
                const IconComponent = getFileIcon(doc.mimeType, doc.originalName);
                const isDeleted = doc.status === "DELETED";

                return (
                  <div key={doc.id} className={`admin-mobile-card ${isDeleted ? "deleted" : ""}`}>
                    <div className="admin-mobile-card-header">
                      <div className="admin-doc-col">
                        <div className={`admin-doc-icon-wrap ${isDeleted ? "deleted" : ""}`}>
                          <IconComponent size={18} />
                        </div>
                        <div className="admin-doc-text">
                          <span className="admin-doc-name">{doc.originalName}</span>
                          <span className="admin-doc-mime">{doc.mimeType}</span>
                        </div>
                      </div>
                      <span className={`admin-status-badge ${isDeleted ? "deleted" : "active"}`}>
                        {doc.status}
                      </span>
                    </div>

                    <div className="admin-mobile-card-body">
                      <div className="admin-mobile-row">
                        <span className="label">Owner:</span>
                        <span className="value">
                          {doc.owner.name} ({doc.owner.email})
                        </span>
                      </div>
                      <div className="admin-mobile-row">
                        <span className="label">Size:</span>
                        <span className="value mono">{doc.formattedSize}</span>
                      </div>
                      <div className="admin-mobile-row">
                        <span className="label">Encryption:</span>
                        <span className="value">
                          {doc.encryption.algorithm} (v{doc.encryption.keyVersion})
                        </span>
                      </div>
                      <div className="admin-mobile-row">
                        <span className="label">Uploaded:</span>
                        <span className="value">
                          {formatShortDate(doc.createdAt)} {formatShortTime(doc.createdAt)}
                        </span>
                      </div>
                    </div>

                    <div className="admin-mobile-card-footer">
                      <button
                        type="button"
                        className="admin-btn-secondary full-width"
                        onClick={() => handleOpenDetails(doc)}
                      >
                        <Info size={15} />
                        <span>Inspect Metadata &amp; Permissions</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 5. Pagination */}
            <div className="admin-pagination-bar">
              <div className="admin-pagination-info">
                Showing page <strong>{pagination.page}</strong> of{" "}
                <strong>{pagination.totalPages}</strong> ({pagination.total} total documents)
              </div>
              <div className="admin-pagination-controls">
                <button
                  type="button"
                  className="admin-btn-page"
                  disabled={pagination.page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  aria-label="Previous page"
                >
                  <ChevronLeft size={16} />
                  <span>Previous</span>
                </button>
                <button
                  type="button"
                  className="admin-btn-page"
                  disabled={pagination.page >= pagination.totalPages || loading}
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  aria-label="Next page"
                >
                  <span>Next</span>
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 6. Document Details & Permissions Modal */}
      {selectedDoc &&
        createPortal(
          <div
            className="sv-admin-modal-overlay"
            onClick={(e) => {
              if (e.target === e.currentTarget) handleCloseDetails();
            }}
            role="dialog"
            aria-modal="true"
          >
            <div className="sv-admin-modal-card wide" onClick={(e) => e.stopPropagation()}>
              <div className="sv-admin-modal-header">
                <div className="sv-admin-modal-header-left">
                  <div className="sv-admin-modal-icon-badge blue">
                    <ShieldCheck size={22} />
                  </div>
                  <div>
                    <h2>Document Governance &amp; Metadata</h2>
                    <p className="subtitle">
                      Cryptographic record audit and cross-user permission inspect.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="sv-modal-close-btn"
                  onClick={handleCloseDetails}
                  aria-label="Close dialog"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="sv-admin-modal-body">
                {/* Document summary box */}
                <div className="admin-inspect-summary-box">
                  <div className="summary-field">
                    <span className="field-label">Document Name</span>
                    <strong className="field-value">{selectedDoc.originalName}</strong>
                  </div>
                  <div className="summary-field">
                    <span className="field-label">Record ID</span>
                    <span className="field-value mono">{selectedDoc.id}</span>
                  </div>
                  <div className="summary-field">
                    <span className="field-label">File Size</span>
                    <span className="field-value">{selectedDoc.formattedSize}</span>
                  </div>
                  <div className="summary-field">
                    <span className="field-label">Status</span>
                    <span className={`admin-status-badge ${selectedDoc.status.toLowerCase()}`}>
                      {selectedDoc.status}
                    </span>
                  </div>
                  <div className="summary-field">
                    <span className="field-label">Owner</span>
                    <span className="field-value">
                      {selectedDoc.owner.name} ({selectedDoc.owner.email})
                    </span>
                  </div>
                  <div className="summary-field">
                    <span className="field-label">Uploaded At</span>
                    <span className="field-value">
                      {formatShortDate(selectedDoc.createdAt)} {formatShortTime(selectedDoc.createdAt)}
                    </span>
                  </div>
                </div>

                {/* Cryptographic Proof Details */}
                <div className="admin-crypto-details-card">
                  <h4>Cryptographic Specification</h4>
                  <div className="crypto-specs-grid">
                    <div className="crypto-spec-item">
                      <span className="spec-title">Encryption Algorithm</span>
                      <span className="spec-value highlight">
                        {selectedDoc.encryption.algorithm} (Authenticated)
                      </span>
                    </div>
                    <div className="crypto-spec-item">
                      <span className="spec-title">Master Key Version</span>
                      <span className="spec-value">Version {selectedDoc.encryption.keyVersion}</span>
                    </div>
                    <div className="crypto-spec-item">
                      <span className="spec-title">Integrity Verification</span>
                      <span className="spec-value">{selectedDoc.integrity.algorithm} Digest</span>
                    </div>
                    <div className="crypto-spec-item">
                      <span className="spec-title">IV &amp; Tag Storage</span>
                      <span className="spec-value secure">Isolated &amp; Secret</span>
                    </div>
                  </div>
                </div>

                {/* Active Sharing Grants / Permissions */}
                <div className="admin-permissions-section">
                  <div className="section-title-row">
                    <Share2 size={16} />
                    <h4>Active Document Permissions (Cross-User Grants)</h4>
                  </div>

                  {loadingPermissions ? (
                    <div className="admin-loading-inline">
                      <Loader2 size={18} className="admin-spin" />
                      <span>Checking permission model...</span>
                    </div>
                  ) : docPermissions.length === 0 ? (
                    <div className="admin-no-permissions-box">
                      <p>
                        No active cross-user permissions found. This document is strictly private to
                        owner <strong>{selectedDoc.owner.name}</strong>.
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
                            <span className="perm-granted-by">
                              Granted by: {perm.grantedBy.name}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Zero-Knowledge Security Callout */}
                <div className="admin-modal-security-footer">
                  <Lock size={15} />
                  <span>
                    Zero-Knowledge Guarantee: Decryption keys are managed client/user side. Platform
                    admins can audit metadata records, but cannot view or decrypt payload content.
                  </span>
                </div>
              </div>

              <div className="sv-admin-modal-actions">
                <button
                  type="button"
                  className="admin-btn-secondary"
                  onClick={handleCloseDetails}
                >
                  Close Inspection
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
