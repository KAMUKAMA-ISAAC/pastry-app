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
      const { data } = await api.post("/auth/login", {
        email,
        password,
      });

      setUser(data);
      navigate("/");
    } catch (err) {
      setError(fmtErr(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-[#FAF7F3]">

      {/* =========================================================
          DESKTOP BRANDING PANEL
      ========================================================= */}
      <div className="hidden lg:flex relative overflow-hidden bg-[#2B1917] text-[#FAF7F3]">

        {/* Decorative circles */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          <div className="w-[520px] h-[520px] rounded-full border border-[#D8A49B]/10" />
          <div className="absolute top-10 left-10 w-[440px] h-[440px] rounded-full border border-[#D8A49B]/10" />
          <div className="absolute top-20 left-20 w-[360px] h-[360px] rounded-full border border-[#D8A49B]/10" />
        </div>

        {/* Top branding */}
        <div className="absolute top-0 left-0 right-0 p-12 z-10">
          <p className="font-serif text-2xl tracking-[0.25em]">
            PASTRY QUIN
          </p>

          <div className="flex items-center gap-3 mt-3">
            <div className="h-px w-8 bg-[#D8A49B]" />

            <p className="text-[10px] font-semibold tracking-[0.35em] uppercase text-[#D8A49B]">
              Taste Royalty
            </p>
          </div>
        </div>

        {/* Center logo */}
        <div className="absolute inset-0 flex items-center justify-center">

          <div className="relative flex items-center justify-center">

            {/* Outer decorative ring */}
            <div className="absolute w-[390px] h-[390px] rounded-full border border-[#D8A49B]/20" />

            {/* Inner decorative ring */}
            <div className="absolute w-[320px] h-[320px] rounded-full border border-[#D8A49B]/15" />

            {/* Logo */}
            <div className="relative z-10 w-64 h-64 flex items-center justify-center">
              <img
                src="/pq-icon-512.png"
                alt="PASTRY QUIN"
                className="w-full h-full object-contain drop-shadow-2xl"
              />
            </div>

          </div>
        </div>

      </div>

      {/* =========================================================
          LOGIN FORM
      ========================================================= */}
      <div className="flex items-center justify-center px-6 py-12 sm:px-12">

        <div className="w-full max-w-[400px]">

          {/* Mobile branding */}
          <div className="lg:hidden text-center mb-10">

            <div className="mx-auto w-32 h-32 flex items-center justify-center">
              <img
                src="/pq-icon-192.png"
                alt="PASTRY QUIN"
                className="w-full h-full object-contain"
              />
            </div>

            <p className="font-serif text-xl tracking-[0.22em] text-[#2B1917] mt-4">
              PASTRY QUIN
            </p>

            <p className="text-[9px] font-semibold tracking-[0.3em] uppercase text-[#B76E60] mt-2">
              Taste Royalty
            </p>

          </div>

          {/* Form heading */}
          <div className="mb-9">

            <p className="text-[10px] font-semibold tracking-[0.3em] uppercase text-[#B76E60] mb-3">
              Studio Administration
            </p>

            <h1 className="font-serif text-[38px] leading-tight text-[#2B1917]">
              Welcome back
            </h1>

          </div>

          {/* Login form */}
          <form
            onSubmit={submit}
            className="space-y-6"
            data-testid="login-form"
          >

            {/* Email */}
            <div>
              <label
                className="block text-[11px] font-semibold tracking-[0.16em] uppercase text-[#5D4A43] mb-2"
                htmlFor="login-email"
              >
                Email address
              </label>

              <input
                id="login-email"
                data-testid="login-email-input"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-13 px-4 rounded-xl border border-[#E3D6CE] bg-white text-[#2B1917] placeholder-[#B5A59E] outline-none transition-all duration-200 focus:border-[#B76E60] focus:ring-4 focus:ring-[#B76E60]/10"
                placeholder="you@pastryquin.com"
              />
            </div>

            {/* Password */}
            <div>
              <label
                className="block text-[11px] font-semibold tracking-[0.16em] uppercase text-[#5D4A43] mb-2"
                htmlFor="login-password"
              >
                Password
              </label>

              <input
                id="login-password"
                data-testid="login-password-input"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-13 px-4 rounded-xl border border-[#E3D6CE] bg-white text-[#2B1917] placeholder-[#B5A59E] outline-none transition-all duration-200 focus:border-[#B76E60] focus:ring-4 focus:ring-[#B76E60]/10"
                placeholder="••••••••"
              />
            </div>

            {/* Error */}
            {error && (
              <p
                className="text-sm text-[#9E2A2B] bg-[#FDF0F0] border border-[#F5CDCD] rounded-xl px-4 py-3"
                data-testid="login-error"
              >
                {error}
              </p>
            )}

            {/* Submit button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-13 rounded-xl bg-[#2B1917] text-[#FAF7F3] text-sm font-semibold tracking-wide transition-all duration-200 hover:bg-[#3A2420] hover:shadow-lg hover:shadow-[#2B1917]/15 disabled:opacity-60 disabled:cursor-not-allowed"
              data-testid="login-submit-btn"
            >
              {loading ? "Signing in…" : "Sign in to the studio"}
            </button>

          </form>

          {/* Forgot password */}
          <div className="text-center mt-6">
            <Link
              to="/forgot-password"
              className="text-sm text-[#B76E60] hover:text-[#9E4A3B] transition-colors"
              data-testid="forgot-password-link"
            >
              Forgot your password?
            </Link>
          </div>

        </div>
      </div>
    </div>
  );
}
