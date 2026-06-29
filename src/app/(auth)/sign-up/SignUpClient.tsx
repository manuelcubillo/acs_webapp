"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, UserPlus, Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { AuthShell } from "@/components/auth/AuthShell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
    <AuthShell footer={LABELS.footer}>
      {/* Logo / Brand */}
      <div className="mb-6 flex flex-col items-center gap-2">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-accent">
          <UserPlus className="size-5.5 text-primary" />
        </div>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
          {LABELS.title}
        </h1>
        <p className="text-sm text-muted-foreground">{LABELS.subtitle}</p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Name */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">{LABELS.nameLabel}</Label>
          <Input
            id="name"
            type="text"
            required
            autoComplete="name"
            autoFocus
            value={name}
            onChange={(e) => { setName(e.target.value); setError(""); }}
            placeholder={LABELS.namePlaceholder}
          />
        </div>

        {/* Email */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">{LABELS.emailLabel}</Label>
          <Input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(""); }}
            placeholder={LABELS.emailPlaceholder}
          />
        </div>

        {/* Username */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="username">{LABELS.usernameLabel}</Label>
          <Input
            id="username"
            type="text"
            required
            autoComplete="username"
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
              minLength={8}
              autoComplete="new-password"
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

        {/* Submit */}
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

      <p className="mt-5 text-center text-sm text-muted-foreground">
        {LABELS.haveAccount}{" "}
        <Link href="/login" className="font-semibold text-primary hover:underline">
          {LABELS.signIn}
        </Link>
      </p>
    </AuthShell>
  );
}
