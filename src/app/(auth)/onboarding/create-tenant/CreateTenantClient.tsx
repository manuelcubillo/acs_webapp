"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Loader2, LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { createTenantWithMasterAction } from "@/lib/actions/tenants";

const LABELS = {
  title: "Crea tu organización",
  subtitle: (userName: string) =>
    `Bienvenido, ${userName}. Da un nombre a tu comunidad para empezar.`,
  nameLabel: "Nombre de la organización",
  namePlaceholder: "Ej. Residencial Las Veredillas",
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
          <div className="mb-6 flex flex-col items-center gap-2">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-2xl"
              style={{ background: "var(--color-primary-light)" }}
            >
              <Building2 size={22} style={{ color: "var(--color-primary)" }} />
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
            <p className="text-center text-sm" style={{ color: "var(--color-muted)" }}>
              {LABELS.subtitle(userName)}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="org-name"
                className="text-sm font-medium"
                style={{ color: "var(--color-dark)" }}
              >
                {LABELS.nameLabel}
              </label>
              <input
                id="org-name"
                type="text"
                required
                maxLength={200}
                autoFocus
                value={name}
                onChange={(e) => { setName(e.target.value); setError(""); }}
                className="form-input"
                placeholder={LABELS.namePlaceholder}
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

          <button
            type="button"
            onClick={handleSignOut}
            className="mt-5 flex w-full items-center justify-center gap-1.5 text-sm"
            style={{ color: "var(--color-muted)" }}
          >
            <LogOut size={14} />
            {LABELS.signOut}
          </button>
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
