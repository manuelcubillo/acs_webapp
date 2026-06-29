"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { KeyRound, Eye, EyeOff, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { AuthShell } from "@/components/auth/AuthShell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
    <AuthShell footer={LABELS.footer}>
      {done ? (
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-accent">
            <CheckCircle className="size-5.5 text-primary" />
          </div>
          <h1 className="font-heading text-xl font-bold tracking-tight text-foreground">
            {LABELS.successTitle}
          </h1>
          <p className="text-sm text-muted-foreground">{LABELS.successMessage}</p>
          <Button asChild className="mt-2 w-full">
            <Link href="/login">{LABELS.goToLogin}</Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="mb-6 flex flex-col items-center gap-2">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-accent">
              <KeyRound className="size-5.5 text-primary" />
            </div>
            <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
              {LABELS.title}
            </h1>
            <p className="text-center text-sm text-muted-foreground">
              {LABELS.subtitle}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* New password */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">{LABELS.passwordLabel}</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPass ? "text" : "password"}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  autoFocus
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(""); }}
                  className="pr-10"
                  placeholder={LABELS.passwordPlaceholder}
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground"
                  tabIndex={-1}
                  aria-label={showPass ? LABELS.hidePassword : LABELS.showPassword}
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Confirm password */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirm">{LABELS.confirmLabel}</Label>
              <Input
                id="confirm"
                type={showPass ? "text" : "password"}
                required
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => { setConfirm(e.target.value); setError(""); }}
                placeholder={LABELS.confirmPlaceholder}
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" disabled={loading} className="mt-1 w-full">
              {loading ? (
                <>
                  <Loader2 className="animate-spin" />
                  {LABELS.submitting}
                </>
              ) : (
                LABELS.submit
              )}
            </Button>
          </form>
        </>
      )}
    </AuthShell>
  );
}

function InvalidTokenCard({ message, linkLabel }: { message: string; linkLabel: string }) {
  return (
    <AuthShell footer={LABELS.footer}>
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex size-12 items-center justify-center rounded-2xl border border-destructive/30 bg-destructive/10">
          <AlertCircle className="size-5.5 text-destructive" />
        </div>
        <p className="text-sm text-muted-foreground">{message}</p>
        <Button asChild variant="secondary" className="mt-2 w-full">
          <Link href="/forgot-password">{linkLabel}</Link>
        </Button>
      </div>
    </AuthShell>
  );
}
