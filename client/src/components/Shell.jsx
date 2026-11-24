import { NavLink, Outlet } from "react-router-dom";
import {
  Activity,
  Bell,
  FileText,
  FolderLock,
  LayoutDashboard,
  LockKeyhole,
  Moon,
  ScrollText,
  Share2,
  ShieldCheck,
  Sun,
  Users,
  Settings,
  Star,
  ChevronDown,
  Search,
  Upload,
} from "lucide-react";

export default function Shell({ audience, theme, toggleTheme }) {
  const isAdmin = audience === "Admin";

  const adminItems = [
    ["/admin", "Dashboard", LayoutDashboard, true],
    ["/admin/users", "User Management", Users],
    ["/admin/roles", "Roles & Permissions", LockKeyhole],
    ["/admin/documents", "Document Records", FileText],
    ["/admin/audit-logs", "Audit Logs", ScrollText],
    ["/admin/security-events", "Security Events", ShieldCheck],
  ];

  const userItems = [
    ["/user", "Dashboard", LayoutDashboard, true],
    ["/user/my-documents", "My Documents", FolderLock],
    ["/user/shared", "Shared With Me", Share2],
    ["/user/activity", "My Activity", Activity],
  ];

  const items = isAdmin ? adminItems : userItems;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <ShieldCheck size={25} strokeWidth={2.2} />
          </div>

          <div className="brand-copy">
            <h2>Secure<span>Vault</span></h2>
            <p>Document Management</p>
          </div>
        </div>

        <div className="sidebar-section">
          <p className="sidebar-label">WORKSPACE</p>

          <nav className="sidebar-nav">
            {items.map(([to, label, Icon, end]) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  isActive ? "nav-link active" : "nav-link"
                }
              >
                <Icon size={19} strokeWidth={1.9} />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="sidebar-promo">
          <div className="promo-icon">
            <ShieldCheck size={25} />
          </div>

          <h3>Your files.<br />Our priority.</h3>
          <p>Secure, private and organized document management.</p>

          <div className="promo-footer">
            <LockKeyhole size={14} />
            <span>Protected workspace</span>
          </div>
        </div>

        <div className="sidebar-profile">
          <div className="profile-avatar">
            {isAdmin ? "AD" : "JD"}
          </div>

          <div className="profile-info">
            <strong>{isAdmin ? "Admin User" : "John Doe"}</strong>
            <span>{audience}</span>
          </div>

          <ChevronDown size={17} className="profile-chevron" />
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div className="global-search">
            <Search size={18} />
            <input
              type="search"
              placeholder="Search files, users, or anything..."
              aria-label="Search"
            />
            <kbd>Ctrl K</kbd>
          </div>

          <div className="topbar-actions">
            <button
              className="theme-toggle"
              onClick={toggleTheme}
              title="Toggle theme"
              aria-label="Toggle theme"
            >
              <Sun size={17} className={theme === "light" ? "selected" : ""} />
              <Moon size={17} className={theme === "dark" ? "selected" : ""} />
            </button>

            <button
              className="notification-button"
              aria-label="Notifications"
              title="Notifications"
            >
              <Bell size={19} />
              <span className="notification-dot">3</span>
            </button>

            <button className="topbar-avatar" title="Profile">
              {isAdmin ? "AD" : "JD"}
            </button>
          </div>
        </header>

        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}