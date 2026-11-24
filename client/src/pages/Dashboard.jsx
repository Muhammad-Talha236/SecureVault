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

export default function Dashboard({ audience }) {
  const isAdmin = audience === "Admin";
  const { user } = useAuth();

  // Metrics configured with neutral empty state ("--") ready for API integration
  const adminMetrics = [
    { label: "Total Users", value: "--", Icon: Users },
    { label: "Total Documents", value: "--", Icon: FileText },
    { label: "Storage Used", value: "--", Icon: Database },
    { label: "Security Events", value: "--", Icon: ShieldCheck },
  ];

  const userMetrics = [
    { label: "My Documents", value: "--", Icon: FileText },
    { label: "Shared Files", value: "--", Icon: Share2 },
    { label: "Storage Used", value: "--", Icon: Database },
    { label: "Favorites", value: "--", Icon: Star },
  ];

  const stats = isAdmin ? adminMetrics : userMetrics;

  // Real data state placeholders (empty arrays ready for future backend fetching)
  const recentFiles = [];
  const activities = [];

  const displayName = user?.name || (isAdmin ? "Administrator" : "User");

  return (
    <div className="dashboard">
      {/* Welcome banner with authenticated user's actual profile */}
      <section className="hero-banner">
        <div className="hero-content">
          <div className="hero-tag">
            <span className="hero-tag-dot" />
            {audience.toUpperCase()} WORKSPACE
          </div>

          <h1>Welcome back, {displayName}!</h1>

          <p>Manage your documents securely and efficiently.</p>

          <button
            className="primary-button"
            disabled
            title="Upload functionality will be available in the document management module"
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

      {/* Metric cards with neutral empty states */}
      <section className="metric-grid">
        {stats.map(({ label, value, Icon }, index) => (
          <article className="metric-card" key={label}>
            <div className={`metric-icon metric-icon-${index + 1}`}>
              <Icon size={22} />
            </div>

            <div className="metric-info">
              <span>{label}</span>
              <strong className="metric-empty">{value}</strong>
            </div>

            <span className="metric-na">No data</span>
          </article>
        ))}
      </section>

      {/* Main dashboard panels with empty states */}
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

          {recentFiles.length > 0 ? (
            <div className="recent-file-list">
              {/* Ready for real document integration */}
            </div>
          ) : (
            <div className="dashboard-empty-state">
              <div className="empty-state-icon">
                <FileText size={24} />
              </div>
              <h3>No documents uploaded yet</h3>
              <p>Your recent documents will appear here.</p>
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
            disabled
            title="Security details will be integrated in upcoming security module"
          >
            Security details <ArrowRight size={15} />
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
            {[
              [CloudUpload, "Upload Document"],
              [FolderPlus, "Create Folder"],
              [Share2, "Share Files"],
              [Star, "View Favorites"],
            ].map(([Icon, label]) => (
              <button
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

        {/* Activity Feed */}
        <article className="dashboard-card activity-panel">
          <div className="card-heading">
            <div>
              <h2>
                <Activity size={18} /> Activity Feed
              </h2>
              <p>Latest workspace updates and events</p>
            </div>
          </div>

          {activities.length > 0 ? (
            <div className="activity-list">
              {/* Ready for real audit log integration */}
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
