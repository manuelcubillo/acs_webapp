"use client";

/**
 * PendingInvitationsList — shows active invitations with a revoke button.
 */

import { useState } from "react";
import { Mail, Trash2 } from "lucide-react";
import { revokeInvitationAction } from "@/lib/actions/invitations";
import type { InvitationWithInviter } from "@/lib/dal";
import ConfirmActionModal from "./ConfirmActionModal";

const LABELS = {
  empty: "No hay invitaciones pendientes.",
  invited: "Invitado por",
  expires: "Caduca",
  role: "Rol",
  revokeLabel: "Revocar",
  confirmTitle: "Revocar invitación",
  confirmBody: "El enlace de invitación dejará de funcionar. El usuario no podrá unirse con este enlace.",
  confirmBtn: "Revocar",
  roles: {
    operator: "Operador",
    admin: "Administrador",
    master: "Master",
  },
} as const;

const ROLE_COLORS: Record<string, string> = {
  master: "#7c3aed",
  admin: "#2563eb",
  operator: "#0891b2",
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
      <p style={{ fontSize: 13.5, color: "var(--color-muted)", margin: "12px 0" }}>
        {LABELS.empty}
      </p>
    );
  }

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {invitations.map((inv) => (
          <div
            key={inv.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 16px",
              background: "#fff",
              border: "1px solid var(--color-border)",
              borderRadius: 10,
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                width: 36, height: 36, borderRadius: 9,
                background: "#eff2ff",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Mail size={16} color="var(--color-primary)" strokeWidth={1.8} />
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-dark)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {inv.email}
              </div>
              <div style={{ fontSize: 12, color: "var(--color-muted)", marginTop: 2 }}>
                {LABELS.invited} <strong>{inv.inviterName}</strong>
                {" · "}
                {LABELS.expires} {new Date(inv.expiresAt).toLocaleDateString("es-ES")}
              </div>
            </div>

            <span style={{
              padding: "3px 10px", borderRadius: 20,
              fontSize: 11.5, fontWeight: 600,
              color: ROLE_COLORS[inv.role] ?? "#6b7094",
              background: (ROLE_COLORS[inv.role] ?? "#6b7094") + "18",
              textTransform: "capitalize",
              flexShrink: 0,
            }}>
              {LABELS.roles[inv.role as keyof typeof LABELS.roles] ?? inv.role}
            </span>

            <button
              onClick={() => setRevoking(inv.id)}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "6px 12px", borderRadius: 7,
                border: "1px solid #fca5a5", background: "#fef2f2",
                cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#dc2626",
                flexShrink: 0,
              }}
            >
              <Trash2 size={12} strokeWidth={2} />
              {LABELS.revokeLabel}
            </button>
          </div>
        ))}
      </div>

      <ConfirmActionModal
        isOpen={!!revoking}
        isLoading={loadingRevoke}
        title={LABELS.confirmTitle}
        body={LABELS.confirmBody}
        confirmLabel={LABELS.confirmBtn}
        confirmingLabel="Revocando…"
        destructive
        onConfirm={handleRevoke}
        onCancel={() => setRevoking(null)}
      />
    </>
  );
}
