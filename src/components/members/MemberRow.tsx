"use client";

/**
 * MemberRow — single member entry in the members list.
 */

import { Edit2, UserCheck, UserX, Trash2 } from "lucide-react";
import type { MemberWithUser } from "@/lib/dal";
import type { TenantRole } from "@/lib/api";
import { canManage } from "@/lib/auth/role-hierarchy";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LABELS = {
  selfTooltip: "Edita tus datos en Configuración → Cuenta",
  selfBadge: "Tú",
  editBtn: "Editar",
  activateBtn: "Activar",
  deactivateBtn: "Desactivar",
  removeBtn: "Quitar",
  roles: {
    operator: "Operador",
    admin: "Administrador",
    master: "Master",
  },
  statusActive: "Activo",
  statusInactive: "Inactivo",
} as const;

/** Decorative role-badge classes — backed by the --role-* Layer 2 tokens. */
const ROLE_BADGE_CLASS: Record<string, string> = {
  master: "bg-role-master text-role-master-foreground",
  admin: "bg-role-admin text-role-admin-foreground",
  operator: "bg-role-operator text-role-operator-foreground",
};

interface Props {
  member: MemberWithUser;
  /** Pre-signed read URL for the member's avatar (or null to fall back to initials). */
  avatarReadUrl?: string | null;
  isSelf: boolean;
  actorRole: TenantRole;
  onEdit: (member: MemberWithUser) => void;
  onToggleActive: (member: MemberWithUser) => void;
  onRemove: (member: MemberWithUser) => void;
}

export default function MemberRow({
  member,
  avatarReadUrl,
  isSelf,
  actorRole,
  onEdit,
  onToggleActive,
  onRemove,
}: Props) {
  const targetRole = member.role as TenantRole;
  const canAct = !isSelf && canManage(actorRole, targetRole);

  const initials = member.userName
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3.5 rounded-xl border bg-card px-4 py-3.5",
        !member.isActive && "opacity-60",
      )}
    >
      {/* Avatar */}
      <Avatar className="size-10 shrink-0 rounded-[10px]">
        {avatarReadUrl && (
          <AvatarImage src={avatarReadUrl} alt={member.userName} className="rounded-[10px] object-cover" />
        )}
        <AvatarFallback className="rounded-[10px] bg-accent font-heading text-sm font-bold text-accent-foreground">
          {initials || "?"}
        </AvatarFallback>
      </Avatar>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-semibold text-foreground">
            {member.userName}
          </span>
          {isSelf && (
            <Badge className="bg-accent text-accent-foreground">
              {LABELS.selfBadge}
            </Badge>
          )}
          {!member.isActive && (
            <Badge variant="secondary">{LABELS.statusInactive}</Badge>
          )}
        </div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground">
          {member.userEmail}
          {member.userUsername && (
            <span className="ml-1.5 text-muted-foreground/70">
              @{member.userUsername}
            </span>
          )}
        </div>
      </div>

      {/* Role badge */}
      <Badge
        className={cn(
          "shrink-0",
          ROLE_BADGE_CLASS[member.role] ?? "bg-role-operator text-role-operator-foreground",
        )}
      >
        {LABELS.roles[member.role as keyof typeof LABELS.roles] ?? member.role}
      </Badge>

      {/* Actions */}
      <div className="flex shrink-0 gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => canAct && onEdit(member)}
          disabled={!canAct}
          title={isSelf ? LABELS.selfTooltip : undefined}
        >
          <Edit2 strokeWidth={2} />
          {LABELS.editBtn}
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => canAct && onToggleActive(member)}
          disabled={!canAct}
          title={isSelf ? LABELS.selfTooltip : undefined}
        >
          {member.isActive ? (
            <UserX strokeWidth={2} />
          ) : (
            <UserCheck strokeWidth={2} />
          )}
          {member.isActive ? LABELS.deactivateBtn : LABELS.activateBtn}
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => canAct && onRemove(member)}
          disabled={!canAct}
          title={isSelf ? LABELS.selfTooltip : undefined}
          className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 strokeWidth={2} />
          {LABELS.removeBtn}
        </Button>
      </div>
    </div>
  );
}
