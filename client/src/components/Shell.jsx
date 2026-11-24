import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
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
  ChevronDown,
  Search,
  LogOut,
  User as UserIcon,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";

export default function Shell({ audience, theme, toggleTheme }) {
  const isAdmin = audience === "Admin";
  const location = useLocation();
  const navigate = useNavigate();
  const pageContentRef = useRef(null);
  const profileMenuRef = useRef(null);

  const { user, logout } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    if (pageContentRef.current) {
      pageContentRef.current.scrollTop = 0;
    }
  }, [location.pathname]);

  // Close profile menu when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    };
    if (profileOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [profileOpen]);

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  const getInitials = (name) => {
    if (!name) return isAdmin ? "AD" : "US";
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const initials = getInitials(user?.name);
  const displayName = user?.name || (isAdmin ? "Administrator" : "User");
  const displayRole = user?.role === "ADMIN" ? "Administrator" : "Standard User";

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

        <div className="sidebar-profile-container" ref={profileMenuRef}>
          <div
            className={`sidebar-profile ${profileOpen ? "active" : ""}`}
            onClick={() => setProfileOpen(!profileOpen)}
            role="button"
            tabIndex={0}
            aria-haspopup="true"
            aria-expanded={profileOpen}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setProfileOpen(!profileOpen);
              }
            }}
          >
            <div className="profile-avatar">{initials}</div>

            <div className="profile-info">
              <strong>{displayName}</strong>
              <span>{displayRole}</span>
            </div>

            <ChevronDown
              size={17}
              className={`profile-chevron ${profileOpen ? "rotated" : ""}`}
            />
          </div>

          {profileOpen && (
            <div className="profile-dropdown">
              <div className="profile-dropdown-header">
                <p className="dropdown-user-name">{displayName}</p>
                <p className="dropdown-user-email">{user?.email || "No email available"}</p>
                <span className="dropdown-role-badge">{user?.role || "USER"}</span>
              </div>
              <div className="profile-dropdown-divider" />
              <button
                type="button"
                className="dropdown-item logout-btn"
                onClick={handleLogout}
              >
                <LogOut size={16} />
                <span>Sign Out</span>
              </button>
            </div>
          )}
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
            </button>

            <button
              className="topbar-avatar"
              title={`${displayName} (${displayRole}) - Click to sign out`}
              onClick={handleLogout}
            >
              {initials}
            </button>
          </div>
        </header>

        <main className="page-content" ref={pageContentRef}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
