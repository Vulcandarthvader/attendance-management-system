/**
 * API client.
 *
 * One place that knows the base URL, one place that attaches the token, one
 * place that turns a failed response into a useful Error. v1 called
 * `axios.post("http://localhost:5000/api/attendance", …)` from inside
 * components, so the host was hardcoded in three files and every call site
 * repeated its own `error.response?.data?.message ?? "Failed"` dance.
 */

const TOKEN_KEY = "attendance.token";

// Same-origin in the browser: Vite proxies /api in development, and a deployed
// build is served next to its API. VITE_API_URL overrides for a split deploy.
const BASE = import.meta.env?.VITE_API_URL ?? "";

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null; // private mode, or storage disabled
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* non-fatal: the session just will not survive a refresh */
  }
}

export class ApiError extends Error {
  constructor(message, { status, code, details } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details ?? [];
  }
}

async function request(path, { method = "GET", body, signal } = {}) {
  const token = getToken();
  let res;
  try {
    res = await fetch(`${BASE}/api${path}`, {
      method,
      signal,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (err.name === "AbortError") throw err;
    throw new ApiError("Cannot reach the server. Is the API running?", { code: "network" });
  }

  const payload = await res.json().catch(() => ({}));

  if (!res.ok) {
    // An expired token should return you to the login screen rather than
    // showing "unauthorized" on every panel of the dashboard.
    if (res.status === 401 && token) setToken(null);
    throw new ApiError(payload.message || `Request failed (${res.status})`, {
      status: res.status,
      code: payload.code,
      details: payload.details,
    });
  }
  return payload;
}

export const api = {
  health: () => request("/health"),

  login: (body) => request("/auth/login", { method: "POST", body }),
  register: (body) => request("/auth/register", { method: "POST", body }),
  me: () => request("/auth/me"),
  updateProfile: (body) => request("/auth/me", { method: "PATCH", body }),

  getSemester: () => request("/semester"),
  saveSemester: (body) => request("/semester", { method: "PUT", body }),

  listCourses: () => request("/courses"),
  createCourse: (body) => request("/courses", { method: "POST", body }),
  updateCourse: (id, body) => request(`/courses/${id}`, { method: "PATCH", body }),
  deleteCourse: (id) => request(`/courses/${id}`, { method: "DELETE" }),

  overview: () => request("/overview"),
  trend: () => request("/trend"),
  calendar: () => request("/calendar"),
  agenda: (date) => request(`/agenda/${date}`),

  mark: (body) => request("/attendance", { method: "POST", body }),
  markMany: (entries) => request("/attendance/bulk", { method: "POST", body: { entries } }),
  listAttendance: (params = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
    return request(`/attendance${q ? `?${q}` : ""}`);
  },
  deleteAttendance: (id) => request(`/attendance/${id}`, { method: "DELETE" }),
};
