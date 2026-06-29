"use client";

/**
 * PendingInvitationsList — shows active invitations with a revoke button.
 */

import { useState } from "react";
import { Mail, Trash2 } from "lucide-react";
import { revokeInvitationAction } from "@/lib/actions/invitations";
import type { InvitationWithInviter } from "@/lib/dal";
import ConfirmActionModal from "./ConfirmActionModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LABELS = {
  empty: "No hay invitaciones pendientes.",
  invited: "Invitado por",
  expires: "Caduca",
  role: "Rol",
  revokeLabel: "Revocar",
  revokingLabel: "Revocando…",
  confirmTitle: "Revocar invitación",
  confirmBody: "El enlace de invitación dejará de funcionar. El usuario no podrá unirse con este enlace.",
  confirmBtn: "Revocar",
  roles: {
    operator: "Operador",
    admin: "Administrador",
    master: "Master",
  },
} as const;

/** Decorative role-badge classes — backed by the --role-* Layer 2 tokens. */
const ROLE_BADGE_CLASS: Record<string, string> = {
  master: "bg-role-master text-role-master-foreground",
  admin: "bg-role-admin text-role-admin-foreground",
  operator: "bg-role-operator text-role-operator-foreground",
};

interface Props {
  invitations: InvitationWithInviter[];
  onRevoked: () => void;
}

export default function PendingInvitationsList({ invitations, onRevoked }: Props) {
  const [revoking, setRevoking] = useState<string | null>(null);
  const [loadingRevoke, setLoadingRevoke] = useState(false);

  async function handleRevoke() {
    if (!revoking) return;
    setLoadingRevoke(true);
    const result = await revokeInvitationAction(revoking);
    setLoadingRevoke(false);
    if (result.success) {
      setRevoking(null);
      onRevoked();
    }
  }

  if (invitations.length === 0) {
    return (
      <p className="my-3 text-sm text-muted-foreground">{LABELS.empty}</p>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        {invitations.map((inv) => (
          <div
            key={inv.id}
            className="flex flex-wrap items-center gap-3 rounded-[10px] border bg-card px-4 py-3"
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-accent">
              <Mail className="size-4 text-primary" strokeWidth={1.8} />
            </div>

            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-foreground">
                {inv.email}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {LABELS.invited} <strong>{inv.inviterName}</strong>
                {" · "}
                {LABELS.expires}{" "}
                {new Date(inv.expiresAt).toLocaleDateString("es-ES")}
              </div>
            </div>

            <Badge
              className={cn(
                "shrink-0 capitalize",
                ROLE_BADGE_CLASS[inv.role] ?? "bg-role-operator text-role-operator-foreground",
              )}
            >
              {LABELS.roles[inv.role as keyof typeof LABELS.roles] ?? inv.role}
            </Badge>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRevoking(inv.id)}
              className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 strokeWidth={2} />
              {LABELS.revokeLabel}
            </Button>
          </div>
        ))}
      </div>

      <ConfirmActionModal
        isOpen={!!revoking}
        isLoading={loadingRevoke}
        title={LABELS.confirmTitle}
        body={LABELS.confirmBody}
        confirmLabel={LABELS.confirmBtn}
        confirmingLabel={LABELS.revokingLabel}
        destructive
        onConfirm={handleRevoke}
        onCancel={() => setRevoking(null)}
      />
    </>
  );
}
