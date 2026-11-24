import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  CloudUpload,
  FileText,
  FolderLock,
  Share2,
  HardDrive,
  Users,
  ShieldAlert,
  ShieldCheck,
  Clock,
  ArrowRight,
  Lock,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import UploadModal from "../components/UploadModal.jsx";
import { getFileExtensionBadge, getFileTypeInfo } from "./MyDocuments.jsx";
import { secureFetch } from "../utils/api.js";
import "./Dashboard.css";

const formatRelativeTime = (dateString) => {
  if (!dateString) return "Recently";
  const date = new Date(dateString);
  const now = new Date();
  const diffSec = Math.floor((now - date) / 1000);

  if (diffSec < 60) return "Just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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

/**
 * =========================================================
 * USER DASHBOARD VIEW
 * =========================================================
 */
function UserDashboardView({ user, dashboardData, onOpenUpload }) {
  const stats = dashboardData.stats || {
    totalDocuments: 0,
    sharedFiles: 0,
    formattedStorage: "0 B",
  };
  const recentFiles = dashboardData.recentFiles || [];
  const activities = dashboardData.activities || [];
  const displayName = user?.name || "User";

  // Display strictly the 4 most recent activity records, sorted by timestamp descending
  const displayedActivities = [...activities]
    .sort((a, b) => new Date(b.time || b.createdAt) - new Date(a.time || a.createdAt))
    .slice(0, 4);

  return (
    <div className="dash-container">
      {/* A. Welcome Header (No workspace label) */}
      <section className="dash-welcome-header">
        <div className="dash-welcome-copy">
          <h1>Welcome back, {displayName}!</h1>
          <p>Manage your documents securely and efficiently with end-to-end encryption.</p>
        </div>

        <div className="dash-welcome-actions">
          <button
            type="button"
            className="primary-button dash-upload-btn"
            onClick={onOpenUpload}
            title="Upload and encrypt a document"
          >
            <CloudUpload size={17} />
            <span>Upload Document</span>
          </button>
        </div>
      </section>

      {/* B. Statistics: 3 compact metrics */}
      <section className="dash-stats-grid user-stats">
        <div className="dash-stat-card">
          <div className="stat-card-header">
            <span className="stat-label">My Documents</span>
            <div className="stat-icon-wrapper blue">
              <FolderLock size={18} />
            </div>
          </div>
          <div className="stat-value">{stats.totalDocuments}</div>
          <div className="stat-footer">
            <span className="stat-sub">Active encrypted files</span>
          </div>
        </div>

        <div className="dash-stat-card">
          <div className="stat-card-header">
            <span className="stat-label">Shared Files</span>
            <div className="stat-icon-wrapper purple">
              <Share2 size={18} />
            </div>
          </div>
          <div className="stat-value">{stats.sharedFiles ?? 0}</div>
          <div className="stat-footer">
            <span className="stat-sub">Accessible to you</span>
          </div>
        </div>

        <div className="dash-stat-card">
          <div className="stat-card-header">
            <span className="stat-label">Storage Used</span>
            <div className="stat-icon-wrapper green">
              <HardDrive size={18} />
            </div>
          </div>
          <div className="stat-value">{stats.formattedStorage || "0 B"}</div>
          <div className="stat-footer">
            <span className="stat-sub">Encrypted AES-256 vault</span>
          </div>
        </div>
      </section>

      {/* C. Main Content: 2-Column Layout */}
      <section className="dash-main-grid">
        {/* Left: Recent Documents */}
        <div className="dash-panel recent-docs-panel">
          <div className="dash-panel-header">
            <div>
              <h2>Recent Documents</h2>
              <p>Latest files added to your encrypted vault</p>
            </div>
            <Link to="/user/my-documents" className="dash-panel-link">
              <span>View All</span>
              <ArrowRight size={14} />
            </Link>
          </div>

          <div className="dash-panel-body">
            {recentFiles.length === 0 ? (
              <div className="dash-empty-state">
                <div className="empty-icon-circle">
                  <FolderLock size={28} />
                </div>
                <h3>No documents uploaded yet</h3>
                <p>Your encrypted document repository is currently empty.</p>
                <button
                  type="button"
                  className="primary-button empty-cta"
                  onClick={onOpenUpload}
                >
                  <CloudUpload size={16} />
                  <span>Upload Your First File</span>
                </button>
              </div>
            ) : (
              <div className="dash-recent-list">
                {recentFiles.map((doc) => {
                  const extBadge = getFileExtensionBadge(doc.name, doc.type);
                  const typeInfo = getFileTypeInfo(doc.name, doc.type);
                  const FileIcon = typeInfo.Icon;

                  return (
                    <div key={doc.id} className="dash-doc-item">
                      <div className={`dash-doc-icon-badge ${typeInfo.variant}`}>
                        <FileIcon size={18} />
                      </div>

                      <div className="dash-doc-meta">
                        <div className="dash-doc-title-row">
                          <span className="dash-doc-name" title={doc.name}>
                            {doc.name}
                          </span>
                          <span className={`doc-ext-badge ${typeInfo.variant}`}>
                            {extBadge}
                          </span>
                        </div>
                        <div className="dash-doc-sub-row">
                          <span>{doc.size}</span>
                          <span className="dot-sep">•</span>
                          <span>{formatShortDate(doc.createdAt)}</span>
                        </div>
                      </div>

                      <div className="dash-doc-end">
                        <span className="dash-encrypted-pill">
                          <Lock size={11} />
                          <span>AES-256</span>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: Recent Activity (Exactly 4 items + View All link) */}
        <div className="dash-panel recent-activity-panel">
          <div className="dash-panel-header">
            <div>
              <h2>Recent Activity</h2>
              <p>Security and vault events for your account</p>
            </div>
            <Link to="/user/activity" className="dash-panel-link">
              <span>View All</span>
              <ArrowRight size={14} />
            </Link>
          </div>

          <div className="dash-panel-body">
            {displayedActivities.length === 0 ? (
              <div className="dash-empty-state">
                <div className="empty-icon-circle">
                  <Clock size={28} />
                </div>
                <h3>No recent activity</h3>
                <p>Actions you perform on documents will appear here.</p>
              </div>
            ) : (
              <div className="dash-timeline-list">
                {displayedActivities.map((act) => {
                  const isSuccess = act.outcome === "SUCCESS";
                  return (
                    <div key={act.id} className="dash-timeline-item">
                      <div className={`timeline-dot ${isSuccess ? "success" : "alert"}`} />
                      <div className="timeline-content">
                        <div className="timeline-title-row">
                          <span className="timeline-title">{act.title || act.action}</span>
                          <span className="timeline-time">{formatRelativeTime(act.time)}</span>
                        </div>
                        <div className="timeline-sub">
                          <span className={`timeline-outcome ${act.outcome?.toLowerCase()}`}>
                            {act.outcome}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

/**
 * =========================================================
 * ADMIN DASHBOARD VIEW
 * =========================================================
 */
function AdminDashboardView({ user, dashboardData }) {
  const stats = dashboardData.stats || {
    totalUsers: 0,
    totalDocuments: 0,
    formattedStorage: "0 B",
    securityEvents: 0,
  };
  const activities = dashboardData.activities || [];
  const recentUsers = dashboardData.recentUsers || [];
  const securityEvents = dashboardData.securityEvents || [];
  const displayName = user?.name || "Administrator";

  // Display strictly the 4 most recent system activity records, sorted by timestamp descending
  const displayedActivities = [...activities]
    .sort((a, b) => new Date(b.time || b.createdAt) - new Date(a.time || a.createdAt))
    .slice(0, 4);

  const getInitials = (name) => {
    if (!name) return "US";
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  return (
    <div className="dash-container">
      {/* A. Welcome Header (No workspace label) */}
      <section className="dash-welcome-header admin">
        <div className="dash-welcome-copy">
          <h1>System Overview, {displayName}</h1>
          <p>Real-time administration, user management, and platform security telemetry.</p>
        </div>

        <div className="dash-admin-status-pill">
          <ShieldCheck size={16} />
          <span>Security Guard Active</span>
        </div>
      </section>

      {/* B. Admin Statistics: 4 compact metrics supported by backend */}
      <section className="dash-stats-grid admin-stats">
        <div className="dash-stat-card">
          <div className="stat-card-header">
            <span className="stat-label">Total Users</span>
            <div className="stat-icon-wrapper blue">
              <Users size={18} />
            </div>
          </div>
          <div className="stat-value">{stats.totalUsers ?? 0}</div>
          <div className="stat-footer">
            <span className="stat-sub">Registered accounts</span>
          </div>
        </div>

        <div className="dash-stat-card">
          <div className="stat-card-header">
            <span className="stat-label">Active Documents</span>
            <div className="stat-icon-wrapper purple">
              <FileText size={18} />
            </div>
          </div>
          <div className="stat-value">{stats.totalDocuments ?? 0}</div>
          <div className="stat-footer">
            <span className="stat-sub">Stored across all vaults</span>
          </div>
        </div>

        <div className="dash-stat-card">
          <div className="stat-card-header">
            <span className="stat-label">Storage Used</span>
            <div className="stat-icon-wrapper green">
              <HardDrive size={18} />
            </div>
          </div>
          <div className="stat-value">{stats.formattedStorage || "0 B"}</div>
          <div className="stat-footer">
            <span className="stat-sub">Total encrypted bytes</span>
          </div>
        </div>

        <div className="dash-stat-card">
          <div className="stat-card-header">
            <span className="stat-label">Security Events</span>
            <div className="stat-icon-wrapper amber">
              <ShieldAlert size={18} />
            </div>
          </div>
          <div className="stat-value">{stats.securityEvents ?? 0}</div>
          <div className="stat-footer">
            <span className="stat-sub">Blocked / denied attempts</span>
          </div>
        </div>
      </section>

      {/* C. Main Content: 2-Column Layout */}
      <section className="dash-main-grid">
        {/* Left: Recent System Audit Activity (Exactly 4 items + Audit Logs link) */}
        <div className="dash-panel admin-activity-panel">
          <div className="dash-panel-header">
            <div>
              <h2>Recent System Activity</h2>
              <p>Platform audit logs across users and resources</p>
            </div>
            <Link to="/admin/audit-logs" className="dash-panel-link">
              <span>Audit Logs</span>
              <ArrowRight size={14} />
            </Link>
          </div>

          <div className="dash-panel-body">
            {displayedActivities.length === 0 ? (
              <div className="dash-empty-state">
                <div className="empty-icon-circle">
                  <Clock size={28} />
                </div>
                <h3>No system activity logged</h3>
                <p>Platform audit records will appear here as users authenticate and interact.</p>
              </div>
            ) : (
              <div className="admin-log-feed">
                {displayedActivities.map((log) => {
                  const isDenied = log.outcome === "DENIED" || log.outcome === "FAILURE";
                  return (
                    <div key={log.id} className="admin-log-row">
                      <div className={`log-outcome-indicator ${isDenied ? "danger" : "success"}`} />
                      <div className="log-info-col">
                        <div className="log-action-row">
                          <span className="log-action-title">{log.title || log.action}</span>
                          <span className="log-time">{formatRelativeTime(log.time)}</span>
                        </div>
                        <div className="log-meta-row">
                          <span className="log-actor">{log.actorName}</span>
                          {log.actorEmail && (
                            <>
                              <span className="dot-sep">•</span>
                              <span className="log-actor-email">{log.actorEmail}</span>
                            </>
                          )}
                          <span className="dot-sep">•</span>
                          <span className="log-resource-tag">{log.resourceType}</span>
                          <span className={`log-outcome-tag ${log.outcome?.toLowerCase()}`}>
                            {log.outcome}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: Recent Users + Security Monitoring */}
        <div className="admin-right-column">
          {/* Recent Users Panel */}
          <div className="dash-panel recent-users-panel">
            <div className="dash-panel-header">
              <div>
                <h2>Recent Users</h2>
                <p>Recently registered platform accounts</p>
              </div>
              <Link to="/admin/users" className="dash-panel-link">
                <span>View All</span>
                <ArrowRight size={14} />
              </Link>
            </div>

            <div className="dash-panel-body">
              {recentUsers.length === 0 ? (
                <div className="dash-empty-state small">
                  <p>No registered users found.</p>
                </div>
              ) : (
                <div className="recent-users-list">
                  {recentUsers.map((usr) => (
                    <div key={usr.id} className="user-list-row">
                      <div className="user-avatar-circle">
                        {getInitials(usr.name)}
                      </div>
                      <div className="user-details-col">
                        <div className="user-name-row">
                          <span className="user-name-text">{usr.name}</span>
                          <span className={`user-role-badge ${usr.role?.toLowerCase()}`}>
                            {usr.role}
                          </span>
                        </div>
                        <span className="user-email-text">{usr.email}</span>
                      </div>
                      <span className="user-joined-text">
                        {formatShortDate(usr.createdAt)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* D. Security Monitoring Panel */}
          <div className="dash-panel security-monitoring-panel">
            <div className="dash-panel-header">
              <div>
                <h2>Security Monitoring</h2>
                <p>Access violations and policy enforcement</p>
              </div>
            </div>

            <div className="dash-panel-body">
              {securityEvents.length === 0 ? (
                <div className="security-clean-status">
                  <div className="clean-status-badge">
                    <ShieldCheck size={20} />
                  </div>
                  <div className="clean-status-copy">
                    <strong>All Systems Secure</strong>
                    <span>No unauthorized access attempts or tamper alerts detected.</span>
                  </div>
                </div>
              ) : (
                <div className="security-events-feed">
                  {securityEvents.map((evt) => (
                    <div key={evt.id} className="security-event-item">
                      <ShieldAlert size={16} className="sec-alert-icon" />
                      <div className="sec-event-info">
                        <div className="sec-event-top">
                          <strong>{evt.action}</strong>
                          <span className="sec-time">{formatRelativeTime(evt.time)}</span>
                        </div>
                        <span className="sec-meta">
                          {evt.actorName} • {evt.ipAddress}
                        </span>
                      </div>
                      <span className="sec-outcome-tag">{evt.outcome}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

/**
 * =========================================================
 * ROOT DASHBOARD CONTROLLER
 * =========================================================
 */
export default function Dashboard({ audience }) {
  const isAdmin = audience === "Admin";
  const { user } = useAuth();
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [dashboardData, setDashboardData] = useState({
    stats: {
      totalDocuments: 0,
      sharedFiles: 0,
      totalSizeBytes: 0,
      formattedStorage: "0 B",
      totalUsers: 0,
      securityEvents: 0,
    },
    recentFiles: [],
    activities: [],
    recentUsers: [],
    securityEvents: [],
  });

  const fetchDashboardData = useCallback(async () => {
    try {
      const res = await secureFetch("/api/documents/dashboard", {
        method: "GET",
      });
      if (res.ok) {
        const data = await res.json();
        setDashboardData(data);
      }
    } catch (_err) {
      // Retain graceful empty state on error
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  return (
    <>
      {/* Upload modal available on user dashboard */}
      {!isAdmin && (
        <UploadModal
          isOpen={isUploadOpen}
          onClose={() => setIsUploadOpen(false)}
          onUploadSuccess={() => fetchDashboardData()}
        />
      )}

      {isAdmin ? (
        <AdminDashboardView user={user} dashboardData={dashboardData} />
      ) : (
        <UserDashboardView
          user={user}
          dashboardData={dashboardData}
          onOpenUpload={() => setIsUploadOpen(true)}
        />
      )}
    </>
  );
}
