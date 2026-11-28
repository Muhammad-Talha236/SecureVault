import { Navigate, Route, Routes } from "react-router-dom";
import Shell from "./components/Shell.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import MyDocuments from "./pages/MyDocuments.jsx";
import AdminUsers from "./pages/AdminUsers.jsx";
import AdminDocuments from "./pages/AdminDocuments.jsx";
import Placeholder from "./pages/Placeholder.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import AuditLogs from "./pages/AuditLogs.jsx";
import SharedWithMe from "./pages/SharedWithMe.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";
import { ThemeProvider, useTheme } from "./context/ThemeContext.jsx";

function RootRedirect() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="auth-loading-screen">
        <div className="auth-spinner" />
        <p>Verifying secure session...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Navigate to={user.role === "ADMIN" ? "/admin" : "/user"} replace />;
}

function AppRoutes() {
  const { theme, toggleTheme } = useTheme();

  const userPlaceholders = [
    ["activity", "My Activity"],
  ];

  return (
    <Routes>
      {/* Public Authentication Routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* Protected Admin Workspace */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute requiredRole="ADMIN">
            <Shell audience="Admin" theme={theme} toggleTheme={toggleTheme} />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard audience="Admin" />} />
        {/* Talha's Completed Admin Modules */}
        <Route path="users" element={<AdminUsers />} />
        <Route path="documents" element={<AdminDocuments />} />

        {/* Laiba's Modules */}
        <Route path="audit-logs" element={<AuditLogs />} />
        <Route path="security-events" element={<Placeholder title="Security Events" />} />
      </Route>

      {/* Protected User Workspace */}
      <Route
        path="/user"
        element={
          <ProtectedRoute requiredRole="USER">
            <Shell audience="User" theme={theme} toggleTheme={toggleTheme} />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard audience="User" />} />
        <Route path="my-documents" element={<MyDocuments />} />
        <Route path="shared" element={<SharedWithMe />} />
        {userPlaceholders.map(([path, title]) => (
          <Route key={path} path={path} element={<Placeholder title={title} />} />
        ))}
      </Route>

      {/* Root & Catch-All */}
      <Route path="/" element={<RootRedirect />} />
      <Route path="*" element={<RootRedirect />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </ThemeProvider>
  );
}
