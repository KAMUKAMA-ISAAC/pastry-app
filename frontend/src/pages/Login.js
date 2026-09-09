import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api, { fmtErr } from "../lib/api";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { email, password });
      setUser(data);
      navigate("/");
    } catch (err) {
      setError(fmtErr(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-[#FAF8F5]">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-[#2B1B17] text-[#FAF8F5] relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.14]">
          <img
            src="https://images.unsplash.com/photo-1519654793190-2e8a4806f1f2?crop=entropy&cs=srgb&fm=jpg&q=85"
            alt="PASTRY QUIN signature tiered cake"
            className="w-full h-full object-cover"
          />
        </div>
        <div className="relative">
          <p className="font-serif text-2xl tracking-[0.22em]" data-testid="login-wordmark">PASTRY QUIN</p>
          <p className="text-[10px] font-semibold tracking-[0.32em] uppercase text-[#D8A49B] mt-2">Atelier &amp; Haute Pâtisserie</p>
        </div>
        <div className="relative max-w-md">
          <p className="font-serif text-4xl leading-snug font-normal">
            Every cake, every client, every payment — beautifully in place.
          </p>
          <p className="text-sm text-[#CBB8AE] mt-5 leading-relaxed">
            The private administration studio of PASTRY QUIN. Orders, designs, payments, reminders and reports in one elegant system.
          </p>
        </div>
        <p className="relative text-[10px] tracking-[0.25em] uppercase text-[#8C6D62]">Internal use only</p>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <p className="lg:hidden font-serif text-xl tracking-[0.22em] text-[#2B1B17] mb-8 text-center">PASTRY QUIN</p>
          <p className="pq-eyebrow mb-2">Studio Administration</p>
          <h1 className="font-serif text-3xl text-[#2B1B17] mb-8">Welcome back</h1>
          <form onSubmit={submit} className="space-y-5" data-testid="login-form">
            <div>
              <label className="pq-label" htmlFor="login-email">Email address</label>
              <input id="login-email" data-testid="login-email-input" type="email" required value={email}
                onChange={(e) => setEmail(e.target.value)} className="pq-input" placeholder="you@pastryquin.com" />
            </div>
            <div>
              <label className="pq-label" htmlFor="login-password">Password</label>
              <input id="login-password" data-testid="login-password-input" type="password" required value={password}
                onChange={(e) => setPassword(e.target.value)} className="pq-input" placeholder="••••••••" />
            </div>
            {error && <p className="text-sm text-[#9E2A2B] bg-[#FDF0F0] border border-[#F5CDCD] rounded-lg px-3.5 py-2.5" data-testid="login-error">{error}</p>}
            <button type="submit" disabled={loading} className="pq-btn-primary w-full" data-testid="login-submit-btn">
              {loading ? "Signing in…" : "Sign in to the studio"}
            </button>
          </form>
          <p className="text-center mt-5">
            <Link to="/forgot-password" className="text-sm text-[#B76E60] hover:text-[#9E4A3B] transition-colors" data-testid="forgot-password-link">
              Forgot your password?
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
