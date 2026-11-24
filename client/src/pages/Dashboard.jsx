import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  CloudUpload,
  Database,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderPlus,
  HardDrive,
  LockKeyhole,
  MoreHorizontal,
  Share2,
  ShieldCheck,
  Star,
  Users,
  Clock3,
} from "lucide-react";

const adminStats = [
  { label: "Total Users", value: "1,248", change: "+12%", Icon: Users },
  { label: "Total Documents", value: "356", change: "+8%", Icon: FileText },
  { label: "Storage Used", value: "72%", change: null, Icon: Database },
  { label: "Security Events", value: "24", change: "+5%", Icon: ShieldCheck },
];

const userStats = [
  { label: "My Documents", value: "1,248", change: "+12%", Icon: FileText },
  { label: "Shared Files", value: "356", change: "+8%", Icon: Share2 },
  { label: "Storage Used", value: "72%", change: null, Icon: Database },
  { label: "Favorites", value: "24", change: "+5%", Icon: Star },
];

const recentFiles = [
  { name: "Project Proposal.pdf", size: "2.4 MB", time: "2 hours ago", type: "pdf", Icon: FileText },
  { name: "Meeting Notes.docx", size: "1.1 MB", time: "3 hours ago", type: "doc", Icon: FileText },
  { name: "Design Assets.zip", size: "12.8 MB", time: "5 hours ago", type: "zip", Icon: FileArchive },
  { name: "Banner.png", size: "856 KB", time: "1 day ago", type: "image", Icon: FileImage },
];

const activities = [
  { title: "You uploaded Project Proposal.pdf", time: "2 hours ago", Icon: CloudUpload, type: "upload" },
  { title: "A document was shared with Sarah", time: "3 hours ago", Icon: Share2, type: "share" },
  { title: "Security check completed", time: "5 hours ago", Icon: ShieldCheck, type: "secure" },
];

function StorageChart() {
  return (
    <div className="storage-chart">
      <div className="donut-chart">
        <div className="donut-center">
          <strong>72%</strong>
          <span>Used</span>
        </div>
      </div>

      <div className="storage-legend">
        <div>
          <i className="legend-dot used" />
          <span>Used Space</span>
          <strong>72 GB</strong>
        </div>
        <div>
          <i className="legend-dot free" />
          <span>Free Space</span>
          <strong>28 GB</strong>
        </div>
        <div>
          <i className="legend-dot total" />
          <span>Total Space</span>
          <strong>100 GB</strong>
        </div>
      </div>
    </div>
  );
}

function ActivityChart() {
  return (
    <div className="activity-chart">
      <div className="chart-y-labels">
        <span>15 GB</span>
        <span>10 GB</span>
        <span>5 GB</span>
        <span>0 GB</span>
      </div>

      <svg
        className="chart-svg"
        viewBox="0 0 600 190"
        preserveAspectRatio="none"
        role="img"
        aria-label="Illustrative storage usage chart"
      >
        <defs>
          <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#398BFF" stopOpacity=".32" />
            <stop offset="100%" stopColor="#398BFF" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[25, 70, 115, 160].map((y) => (
          <line
            key={y}
            x1="0"
            y1={y}
            x2="600"
            y2={y}
            className="chart-grid-line"
          />
        ))}

        <path
          d="M0 135 C55 125 65 92 120 98 S190 118 240 88 S310 75 360 91 S440 52 490 60 S550 48 600 27 L600 165 L0 165 Z"
          fill="url(#chartFill)"
        />

        <path
          d="M0 135 C55 125 65 92 120 98 S190 118 240 88 S310 75 360 91 S440 52 490 60 S550 48 600 27"
          className="chart-line"
        />

        {[
          [0, 135], [120, 98], [240, 88],
          [360, 91], [490, 60], [600, 27],
        ].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="4" className="chart-point" />
        ))}
      </svg>

      <div className="chart-x-labels">
        <span>Jan</span>
        <span>Feb</span>
        <span>Mar</span>
        <span>Apr</span>
        <span>May</span>
        <span>Jun</span>
      </div>
    </div>
  );
}

export default function Dashboard({ audience }) {
  const isAdmin = audience === "Admin";
  const stats = isAdmin ? adminStats : userStats;

  return (
    <div className="dashboard">
      {/* Welcome banner */}
      <section className="hero-banner">
        <div className="hero-content">
          <div className="hero-tag">
            <span className="hero-tag-dot" />
            {audience.toUpperCase()} WORKSPACE
          </div>

          <h1>
            Welcome back, {isAdmin ? "Admin" : "John"}!
          </h1>

          <p>
            Manage your documents securely and efficiently.
          </p>

          <button className="primary-button" disabled title="Upload functionality will be added later">
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

      {/* Metric cards */}
      <section className="metric-grid">
        {stats.map(({ label, value, change, Icon }, index) => (
          <article className="metric-card" key={label}>
            <div className={`metric-icon metric-icon-${index + 1}`}>
              <Icon size={22} />
            </div>

            <div className="metric-info">
              <span>{label}</span>
              <strong>{value}</strong>
            </div>

            {change && (
              <span className="metric-change">
                <ArrowUpRight size={13} />
                {change}
              </span>
            )}

            {index === 2 && (
              <div className="metric-progress">
                <span style={{ width: "72%" }} />
              </div>
            )}
          </article>
        ))}
      </section>

      {/* Main dashboard panels */}
      <section className="dashboard-grid">
        <article className="dashboard-card storage-panel">
          <div className="card-heading">
            <div>
              <h2><Database size={18} /> Storage Overview</h2>
              <p>Understand your storage usage</p>
            </div>
            <button className="text-action" disabled>
              Last 6 Months <MoreHorizontal size={18} />
            </button>
          </div>

          <StorageChart />
        </article>

        <article className="dashboard-card recent-panel">
          <div className="card-heading">
            <div>
              <h2><Clock3 size={18} /> Recent Files</h2>
              <p>Your recently accessed documents</p>
            </div>
            <button className="text-action" disabled>
              View All <ArrowRight size={15} />
            </button>
          </div>

          <div className="recent-file-list">
            {recentFiles.map((file) => (
              <div className="recent-file" key={file.name}>
                <div className={`file-type-icon ${file.type}`}>
                  <file.Icon size={20} />
                </div>

                <div className="file-details">
                  <strong>{file.name}</strong>
                  <span>{file.size} <i /> {file.time}</span>
                </div>

                <button className="more-button" aria-label={`More options for ${file.name}`}>
                  <MoreHorizontal size={18} />
                </button>
              </div>
            ))}
          </div>
        </article>

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

          <button className="security-link" disabled>
            Security details <ArrowRight size={15} />
          </button>
        </article>
      </section>

      {/* Bottom section */}
      <section className="bottom-grid">
        <article className="dashboard-card quick-actions">
          <div className="card-heading">
            <div>
              <h2><Activity size={18} /> Quick Actions</h2>
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
              <button className="quick-action" key={label} disabled title="This feature will be implemented later">
                <span><Icon size={21} /></span>
                <strong>{label}</strong>
              </button>
            ))}
          </div>
        </article>

        <article className="dashboard-card activity-panel">
          <div className="card-heading">
            <div>
              <h2><Activity size={18} /> Activity Feed</h2>
              <p>Latest workspace updates</p>
            </div>
            <button className="text-action" disabled>
              View All <ArrowRight size={15} />
            </button>
          </div>

          <div className="activity-list">
            {activities.map(({ title, time, Icon, type }) => (
              <div className="activity-item" key={title}>
                <div className={`activity-icon ${type}`}>
                  <Icon size={16} />
                </div>
                <div>
                  <strong>{title}</strong>
                  <span>{time}</span>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="quote-card">
          <div className="quote-mark">“</div>
          <h2>Secure what matters most.</h2>
          <p>Your documents. Your control.</p>
          <div className="quote-brand">
            <ShieldCheck size={18} /> SecureVault
          </div>
        </article>
      </section>

      <p className="demo-notice">
        <ShieldCheck size={14} />
        Preview dashboard — displayed figures and activity are sample data.
      </p>
    </div>
  );
}