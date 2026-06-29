/**
 * /invitations/[token] — Invitation Accept Page
 *
 * Public route — no auth guard.
 * Fetches the invitation by token and renders the appropriate UI:
 * - Error state if the token is invalid, expired, accepted, or revoked.
 * - Registration form if the email doesn't have an account yet.
 * - Single-click join if the email already has a ACS account.
 */

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { getInvitationByToken, getTenantById } from "@/lib/dal";
import { NotFoundError } from "@/lib/dal/errors";
import InvitationAcceptClient from "./InvitationAcceptClient";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MemberInvitation } from "@/lib/dal";

export const dynamic = "force-dynamic";

const LABELS = {
  errorTitle: "Invitación no válida",
  notFound: "Esta invitación no existe o el enlace es incorrecto.",
  expired: "Esta invitación ha expirado. Pide al administrador que te envíe una nueva.",
  accepted: "Esta invitación ya fue aceptada.",
  revoked: "Esta invitación ha sido revocada.",
  backToLogin: "Ir al inicio de sesión",
} as const;

function getInvitationError(inv: MemberInvitation): string | null {
  if (inv.acceptedAt) return LABELS.accepted;
  if (inv.revokedAt) return LABELS.revoked;
  if (inv.expiresAt < new Date()) return LABELS.expired;
  return null;
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="flex max-w-[420px] flex-col items-center gap-5 rounded-2xl border bg-card px-9 py-10 text-center shadow-sm">
        <div className="flex size-13 items-center justify-center rounded-2xl border border-destructive/30 bg-destructive/10">
          <ShieldAlert className="size-6 text-destructive" strokeWidth={1.8} />
        </div>
        <div>
          <h1 className="mb-2 font-heading text-lg font-bold text-foreground">
            {LABELS.errorTitle}
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {message}
          </p>
        </div>
        <Button asChild>
          <Link href="/login">{LABELS.backToLogin}</Link>
        </Button>
      </div>
    </div>
  );
}

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function InvitationTokenPage({ params }: PageProps) {
  const { token } = await params;

  // Fetch invitation — render error if not found.
  let invitation: MemberInvitation;
  try {
    invitation = await getInvitationByToken(token);
  } catch (err) {
    if (err instanceof NotFoundError) {
      return <ErrorState message={LABELS.notFound} />;
    }
    throw err;
  }

  // Validate invitation status — render specific error messages.
  const invError = getInvitationError(invitation);
  if (invError) {
    return <ErrorState message={invError} />;
  }

  // Fetch tenant name.
  const tenant = await getTenantById(invitation.tenantId).catch(() => null);
  const tenantName = tenant?.name ?? "la organización";

  // Check if this email already has a ACS account.
  const [existingUser] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, invitation.email))
    .limit(1);

  return (
    <InvitationAcceptClient
      invitation={invitation}
      existingAccount={!!existingUser}
      tenantName={tenantName}
    />
  );
}
