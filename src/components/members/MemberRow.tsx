"use client";

/**
 * MemberRow — single member entry in the members list.
 */

import { Edit2, UserCheck, UserX, Trash2 } from "lucide-react";
import type { MemberWithUser } from "@/lib/dal";
import type { TenantRole } from "@/lib/api";
import { canManage } from "@/lib/auth/role-hierarchy";

const LABELS = {
  selfTooltip: "Edita tus datos en Configuración → Cuenta",
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

const ROLE_COLORS: Record<string, string> = {
  master: "#7c3aed",
  admin: "#2563eb",
  operator: "#0891b2",
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
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "14px 16px",
        background: "#fff",
        border: "1px solid var(--color-border)",
        borderRadius: 12,
        opacity: member.isActive ? 1 : 0.6,
        flexWrap: "wrap",
      }}
    >
      {/* Avatar */}
      {avatarReadUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarReadUrl}
          alt={member.userName}
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            objectFit: "cover",
            border: "1px solid var(--color-border)",
            flexShrink: 0,
          }}
        />
      ) : (
        <div
          style={{
            width: 40, height: 40, borderRadius: 10,
            background: "linear-gradient(135deg, #e0e7ff, #c7d2fe)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 700, fontSize: 14, color: "var(--color-primary)",
            fontFamily: "var(--font-heading)",
            flexShrink: 0,
          }}
        >
          {initials || "?"}
        </div>
      )}

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--color-dark)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {member.userName}
          </span>
          {isSelf && (
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-primary)", background: "#eff2ff", padding: "1px 7px", borderRadius: 20 }}>
              Tú
            </span>
          )}
          {!member.isActive && (
            <span style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", background: "#f3f4f6", padding: "1px 7px", borderRadius: 20 }}>
              {LABELS.statusInactive}
            </span>
          )}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--color-muted)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {member.userEmail}
          {member.userUsername && <span style={{ marginLeft: 6, color: "#a0a3b1" }}>@{member.userUsername}</span>}
        </div>
      </div>

      {/* Role badge */}
      <span
        style={{
          padding: "3px 11px", borderRadius: 20,
          fontSize: 12, fontWeight: 600,
          color: ROLE_COLORS[member.role] ?? "#6b7094",
          background: (ROLE_COLORS[member.role] ?? "#6b7094") + "18",
          flexShrink: 0,
        }}
      >
        {LABELS.roles[member.role as keyof typeof LABELS.roles] ?? member.role}
      </span>

      {/* Actions */}
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <button
          onClick={() => canAct && onEdit(member)}
          disabled={!canAct}
          title={isSelf ? LABELS.selfTooltip : undefined}
          style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "6px 10px", borderRadius: 7,
            border: "1px solid var(--color-border)", background: "#fff",
            cursor: canAct ? "pointer" : "not-allowed",
            fontSize: 12, fontWeight: 500, color: canAct ? "var(--color-dark)" : "#9ca3af",
            opacity: canAct ? 1 : 0.5,
          }}
        >
          <Edit2 size={12} strokeWidth={2} />
          {LABELS.editBtn}
        </button>

        <button
          onClick={() => canAct && onToggleActive(member)}
          disabled={!canAct}
          title={isSelf ? LABELS.selfTooltip : undefined}
          style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "6px 10px", borderRadius: 7,
            border: `1px solid ${member.isActive ? "#fed7aa" : "#bbf7d0"}`,
            background: member.isActive ? "#fff7ed" : "#f0fdf4",
            cursor: canAct ? "pointer" : "not-allowed",
            fontSize: 12, fontWeight: 500,
            color: canAct ? (member.isActive ? "#ea580c" : "#16a34a") : "#9ca3af",
            opacity: canAct ? 1 : 0.5,
          }}
        >
          {member.isActive
            ? <UserX size={12} strokeWidth={2} />
            : <UserCheck size={12} strokeWidth={2} />
          }
          {member.isActive ? LABELS.deactivateBtn : LABELS.activateBtn}
        </button>

        <button
          onClick={() => canAct && onRemove(member)}
          disabled={!canAct}
          title={isSelf ? LABELS.selfTooltip : undefined}
          style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "6px 10px", borderRadius: 7,
            border: "1px solid #fca5a5", background: "#fef2f2",
            cursor: canAct ? "pointer" : "not-allowed",
            fontSize: 12, fontWeight: 500, color: canAct ? "#dc2626" : "#9ca3af",
            opacity: canAct ? 1 : 0.5,
          }}
        >
          <Trash2 size={12} strokeWidth={2} />
          {LABELS.removeBtn}
        </button>
      </div>
    </div>
  );
}
