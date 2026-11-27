import { useCallback, useEffect, useState } from "react";
import { Search, RefreshCw, ChevronLeft, ChevronRight, X, ShieldAlert, Activity, KeyRound, FileWarning } from "lucide-react";
import { secureFetch } from "../utils/api.js";
import "./AuditLogs.css";

const ACTIONS = ["LOGIN_SUCCESS", "LOGIN_FAILURE", "LOGOUT", "DOCUMENT_UPLOAD", "DOCUMENT_VIEW", "DOCUMENT_DOWNLOAD", "DOCUMENT_UPDATE", "DOCUMENT_DELETE", "DOCUMENT_SHARE", "PERMISSION_REVOKE", "ACCESS_DENIED", "INTEGRITY_CHECK", "ADMIN_ACTION"];
const dateForRange = (range) => {
  if (range === "custom" || range === "all") return {};
  const end = new Date();
  const start = new Date();
  if (range === "today") start.setHours(0, 0, 0, 0);
  else start.setDate(start.getDate() - (range === "7d" ? 7 : 30));
  return { startDate: start.toISOString(), endDate: end.toISOString() };
};
const prettyDate = (value) => value ? new Date(value).toLocaleString() : "—";
const clientDetails = (ua = "") => ({
  browser: /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Unknown browser",
  os: /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : "Unknown OS",
  device: /Mobile|Android|iPhone/.test(ua) ? "Mobile" : "Desktop",
});

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState({ totalEventsToday: 0, failedLogins: 0, accessDenials: 0, integrityFailures: 0 });
  const [pagination, setPagination] = useState({ totalRecords: 0, currentPage: 1, totalPages: 0, limit: 25 });
  const [filters, setFilters] = useState({ action: "", outcome: "", range: "7d", startDate: "", endDate: "", search: "" });
  const [query, setQuery] = useState({ ...filters });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(pagination.limit) });
      if (query.action) params.set("action", query.action);
      if (query.outcome) params.set("outcome", query.outcome);
      if (query.search.trim()) params.set("search", query.search.trim());
      const dateParams = query.range === "custom"
        ? { startDate: query.startDate, endDate: query.endDate }
        : dateForRange(query.range);
      Object.entries(dateParams).forEach(([key, value]) => value && params.set(key, value));
      const [logsRes, statsRes] = await Promise.all([
        secureFetch(`/api/audit-logs?${params}`), secureFetch("/api/audit-logs/stats"),
      ]);
      if (!logsRes.ok || !statsRes.ok) throw new Error("Could not load audit records. Check your administrator session and try again.");
      const [data, statsData] = await Promise.all([logsRes.json(), statsRes.json()]);
      setLogs(data.logs || []); setPagination((prev) => ({ ...prev, ...data.pagination })); setStats(statsData.stats || stats);
    } catch (err) { setError(err.message || "Unable to load audit records."); }
    finally { setLoading(false); }
  }, [page, pagination.limit, query]);

  useEffect(() => { load(); }, [load]);

  const applyFilters = (event) => { event.preventDefault(); setPage(1); setQuery({ ...filters }); };
  const openDetails = async (entry) => {
    try {
      const res = await secureFetch(`/api/audit-logs/${entry.id}`);
      if (res.ok) { const data = await res.json(); setSelected(data.log); return; }
    } catch (_error) { /* Show the row details if the detail request is temporarily unavailable. */ }
    setSelected(entry);
  };

  return <section className="audit-page">
    <header className="audit-heading"><div><span className="audit-eyebrow">SECURITY & ACCOUNTABILITY</span><h1>Audit Logs</h1><p>Search and review the system’s security activity timeline.</p></div><button className="audit-refresh" onClick={load} disabled={loading}><RefreshCw size={16} /> Refresh</button></header>

    <div className="audit-stats">
      <article><span className="audit-stat-icon blue"><Activity size={18}/></span><small>Events today</small><strong>{stats.totalEventsToday}</strong></article>
      <article><span className="audit-stat-icon red"><KeyRound size={18}/></span><small>Failed logins</small><strong>{stats.failedLogins}</strong></article>
      <article><span className="audit-stat-icon amber"><ShieldAlert size={18}/></span><small>Access denials</small><strong>{stats.accessDenials}</strong></article>
      <article><span className="audit-stat-icon violet"><FileWarning size={18}/></span><small>Integrity failures</small><strong>{stats.integrityFailures}</strong></article>
    </div>

    <form className="audit-filters" onSubmit={applyFilters}>
      <label>Action<select value={filters.action} onChange={(e) => setFilters({ ...filters, action: e.target.value })}><option value="">All actions</option>{ACTIONS.map((a) => <option key={a}>{a}</option>)}</select></label>
      <label>Outcome<select value={filters.outcome} onChange={(e) => setFilters({ ...filters, outcome: e.target.value })}><option value="">All outcomes</option><option>SUCCESS</option><option>FAILURE</option><option>DENIED</option></select></label>
      <label>Date range<select value={filters.range} onChange={(e) => setFilters({ ...filters, range: e.target.value })}><option value="today">Today</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="custom">Custom range</option><option value="all">All time</option></select></label>
      {filters.range === "custom" && <><label>From<input type="date" value={filters.startDate} onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}/></label><label>To<input type="date" value={filters.endDate} onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}/></label></>}
      <label className="audit-search-label">Actor or resource<Search size={15}/><input aria-label="Search actor or resource" placeholder="Name, email, user or document ID" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })}/></label>
      <button className="audit-apply" type="submit"><Search size={15}/> Apply filters</button>
    </form>

    <div className="audit-table-wrap"><table className="audit-table"><thead><tr><th>Timestamp</th><th>Actor</th><th>Action</th><th>Resource</th><th>Outcome</th><th>IP address</th><th><span className="sr-only">Details</span></th></tr></thead><tbody>
      {loading ? <tr><td className="audit-message" colSpan="7">Loading audit records…</td></tr> : error ? <tr><td className="audit-message error" colSpan="7">{error}</td></tr> : logs.length === 0 ? <tr><td className="audit-message" colSpan="7">No audit records match these filters.</td></tr> : logs.map((log) => <tr key={log.id}>
        <td className="audit-time">{prettyDate(log.createdAt)}</td><td><strong>{log.actor?.name || (log.resourceType === "USER" && log.action === "LOGIN_FAILURE" ? "Anonymous" : "System")}</strong>{log.actor?.email && <small className="audit-subline">{log.actor.email}</small>}</td>
        <td><span className="audit-action">{log.action}</span></td><td><span className="audit-resource">{log.resourceType}</span><small className="audit-subline audit-id">{log.resourceId || "—"}</small></td>
        <td><span className={`audit-outcome ${log.outcome?.toLowerCase()}`}>{log.outcome}</span></td><td>{log.ipAddress || "—"}</td><td><button className="audit-view" onClick={() => openDetails(log)}>View details</button></td>
      </tr>)}
    </tbody></table></div>
    <footer className="audit-pagination"><span>{pagination.totalRecords} records</span><div><label>Rows <select value={pagination.limit} onChange={(e) => { setPage(1); setPagination({ ...pagination, limit: Number(e.target.value) }); }}><option>10</option><option>25</option><option>50</option></select></label><button disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)} aria-label="Previous page"><ChevronLeft size={17}/></button><span>Page {pagination.currentPage || page} of {pagination.totalPages || 1}</span><button disabled={page >= pagination.totalPages || loading} onClick={() => setPage((p) => p + 1)} aria-label="Next page"><ChevronRight size={17}/></button></div></footer>

    {selected && <div className="audit-modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setSelected(null)}><section className="audit-modal" role="dialog" aria-modal="true" aria-labelledby="audit-detail-title"><header><div><span className="audit-eyebrow">FORENSIC RECORD</span><h2 id="audit-detail-title">{selected.action}</h2></div><button onClick={() => setSelected(null)} aria-label="Close details"><X size={19}/></button></header><dl className="audit-detail-grid"><div><dt>Outcome</dt><dd><span className={`audit-outcome ${selected.outcome?.toLowerCase()}`}>{selected.outcome}</span></dd></div><div><dt>Timestamp</dt><dd>{prettyDate(selected.createdAt)}</dd></div><div><dt>Actor</dt><dd>{selected.actor?.name || "Anonymous"}{selected.actor?.email ? ` · ${selected.actor.email}` : ""}</dd></div><div><dt>Resource</dt><dd>{selected.resourceType} · {selected.resourceId || "—"}</dd></div><div><dt>IP address</dt><dd>{selected.ipAddress || "—"}</dd></div><div><dt>Client</dt><dd>{Object.values(clientDetails(selected.userAgent)).join(" · ")}</dd></div><div className="audit-detail-wide"><dt>User-Agent</dt><dd>{selected.userAgent || "Not recorded"}</dd></div></dl><h3>Safe metadata</h3><pre className="audit-json">{JSON.stringify(selected.metadata || {}, null, 2)}</pre></section></div>}
  </section>;
}
