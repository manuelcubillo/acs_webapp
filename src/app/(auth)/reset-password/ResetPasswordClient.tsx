"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { KeyRound, Eye, EyeOff, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { authClient } from "@/lib/auth-client";

const LABELS = {
  title: "Nueva contraseña",
  subtitle: "Elige una contraseña segura para tu cuenta.",
  passwordLabel: "Nueva contraseña",
  passwordPlaceholder: "••••••••",
  confirmLabel: "Confirmar contraseña",
  confirmPlaceholder: "••••••••",
  showPassword: "Mostrar contraseña",
  hidePassword: "Ocultar contraseña",
  submit: "Restablecer contraseña",
  submitting: "Guardando…",
  successTitle: "Contraseña actualizada",
  successMessage: "Tu contraseña ha sido restablecida correctamente.",
  goToLogin: "Ir al inicio de sesión",
  invalidToken: "El enlace es inválido o ha expirado. Solicita uno nuevo.",
  requestNew: "Solicitar nuevo enlace",
  mismatch: "Las contraseñas no coinciden.",
  errorFallback: "Error al restablecer la contraseña. Inténtalo de nuevo.",
  footer: "Sistema de Control de Acceso",
} as const;

export default function ResetPasswordClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  if (!token) {
    return (
      <InvalidTokenCard message={LABELS.invalidToken} linkLabel={LABELS.requestNew} />
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError(LABELS.mismatch);
      return;
    }

    setLoading(true);

    const { error } = await authClient.resetPassword({ newPassword: password, token: token! });

    setLoading(false);

    if (error) {
      setError(error.message ?? LABELS.errorFallback);
      return;
    }

    setDone(true);
    setTimeout(() => router.push("/login"), 3000);
  }

  return (
    <AuthShell>
      {done ? (
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
          <Link href="/login" className="btn btn-primary mt-2 w-full" style={{ fontSize: "14px" }}>
            {LABELS.goToLogin}
          </Link>
        </div>
      ) : (
        <>
          <div className="mb-6 flex flex-col items-center gap-2">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-2xl"
              style={{ background: "var(--color-primary-light)" }}
            >
              <KeyRound size={22} style={{ color: "var(--color-primary)" }} />
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
            {/* New password */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="password"
                className="text-sm font-medium"
                style={{ color: "var(--color-dark)" }}
              >
                {LABELS.passwordLabel}
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPass ? "text" : "password"}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  autoFocus
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(""); }}
                  className="form-input"
                  style={{ paddingRight: "40px" }}
                  placeholder={LABELS.passwordPlaceholder}
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: "var(--color-muted)", lineHeight: 0 }}
                  tabIndex={-1}
                  aria-label={showPass ? LABELS.hidePassword : LABELS.showPassword}
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Confirm password */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="confirm"
                className="text-sm font-medium"
                style={{ color: "var(--color-dark)" }}
              >
                {LABELS.confirmLabel}
              </label>
              <input
                id="confirm"
                type={showPass ? "text" : "password"}
                required
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => { setConfirm(e.target.value); setError(""); }}
                className="form-input"
                placeholder={LABELS.confirmPlaceholder}
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
        </>
      )}
    </AuthShell>
  );
}

function InvalidTokenCard({ message, linkLabel }: { message: string; linkLabel: string }) {
  return (
    <AuthShell>
      <div className="flex flex-col items-center gap-3 text-center">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-2xl"
          style={{ background: "#fef2f2" }}
        >
          <AlertCircle size={22} style={{ color: "#dc2626" }} />
        </div>
        <p className="text-sm" style={{ color: "var(--color-muted)" }}>
          {message}
        </p>
        <Link
          href="/forgot-password"
          className="btn btn-secondary mt-2 w-full"
          style={{ fontSize: "14px" }}
        >
          {linkLabel}
        </Link>
      </div>
    </AuthShell>
  );
}

function AuthShell({ children }: { children: React.ReactNode }) {
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
          {children}
        </div>

        <p
          className="mt-4 text-center text-xs"
          style={{ color: "var(--color-muted)" }}
        >
          Sistema de Control de Acceso
        </p>
      </div>
    </div>
  );
}
