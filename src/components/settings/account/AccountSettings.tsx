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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { TenantRole } from "@/lib/api";

const LABEL_CLASS = "block text-sm font-semibold text-foreground";
const SAVED_TEXT = "Guardado";
const SAVING_TEXT = "Guardando…";
const SAVE_TEXT = "Guardar cambios";

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

// Decorative role badges — backed by the --role-* Layer 2 tokens.
const ROLE_LABELS: Record<TenantRole, { label: string; className: string }> = {
  master:   { label: "Master",   className: "bg-role-master text-role-master-foreground" },
  admin:    { label: "Admin",    className: "bg-role-admin text-role-admin-foreground" },
  operator: { label: "Operador", className: "bg-role-operator text-role-operator-foreground" },
};

function RoleBadge({ role }: { role: TenantRole }) {
  const { label, className } = ROLE_LABELS[role] ?? ROLE_LABELS.operator;
  return <Badge className={className}>{label}</Badge>;
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
      <div className={LABEL_CLASS}>{label}</div>
      <div className="mt-1.5 flex items-center gap-2 rounded-[10px] border bg-muted px-3.5 py-2.5 font-mono text-sm text-muted-foreground">
        <span className="flex-1 break-all">{value}</span>
        {copyable && (
          <button
            type="button"
            onClick={handleCopy}
            title="Copiar"
            className={cn(
              "flex shrink-0 items-center p-0.5",
              copied ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
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
            <Button
              onClick={handleTenantSave}
              disabled={isTenantPending || tenantName === tenant.name || !tenantName.trim()}
            >
              <Save strokeWidth={2} />
              {isTenantPending ? SAVING_TEXT : SAVE_TEXT}
            </Button>
            {tenantSaved && (
              <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                <Check className="size-3.5" strokeWidth={2.5} />
                {SAVED_TEXT}
              </span>
            )}
            {tenantError && (
              <span className="text-xs text-destructive">{tenantError}</span>
            )}
          </>
        }
      >
        <div className="flex flex-col gap-4.5">
          {/* Logo */}
          {isMaster && (
            <div>
              <div className={LABEL_CLASS}>Logo de la organización</div>
              <div className="mt-1.5">
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
                <p className="mt-1.5 text-xs text-destructive">{logoError}</p>
              )}
            </div>
          )}

          {/* Tenant name */}
          <div>
            <Label htmlFor="tenant-name" className={LABEL_CLASS}>
              Nombre de la organización
            </Label>
            <Input
              id="tenant-name"
              type="text"
              value={tenantName}
              onChange={(e) => setTenantName(e.target.value)}
              placeholder="Nombre de la organización"
              className="mt-1.5"
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
            <Button
              onClick={handleUserSave}
              disabled={isUserPending || userName === (user.name ?? "")}
            >
              <Save strokeWidth={2} />
              {isUserPending ? SAVING_TEXT : SAVE_TEXT}
            </Button>
            {userSaved && (
              <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                <Check className="size-3.5" strokeWidth={2.5} />
                {SAVED_TEXT}
              </span>
            )}
            {userError && (
              <span className="text-xs text-destructive">{userError}</span>
            )}
          </>
        }
      >
        <div className="flex flex-col gap-4.5">
          {/* Avatar */}
          {user.id && (
            <div>
              <div className={LABEL_CLASS}>Foto de perfil</div>
              <div className="mt-1.5">
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
                <p className="mt-1.5 text-xs text-destructive">{avatarError}</p>
              )}
            </div>
          )}

          {/* Display name */}
          <div>
            <Label htmlFor="user-name" className={LABEL_CLASS}>
              Nombre para mostrar
            </Label>
            <Input
              id="user-name"
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="Tu nombre"
              className="mt-1.5"
            />
          </div>

          {/* Email (read-only) */}
          <ReadOnlyField label="Correo electrónico" value={user.email} />

          {/* Role badge */}
          <div>
            <div className={LABEL_CLASS}>Rol en este tenant</div>
            <div className="mt-1.5">
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
        <div className="flex flex-col gap-3">
          <p className="text-sm leading-relaxed text-muted-foreground">
            {isLastMaster ? DANGER_ZONE.warningLastMaster : DANGER_ZONE.warningNotLastMaster}
          </p>
          {deleteError && (
            <p className="text-xs text-destructive">{deleteError}</p>
          )}
          <div>
            <Button
              type="button"
              variant="outline"
              onClick={() => { setDeleteError(null); setShowDeleteModal(true); }}
              disabled={isDeleting}
              className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              {isDeleting ? DANGER_ZONE.deletingButton : DANGER_ZONE.deleteButton}
            </Button>
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
