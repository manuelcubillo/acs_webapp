"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, UserPlus, Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";

const LABELS = {
  title: "Crear cuenta",
  subtitle: "Empieza creando tu organización",
  nameLabel: "Nombre completo",
  namePlaceholder: "Tu nombre",
  emailLabel: "Correo electrónico",
  emailPlaceholder: "tu@correo.com",
  usernameLabel: "Usuario",
  usernamePlaceholder: "nombre de usuario",
  passwordLabel: "Contraseña",
  passwordPlaceholder: "mínimo 8 caracteres",
  showPassword: "Mostrar contraseña",
  hidePassword: "Ocultar contraseña",
  submit: "Crear cuenta",
  submitting: "Creando…",
  errorFallback: "Error al crear la cuenta",
  haveAccount: "¿Ya tienes cuenta?",
  signIn: "Inicia sesión",
  footer: "Sistema de Control de Acceso",
} as const;

export default function SignUpClient() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error } = await authClient.signUp.email({
      name,
      email,
      username,
      password,
    });

    if (error) {
      setError(error.message ?? LABELS.errorFallback);
      setLoading(false);
      return;
    }

    router.push("/onboarding/create-tenant");
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
        <div
          className="absolute -bottom-24 left-1/3 h-[340px] w-[340px] rounded-full opacity-20 blur-[70px]"
          style={{
            background: "radial-gradient(circle, #bfdbfe 0%, transparent 80%)",
            animation: "drift1 18s linear infinite reverse",
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
          {/* Logo / Brand */}
          <div className="mb-6 flex flex-col items-center gap-2">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-2xl"
              style={{ background: "var(--color-primary-light)" }}
            >
              <UserPlus size={22} style={{ color: "var(--color-primary)" }} />
            </div>
            <h1
              className="text-2xl font-bold tracking-tight"
              style={{
                fontFamily: "var(--font-heading)",
                color: "var(--color-dark)",
              }}
            >
              {LABELS.title}
            </h1>
            <p className="text-sm" style={{ color: "var(--color-muted)" }}>
              {LABELS.subtitle}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Name */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="name"
                className="text-sm font-medium"
                style={{ color: "var(--color-dark)" }}
              >
                {LABELS.nameLabel}
              </label>
              <input
                id="name"
                type="text"
                required
                autoComplete="name"
                autoFocus
                value={name}
                onChange={(e) => { setName(e.target.value); setError(""); }}
                className="form-input"
                placeholder={LABELS.namePlaceholder}
              />
            </div>

            {/* Email */}
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
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(""); }}
                className="form-input"
                placeholder={LABELS.emailPlaceholder}
              />
            </div>

            {/* Username */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="username"
                className="text-sm font-medium"
                style={{ color: "var(--color-dark)" }}
              >
                {LABELS.usernameLabel}
              </label>
              <input
                id="username"
                type="text"
                required
                autoComplete="username"
                value={username}
                onChange={(e) => { setUsername(e.target.value); setError(""); }}
                className="form-input"
                placeholder={LABELS.usernamePlaceholder}
              />
            </div>

            {/* Password */}
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

            {/* Error */}
            {error && (
              <p
                className="rounded-lg px-3 py-2 text-sm font-medium"
                style={{
                  background: "#fef2f2",
                  color: "#dc2626",
                  border: "1px solid #fecaca",
                }}
              >
                {error}
              </p>
            )}

            {/* Submit */}
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

          <p
            className="mt-5 text-center text-sm"
            style={{ color: "var(--color-muted)" }}
          >
            {LABELS.haveAccount}{" "}
            <Link
              href="/login"
              style={{ color: "var(--color-primary)", fontWeight: 600 }}
            >
              {LABELS.signIn}
            </Link>
          </p>
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
