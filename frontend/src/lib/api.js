import axios from "axios";

const api = axios.create({
  baseURL: `${process.env.REACT_APP_BACKEND_URL}/api`,
  withCredentials: true,
});

api.interceptors.response.use(
  (r) => r,
  async (err) => {
    const orig = err.config;
    if (
      err.response?.status === 401 &&
      !orig._retry &&
      !orig.url.includes("/auth/") &&
      !window.location.pathname.startsWith("/login")
    ) {
      orig._retry = true;
      try {
        await api.post("/auth/refresh");
        return api(orig);
      } catch {
        if (!["/login", "/forgot-password", "/reset-password"].some((p) => window.location.pathname.startsWith(p))) {
          window.location.href = "/login";
        }
      }
    }
    return Promise.reject(err);
  }
);

export const fmtErr = (e) => {
  const d = e.response?.data?.detail;
  if (!d) return "Something went wrong. Please try again.";
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x?.msg || "").filter(Boolean).join(" ");
  return String(d);
};

export const money = (n, currency = "UGX") =>
  `${currency} ${Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

export const fileUrl = (path) =>
  path ? `${process.env.REACT_APP_BACKEND_URL}/api/files/${path}` : null;

export default api;
