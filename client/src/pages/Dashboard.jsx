import { useState, useEffect, useCallback } from "react";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  CloudUpload,
  Database,
  FileText,
  Folder,
  FolderPlus,
  HardDrive,
  LockKeyhole,
  Share2,
  ShieldCheck,
  Star,
  Users,
  Clock3,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import UploadModal, { getFileIcon } from "../components/UploadModal.jsx";

const formatRelativeTime = (dateString) => {
  if (!dateString) return "Recently";
  const date = new Date(dateString);
  const now = new Date();
  const diffSec = Math.floor((now - date) / 1000);

  if (diffSec < 60) return "Just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
  return date.toLocaleDateString();
};

export default function Dashboard({ audience }) {
  const isAdmin = audience === "Admin";
  const { user } = useAuth();

  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [dashboardData, setDashboardData] = useState({
    stats: { totalDocuments: 0, totalSizeBytes: 0, formattedStorage: "0 B" },
    recentFiles: [],
    activities: [],
  });

  const fetchDashboardData = useCallback(async () => {
    try {
      const res = await fetch("/api/documents/dashboard", {
        method: "GET",
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setDashboardData({
          stats: data.stats || { totalDocuments: 0, totalSizeBytes: 0, formattedStorage: "0 B" },
          recentFiles: data.recentFiles || [],
          activities: data.activities || [],
        });
      }
    } catch (_err) {
      // Keep empty states on error
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const hasDocs = dashboardData.stats.totalDocuments > 0;

  // Real data metrics (falls back to "--" if no data exists)
  const adminMetrics = [
    { label: "Total Users", value: "--", na: true, Icon: Users },
    {
      label: "Total Documents",
      value: hasDocs ? String(dashboardData.stats.totalDocuments) : "--",
      na: !hasDocs,
      Icon: FileText,
    },
    {
      label: "Storage Used",
      value: hasDocs ? dashboardData.stats.formattedStorage : "--",
      na: !hasDocs,
      Icon: Database,
    },
    { label: "Security Events", value: "--", na: true, Icon: ShieldCheck },
  ];

  const userMetrics = [
    {
      label: "My Documents",
      value: hasDocs ? String(dashboardData.stats.totalDocuments) : "--",
      na: !hasDocs,
      Icon: FileText,
    },
    { label: "Shared Files", value: "--", na: true, Icon: Share2 },
    {
      label: "Storage Used",
      value: hasDocs ? dashboardData.stats.formattedStorage : "--",
      na: !hasDocs,
      Icon: Database,
    },
    { label: "Favorites", value: "--", na: true, Icon: Star },
  ];

  const stats = isAdmin ? adminMetrics : userMetrics;
  const displayName = user?.name || (isAdmin ? "Administrator" : "User");

  return (
    <div className="dashboard">
      {/* Upload Modal Dialog */}
      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUploadSuccess={() => fetchDashboardData()}
      />

      {/* Welcome banner with real user greeting and working upload button */}
      <section className="hero-banner">
        <div className="hero-content">
          <div className="hero-tag">
            <span className="hero-tag-dot" />
            {audience.toUpperCase()} WORKSPACE
          </div>

          <h1>Welcome back, {displayName}!</h1>

          <p>Manage your documents securely and efficiently.</p>

          <button
            type="button"
            className="primary-button"
            onClick={() => setIsUploadOpen(true)}
            title="Upload and encrypt a document with AES-256-GCM"
          >
            <CloudUpload size={18} />
            Upload Document
            <ArrowRight size={17} />
          </button>
        </div>

        <div className="hero-visual">
          <div className="hero-orbit orbit-one" />
          <div className="hero-orbit orbit-two" />
          <div className="hero-shield">
            <ShieldCheck size={66} strokeWidth={1.4} />
            <LockKeyhole size={25} className="hero-lock" />
          </div>
          <div className="hero-floating-file file-one">
            <FileText size={23} />
          </div>
          <div className="hero-floating-file file-two">
            <Folder size={25} />
          </div>
        </div>

        <div className="hero-highlights">
          <div>
            <ShieldCheck size={22} />
            <strong>Protected</strong>
            <span>Workspace</span>
          </div>
          <div>
            <LockKeyhole size={22} />
            <strong>Private</strong>
            <span>Documents</span>
          </div>
        </div>
      </section>

      {/* Metric cards with live MongoDB data */}
      <section className="metric-grid">
        {stats.map(({ label, value, na, Icon }, index) => (
          <article className="metric-card" key={label}>
            <div className={`metric-icon metric-icon-${index + 1}`}>
              <Icon size={22} />
            </div>

            <div className="metric-info">
              <span>{label}</span>
              <strong className={na ? "metric-empty" : ""}>{value}</strong>
            </div>

            {na && <span className="metric-na">No data</span>}
          </article>
        ))}
      </section>

      {/* Main dashboard panels with live data or honest empty states */}
      <section className="dashboard-grid">
        {/* Storage Overview */}
        <article className="dashboard-card storage-panel">
          <div className="card-heading">
            <div>
              <h2>
                <Database size={18} /> Storage Overview
              </h2>
              <p>System storage telemetry and capacity</p>
            </div>
          </div>

          {hasDocs ? (
            <div className="live-storage-summary">
              <div className="storage-summary-stat">
                <span className="summary-label">Encrypted Storage Used</span>
                <strong className="summary-value">{dashboardData.stats.formattedStorage}</strong>
                <span className="summary-sub">
                  Across {dashboardData.stats.totalDocuments} active {dashboardData.stats.totalDocuments === 1 ? "document" : "documents"}
                </span>
              </div>
              <div className="storage-security-badge">
                <LockKeyhole size={14} />
                <span>AES-256-GCM Encrypted &middot; Private Supabase Bucket</span>
              </div>
            </div>
          ) : (
            <div className="dashboard-empty-state">
              <div className="empty-state-icon">
                <HardDrive size={24} />
              </div>
              <h3>No storage data available</h3>
              <p>
                {isAdmin
                  ? "Storage information will appear when documents are uploaded across the platform."
                  : "Storage information will appear when documents are uploaded."}
              </p>
            </div>
          )}
        </article>

        {/* Recent Files */}
        <article className="dashboard-card recent-panel">
          <div className="card-heading">
            <div>
              <h2>
                <Clock3 size={18} /> Recent Files
              </h2>
              <p>Recently accessed and modified documents</p>
            </div>
          </div>

          {dashboardData.recentFiles.length > 0 ? (
            <div className="recent-file-list">
              {dashboardData.recentFiles.map((file) => {
                const IconComponent = getFileIcon(file.type, file.name);
                return (
                  <div className="recent-file" key={file.id}>
                    <div className="file-type-icon">
                      <IconComponent size={20} />
                    </div>
                    <div className="file-details">
                      <strong>{file.name}</strong>
                      <span>
                        {file.size} &bull; {formatRelativeTime(file.createdAt)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="dashboard-empty-state">
              <div className="empty-state-icon">
                <FileText size={24} />
              </div>
              <h3>No documents uploaded yet</h3>
              <p>Your recent documents will appear here once files are added.</p>
            </div>
          )}
        </article>

        {/* Security Overview Banner */}
        <article className="security-card">
          <div className="security-art">
            <div className="security-ring" />
            <div className="security-shield">
              <ShieldCheck size={58} />
              <LockKeyhole size={20} />
            </div>
          </div>

          <div className="security-copy">
            <span className="security-label">
              <CheckCircle2 size={15} /> SECURITY
            </span>
            <h2>Enterprise-grade protection</h2>
            <p>Your documents deserve a secure place.</p>
          </div>

          <button
            className="security-link"
            type="button"
            onClick={() => setIsUploadOpen(true)}
            title="Upload a new encrypted document"
          >
            Upload a document <ArrowRight size={15} />
          </button>
        </article>
      </section>

      {/* Bottom section */}
      <section className="bottom-grid">
        {/* Quick Actions */}
        <article className="dashboard-card quick-actions">
          <div className="card-heading">
            <div>
              <h2>
                <Activity size={18} /> Quick Actions
              </h2>
              <p>Common workspace actions</p>
            </div>
          </div>

          <div className="quick-action-list">
            <button
              type="button"
              className="quick-action"
              onClick={() => setIsUploadOpen(true)}
              title="Upload and encrypt a document"
            >
              <span>
                <CloudUpload size={21} />
              </span>
              <strong>Upload Document</strong>
            </button>

            {[
              [FolderPlus, "Create Folder"],
              [Share2, "Share Files"],
              [Star, "View Favorites"],
            ].map(([Icon, label]) => (
              <button
                type="button"
                className="quick-action"
                key={label}
                disabled
                title="This action will be enabled in upcoming modules"
              >
                <span>
                  <Icon size={21} />
                </span>
                <strong>{label}</strong>
              </button>
            ))}
          </div>
        </article>

        {/* Activity Feed with live AuditLog events */}
        <article className="dashboard-card activity-panel">
          <div className="card-heading">
            <div>
              <h2>
                <Activity size={18} /> Activity Feed
              </h2>
              <p>Latest workspace updates and events</p>
            </div>
          </div>

          {dashboardData.activities.length > 0 ? (
            <div className="activity-list">
              {dashboardData.activities.map((act) => (
                <div className="activity-item" key={act.id}>
                  <div className="activity-icon upload">
                    <CloudUpload size={16} />
                  </div>
                  <div>
                    <strong>{act.title}</strong>
                    <span>{formatRelativeTime(act.time)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="dashboard-empty-state">
              <div className="empty-state-icon">
                <Activity size={24} />
              </div>
              <h3>No recent activity</h3>
              <p>Workspace and security events will be recorded here.</p>
            </div>
          )}
        </article>

        {/* Brand Quote */}
        <article className="quote-card">
          <div className="quote-mark">“</div>
          <h2>Secure what matters most.</h2>
          <p>Your documents. Your control.</p>
          <div className="quote-brand">
            <ShieldCheck size={18} /> SecureVault
          </div>
        </article>
      </section>
    </div>
  );
}
