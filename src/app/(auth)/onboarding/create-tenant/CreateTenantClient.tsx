"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Loader2, LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { createTenantWithMasterAction } from "@/lib/actions/tenants";
import { AuthShell } from "@/components/auth/AuthShell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const LABELS = {
  title: "Crea tu organización",
  subtitle: (userName: string) =>
    `Bienvenido, ${userName}. Da un nombre a tu comunidad para empezar.`,
  nameLabel: "Nombre de la organización",
  namePlaceholder: "Ej. Residencial Los Olivos",
  submit: "Crear organización",
  submitting: "Creando…",
  errorFallback: "No se pudo crear la organización. Inténtalo de nuevo.",
  signOut: "Cerrar sesión",
  footer: "Sistema de Control de Acceso",
} as const;

export default function CreateTenantClient({ userName }: { userName: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await createTenantWithMasterAction({ name });

    if (!result.success) {
      const message =
        result.fieldErrors?.name?.[0] ?? result.error ?? LABELS.errorFallback;
      setError(message);
      setLoading(false);
      return;
    }

    // Force the layout to re-read the session so the new tenantId is picked up.
    router.refresh();
    router.push("/dashboard");
  }

  async function handleSignOut() {
    await authClient.signOut();
    router.push("/login");
  }

  return (
    <AuthShell footer={LABELS.footer}>
      <div className="mb-6 flex flex-col items-center gap-2">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-accent">
          <Building2 className="size-5.5 text-primary" />
        </div>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
          {LABELS.title}
        </h1>
        <p className="text-center text-sm text-muted-foreground">
          {LABELS.subtitle(userName)}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="org-name">{LABELS.nameLabel}</Label>
          <Input
            id="org-name"
            type="text"
            required
            maxLength={200}
            autoFocus
            value={name}
            onChange={(e) => { setName(e.target.value); setError(""); }}
            placeholder={LABELS.namePlaceholder}
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

      <button
        type="button"
        onClick={handleSignOut}
        className="mt-5 flex w-full items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <LogOut size={14} />
        {LABELS.signOut}
      </button>
    </AuthShell>
  );
}
