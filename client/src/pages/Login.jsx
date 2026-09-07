import { useState } from "react";
import { useAuth } from "../lib/auth.jsx";
import Banner from "../components/Banner.jsx";

export default function Login() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState("signin");
  const [form, setForm] = useState({ username: "", password: "", displayName: "", rollNumber: "" });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "signin") await signIn({ username: form.username, password: form.password });
      else await signUp(form);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function useDemo() {
    setBusy(true);
    setError(null);
    try {
      await signIn({ username: "demo", password: "demo1234" });
    } catch {
      setError("The demo account is not available. Start the server with no MONGO_URI set, or create an account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center-screen">
      <div className="auth-card stack">
        <div className="row" style={{ gap: 10 }}>
          <span className="brand-mark">AT</span>
          <div>
            <h1 style={{ fontSize: "1.3rem" }}>Attendance</h1>
            <p className="dim">Know exactly how many classes you can afford to miss.</p>
          </div>
        </div>

        <form className="card" onSubmit={submit}>
          <h2 style={{ marginBottom: 14 }}>{mode === "signin" ? "Sign in" : "Create an account"}</h2>

          <div className="field">
            <label htmlFor="username">Username</label>
            <input id="username" type="text" autoComplete="username" required
                   value={form.username} onChange={set("username")} />
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" type="password" required
                   autoComplete={mode === "signin" ? "current-password" : "new-password"}
                   value={form.password} onChange={set("password")} />
            {mode === "signup" && <p className="dim">At least 8 characters.</p>}
          </div>

          {mode === "signup" && (
            <div className="field-row">
              <div className="field">
                <label htmlFor="displayName">Name</label>
                <input id="displayName" type="text" value={form.displayName} onChange={set("displayName")} />
              </div>
              <div className="field">
                <label htmlFor="rollNumber">Roll number</label>
                <input id="rollNumber" type="text" value={form.rollNumber} onChange={set("rollNumber")} />
              </div>
            </div>
          )}

          {error && <Banner kind="error" onDismiss={() => setError(null)}>{error}</Banner>}

          <button className="primary" type="submit" disabled={busy} style={{ width: "100%", marginTop: 12 }}>
            {busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>

          <div className="row spread" style={{ marginTop: 14 }}>
            <button type="button" className="ghost sm"
                    onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); }}>
              {mode === "signin" ? "Create an account" : "I already have an account"}
            </button>
            <button type="button" className="ghost sm" onClick={useDemo} disabled={busy}>
              Try the demo
            </button>
          </div>
        </form>

        <p className="dim" style={{ textAlign: "center" }}>
          The demo account is seeded with a semester in progress, so every screen has real data in it.
        </p>
      </div>
    </div>
  );
}
