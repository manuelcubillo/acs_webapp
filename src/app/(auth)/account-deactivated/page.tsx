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
import { Button } from "@/components/ui/button";

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
    <div className="relative flex min-h-screen items-center justify-center bg-background">
      <div className="mx-4 flex max-w-[420px] flex-col items-center gap-6 rounded-2xl border bg-card px-10 py-12 text-center shadow-sm">
        <div className="flex size-14 items-center justify-center rounded-2xl border border-destructive/30 bg-destructive/10">
          <ShieldOff className="size-6.5 text-destructive" strokeWidth={1.8} />
        </div>

        <div>
          <h1 className="mb-2 font-heading text-xl font-bold text-foreground">
            {LABELS.title}
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {LABELS.body}
          </p>
        </div>

        {done ? (
          <Button asChild>
            <Link href="/login">{LABELS.backToLogin}</Link>
          </Button>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />
            {LABELS.signingOut}
          </div>
        )}
      </div>
    </div>
  );
}
