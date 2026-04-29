"use client";

/**
 * AccountSettings
 *
 * Client component that renders two independent settings cards:
 *
 *   1. "Información del tenant" — editable tenant name, read-only ID and
 *      creation date. Saves via updateCurrentTenantNameAction (admin+).
 *
 *   2. "Tu perfil" — editable display name (via Better Auth updateUser),
 *      read-only email, and a role badge. Each card has its own Save button.
 *
 * Props come from the server page which fetches both tenant and session data.
 */

import { useState, useTransition } from "react";
import { Save, Copy, Check } from "lucide-react";
import {
  setCurrentTenantLogoAction,
  updateCurrentTenantNameAction,
} from "@/lib/actions/tenants";
import { setMyAvatarAction } from "@/lib/actions/members";
import { deleteAccountAction } from "@/lib/actions/account";
import { authClient } from "@/lib/auth-client";
import SettingsSection from "@/components/settings/SettingsSection";
import SettingsCard from "@/components/settings/SettingsCard";
import PhotoUploader from "@/components/shared/PhotoUploader";
import DeleteAccountModal from "./DeleteAccountModal";
import DeleteTenantAccountModal from "./DeleteTenantAccountModal";
import type { TenantRole } from "@/lib/api";

// ─── Danger zone copy ─────────────────────────────────────────────────────────

const DANGER_ZONE = {
  cardTitle: "Zona de peligro",
  cardDescription: "Acciones irreversibles sobre tu cuenta.",
  warningLastMaster:
    "Eres el único master activo de este tenant. Eliminar tu cuenta eliminará permanentemente toda la organización y sus datos.",
  warningNotLastMaster:
    "Al eliminar tu cuenta perderás el acceso a este tenant. Los datos de la organización no se verán afectados.",
  deleteButton: "Eliminar cuenta",
  deletingButton: "Eliminando…",
  errorFallback: "Error al eliminar la cuenta",
} as const;

// ─── Role badge ───────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<TenantRole, { label: string; color: string; bg: string }> = {
  master: { label: "Master",   color: "#7c3aed", bg: "#f5f3ff" },
  admin:  { label: "Admin",    color: "#2563eb", bg: "#eff6ff" },
  operator: { label: "Operador", color: "#16a34a", bg: "#f0fdf4" },
};

function RoleBadge({ role }: { role: TenantRole }) {
  const { label, color, bg } = ROLE_LABELS[role] ?? ROLE_LABELS.operator;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 600,
        color,
        background: bg,
        border: `1px solid ${color}22`,
      }}
    >
      {label}
    </span>
  );
}

// ─── Read-only field ──────────────────────────────────────────────────────────

/** Displays a non-editable value with an optional copy button. */
function ReadOnlyField({
  label,
  value,
  copyable = false,
}: {
  label: string;
  value: string;
  copyable?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      <div style={labelStyle}>{label}</div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginTop: 6,
          padding: "10px 14px",
          background: "var(--color-subtle-bg)",
          border: "1.5px solid var(--color-border-soft)",
          borderRadius: 10,
          fontSize: 14,
          color: "var(--color-secondary)",
          fontFamily: "monospace",
        }}
      >
        <span style={{ flex: 1, wordBreak: "break-all" }}>{value}</span>
        {copyable && (
          <button
            type="button"
            onClick={handleCopy}
            title="Copiar"
            style={{
              border: "none",
              background: "none",
              cursor: "pointer",
              color: copied ? "#16a34a" : "var(--color-muted)",
              padding: 2,
              display: "flex",
              alignItems: "center",
              flexShrink: 0,
            }}
          >
            {copied ? <Check size={14} strokeWidth={2} /> : <Copy size={14} strokeWidth={2} />}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface AccountSettingsProps {
  /** Tenant data fetched server-side. */
  tenant: {
    id: string;
    name: string;
    createdAt: Date;
    logoObjectKey: string | null;
    logoReadUrl: string | null;
  };
  /** Current user's data from the session. */
  user: {
    id: string | null;
    name: string | null;
    email: string;
    imageObjectKey: string | null;
    imageReadUrl: string | null;
  };
  /** Current user's role in this tenant. */
  role: TenantRole;
  /** Number of active master members in this tenant. */
  masterCount: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AccountSettings({ tenant, user, role, masterCount }: AccountSettingsProps) {
  // ── Tenant name form ──────────────────────────────────────────────────────
  const [tenantName, setTenantName] = useState(tenant.name);
  const [isTenantPending, startTenantTransition] = useTransition();
  const [tenantSaved, setTenantSaved] = useState(false);
  const [tenantError, setTenantError] = useState<string | null>(null);

  function handleTenantSave() {
    setTenantError(null);
    setTenantSaved(false);
    startTenantTransition(async () => {
      const result = await updateCurrentTenantNameAction({ name: tenantName });
      if (result.success) {
        setTenantSaved(true);
        setTimeout(() => setTenantSaved(false), 3000);
      } else {
        setTenantError(result.error ?? "Error al guardar");
      }
    });
  }

  // ── Tenant logo ───────────────────────────────────────────────────────────
  const [logoReadUrl, setLogoReadUrl] = useState<string | null>(tenant.logoReadUrl);
  const [logoError, setLogoError] = useState<string | null>(null);
  const isMaster = role === "master";

  async function handleLogoChange(
    v: { objectKey: string; readUrl: string } | null,
  ) {
    setLogoError(null);
    const result = await setCurrentTenantLogoAction({
      key: v?.objectKey ?? null,
    });
    if (!result.success) {
      setLogoError(result.error ?? "No se pudo guardar el logo");
      return;
    }
    setLogoReadUrl(v?.readUrl ?? null);
  }

  // ── User avatar ────────────────────────────────────────────────────────────
  const [avatarReadUrl, setAvatarReadUrl] = useState<string | null>(user.imageReadUrl);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  async function handleAvatarChange(
    v: { objectKey: string; readUrl: string } | null,
  ) {
    setAvatarError(null);
    const result = await setMyAvatarAction({ key: v?.objectKey ?? null });
    if (!result.success) {
      setAvatarError(result.error ?? "No se pudo guardar la foto de perfil");
      return;
    }
    setAvatarReadUrl(v?.readUrl ?? null);
  }

  // ── User name form ────────────────────────────────────────────────────────
  const [userName, setUserName] = useState(user.name ?? "");
  const [isUserPending, startUserTransition] = useTransition();
  const [userSaved, setUserSaved] = useState(false);
  const [userError, setUserError] = useState<string | null>(null);

  function handleUserSave() {
    setUserError(null);
    setUserSaved(false);
    startUserTransition(async () => {
      const { error } = await authClient.updateUser({ name: userName });
      if (error) {
        setUserError(error.message ?? "Error al actualizar el perfil");
      } else {
        setUserSaved(true);
        setTimeout(() => setUserSaved(false), 3000);
      }
    });
  }

  // ── Delete account ────────────────────────────────────────────────────────
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, startDeleteTransition] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const isLastMaster = role === "master" && masterCount === 1;

  function handleDeleteConfirm() {
    setDeleteError(null);
    startDeleteTransition(async () => {
      const result = await deleteAccountAction();
      if (result.success) {
        // Full navigation — session is invalidated server-side,
        // router.push would trigger dashboard layout auth checks with dead session.
        window.location.href = `/goodbye?fid=${result.data.feedbackId}`;
      } else {
        setShowDeleteModal(false);
        setDeleteError(result.error ?? DANGER_ZONE.errorFallback);
      }
    });
  }

  // ── Formatted creation date ───────────────────────────────────────────────
  const createdAtDisplay = new Date(tenant.createdAt).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <SettingsSection
      title="Datos de la cuenta"
      description="Información general de tu organización y tu perfil de usuario."
    >
      {/* ── Tenant info ──────────────────────────────────────────────────── */}
      <SettingsCard
        title="Información del tenant"
        description="Nombre y datos de identificación de tu organización."
        footer={
          <>
            <button
              className="btn btn-primary"
              onClick={handleTenantSave}
              disabled={isTenantPending || tenantName === tenant.name || !tenantName.trim()}
            >
              <Save size={14} strokeWidth={2} />
              {isTenantPending ? "Guardando…" : "Guardar cambios"}
            </button>
            {tenantSaved && (
              <span style={{ fontSize: 12.5, color: "#16a34a", fontWeight: 600 }}>
                ✓ Guardado
              </span>
            )}
            {tenantError && (
              <span style={{ fontSize: 12.5, color: "#dc2626" }}>{tenantError}</span>
            )}
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Logo */}
          {isMaster && (
            <div>
              <div style={labelStyle}>Logo de la organización</div>
              <div style={{ marginTop: 6 }}>
                <PhotoUploader
                  kind="tenant-logo"
                  ownerId={tenant.id}
                  currentObjectKey={tenant.logoObjectKey}
                  currentReadUrl={logoReadUrl}
                  previewSize={96}
                  alt="Logo"
                  onChange={(v) => void handleLogoChange(v)}
                />
              </div>
              {logoError && (
                <p style={{ margin: "6px 0 0", fontSize: 12, color: "#dc2626" }}>
                  {logoError}
                </p>
              )}
            </div>
          )}

          {/* Tenant name */}
          <div>
            <label htmlFor="tenant-name" style={labelStyle}>
              Nombre de la organización
            </label>
            <input
              id="tenant-name"
              type="text"
              className="form-input"
              value={tenantName}
              onChange={(e) => setTenantName(e.target.value)}
              placeholder="Nombre de la organización"
              style={{ marginTop: 6 }}
            />
          </div>

          {/* Tenant ID */}
          <ReadOnlyField
            label="ID del tenant"
            value={tenant.id}
            copyable
          />

          {/* Created at */}
          <ReadOnlyField label="Fecha de creación" value={createdAtDisplay} />
        </div>
      </SettingsCard>

      {/* ── User profile ─────────────────────────────────────────────────── */}
      <SettingsCard
        title="Tu perfil"
        description="Tu nombre de usuario y datos de acceso."
        footer={
          <>
            <button
              className="btn btn-primary"
              onClick={handleUserSave}
              disabled={isUserPending || userName === (user.name ?? "")}
            >
              <Save size={14} strokeWidth={2} />
              {isUserPending ? "Guardando…" : "Guardar cambios"}
            </button>
            {userSaved && (
              <span style={{ fontSize: 12.5, color: "#16a34a", fontWeight: 600 }}>
                ✓ Guardado
              </span>
            )}
            {userError && (
              <span style={{ fontSize: 12.5, color: "#dc2626" }}>{userError}</span>
            )}
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Avatar */}
          {user.id && (
            <div>
              <div style={labelStyle}>Foto de perfil</div>
              <div style={{ marginTop: 6 }}>
                <PhotoUploader
                  kind="member-avatar"
                  ownerId={user.id}
                  currentObjectKey={user.imageObjectKey}
                  currentReadUrl={avatarReadUrl}
                  previewSize={96}
                  alt="Avatar"
                  onChange={(v) => void handleAvatarChange(v)}
                />
              </div>
              {avatarError && (
                <p style={{ margin: "6px 0 0", fontSize: 12, color: "#dc2626" }}>
                  {avatarError}
                </p>
              )}
            </div>
          )}

          {/* Display name */}
          <div>
            <label htmlFor="user-name" style={labelStyle}>
              Nombre para mostrar
            </label>
            <input
              id="user-name"
              type="text"
              className="form-input"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="Tu nombre"
              style={{ marginTop: 6 }}
            />
          </div>

          {/* Email (read-only) */}
          <ReadOnlyField label="Correo electrónico" value={user.email} />

          {/* Role badge */}
          <div>
            <div style={labelStyle}>Rol en este tenant</div>
            <div style={{ marginTop: 6 }}>
              <RoleBadge role={role} />
            </div>
          </div>
        </div>
      </SettingsCard>
      {/* ── Danger zone ──────────────────────────────────────────────────── */}
      <SettingsCard
        title={DANGER_ZONE.cardTitle}
        description={DANGER_ZONE.cardDescription}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ margin: 0, fontSize: 13, color: "var(--color-secondary)", lineHeight: 1.6 }}>
            {isLastMaster ? DANGER_ZONE.warningLastMaster : DANGER_ZONE.warningNotLastMaster}
          </p>
          {deleteError && (
            <p style={{ margin: 0, fontSize: 12.5, color: "#dc2626" }}>{deleteError}</p>
          )}
          <div>
            <button
              type="button"
              onClick={() => { setDeleteError(null); setShowDeleteModal(true); }}
              disabled={isDeleting}
              style={{
                padding: "9px 18px",
                borderRadius: 9,
                border: "1.5px solid #dc2626",
                background: "#fff",
                color: "#dc2626",
                cursor: isDeleting ? "not-allowed" : "pointer",
                fontSize: 13,
                fontWeight: 600,
                opacity: isDeleting ? 0.6 : 1,
              }}
            >
              {isDeleting ? DANGER_ZONE.deletingButton : DANGER_ZONE.deleteButton}
            </button>
          </div>
        </div>
      </SettingsCard>

      {isLastMaster ? (
        <DeleteTenantAccountModal
          isOpen={showDeleteModal}
          isLoading={isDeleting}
          tenantName={tenant.name}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setShowDeleteModal(false)}
        />
      ) : (
        <DeleteAccountModal
          isOpen={showDeleteModal}
          isLoading={isDeleting}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setShowDeleteModal(false)}
        />
      )}
    </SettingsSection>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "var(--color-dark)",
  display: "block",
};
