"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, ArrowLeft, Loader2, CheckCircle } from "lucide-react";
import { authClient } from "@/lib/auth-client";

const LABELS = {
  title: "Recuperar contraseña",
  subtitle: "Te enviaremos un enlace para restablecer tu contraseña.",
  emailLabel: "Correo electrónico",
  emailPlaceholder: "tu@correo.com",
  submit: "Enviar enlace",
  submitting: "Enviando…",
  backToLogin: "Volver al inicio de sesión",
  successTitle: "Correo enviado",
  successMessage: "Si existe una cuenta con ese correo, recibirás un enlace en los próximos minutos. Revisa tu carpeta de spam si no lo ves.",
  errorFallback: "Error al enviar el correo. Inténtalo de nuevo.",
  footer: "Sistema de Control de Acceso",
} as const;

export default function ForgotPasswordClient() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error } = await authClient.requestPasswordReset({
      email,
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setLoading(false);

    if (error) {
      setError(error.message ?? LABELS.errorFallback);
      return;
    }

    setSent(true);
  }

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden"
      style={{ background: "var(--color-page-bg)" }}
    >
      {/* Animated blobs */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute -top-40 -left-32 h-[580px] w-[580px] rounded-full opacity-30 blur-[90px]"
          style={{
            background: "radial-gradient(circle, #a5b4fc 0%, #818cf8 60%, transparent 100%)",
            animation: "drift1 22s linear infinite",
          }}
        />
        <div
          className="absolute top-1/2 -right-20 h-[420px] w-[420px] rounded-full opacity-25 blur-[80px]"
          style={{
            background: "radial-gradient(circle, #c7d2fe 0%, #a5b4fc 60%, transparent 100%)",
            animation: "drift2 28s linear infinite",
          }}
        />
      </div>

      {/* Card */}
      <div
        className="animate-fadein relative z-10 w-full max-w-sm"
        style={{ padding: "0 16px" }}
      >
        <div
          className="card"
          style={{
            padding: "40px 36px 32px",
            background: "rgba(255,255,255,0.85)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(79,91,255,0.12)",
            boxShadow: "0 20px 60px rgba(79,91,255,0.08), inset 0 1px 0 rgba(255,255,255,0.9)",
          }}
        >
          {sent ? (
            /* Success state */
            <div className="flex flex-col items-center gap-3 text-center">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-2xl"
                style={{ background: "#f0fdf4" }}
              >
                <CheckCircle size={22} style={{ color: "#16a34a" }} />
              </div>
              <h1
                className="text-xl font-bold tracking-tight"
                style={{ fontFamily: "var(--font-heading)", color: "var(--color-dark)" }}
              >
                {LABELS.successTitle}
              </h1>
              <p className="text-sm" style={{ color: "var(--color-muted)" }}>
                {LABELS.successMessage}
              </p>
              <Link
                href="/login"
                className="btn btn-secondary mt-2 w-full"
                style={{ fontSize: "14px" }}
              >
                {LABELS.backToLogin}
              </Link>
            </div>
          ) : (
            /* Form state */
            <>
              <div className="mb-6 flex flex-col items-center gap-2">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-2xl"
                  style={{ background: "var(--color-primary-light)" }}
                >
                  <Mail size={22} style={{ color: "var(--color-primary)" }} />
                </div>
                <h1
                  className="text-2xl font-bold tracking-tight"
                  style={{ fontFamily: "var(--font-heading)", color: "var(--color-dark)" }}
                >
                  {LABELS.title}
                </h1>
                <p className="text-center text-sm" style={{ color: "var(--color-muted)" }}>
                  {LABELS.subtitle}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="email"
                    className="text-sm font-medium"
                    style={{ color: "var(--color-dark)" }}
                  >
                    {LABELS.emailLabel}
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    autoFocus
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(""); }}
                    className="form-input"
                    placeholder={LABELS.emailPlaceholder}
                  />
                </div>

                {error && (
                  <p
                    className="rounded-lg px-3 py-2 text-sm font-medium"
                    style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" }}
                  >
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="btn btn-primary mt-1 w-full py-2.5"
                  style={{ fontSize: "14px" }}
                >
                  {loading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      {LABELS.submitting}
                    </>
                  ) : (
                    LABELS.submit
                  )}
                </button>
              </form>

              <Link
                href="/login"
                className="mt-5 flex items-center justify-center gap-1.5 text-sm"
                style={{ color: "var(--color-muted)" }}
              >
                <ArrowLeft size={14} />
                {LABELS.backToLogin}
              </Link>
            </>
          )}
        </div>

        <p
          className="mt-4 text-center text-xs"
          style={{ color: "var(--color-muted)" }}
        >
          {LABELS.footer}
        </p>
      </div>
    </div>
  );
}
