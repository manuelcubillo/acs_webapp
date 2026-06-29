"use client";

/**
 * MembersList — renders the full list of members with action buttons.
 */

import type { MemberWithUser } from "@/lib/dal";
import type { TenantRole } from "@/lib/api";
import MemberRow from "./MemberRow";

const LABELS = {
  empty: "No hay miembros en esta organización.",
} as const;

interface Props {
  members: MemberWithUser[];
  /** Signed avatar URLs keyed by member id. */
  memberAvatarReadUrls: Record<string, string>;
  currentUserId: string;
  actorRole: TenantRole;
  onEdit: (member: MemberWithUser) => void;
  onToggleActive: (member: MemberWithUser) => void;
  onRemove: (member: MemberWithUser) => void;
}

export default function MembersList({
  members,
  memberAvatarReadUrls,
  currentUserId,
  actorRole,
  onEdit,
  onToggleActive,
  onRemove,
}: Props) {
  if (members.length === 0) {
    return (
      <p className="my-3 text-sm text-muted-foreground">{LABELS.empty}</p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {members.map((m) => (
        <MemberRow
          key={m.id}
          member={m}
          avatarReadUrl={memberAvatarReadUrls[m.id] ?? null}
          isSelf={m.userId === currentUserId}
          actorRole={actorRole}
          onEdit={onEdit}
          onToggleActive={onToggleActive}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
}
