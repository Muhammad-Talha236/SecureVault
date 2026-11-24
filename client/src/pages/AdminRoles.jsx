import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  ShieldCheck,
  ShieldAlert,
  Users,
  Lock,
  Share2,
  Check,
  X,
  FileText,
  Key,
  Shield,
  Layers,
  Clock,
  ArrowRight,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { secureFetch } from "../utils/api.js";
import "./AdminPages.css";

export default function AdminRoles() {
  const [overview, setOverview] = useState({
    totalUsers: 0,
    adminCount: 0,
    userCount: 0,
    activePermissionsCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchOverview = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await secureFetch("/api/admin/roles/overview", {
        method: "GET",
      });
      if (!res.ok) {
        throw new Error("Failed to load roles overview.");
      }
      const data = await res.json();
      setOverview(data.overview || {});
    } catch (err) {
      setError(err.message || "Failed to communicate with roles API.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  const matrixData = [
    {
      capability: "Multi-Factor Authentication & HttpOnly Session",
      user: true,
      admin: true,
      note: "Standard secure credential and JWT session handling.",
    },
    {
      capability: "Upload & Encrypt Documents (AES-256-GCM)",
      user: true,
      admin: false,
      note: "Users encrypt files with client-side or per-user master keys.",
    },
    {
      capability: "Download & Decrypt Document Plaintext",
      user: true,
      admin: false,
      note: "Zero-Knowledge: Admin cannot decrypt or bypass user keys.",
    },
    {
      capability: "Delete Owned Documents & Clean Supabase Storage",
      user: true,
      admin: false,
      note: "Only document owner has cryptographic authority to delete.",
    },
    {
      capability: "Grant Granular Document Access (Viewer / Editor)",
      user: true,
      admin: false,
      note: "Controlled by document owners via DocumentPermission model.",
    },
    {
      capability: "View Platform-Wide Encrypted Metadata Records",
      user: false,
      admin: true,
      note: "Auditing of file size, timestamp, integrity hashes & key version.",
    },
    {
      capability: "User Account Directory & Role Management",
      user: false,
      admin: true,
      note: "Promote/demote accounts with strict self-demotion prevention.",
    },
    {
      capability: "System Security & Audit Log Inspection",
      user: false,
      admin: true,
      note: "Immutable audit trail for all authentication and security events.",
    },
  ];

  return (
    <div className="admin-page-container">
      {/* 1. Header */}
      <header className="admin-page-header">
        <div className="admin-header-copy">
          <div className="admin-header-title-row">
            <h1>Roles &amp; Permissions</h1>
            <span className="admin-counter-badge">RBAC Matrix</span>
          </div>
          <p className="admin-header-subtitle">
            Role-based access control, cryptographic privilege separation, and sharing permissions.
          </p>
        </div>

        <div className="admin-header-actions">
          <button
            type="button"
            className="admin-btn-secondary"
            onClick={fetchOverview}
            disabled={loading}
            title="Refresh statistics"
          >
            <RefreshCw size={15} className={loading ? "admin-spin" : ""} />
            <span>Refresh</span>
          </button>
        </div>
      </header>

      {/* 2. Top Summary Cards */}
      <div className="admin-roles-summary-grid">
        {/* Administrator Role Card */}
        <div className="admin-role-summary-card admin-highlight">
          <div className="role-summary-header">
            <div className="role-summary-badge admin">
              <ShieldAlert size={20} />
            </div>
            <div className="role-summary-title-wrap">
              <h3>ADMINISTRATOR</h3>
              <span className="role-user-count">
                {loading ? <Loader2 size={14} className="admin-spin" /> : `${overview.adminCount} Assigned`}
              </span>
            </div>
          </div>
          <p className="role-summary-desc">
            Authorized governance operators. Responsible for user management, system audit monitoring,
            and cryptographic metadata inspection. Zero download or decryption bypass.
          </p>
          <div className="role-summary-footer">
            <Link to="/admin/users" className="role-action-link">
              <span>Manage User Roles</span>
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>

        {/* Standard User Role Card */}
        <div className="admin-role-summary-card user-highlight">
          <div className="role-summary-header">
            <div className="role-summary-badge user">
              <Users size={20} />
            </div>
            <div className="role-summary-title-wrap">
              <h3>STANDARD USER</h3>
              <span className="role-user-count">
                {loading ? <Loader2 size={14} className="admin-spin" /> : `${overview.userCount} Assigned`}
              </span>
            </div>
          </div>
          <p className="role-summary-desc">
            Standard workspace participants. Owners of their personal encrypted documents, retention
            lifecycles, and cross-user collaborative sharing permissions.
          </p>
          <div className="role-summary-footer">
            <Link to="/admin/documents" className="role-action-link">
              <span>View Document Records</span>
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>

        {/* Cross-User Sharing Grants Card */}
        <div className="admin-role-summary-card share-highlight">
          <div className="role-summary-header">
            <div className="role-summary-badge share">
              <Share2 size={20} />
            </div>
            <div className="role-summary-title-wrap">
              <h3>SHARING GRANTS</h3>
              <span className="role-user-count">
                {loading ? (
                  <Loader2 size={14} className="admin-spin" />
                ) : (
                  `${overview.activePermissionsCount} Active`
                )}
              </span>
            </div>
          </div>
          <p className="role-summary-desc">
            Active cross-user document grants managed via the DocumentPermission model. Encrypted
            documents can be delegated as read-only VIEWER or collaborative EDITOR.
          </p>
          <div className="role-summary-footer">
            <span className="role-note-badge">Zero-Trust Isolation</span>
          </div>
        </div>
      </div>

      {/* 3. Access Control Permission Matrix */}
      <div className="admin-matrix-section">
        <div className="admin-matrix-header">
          <div className="matrix-title-row">
            <Layers size={18} />
            <h2>System Access Control Matrix</h2>
          </div>
          <p className="matrix-subtitle">
            Formal separation of duties between System Governance (ADMIN) and Data Ownership (USER).
          </p>
        </div>

        <div className="admin-table-wrapper">
          <table className="admin-data-table matrix-table">
            <thead>
              <tr>
                <th style={{ width: "42%" }}>Platform Capability</th>
                <th style={{ width: "16%" }} className="text-center">
                  USER Role
                </th>
                <th style={{ width: "16%" }} className="text-center">
                  ADMIN Role
                </th>
                <th style={{ width: "26%" }}>Security Enforcement</th>
              </tr>
            </thead>
            <tbody>
              {matrixData.map((row, idx) => (
                <tr key={idx}>
                  <td>
                    <strong>{row.capability}</strong>
                  </td>
                  <td className="text-center">
                    {row.user ? (
                      <span className="matrix-check green" title="Granted">
                        <Check size={16} />
                      </span>
                    ) : (
                      <span className="matrix-check red" title="Denied">
                        <X size={16} />
                      </span>
                    )}
                  </td>
                  <td className="text-center">
                    {row.admin ? (
                      <span className="matrix-check green" title="Granted">
                        <Check size={16} />
                      </span>
                    ) : (
                      <span className="matrix-check red" title="Denied / Zero-Knowledge Isolation">
                        <X size={16} />
                      </span>
                    )}
                  </td>
                  <td>
                    <span className="matrix-note">{row.note}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Granular Document Permission Tiers */}
      <div className="admin-tiers-grid">
        <div className="admin-tier-card">
          <div className="tier-header">
            <div className="tier-badge viewer">VIEWER</div>
            <h4>Read-Only Collaborator</h4>
          </div>
          <ul className="tier-features">
            <li>
              <Check size={14} className="text-green" />
              <span>Decryption and download of shared document</span>
            </li>
            <li>
              <Check size={14} className="text-green" />
              <span>Audit trail entry logged on each access</span>
            </li>
            <li>
              <X size={14} className="text-red" />
              <span>Cannot delete or re-upload document</span>
            </li>
            <li>
              <X size={14} className="text-red" />
              <span>Cannot modify permissions or invite others</span>
            </li>
          </ul>
        </div>

        <div className="admin-tier-card">
          <div className="tier-header">
            <div className="tier-badge editor">EDITOR</div>
            <h4>Collaborative Contributor</h4>
          </div>
          <ul className="tier-features">
            <li>
              <Check size={14} className="text-green" />
              <span>Decryption and download of shared document</span>
            </li>
            <li>
              <Check size={14} className="text-green" />
              <span>Upload new encrypted versions with fresh IVs</span>
            </li>
            <li>
              <Check size={14} className="text-green" />
              <span>View collaborators list for the document</span>
            </li>
            <li>
              <X size={14} className="text-red" />
              <span>Cannot delete the root document (owner only)</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
