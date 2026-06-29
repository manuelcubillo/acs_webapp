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
import { AuthShell } from "@/components/auth/AuthShell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const LABELS = {
  title: "Aceptar invitación",
  subtitleNew: "Crea tu cuenta para unirte a la organización.",
  subtitleExisting: "Tu email ya tiene una cuenta de ${tenantName}. Haz clic para unirte a la organización.",
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
    <AuthShell maxWidthClassName="max-w-md">
      {/* Logo */}
      <div className="mb-5 flex flex-col items-center gap-2">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-accent">
          <LogIn className="size-5.5 text-primary" />
        </div>
        <h1 className="mt-1 text-center font-heading text-xl font-bold text-foreground">
          {LABELS.title}
        </h1>
        <div className="text-center">
          <p className="text-sm text-muted-foreground">
            {existingAccount ? LABELS.subtitleExisting : LABELS.subtitleNew}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Organización: <strong className="text-foreground">{tenantName}</strong>
            {" · "}Rol: <strong className="text-foreground">{roleLabel}</strong>
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
        {/* Email (read-only) */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="inv-email">{LABELS.emailLabel}</Label>
          <Input
            id="inv-email"
            type="email"
            value={invitation.email}
            readOnly
            className="cursor-default bg-muted text-muted-foreground"
          />
        </div>

        {!existingAccount && (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="inv-name">{LABELS.nameLabel}</Label>
              <Input
                id="inv-name"
                type="text"
                required
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={LABELS.namePlaceholder}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="inv-username">{LABELS.usernameLabel}</Label>
              <Input
                id="inv-username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={LABELS.usernamePlaceholder}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="inv-password">{LABELS.passwordLabel}</Label>
              <div className="relative">
                <Input
                  id="inv-password"
                  type={showPass ? "text" : "password"}
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10"
                  placeholder={LABELS.passwordPlaceholder}
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground"
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
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {success && (
          <Alert>
            <AlertDescription className="text-card-foreground">{success}</AlertDescription>
          </Alert>
        )}

        <Button type="submit" disabled={loading} className="w-full">
          {loading
            ? <><Loader2 className="animate-spin" />{existingAccount ? LABELS.submittingExisting : LABELS.submittingNew}</>
            : existingAccount ? LABELS.submitExisting : LABELS.submitNew
          }
        </Button>
      </form>

      {existingAccount && (
        <p className="mt-4 text-center text-sm text-muted-foreground">
          <Link href="/login" className="font-semibold text-primary hover:underline">
            {LABELS.backToLogin}
          </Link>
        </p>
      )}
    </AuthShell>
  );
}
