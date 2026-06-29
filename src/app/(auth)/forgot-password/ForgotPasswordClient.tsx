"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, ArrowLeft, Loader2, CheckCircle } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { AuthShell } from "@/components/auth/AuthShell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
    <AuthShell footer={LABELS.footer}>
      {sent ? (
        /* Success state — neutral confirmation (not an access-control outcome). */
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-accent">
            <CheckCircle className="size-5.5 text-primary" />
          </div>
          <h1 className="font-heading text-xl font-bold tracking-tight text-foreground">
            {LABELS.successTitle}
          </h1>
          <p className="text-sm text-muted-foreground">{LABELS.successMessage}</p>
          <Button asChild variant="secondary" className="mt-2 w-full">
            <Link href="/login">{LABELS.backToLogin}</Link>
          </Button>
        </div>
      ) : (
        /* Form state */
        <>
          <div className="mb-6 flex flex-col items-center gap-2">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-accent">
              <Mail className="size-5.5 text-primary" />
            </div>
            <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
              {LABELS.title}
            </h1>
            <p className="text-center text-sm text-muted-foreground">
              {LABELS.subtitle}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">{LABELS.emailLabel}</Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(""); }}
                placeholder={LABELS.emailPlaceholder}
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

          <Link
            href="/login"
            className="mt-5 flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={14} />
            {LABELS.backToLogin}
          </Link>
        </>
      )}
    </AuthShell>
  );
}
