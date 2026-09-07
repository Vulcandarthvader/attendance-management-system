import { NavLink, Navigate, Route, Routes } from "react-router-dom";

import Dashboard from "./pages/Dashboard.jsx";
import History from "./pages/History.jsx";
import Login from "./pages/Login.jsx";
import Mark from "./pages/Mark.jsx";
import Settings from "./pages/Settings.jsx";
import { useAuth } from "./lib/auth.jsx";

export default function App() {
  const { user, loading, signOut } = useAuth();

  if (loading) {
    return (
      <div className="center-screen">
        <div className="skeleton" style={{ width: 200, height: 16 }} />
        <span className="visually-hidden">Loading</span>
      </div>
    );
  }

  if (!user) return <Login />;

  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">
          <span className="brand-mark">AT</span>
          Attendance
        </span>
        <nav className="nav">
          <NavLink to="/" end>Dashboard</NavLink>
          <NavLink to="/mark">Mark</NavLink>
          <NavLink to="/history">History</NavLink>
          <NavLink to="/settings">Settings</NavLink>
        </nav>
        <div className="row" style={{ gap: 10 }}>
          <span className="dim">{user.displayName || user.username}</span>
          <button className="ghost sm" onClick={signOut}>Sign out</button>
        </div>
      </header>

      <main className="page">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/mark" element={<Mark />} />
          <Route path="/history" element={<History />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
