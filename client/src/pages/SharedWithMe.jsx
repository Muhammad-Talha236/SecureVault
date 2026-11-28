import { useEffect, useState } from "react";
import { Download, FileText, Loader2, Share2, AlertCircle, RefreshCw } from "lucide-react";
import { secureFetch } from "../utils/api.js";
import "./SharedWithMe.css";

export default function SharedWithMe() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloadingId, setDownloadingId] = useState(null);

  const fetchDocuments = async () => {
    setLoading(true); setError("");
    try {
      const response = await secureFetch("/api/documents/shared-with-me");
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Failed to load shared documents.");
      setDocuments(data.documents || []);
    } catch (err) {
      setError(err.message || "Failed to load shared documents.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDocuments(); }, []);

  const downloadDocument = async (documentItem) => {
    if (downloadingId) return;
    setDownloadingId(documentItem.id); setError("");
    try {
      const response = await secureFetch(`/api/documents/${documentItem.id}/download`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || "Download failed.");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition");
      let filename = documentItem.originalName;
      if (disposition) {
        const match = disposition.match(/filename\*?=['"]?(?:UTF-\d['"]*)?([^;\r\n"']*)['"]?/i);
        if (match?.[1]) filename = decodeURIComponent(match[1]);
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = filename;
      document.body.appendChild(link); link.click(); link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || "Download failed.");
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="shared-page">
      <header className="shared-header">
        <div><div className="shared-title"><Share2 size={22} /><h1>Shared With Me</h1></div><p>Documents you can access through active permission grants.</p></div>
        <button type="button" className="sharing-button secondary" onClick={fetchDocuments} disabled={loading}><RefreshCw size={15} /> Refresh</button>
      </header>
      {error && <div className="sharing-alert error" role="alert"><AlertCircle size={16} /> {error}</div>}
      {loading ? (
        <div className="shared-state"><Loader2 className="docs-spinner" size={30} /><h3>Loading shared documents...</h3></div>
      ) : documents.length === 0 ? (
        <div className="shared-state"><Share2 size={34} /><h3>No shared documents</h3><p>Documents shared with your account will appear here.</p></div>
      ) : (
        <div className="shared-grid">
          {documents.map((documentItem) => (
            <article className="shared-card" key={documentItem.id}>
              <div className="shared-card-icon"><FileText size={24} /></div>
              <div className="shared-card-copy">
                <h3 title={documentItem.originalName}>{documentItem.originalName}</h3>
                <p>Shared by {documentItem.owner.name} ({documentItem.owner.email})</p>
                <p>{documentItem.sizeBytes ? `${Math.max(1, Math.ceil(documentItem.sizeBytes / 1024))} KB` : "Unknown size"}</p>
              </div>
              <div className="shared-card-meta">
                <span className={`sharing-status active`}>{documentItem.myPermission}</span>
                <span>{documentItem.expiresAt ? `Expires ${new Date(documentItem.expiresAt).toLocaleString()}` : "No expiration"}</span>
              </div>
              <button type="button" className="sharing-button primary" disabled={downloadingId !== null} onClick={() => downloadDocument(documentItem)}>
                {downloadingId === documentItem.id ? <Loader2 size={15} /> : <Download size={15} />} Download
              </button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
