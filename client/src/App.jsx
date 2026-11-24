import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Shell from "./components/Shell.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Placeholder from "./pages/Placeholder.jsx";

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem("securevault-theme") || "light");
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("securevault-theme", theme);
  }, [theme]);
  const toggleTheme = () => setTheme(t => t === "light" ? "dark" : "light");
  const admin = [
    ["users", "User Management"], ["roles", "Roles & Permissions"],
    ["documents", "Document Records"], ["audit-logs", "Audit Logs"],
    ["security-events", "Security Events"]
  ];
  const user = [["my-documents", "My Documents"], ["shared", "Shared With Me"], ["activity", "My Activity"]];
  return <Routes>
    <Route path="/admin" element={<Shell audience="Admin" theme={theme} toggleTheme={toggleTheme} />}>
      <Route index element={<Dashboard audience="Admin" />} />
      {admin.map(([path, title]) => <Route key={path} path={path} element={<Placeholder title={title} />} />)}
    </Route>
    <Route path="/user" element={<Shell audience="User" theme={theme} toggleTheme={toggleTheme} />}>
      <Route index element={<Dashboard audience="User" />} />
      {user.map(([path, title]) => <Route key={path} path={path} element={<Placeholder title={title} />} />)}
    </Route>
    <Route path="/" element={<Navigate to="/admin" replace />} />
    <Route path="*" element={<Navigate to="/admin" replace />} />
  </Routes>;
}
