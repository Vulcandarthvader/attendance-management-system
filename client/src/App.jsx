// Decides what to show:
//  - not logged in  -> Login page
//  - logged in      -> header + Dashboard ("/") or Course page ("/course/:id")

import { useEffect, useState } from "react";
import { Routes, Route, Link, Navigate } from "react-router-dom";
import { api } from "./api";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import CourseDetail from "./pages/CourseDetail.jsx";

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // When the page loads, if we have a saved token, ask the server who we are
  useEffect(() => {
    if (!localStorage.getItem("token")) {
      setLoading(false);
      return;
    }
    api("/auth/me")
      .then((data) => setUser(data.user))
      .catch(() => localStorage.removeItem("token"))
      .finally(() => setLoading(false));
  }, []);

  function logout() {
    localStorage.removeItem("token");
    setUser(null);
  }

  if (loading) return <p className="center">Loading...</p>;
  if (!user) return <Login onLogin={setUser} />;

  return (
    <div className="container">
      <header className="header">
        <Link to="/" className="brand">Attendance Tracker</Link>
        <div>
          <span className="muted">Hi, {user.name}</span>
          <button className="secondary" onClick={logout}>Log out</button>
        </div>
      </header>

      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/course/:id" element={<CourseDetail />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </div>
  );
}
