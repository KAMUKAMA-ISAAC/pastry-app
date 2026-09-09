import { useState } from "react";
import { Link } from "react-router-dom";
import api, { fmtErr } from "../lib/api";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { email });
      setDone(true);
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
        <h1 className="font-serif text-3xl text-[#2B1B17] mb-6">Reset your password</h1>
        {done ? (
          <div className="pq-card p-5" data-testid="forgot-success">
            <p className="text-sm text-[#4A3B32] leading-relaxed">
              If that email is registered, a reset link has been sent. Please check your inbox — the link expires in one hour.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-5" data-testid="forgot-form">
            <div>
              <label className="pq-label" htmlFor="forgot-email">Email address</label>
              <input id="forgot-email" data-testid="forgot-email-input" type="email" required value={email}
                onChange={(e) => setEmail(e.target.value)} className="pq-input" placeholder="you@pastryquin.com" />
            </div>
            {error && <p className="text-sm text-[#9E2A2B]" data-testid="forgot-error">{error}</p>}
            <button type="submit" disabled={loading} className="pq-btn-primary w-full" data-testid="forgot-submit-btn">
              {loading ? "Sending…" : "Send reset link"}
            </button>
          </form>
        )}
        <p className="text-center mt-5">
          <Link to="/login" className="text-sm text-[#B76E60] hover:text-[#9E4A3B]" data-testid="back-to-login-link">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
