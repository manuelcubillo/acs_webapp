"use client";

/**
 * InviteMemberModal — two-tab modal for adding members.
 * Tab "Por email" — sends an invitation email (inviteMemberByEmailAction).
 * Tab "Usuario nuevo" — creates a new account and adds them directly (createAndAddMemberAction).
 */

import { useState } from "react";
import { X, Loader2, Mail, UserPlus } from "lucide-react";
import { inviteMemberByEmailAction } from "@/lib/actions/invitations";
import { createAndAddMemberAction } from "@/lib/actions/members";
import type { TenantRole } from "@/lib/api";

const LABELS = {
  title: "Añadir miembro",
  tabEmail: "Por email",
  tabNew: "Usuario nuevo",
  emailLabel: "Email",
  emailPlaceholder: "usuario@ejemplo.com",
  nameLabel: "Nombre",
  namePlaceholder: "Nombre completo",
  usernameLabel: "Nombre de usuario",
  usernamePlaceholder: "usuario",
  passwordLabel: "Contraseña",
  roleLabel: "Rol",
  submitEmail: "Enviar invitación",
  submittingEmail: "Enviando…",
  submitNew: "Crear y añadir",
  submittingNew: "Creando…",
  cancel: "Cancelar",
  successEmail: "Invitación enviada correctamente.",
  successNew: "Usuario creado y añadido correctamente.",
  roles: {
    operator: "Operador",
    admin: "Administrador",
    master: "Master",
  },
} as const;

const AVAILABLE_ROLES: TenantRole[] = ["operator", "admin", "master"];

interface Props {
  isOpen: boolean;
  actorRole: TenantRole;
  onClose: () => void;
  onSuccess: () => void;
}

type Tab = "email" | "new";

export default function InviteMemberModal({
  isOpen,
  actorRole,
  onClose,
  onSuccess,
}: Props) {
  const [tab, setTab] = useState<Tab>("email");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<TenantRole>("operator");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const roleOrder: Record<TenantRole, number> = { operator: 1, admin: 2, master: 3 };
  const assignableRoles = AVAILABLE_ROLES.filter(
    (r) => roleOrder[r] <= roleOrder[actorRole],
  );

  function reset() {
    setEmail("");
    setName("");
    setUsername("");
    setPassword("");
    setRole("operator");
    setError("");
    setSuccess("");
    setLoading(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    let result;
    if (tab === "email") {
      result = await inviteMemberByEmailAction({ email, role });
    } else {
      result = await createAndAddMemberAction({ email, name, username, password, role });
    }

    setLoading(false);

    if (!result.success) {
      setError(result.error ?? "Error desconocido.");
      return;
    }

    setSuccess(tab === "email" ? LABELS.successEmail : LABELS.successNew);
    setTimeout(() => {
      reset();
      onClose();
      onSuccess();
    }, 1200);
  }

  if (!isOpen) return null;

  const fieldStyle = {
    label: {
      display: "block" as const,
      fontSize: 13,
      fontWeight: 600,
      color: "var(--color-dark)",
      marginBottom: 6,
    },
  };

  return (
    <>
      <div
        onClick={() => !loading && handleClose()}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9998 }}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: "fixed",
          top: "50%", left: "50%",
          transform: "translate(-50%,-50%)",
          zIndex: 9999,
          width: "min(480px, calc(100vw - 32px))",
          background: "#fff",
          borderRadius: 16,
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "20px 20px 0",
        }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--color-dark)" }}>
            {LABELS.title}
          </h2>
          {!loading && (
            <button onClick={handleClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af" }}>
              <X size={18} />
            </button>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, padding: "16px 20px 0", borderBottom: "1px solid var(--color-border-soft)" }}>
          {(["email", "new"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); reset(); }}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 14px",
                border: "none",
                background: "none",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: tab === t ? 600 : 400,
                color: tab === t ? "var(--color-primary)" : "var(--color-muted)",
                borderBottom: tab === t ? "2px solid var(--color-primary)" : "2px solid transparent",
                marginBottom: -1,
              }}
            >
              {t === "email" ? <Mail size={14} /> : <UserPlus size={14} />}
              {t === "email" ? LABELS.tabEmail : LABELS.tabNew}
            </button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: "20px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Email — always shown */}
            <div>
              <label style={fieldStyle.label}>{LABELS.emailLabel}</label>
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(""); }}
                className="form-input"
                placeholder={LABELS.emailPlaceholder}
              />
            </div>

            {/* Extra fields for "new user" tab */}
            {tab === "new" && (
              <>
                <div>
                  <label style={fieldStyle.label}>{LABELS.nameLabel}</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => { setName(e.target.value); setError(""); }}
                    className="form-input"
                    placeholder={LABELS.namePlaceholder}
                    minLength={1}
                    maxLength={100}
                  />
                </div>

                <div>
                  <label style={fieldStyle.label}>{LABELS.usernameLabel}</label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => { setUsername(e.target.value.toLowerCase()); setError(""); }}
                    className="form-input"
                    placeholder={LABELS.usernamePlaceholder}
                    minLength={2}
                    maxLength={50}
                    pattern="^[a-z0-9_.\-]+$"
                    title="Solo letras minúsculas, números, guiones y puntos"
                  />
                </div>

                <div>
                  <label style={fieldStyle.label}>{LABELS.passwordLabel}</label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(""); }}
                    className="form-input"
                    minLength={8}
                    maxLength={128}
                  />
                </div>
              </>
            )}

            {/* Role — always shown */}
            <div>
              <label style={fieldStyle.label}>{LABELS.roleLabel}</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as TenantRole)}
                className="form-input"
              >
                {assignableRoles.map((r) => (
                  <option key={r} value={r}>
                    {LABELS.roles[r]}
                  </option>
                ))}
              </select>
            </div>

            {error && (
              <p style={{ margin: 0, padding: "10px 12px", background: "#fef2f2", color: "#dc2626", borderRadius: 8, fontSize: 13, border: "1px solid #fecaca" }}>
                {error}
              </p>
            )}
            {success && (
              <p style={{ margin: 0, padding: "10px 12px", background: "#f0fdf4", color: "#16a34a", borderRadius: 8, fontSize: 13, border: "1px solid #bbf7d0" }}>
                {success}
              </p>
            )}
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              style={{
                padding: "9px 18px", borderRadius: 9,
                border: "1.5px solid var(--color-border)",
                background: "#fff", cursor: loading ? "not-allowed" : "pointer",
                fontSize: 13, fontWeight: 600, color: "var(--color-secondary)",
                opacity: loading ? 0.5 : 1,
              }}
            >
              {LABELS.cancel}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary"
              style={{ fontSize: 13 }}
            >
              {loading
                ? <><Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} />{tab === "email" ? LABELS.submittingEmail : LABELS.submittingNew}</>
                : tab === "email" ? LABELS.submitEmail : LABELS.submitNew
              }
            </button>
          </div>
        </form>
      </div>
      <style>{`@keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }`}</style>
    </>
  );
}
