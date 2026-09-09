import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api, { fmtErr } from "../lib/api";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords do not match.");
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, password });
      navigate("/login");
    } catch (err) {
      setError(fmtErr(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <p className="font-serif text-xl tracking-[0.22em] text-[#2B1B17] mb-8 text-center">PASTRY QUIN</p>
        <p className="pq-eyebrow mb-2">Account Recovery</p>
        <h1 className="font-serif text-3xl text-[#2B1B17] mb-6">Choose a new password</h1>
        {!token ? (
          <p className="text-sm text-[#9E2A2B]" data-testid="reset-no-token">This reset link is missing its token.</p>
        ) : (
          <form onSubmit={submit} className="space-y-5" data-testid="reset-form">
            <div>
              <label className="pq-label" htmlFor="reset-password">New password</label>
              <input id="reset-password" data-testid="reset-password-input" type="password" required value={password}
                onChange={(e) => setPassword(e.target.value)} className="pq-input" placeholder="At least 8 characters" />
            </div>
            <div>
              <label className="pq-label" htmlFor="reset-confirm">Confirm password</label>
              <input id="reset-confirm" data-testid="reset-confirm-input" type="password" required value={confirm}
                onChange={(e) => setConfirm(e.target.value)} className="pq-input" placeholder="Repeat password" />
            </div>
            {error && <p className="text-sm text-[#9E2A2B]" data-testid="reset-error">{error}</p>}
            <button type="submit" disabled={loading} className="pq-btn-primary w-full" data-testid="reset-submit-btn">
              {loading ? "Saving…" : "Set new password"}
            </button>
          </form>
        )}
        <p className="text-center mt-5">
          <Link to="/login" className="text-sm text-[#B76E60] hover:text-[#9E4A3B]" data-testid="reset-back-login">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
