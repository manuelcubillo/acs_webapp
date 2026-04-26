"use client";

/**
 * InvitationAcceptClient — form to accept a tenant membership invitation.
 *
 * Two paths:
 * - existingAccount=true: single button to join the organization (no password needed
 *   from the form; server finds the user by email).
 * - existingAccount=false: full registration form (name, username, password).
 *
 * After successful acceptance, new users are signed in via authClient.
 * Existing users are redirected to /dashboard (or /login if not signed in).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Loader2, LogIn } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { acceptInvitationAction } from "@/lib/actions/invitations";
import type { MemberInvitation } from "@/lib/dal";

const LABELS = {
  title: "Aceptar invitación",
  subtitleNew: "Crea tu cuenta para unirte a la organización.",
  subtitleExisting: "Tu email ya tiene una cuenta de Veredillas. Haz clic para unirte a la organización.",
  emailLabel: "Email (confirmación)",
  nameLabel: "Nombre completo",
  namePlaceholder: "Tu nombre",
  usernameLabel: "Nombre de usuario",
  usernamePlaceholder: "sin espacios",
  passwordLabel: "Contraseña",
  passwordPlaceholder: "Mínimo 8 caracteres",
  showPass: "Mostrar contraseña",
  hidePass: "Ocultar contraseña",
  submitNew: "Crear cuenta y unirse",
  submittingNew: "Creando cuenta…",
  submitExisting: "Unirse a la organización",
  submittingExisting: "Uniéndose…",
  backToLogin: "¿Ya tienes cuenta? Inicia sesión",
  successNew: "Cuenta creada. Iniciando sesión…",
  successExisting: "¡Bienvenido! Redirigiendo…",
  errorFallback: "Error al aceptar la invitación.",
  roles: {
    operator: "Operador",
    admin: "Administrador",
    master: "Master",
  },
} as const;

interface Props {
  invitation: MemberInvitation;
  existingAccount: boolean;
  tenantName: string;
}

export default function InvitationAcceptClient({
  invitation,
  existingAccount,
  tenantName,
}: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const roleLabel = LABELS.roles[invitation.role as keyof typeof LABELS.roles] ?? invitation.role;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await acceptInvitationAction({
      token: invitation.token,
      name: existingAccount ? undefined : name,
      username: existingAccount ? undefined : username,
      password: existingAccount ? undefined : password,
    });

    if (!result.success) {
      setError(result.error ?? LABELS.errorFallback);
      setLoading(false);
      return;
    }

    const { userCreated } = result.data;

    if (userCreated) {
      setSuccess(LABELS.successNew);
      // Sign in the newly created user.
      const { error: signInError } = await authClient.signIn.username({
        username,
        password,
      });
      if (signInError) {
        setError("Cuenta creada, pero error al iniciar sesión automáticamente. Ve a la página de inicio de sesión.");
        setLoading(false);
        return;
      }
      router.push("/dashboard");
    } else {
      setSuccess(LABELS.successExisting);
      router.push("/dashboard");
    }
  }

  return (
    <div
      className="relative flex min-h-screen items-center justify-center"
      style={{ background: "var(--color-page-bg)", padding: "16px" }}
    >
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div
          className="card"
          style={{
            padding: "36px 32px 28px",
            background: "rgba(255,255,255,0.9)",
          }}
        >
          {/* Logo */}
          <div className="mb-5 flex flex-col items-center gap-2">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-2xl"
              style={{ background: "var(--color-primary-light)" }}
            >
              <LogIn size={22} style={{ color: "var(--color-primary)" }} />
            </div>
            <h1
              style={{
                fontSize: 20,
                fontWeight: 700,
                fontFamily: "var(--font-heading)",
                color: "var(--color-dark)",
                margin: "4px 0 0",
                textAlign: "center",
              }}
            >
              {LABELS.title}
            </h1>
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 13.5, color: "var(--color-secondary)", margin: 0 }}>
                {existingAccount ? LABELS.subtitleExisting : LABELS.subtitleNew}
              </p>
              <p style={{ fontSize: 13, color: "var(--color-muted)", margin: "4px 0 0" }}>
                Organización: <strong style={{ color: "var(--color-dark)" }}>{tenantName}</strong>
                {" · "}Rol: <strong style={{ color: "var(--color-dark)" }}>{roleLabel}</strong>
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Email (read-only) */}
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--color-dark)", marginBottom: 5 }}>
                {LABELS.emailLabel}
              </label>
              <input
                type="email"
                value={invitation.email}
                readOnly
                className="form-input"
                style={{ background: "#f9fafb", color: "var(--color-muted)", cursor: "default" }}
              />
            </div>

            {!existingAccount && (
              <>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--color-dark)", marginBottom: 5 }}>
                    {LABELS.nameLabel}
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="form-input"
                    placeholder={LABELS.namePlaceholder}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--color-dark)", marginBottom: 5 }}>
                    {LABELS.usernameLabel}
                  </label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="form-input"
                    placeholder={LABELS.usernamePlaceholder}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--color-dark)", marginBottom: 5 }}>
                    {LABELS.passwordLabel}
                  </label>
                  <div style={{ position: "relative" }}>
                    <input
                      type={showPass ? "text" : "password"}
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="form-input"
                      style={{ paddingRight: 40 }}
                      placeholder={LABELS.passwordPlaceholder}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass((v) => !v)}
                      style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--color-muted)", lineHeight: 0 }}
                      tabIndex={-1}
                      aria-label={showPass ? LABELS.hidePass : LABELS.showPass}
                    >
                      {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              </>
            )}

            {error && (
              <p style={{ margin: 0, padding: "10px 12px", background: "#fef2f2", color: "#dc2626", borderRadius: 8, fontSize: 13, border: "1px solid #fecaca" }}>
                {error}
              </p>
            )}
            {success && (
              <p style={{ margin: 0, padding: "10px 12px", background: "#f0fdf4", color: "#16a34a", borderRadius: 8, fontSize: 13, border: "1px solid #bbf7d0" }}>
                {success}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary w-full"
              style={{ fontSize: 14, padding: "11px" }}
            >
              {loading
                ? <><Loader2 size={16} className="animate-spin" />{existingAccount ? LABELS.submittingExisting : LABELS.submittingNew}</>
                : existingAccount ? LABELS.submitExisting : LABELS.submitNew
              }
            </button>
          </form>

          {existingAccount && (
            <p style={{ marginTop: 16, textAlign: "center", fontSize: 13, color: "var(--color-muted)" }}>
              <Link href="/login" style={{ color: "var(--color-primary)", fontWeight: 600 }}>
                {LABELS.backToLogin}
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
