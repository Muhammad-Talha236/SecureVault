import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Users,
  Search,
  X,
  RefreshCw,
  ShieldCheck,
  Shield,
  User,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Calendar,
  FolderLock,
  Lock,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { secureFetch } from "../utils/api.js";
import "./AdminPages.css";

const ROLE_FILTERS = [
  { id: "all", label: "All Accounts" },
  { id: "USER", label: "Standard Users" },
  { id: "ADMIN", label: "Administrators" },
];

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

const getInitials = (name) => {
  if (!name) return "US";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

export default function AdminUsers() {
  const { user: currentAdmin } = useAuth();
  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 15, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [search, setSearch] = useState("");
  const [selectedRole, setSelectedRole] = useState("all");
  const [page, setPage] = useState(1);

  // Role modification state
  const [targetUser, setTargetUser] = useState(null);
  const [selectedNewRole, setSelectedNewRole] = useState("USER");
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);

  const searchInputRef = useRef(null);

  const fetchUsers = useCallback(async () => {
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

      if (selectedRole !== "all") {
        queryParams.append("role", selectedRole);
      }

      const res = await secureFetch(`/api/admin/users?${queryParams.toString()}`, {
        method: "GET",
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to load user accounts.");
      }

      const data = await res.json();
      setUsers(data.users || []);
      setPagination(
        data.pagination || { total: data.users?.length || 0, page, limit: 15, totalPages: 1 }
      );
    } catch (err) {
      setError(err.message || "Unable to retrieve platform user accounts.");
    } finally {
      setLoading(false);
    }
  }, [page, search, selectedRole]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Handle Role Change
  const handleRoleUpdate = async () => {
    if (!targetUser || isUpdatingRole) return;

    if (targetUser.id === currentAdmin?._id && selectedNewRole !== "ADMIN") {
      setError("Administrators cannot revoke their own administrative access.");
      setTargetUser(null);
      return;
    }

    try {
      setIsUpdatingRole(true);
      setError("");
      setSuccessMsg("");

      const res = await secureFetch(`/api/admin/users/${targetUser.id}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role: selectedNewRole }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.message || "Failed to update user role.");
      }

      setSuccessMsg(data.message || `Role updated successfully.`);
      setTimeout(() => setSuccessMsg(""), 5000);
      setTargetUser(null);
      fetchUsers();
    } catch (err) {
      setError(err.message || "Failed to update role.");
    } finally {
      setIsUpdatingRole(false);
    }
  };

  const adminCount = users.filter((u) => u.role === "ADMIN").length;
  const userCount = users.filter((u) => u.role === "USER").length;

  return (
    <div className="admin-page-container">
      {/* Page Header */}
      <header className="admin-header">
        <div className="admin-header-copy">
          <div className="admin-header-title-row">
            <div className="admin-header-icon-mark">
              <Users size={22} />
            </div>
            <h1>User Management</h1>
          </div>
          <p>Registered platform accounts, authentication status, and role assignments.</p>
        </div>

        <div className="admin-header-actions">
          <button
            type="button"
            className="admin-refresh-btn"
            onClick={fetchUsers}
            disabled={loading}
            title="Refresh user accounts list"
          >
            <RefreshCw size={15} className={loading ? "admin-spinner" : ""} />
            <span>Refresh</span>
          </button>
        </div>
      </header>

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

      {successMsg && (
        <div className="admin-alert success" role="status">
          <div className="admin-alert-inner">
            <CheckCircle2 size={18} className="alert-icon" />
            <span>{successMsg}</span>
          </div>
          <button
            type="button"
            className="admin-alert-close"
            onClick={() => setSuccessMsg("")}
            aria-label="Dismiss message"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Search and Filters Toolbar */}
      <section className="admin-toolbar">
        <div className="admin-search-wrapper">
          <Search size={16} className="admin-search-icon" />
          <input
            ref={searchInputRef}
            type="text"
            className="admin-search-input"
            placeholder="Search users by name or email..."
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

        <div className="admin-filter-pills" role="tablist">
          {ROLE_FILTERS.map((filter) => {
            const isActive = selectedRole === filter.id;
            return (
              <button
                key={filter.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`admin-filter-btn ${isActive ? "active" : ""}`}
                onClick={() => {
                  setSelectedRole(filter.id);
                  setPage(1);
                }}
              >
                {filter.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Main Table / Mobile Cards */}
      <div className="admin-card-container">
        {loading && users.length === 0 ? (
          <div className="admin-state-card">
            <div className="admin-state-icon">
              <Loader2 size={32} className="admin-spinner" />
            </div>
            <h3>Loading accounts...</h3>
            <p>Accessing registered user records from database.</p>
          </div>
        ) : users.length === 0 ? (
          <div className="admin-state-card">
            <div className="admin-state-icon empty">
              <Users size={34} />
            </div>
            <h3>No users found</h3>
            <p>
              {search || selectedRole !== "all"
                ? "No registered accounts match your search or role filter criteria."
                : "No registered users exist in the platform yet."}
            </p>
            {search || selectedRole !== "all" ? (
              <button
                type="button"
                className="admin-refresh-btn"
                onClick={() => {
                  setSearch("");
                  setSelectedRole("all");
                  setPage(1);
                }}
              >
                Clear Filters
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
                    <th className="th-user">User</th>
                    <th className="th-email">Email Address</th>
                    <th className="th-role">System Role</th>
                    <th className="th-docs">Active Files</th>
                    <th className="th-joined">Registered Date</th>
                    <th className="th-actions">Manage</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((usr) => {
                    const isSelf = usr.id === currentAdmin?._id;
                    const isAdmin = usr.role === "ADMIN";

                    return (
                      <tr key={usr.id}>
                        {/* Name & Avatar */}
                        <td className="td-user">
                          <div className="user-name-cell">
                            <div className={`user-avatar-badge ${usr.role.toLowerCase()}`}>
                              {getInitials(usr.name)}
                            </div>
                            <div className="user-name-meta">
                              <span className="user-display-name">{usr.name}</span>
                              {isSelf && <span className="user-self-pill">You</span>}
                            </div>
                          </div>
                        </td>

                        {/* Email */}
                        <td className="td-email">
                          <span className="user-email-text">{usr.email}</span>
                        </td>

                        {/* Role Badge */}
                        <td className="td-role">
                          <span className={`role-badge ${usr.role.toLowerCase()}`}>
                            {isAdmin ? <ShieldCheck size={13} /> : <User size={13} />}
                            <span>{usr.role}</span>
                          </span>
                        </td>

                        {/* Active Documents Count */}
                        <td className="td-docs">
                          <div className="user-docs-cell">
                            <FolderLock size={14} className="cell-sub-icon" />
                            <span>{usr.activeDocuments} files</span>
                          </div>
                        </td>

                        {/* Registration Date */}
                        <td className="td-joined">
                          <div className="user-date-cell">
                            <span className="date-main">{formatShortDate(usr.createdAt)}</span>
                            <span className="date-sub">{formatShortTime(usr.createdAt)}</span>
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="td-actions">
                          <button
                            type="button"
                            className="admin-role-btn"
                            onClick={() => {
                              setTargetUser(usr);
                              setSelectedNewRole(usr.role === "ADMIN" ? "USER" : "ADMIN");
                            }}
                            title={isSelf ? "Self-role modification disabled" : "Modify system role"}
                            disabled={isSelf}
                          >
                            <Shield size={14} />
                            <span>Change Role</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards (shown on <= 768px screens) */}
            <div className="admin-mobile-cards">
              {users.map((usr) => {
                const isSelf = usr.id === currentAdmin?._id;
                const isAdmin = usr.role === "ADMIN";

                return (
                  <div key={usr.id} className="admin-mobile-card">
                    <div className="admin-card-top">
                      <div className={`user-avatar-badge ${usr.role.toLowerCase()}`}>
                        {getInitials(usr.name)}
                      </div>
                      <div className="admin-card-user-info">
                        <div className="card-user-title-row">
                          <span className="user-display-name">{usr.name}</span>
                          {isSelf && <span className="user-self-pill">You</span>}
                        </div>
                        <span className="user-email-text">{usr.email}</span>
                      </div>
                      <span className={`role-badge ${usr.role.toLowerCase()}`}>
                        {isAdmin ? <ShieldCheck size={13} /> : <User size={13} />}
                        <span>{usr.role}</span>
                      </span>
                    </div>

                    <div className="admin-card-meta-row">
                      <div className="card-meta-item">
                        <FolderLock size={13} />
                        <span>{usr.activeDocuments} files</span>
                      </div>
                      <div className="card-meta-item">
                        <Calendar size={13} />
                        <span>{formatShortDate(usr.createdAt)}</span>
                      </div>
                    </div>

                    <div className="admin-card-actions">
                      <button
                        type="button"
                        className="mobile-manage-btn"
                        onClick={() => {
                          setTargetUser(usr);
                          setSelectedNewRole(usr.role === "ADMIN" ? "USER" : "ADMIN");
                        }}
                        disabled={isSelf}
                      >
                        <Shield size={14} />
                        <span>{isSelf ? "Self Account (Locked)" : "Change Role"}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination Controls */}
            {pagination.totalPages > 1 && (
              <div className="admin-pagination">
                <span className="pagination-count-label">
                  Showing <strong>{users.length}</strong> of <strong>{pagination.total}</strong> accounts
                </span>
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
              </div>
            )}
          </>
        )}
      </div>

      {/* Role Management Confirmation Modal */}
      {targetUser &&
        createPortal(
          <div
            className="admin-modal-overlay"
            onClick={(e) => {
              if (e.target === e.currentTarget && !isUpdatingRole) setTargetUser(null);
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="role-dialog-title"
          >
            <div className="admin-modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="admin-modal-header">
                <div className="admin-modal-icon-badge purple">
                  <ShieldAlert size={22} />
                </div>
                <div className="admin-modal-header-copy">
                  <h3 id="role-dialog-title">Modify System Role</h3>
                  <p>Access Control &amp; Authority Assignment</p>
                </div>
              </div>

              <div className="admin-modal-user-box">
                <div className="user-box-row">
                  <span className="user-box-name">{targetUser.name}</span>
                  <span className={`role-badge ${targetUser.role.toLowerCase()}`}>
                    Current: {targetUser.role}
                  </span>
                </div>
                <span className="user-box-email">{targetUser.email}</span>
              </div>

              <div className="role-selection-group">
                <label className="role-selection-label">Select New Role:</label>
                <div className="role-radio-options">
                  <label className={`role-option-card ${selectedNewRole === "USER" ? "selected" : ""}`}>
                    <input
                      type="radio"
                      name="targetRole"
                      value="USER"
                      checked={selectedNewRole === "USER"}
                      onChange={(e) => setSelectedNewRole(e.target.value)}
                    />
                    <div className="role-option-content">
                      <div className="role-option-title">
                        <User size={16} />
                        <strong>Standard User (USER)</strong>
                      </div>
                      <p>Personal encrypted vault, document management, zero administrative privileges.</p>
                    </div>
                  </label>

                  <label className={`role-option-card ${selectedNewRole === "ADMIN" ? "selected" : ""}`}>
                    <input
                      type="radio"
                      name="targetRole"
                      value="ADMIN"
                      checked={selectedNewRole === "ADMIN"}
                      onChange={(e) => setSelectedNewRole(e.target.value)}
                    />
                    <div className="role-option-content">
                      <div className="role-option-title">
                        <ShieldCheck size={16} />
                        <strong>Administrator (ADMIN)</strong>
                      </div>
                      <p>Platform telemetry, user lifecycle management, and system-wide visibility.</p>
                    </div>
                  </label>
                </div>
              </div>

              {selectedNewRole === "ADMIN" && (
                <div className="admin-warning-callout">
                  <strong>Security Note:</strong> Granting ADMIN role permits platform user management and system telemetry access. Admins cannot decrypt or download users' private document ciphertexts.
                </div>
              )}

              <div className="admin-modal-actions">
                <button
                  type="button"
                  className="modal-btn-cancel"
                  onClick={() => setTargetUser(null)}
                  disabled={isUpdatingRole}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  className="modal-btn-confirm"
                  onClick={handleRoleUpdate}
                  disabled={isUpdatingRole || selectedNewRole === targetUser.role}
                >
                  {isUpdatingRole ? (
                    <>
                      <Loader2 size={16} className="admin-spinner" />
                      <span>Updating Role...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck size={16} />
                      <span>Confirm Role Change</span>
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
