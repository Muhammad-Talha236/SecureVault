import { useState } from "react";
import { createPortal } from "react-dom";
import { X, Share2, Loader2 } from "lucide-react";
import { secureFetch } from "../utils/api.js";
import "./Sharing.css";

export default function ShareModal({ documentItem, onClose, onShared }) {
  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState("VIEWER");
  const [expiresAt, setExpiresAt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    setError(""); setSuccess("");
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Enter a valid recipient email address."); return;
    }
    if (expiresAt) {
      const date = new Date(expiresAt);
      if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
        setError("Expiration must be a valid future date and time."); return;
      }
    }
    try {
      setLoading(true);
      const response = await secureFetch(`/api/documents/${documentItem.id}/share`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientEmail: email.trim(), permission, expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Failed to share document.");
      setSuccess(`Access granted to ${email.trim()}.`);
      onShared?.();
      setEmail("");
    } catch (err) {
      setError(err.message || "Failed to share document.");
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div className="sharing-modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sharing-modal" role="dialog" aria-modal="true" aria-label="Share document">
        <div className="sharing-modal-header">
          <div><h2>Share Document</h2><p>{documentItem.originalName}</p></div>
          <button className="sharing-close" type="button" onClick={onClose} aria-label="Close"><X size={19} /></button>
        </div>
        <form onSubmit={submit}>
          <div className="sharing-modal-body">
            {error && <div className="sharing-alert error" role="alert">{error}</div>}
            {success && <div className="sharing-alert success" role="status">{success}</div>}
            <div className="sharing-field">
              <label htmlFor="share-email">Recipient email</label>
              <input id="share-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="colleague@example.com" />
            </div>
            <div className="sharing-field">
              <label htmlFor="share-permission">Permission</label>
              <select id="share-permission" value={permission} onChange={(e) => setPermission(e.target.value)}>
                <option value="VIEWER">VIEWER - read and download</option>
                <option value="EDITOR">EDITOR - read and update</option>
              </select>
            </div>
            <div className="sharing-field">
              <label htmlFor="share-expiration">Expiration (optional)</label>
              <input id="share-expiration" type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </div>
          </div>
          <div className="sharing-modal-footer">
            <button type="button" className="sharing-button secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="sharing-button primary" disabled={loading}>
              {loading ? <Loader2 size={15} /> : <Share2 size={15} />} Grant Access
            </button>
          </div>
        </form>
      </div>
    </div>, document.body
  );
}
