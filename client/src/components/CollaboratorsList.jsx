import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, Users } from "lucide-react";
import { secureFetch } from "../utils/api.js";
import "./Sharing.css";

export default function CollaboratorsList({ documentItem, onClose }) {
  const [collaborators, setCollaborators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expirationDrafts, setExpirationDrafts] = useState({});

  const toLocalInputValue = (value) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  };

  const fetchCollaborators = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await secureFetch(`/api/documents/${documentItem.id}/collaborators`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Failed to load collaborators.");
      const nextCollaborators = data.collaborators || [];
      setCollaborators(nextCollaborators);
      setExpirationDrafts(Object.fromEntries(
        nextCollaborators.map((item) => [item.id, toLocalInputValue(item.expiresAt)])
      ));
    } catch (err) {
      setError(err.message || "Failed to load collaborators.");
    } finally {
      setLoading(false);
    }
  }, [documentItem.id]);

  useEffect(() => { fetchCollaborators(); }, [fetchCollaborators]);

  const updatePermission = async (collaborator, permission) => {
    try {
      setError("");
      const response = await secureFetch(`/api/documents/${documentItem.id}/permissions/${collaborator.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ permission }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Failed to update permission.");
      await fetchCollaborators();
    } catch (err) { setError(err.message || "Failed to update permission."); }
  };

  const updateExpiration = async (collaborator) => {
    const draft = expirationDrafts[collaborator.id] || "";
    try {
      setError("");
      if (!draft) throw new Error("Choose a future expiration date or use Remove.");
      const date = new Date(draft);
      if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
        throw new Error("Expiration must be a valid future date and time.");
      }
      const response = await secureFetch(`/api/documents/${documentItem.id}/permissions/${collaborator.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiresAt: date.toISOString() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Failed to update expiration.");
      await fetchCollaborators();
    } catch (err) { setError(err.message || "Failed to update expiration."); }
  };

  const removeExpiration = async (collaborator) => {
    try {
      setError("");
      const response = await secureFetch(`/api/documents/${documentItem.id}/permissions/${collaborator.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiresAt: null }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Failed to remove expiration.");
      await fetchCollaborators();
    } catch (err) { setError(err.message || "Failed to remove expiration."); }
  };

  const revoke = async (collaborator) => {
    if (!window.confirm(`Revoke access from ${collaborator.user.name} (${collaborator.user.email})?`)) return;
    try {
      setError("");
      const response = await secureFetch(`/api/documents/${documentItem.id}/permissions/${collaborator.id}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Failed to revoke access.");
      await fetchCollaborators();
    } catch (err) { setError(err.message || "Failed to revoke access."); }
  };

  return createPortal(
    <div className="sharing-modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sharing-modal" role="dialog" aria-modal="true" aria-label="Manage collaborators">
        <div className="sharing-modal-header">
          <div><h2>Manage Access</h2><p>{documentItem.originalName}</p></div>
          <button className="sharing-close" type="button" onClick={onClose} aria-label="Close"><X size={19} /></button>
        </div>
        <div className="sharing-modal-body">
          {error && <div className="sharing-alert error" role="alert">{error}</div>}
          {loading ? (
            <div className="sharing-alert"><Loader2 size={16} /> Loading collaborators...</div>
          ) : collaborators.length === 0 ? (
            <div className="sharing-alert">No users have been granted access.</div>
          ) : collaborators.map((item) => {
            const initials = item.user.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
            const disabled = item.status !== "ACTIVE";
            return (
              <div className="collaborator-row" key={item.id}>
                <div className="collaborator-person">
                  <div className="collaborator-avatar">{initials}</div>
                  <div><strong>{item.user.name}</strong><span>{item.user.email}</span></div>
                </div>
                <select value={item.permission} disabled={disabled} onChange={(e) => updatePermission(item, e.target.value)}>
                  <option value="VIEWER">VIEWER</option><option value="EDITOR">EDITOR</option>
                </select>
                <div>
                  <span className={`sharing-status ${item.status.toLowerCase()}`}>{item.status}</span>
                  {item.status === "ACTIVE" ? (
                    <div style={{ display: "grid", gap: 5, marginTop: 6 }}>
                      <input
                        type="datetime-local"
                        value={expirationDrafts[item.id] || ""}
                        onChange={(event) => setExpirationDrafts((current) => ({
                          ...current,
                          [item.id]: event.target.value,
                        }))}
                        aria-label={`Expiration for ${item.user.name}`}
                      />
                      <div style={{ display: "flex", gap: 5 }}>
                        <button
                          type="button"
                          className="sharing-button secondary"
                          onClick={() => updateExpiration(item)}
                        >
                          Save
                        </button>
                        {item.expiresAt && (
                          <button
                            type="button"
                            className="sharing-button secondary"
                            onClick={() => removeExpiration(item)}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 5 }}>
                      {item.expiresAt ? `Expired ${new Date(item.expiresAt).toLocaleString()}` : "No expiration"}
                    </div>
                  )}
                </div>
                <button type="button" className="sharing-button danger" disabled={item.status === "REVOKED"} onClick={() => revoke(item)}>Revoke</button>
              </div>
            );
          })}
        </div>
        <div className="sharing-modal-footer">
          <button type="button" className="sharing-button secondary" onClick={fetchCollaborators}><Users size={15} /> Refresh</button>
          <button type="button" className="sharing-button secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>, document.body
  );
}
