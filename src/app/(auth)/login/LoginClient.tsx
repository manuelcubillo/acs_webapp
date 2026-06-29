"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, LogIn, Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { checkOwnMembershipStatusAction } from "@/lib/actions/members";
import { AuthShell } from "@/components/auth/AuthShell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const LABELS = {
  title: "Bienvenido",
  subtitle: "Inicia sesión para continuar",
  usernameLabel: "Usuario",
  usernamePlaceholder: "nombre de usuario",
  passwordLabel: "Contraseña",
  passwordPlaceholder: "••••••••",
  showPassword: "Mostrar contraseña",
  hidePassword: "Ocultar contraseña",
  submit: "Iniciar sesión",
  submitting: "Entrando…",
  errorFallback: "Error al iniciar sesión",
  forgotPassword: "¿Olvidaste tu contraseña?",
  noAccount: "¿No tienes cuenta?",
  signUp: "Crear una",
  footer: "Sistema de Control de Acceso",
} as const;

export default function LoginClient() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error } = await authClient.signIn.username({ username, password });

    if (error) {
      setError(error.message ?? LABELS.errorFallback);
      setLoading(false);
      return;
    }

    // Check membership status immediately — bounce deactivated/removed members
    // before they reach the dashboard layout.
    const statusResult = await checkOwnMembershipStatusAction();
    if (statusResult.success && statusResult.data.status === "deactivated") {
      router.push("/account-deactivated");
      return;
    }

    router.push("/dashboard");
  }

  return (
    <AuthShell footer={LABELS.footer}>
      {/* Logo / Brand */}
      <div className="mb-6 flex flex-col items-center gap-2">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-accent">
          <LogIn className="size-5.5 text-primary" />
        </div>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
          {LABELS.title}
        </h1>
        <p className="text-sm text-muted-foreground">{LABELS.subtitle}</p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Username */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="username">{LABELS.usernameLabel}</Label>
          <Input
            id="username"
            type="text"
            required
            autoComplete="username"
            autoFocus
            value={username}
            onChange={(e) => { setUsername(e.target.value); setError(""); }}
            placeholder={LABELS.usernamePlaceholder}
          />
        </div>

        {/* Password */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">{LABELS.passwordLabel}</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPass ? "text" : "password"}
              required
              autoComplete="current-password"
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

        {/* Error */}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Forgot password */}
        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-xs text-primary hover:underline">
            {LABELS.forgotPassword}
          </Link>
        </div>

        {/* Submit */}
        <Button type="submit" disabled={loading} className="w-full">
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

      <p className="mt-5 text-center text-sm text-muted-foreground">
        {LABELS.noAccount}{" "}
        <Link href="/sign-up" className="font-semibold text-primary hover:underline">
          {LABELS.signUp}
        </Link>
      </p>
    </AuthShell>
  );
}
