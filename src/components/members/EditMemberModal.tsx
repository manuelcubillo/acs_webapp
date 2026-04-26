"use client";

/**
 * EditMemberModal — edit a member's profile, role, or trigger a password reset.
 */

import { useState } from "react";
import { X, Loader2, Key } from "lucide-react";
import {
  updateMemberProfileAction,
  updateMemberRoleAction,
  triggerPasswordResetForMemberAction,
} from "@/lib/actions/members";
import type { MemberWithUser } from "@/lib/dal";
import type { TenantRole } from "@/lib/api";
import { canAssignRole } from "@/lib/auth/role-hierarchy";

const LABELS = {
  title: "Editar miembro",
  nameLabel: "Nombre",
  namePlaceholder: "Nombre completo",
  emailLabel: "Email",
  emailPlaceholder: "usuario@ejemplo.com",
  roleLabel: "Rol",
  saveProfile: "Guardar perfil",
  savingProfile: "Guardando…",
  saveRole: "Cambiar rol",
  savingRole: "Cambiando…",
  passwordReset: "Enviar email de recuperación de contraseña",
  sendingReset: "Enviando…",
  cancel: "Cancelar",
  roles: {
    operator: "Operador",
    admin: "Administrador",
    master: "Master",
  },
} as const;

const ALL_ROLES: TenantRole[] = ["operator", "admin", "master"];

interface Props {
  isOpen: boolean;
  member: MemberWithUser;
  actorRole: TenantRole;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EditMemberModal({ isOpen, member, actorRole, onClose, onSuccess }: Props) {
  const [name, setName] = useState(member.userName);
  const [email, setEmail] = useState(member.userEmail);
  const [role, setRole] = useState<TenantRole>(member.role as TenantRole);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [loadingRole, setLoadingRole] = useState(false);
  const [loadingReset, setLoadingReset] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const assignableRoles = ALL_ROLES.filter((r) => canAssignRole(actorRole, r));

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  function handleClose() {
    setError("");
    setToast("");
    onClose();
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoadingProfile(true);
    const result = await updateMemberProfileAction(member.id, { name, email });
    setLoadingProfile(false);
    if (!result.success) { setError(result.error ?? "Error al guardar."); return; }
    showToast("Perfil actualizado.");
    onSuccess();
  }

  async function handleSaveRole(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoadingRole(true);
    const result = await updateMemberRoleAction(member.id, { role });
    setLoadingRole(false);
    if (!result.success) { setError(result.error ?? "Error al cambiar rol."); return; }
    showToast("Rol actualizado.");
    onSuccess();
  }

  async function handlePasswordReset() {
    setError("");
    setLoadingReset(true);
    const result = await triggerPasswordResetForMemberAction(member.id);
    setLoadingReset(false);
    if (!result.success) { setError(result.error ?? "Error al enviar email."); return; }
    showToast(`Email enviado a ${result.data.email}.`);
  }

  if (!isOpen) return null;

  return (
    <>
      <div onClick={() => !loadingProfile && !loadingRole && handleClose()} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9998 }} aria-hidden="true" />
      <div role="dialog" aria-modal="true" style={{
        position: "fixed", top: "50%", left: "50%",
        transform: "translate(-50%,-50%)", zIndex: 9999,
        width: "min(520px, calc(100vw - 32px))",
        background: "#fff", borderRadius: 16,
        boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
        overflow: "hidden", maxHeight: "90vh", overflowY: "auto",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 20px 16px", borderBottom: "1px solid var(--color-border-soft)" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--color-dark)" }}>{LABELS.title}</h2>
          <button onClick={handleClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af" }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 20 }}>
          {error && (
            <p style={{ margin: 0, padding: "10px 12px", background: "#fef2f2", color: "#dc2626", borderRadius: 8, fontSize: 13, border: "1px solid #fecaca" }}>
              {error}
            </p>
          )}
          {toast && (
            <p style={{ margin: 0, padding: "10px 12px", background: "#f0fdf4", color: "#16a34a", borderRadius: 8, fontSize: 13, border: "1px solid #bbf7d0" }}>
              {toast}
            </p>
          )}

          {/* Profile section */}
          <section>
            <h3 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 600, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Perfil
            </h3>
            <form onSubmit={handleSaveProfile} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--color-dark)", marginBottom: 5 }}>{LABELS.nameLabel}</label>
                <input type="text" required value={name} onChange={(e) => setName(e.target.value)} className="form-input" placeholder={LABELS.namePlaceholder} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--color-dark)", marginBottom: 5 }}>{LABELS.emailLabel}</label>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="form-input" placeholder={LABELS.emailPlaceholder} />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button type="submit" disabled={loadingProfile} className="btn btn-primary" style={{ fontSize: 13 }}>
                  {loadingProfile ? <><Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} />{LABELS.savingProfile}</> : LABELS.saveProfile}
                </button>
              </div>
            </form>
          </section>

          {/* Role section */}
          <section style={{ borderTop: "1px solid var(--color-border-soft)", paddingTop: 20 }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 600, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Rol
            </h3>
            <form onSubmit={handleSaveRole} style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--color-dark)", marginBottom: 5 }}>{LABELS.roleLabel}</label>
                <select value={role} onChange={(e) => setRole(e.target.value as TenantRole)} className="form-input">
                  {assignableRoles.map((r) => (
                    <option key={r} value={r}>{LABELS.roles[r]}</option>
                  ))}
                </select>
              </div>
              <button type="submit" disabled={loadingRole || role === member.role} className="btn btn-primary" style={{ fontSize: 13, flexShrink: 0 }}>
                {loadingRole ? <><Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} />{LABELS.savingRole}</> : LABELS.saveRole}
              </button>
            </form>
          </section>

          {/* Password reset */}
          <section style={{ borderTop: "1px solid var(--color-border-soft)", paddingTop: 20 }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 600, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Contraseña
            </h3>
            <button
              onClick={handlePasswordReset}
              disabled={loadingReset}
              style={{
                display: "flex", alignItems: "center", gap: 7,
                padding: "9px 16px", borderRadius: 9,
                border: "1.5px solid var(--color-border)",
                background: "#fff", cursor: loadingReset ? "not-allowed" : "pointer",
                fontSize: 13, fontWeight: 500, color: "var(--color-dark)",
                opacity: loadingReset ? 0.7 : 1,
              }}
            >
              {loadingReset
                ? <Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} />
                : <Key size={13} />
              }
              {loadingReset ? LABELS.sendingReset : LABELS.passwordReset}
            </button>
          </section>
        </div>
      </div>
      <style>{`@keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }`}</style>
    </>
  );
}
