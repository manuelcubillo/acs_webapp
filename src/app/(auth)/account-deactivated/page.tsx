"use client";

/**
 * /account-deactivated — shown when a member's access has been revoked.
 *
 * No auth guard. Signs the user out client-side on mount so the session
 * cookie is cleared and they can't navigate back into the dashboard.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldOff, Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";

const LABELS = {
  title: "Cuenta desactivada",
  body: "Tu cuenta ha sido desactivada. Contacta con el administrador de tu organización.",
  backToLogin: "Volver al inicio de sesión",
  signingOut: "Cerrando sesión…",
} as const;

export default function AccountDeactivatedPage() {
  const [done, setDone] = useState(false);

  useEffect(() => {
    authClient.signOut().finally(() => setDone(true));
  }, []);

  return (
    <div
      className="relative flex min-h-screen items-center justify-center"
      style={{ background: "var(--color-page-bg)" }}
    >
      <div
        className="card flex flex-col items-center gap-6 text-center"
        style={{
          padding: "48px 40px",
          maxWidth: 420,
          margin: "0 16px",
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            background: "#fef2f2",
            border: "1.5px solid #fca5a5",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ShieldOff size={26} color="#dc2626" strokeWidth={1.8} />
        </div>

        <div>
          <h1
            style={{
              fontSize: 20,
              fontWeight: 700,
              fontFamily: "var(--font-heading)",
              color: "var(--color-dark)",
              margin: "0 0 8px",
            }}
          >
            {LABELS.title}
          </h1>
          <p
            style={{
              fontSize: 14,
              color: "var(--color-secondary)",
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            {LABELS.body}
          </p>
        </div>

        {done ? (
          <Link
            href="/login"
            className="btn btn-primary"
            style={{ fontSize: 14 }}
          >
            {LABELS.backToLogin}
          </Link>
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13,
              color: "var(--color-muted)",
            }}
          >
            <Loader2 size={14} strokeWidth={2} className="animate-spin" />
            {LABELS.signingOut}
          </div>
        )}
      </div>
    </div>
  );
}
