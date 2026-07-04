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
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

const LABELS = {
  inviteBtn: "Añadir miembro",
  membersTitle: "Miembros",
  memberCountSingle: "miembro en esta organización",
  memberCountPlural: "miembros en esta organización",
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
  /** Signed avatar URLs keyed by member id. */
  memberAvatarReadUrls: Record<string, string>;
  currentUserId: string;
  currentUserRole: TenantRole;
}

export default function MembersClient({
  initialMembers,
  initialInvitations,
  memberAvatarReadUrls,
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
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-extrabold text-foreground">
            {LABELS.membersTitle}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {initialMembers.length}{" "}
            {initialMembers.length !== 1
              ? LABELS.memberCountPlural
              : LABELS.memberCountSingle}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={refresh}>
            <RefreshCw className="size-3.5" strokeWidth={2} />
          </Button>
          <Button onClick={() => setInviteOpen(true)}>
            <UserPlus className="size-4" strokeWidth={2} />
            {LABELS.inviteBtn}
          </Button>
        </div>
      </div>

      {actionError && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}

      {/* Members list */}
      <section className="mb-8">
        <MembersList
          members={initialMembers}
          memberAvatarReadUrls={memberAvatarReadUrls}
          currentUserId={currentUserId}
          actorRole={currentUserRole}
          onEdit={(m) => { setActionError(""); setEditTarget(m); }}
          onToggleActive={(m) => { setActionError(""); setToggleTarget(m); }}
          onRemove={(m) => { setActionError(""); setRemoveTarget(m); }}
        />
      </section>

      {/* Pending invitations */}
      <section>
        <h2 className="mb-3 font-heading text-base font-bold text-foreground">
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
