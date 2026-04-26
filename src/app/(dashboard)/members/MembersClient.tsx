"use client";

/**
 * MembersClient — client UI for the /members page.
 * Manages modal state for invite, edit, deactivate/activate, and remove.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, RefreshCw } from "lucide-react";
import type { MemberWithUser, InvitationWithInviter } from "@/lib/dal";
import type { TenantRole } from "@/lib/api";
import { setMemberActiveAction, removeMemberAction } from "@/lib/actions/members";
import MembersList from "@/components/members/MembersList";
import PendingInvitationsList from "@/components/members/PendingInvitationsList";
import InviteMemberModal from "@/components/members/InviteMemberModal";
import EditMemberModal from "@/components/members/EditMemberModal";
import ConfirmActionModal from "@/components/members/ConfirmActionModal";

const LABELS = {
  inviteBtn: "Añadir miembro",
  membersTitle: "Miembros",
  invitationsTitle: "Invitaciones pendientes",
  deactivateTitle: "Desactivar miembro",
  deactivateSubtitle: "El miembro perderá acceso inmediatamente.",
  deactivateBody: "La sesión activa del miembro será cerrada. Puedes reactivar su acceso en cualquier momento.",
  deactivateBtn: "Desactivar",
  activateTitle: "Activar miembro",
  activateBody: "El miembro recuperará acceso a la organización con su rol actual.",
  activateBtn: "Activar",
  removeTitle: "Quitar miembro",
  removeSubtitle: "Esta acción no se puede deshacer.",
  removeBody: "La cuenta se quitará de la organización. Esta acción no se puede deshacer.",
  removeBtn: "Quitar de la organización",
} as const;

interface Props {
  initialMembers: MemberWithUser[];
  initialInvitations: InvitationWithInviter[];
  currentUserId: string;
  currentUserRole: TenantRole;
}

export default function MembersClient({
  initialMembers,
  initialInvitations,
  currentUserId,
  currentUserRole,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Modal state
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<MemberWithUser | null>(null);
  const [toggleTarget, setToggleTarget] = useState<MemberWithUser | null>(null);
  const [removeTarget, setRemoveTarget] = useState<MemberWithUser | null>(null);

  const [loadingToggle, setLoadingToggle] = useState(false);
  const [loadingRemove, setLoadingRemove] = useState(false);
  const [actionError, setActionError] = useState("");

  function refresh() {
    startTransition(() => router.refresh());
  }

  async function handleToggleActive() {
    if (!toggleTarget) return;
    setActionError("");
    setLoadingToggle(true);
    const result = await setMemberActiveAction(toggleTarget.id, !toggleTarget.isActive);
    setLoadingToggle(false);
    if (!result.success) { setActionError(result.error ?? "Error."); return; }
    setToggleTarget(null);
    refresh();
  }

  async function handleRemove() {
    if (!removeTarget) return;
    setActionError("");
    setLoadingRemove(true);
    const result = await removeMemberAction(removeTarget.id);
    setLoadingRemove(false);
    if (!result.success) { setActionError(result.error ?? "Error."); return; }
    setRemoveTarget(null);
    refresh();
  }

  const isDeactivating = toggleTarget?.isActive ?? false;

  return (
    <div>
      {/* Page header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, fontFamily: "var(--font-heading)", color: "var(--color-dark)", margin: 0 }}>
            Miembros
          </h1>
          <p style={{ fontSize: 13.5, color: "var(--color-secondary)", marginTop: 4 }}>
            {initialMembers.length} miembro{initialMembers.length !== 1 ? "s" : ""} en esta organización
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={refresh}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "9px 14px", borderRadius: 9,
              border: "1.5px solid var(--color-border)", background: "#fff",
              cursor: "pointer", fontSize: 13, fontWeight: 500, color: "var(--color-dark)",
            }}
          >
            <RefreshCw size={14} strokeWidth={2} />
          </button>
          <button
            onClick={() => setInviteOpen(true)}
            className="btn btn-primary"
          >
            <UserPlus size={16} strokeWidth={2} />
            {LABELS.inviteBtn}
          </button>
        </div>
      </div>

      {actionError && (
        <div style={{ padding: "12px 16px", background: "#fef2f2", color: "#dc2626", borderRadius: 10, border: "1px solid #fecaca", marginBottom: 16, fontSize: 13 }}>
          {actionError}
        </div>
      )}

      {/* Members list */}
      <section style={{ marginBottom: 32 }}>
        <MembersList
          members={initialMembers}
          currentUserId={currentUserId}
          actorRole={currentUserRole}
          onEdit={(m) => { setActionError(""); setEditTarget(m); }}
          onToggleActive={(m) => { setActionError(""); setToggleTarget(m); }}
          onRemove={(m) => { setActionError(""); setRemoveTarget(m); }}
        />
      </section>

      {/* Pending invitations */}
      <section>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--color-dark)", marginBottom: 12 }}>
          {LABELS.invitationsTitle}
        </h2>
        <PendingInvitationsList
          invitations={initialInvitations}
          onRevoked={refresh}
        />
      </section>

      {/* Modals */}
      <InviteMemberModal
        isOpen={inviteOpen}
        actorRole={currentUserRole}
        onClose={() => setInviteOpen(false)}
        onSuccess={refresh}
      />

      {editTarget && (
        <EditMemberModal
          isOpen={!!editTarget}
          member={editTarget}
          actorRole={currentUserRole}
          onClose={() => setEditTarget(null)}
          onSuccess={() => { setEditTarget(null); refresh(); }}
        />
      )}

      {/* Activate / Deactivate confirmation */}
      <ConfirmActionModal
        isOpen={!!toggleTarget}
        isLoading={loadingToggle}
        title={isDeactivating ? LABELS.deactivateTitle : LABELS.activateTitle}
        subtitle={isDeactivating ? LABELS.deactivateSubtitle : undefined}
        body={isDeactivating ? LABELS.deactivateBody : LABELS.activateBody}
        confirmLabel={isDeactivating ? LABELS.deactivateBtn : LABELS.activateBtn}
        confirmingLabel={isDeactivating ? "Desactivando…" : "Activando…"}
        destructive={isDeactivating}
        onConfirm={handleToggleActive}
        onCancel={() => setToggleTarget(null)}
      />

      {/* Remove confirmation */}
      <ConfirmActionModal
        isOpen={!!removeTarget}
        isLoading={loadingRemove}
        title={LABELS.removeTitle}
        subtitle={LABELS.removeSubtitle}
        body={LABELS.removeBody}
        confirmLabel={LABELS.removeBtn}
        confirmingLabel="Quitando…"
        destructive
        onConfirm={handleRemove}
        onCancel={() => setRemoveTarget(null)}
      />
    </div>
  );
}
