import { Construction } from "lucide-react";
export default function Placeholder({ title }) {
  return <section className="card placeholder"><Construction size={28}/><p className="eyebrow">MODULE PLACEHOLDER</p><h1>{title}</h1><p className="muted">This section is reserved for a future implementation.</p><span className="pill">Planned — not implemented</span></section>;
}
