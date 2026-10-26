// Login and Register on one page (a toggle switches between them)

import { useState } from "react";
import { api } from "../api";

export default function Login({ onLogin }) {
  const [isRegister, setIsRegister] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    try {
      const path = isRegister ? "/auth/register" : "/auth/login";
      const data = await api(path, { method: "POST", body: form });
      localStorage.setItem("token", data.token); // remember the login
      onLogin(data.user);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="login-box card">
      <h1>{isRegister ? "Create account" : "Log in"}</h1>
      <p className="muted">Track attendance and see how many classes you can skip.</p>

      <form onSubmit={handleSubmit}>
        {isRegister && (
          <input name="name" placeholder="Name" value={form.name} onChange={handleChange} required />
        )}
        <input name="email" type="email" placeholder="Email" value={form.email} onChange={handleChange} required />
        <input name="password" type="password" placeholder="Password (min 6 characters)" value={form.password} onChange={handleChange} required />
        {error && <p className="error">{error}</p>}
        <button type="submit">{isRegister ? "Register" : "Log in"}</button>
      </form>

      <p className="muted">
        {isRegister ? "Already have an account? " : "New here? "}
        <button className="link" onClick={() => { setIsRegister(!isRegister); setError(""); }}>
          {isRegister ? "Log in" : "Create an account"}
        </button>
      </p>
    </div>
  );
}
