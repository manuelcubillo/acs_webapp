"use client";

/**
 * EditMemberModal — edit a member's profile, role, or trigger a password reset.
 */

import { useState } from "react";
import { Loader2, Key } from "lucide-react";
import {
  updateMemberProfileAction,
  updateMemberRoleAction,
  triggerPasswordResetForMemberAction,
} from "@/lib/actions/members";
import type { MemberWithUser } from "@/lib/dal";
import type { TenantRole } from "@/lib/api";
import { canAssignRole } from "@/lib/auth/role-hierarchy";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const LABELS = {
  title: "Editar miembro",
  nameLabel: "Nombre",
  namePlaceholder: "Nombre completo",
  emailLabel: "Email",
  emailPlaceholder: "usuario@ejemplo.com",
  roleLabel: "Rol",
  sectionProfile: "Perfil",
  sectionRole: "Rol",
  sectionPassword: "Contraseña",
  saveProfile: "Guardar perfil",
  savingProfile: "Guardando…",
  saveRole: "Cambiar rol",
  savingRole: "Cambiando…",
  passwordReset: "Enviar email de recuperación de contraseña",
  sendingReset: "Enviando…",
  cancel: "Cancelar",
  errProfile: "Error al guardar.",
  errRole: "Error al cambiar rol.",
  errReset: "Error al enviar email.",
  okProfile: "Perfil actualizado.",
  okRole: "Rol actualizado.",
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
    if (!result.success) { setError(result.error ?? LABELS.errProfile); return; }
    showToast(LABELS.okProfile);
    onSuccess();
  }

  async function handleSaveRole(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoadingRole(true);
    const result = await updateMemberRoleAction(member.id, { role });
    setLoadingRole(false);
    if (!result.success) { setError(result.error ?? LABELS.errRole); return; }
    showToast(LABELS.okRole);
    onSuccess();
  }

  async function handlePasswordReset() {
    setError("");
    setLoadingReset(true);
    const result = await triggerPasswordResetForMemberAction(member.id);
    setLoadingReset(false);
    if (!result.success) { setError(result.error ?? LABELS.errReset); return; }
    showToast(`Email enviado a ${result.data.email}.`);
  }

  const handleOpenChange = (open: boolean) => {
    if (!open && !loadingProfile && !loadingRole) handleClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-[520px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{LABELS.title}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {toast && (
            <Alert>
              <AlertDescription className="text-card-foreground">
                {toast}
              </AlertDescription>
            </Alert>
          )}

          {/* Profile section */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {LABELS.sectionProfile}
            </h3>
            <form onSubmit={handleSaveProfile} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-member-name">{LABELS.nameLabel}</Label>
                <Input
                  id="edit-member-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={LABELS.namePlaceholder}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-member-email">{LABELS.emailLabel}</Label>
                <Input
                  id="edit-member-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={LABELS.emailPlaceholder}
                />
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={loadingProfile}>
                  {loadingProfile && <Loader2 className="animate-spin" />}
                  {loadingProfile ? LABELS.savingProfile : LABELS.saveProfile}
                </Button>
              </div>
            </form>
          </section>

          {/* Role section */}
          <section className="border-t pt-5">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {LABELS.sectionRole}
            </h3>
            <form onSubmit={handleSaveRole} className="flex items-end gap-2.5">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor="edit-member-role">{LABELS.roleLabel}</Label>
                <Select value={role} onValueChange={(v) => setRole(v as TenantRole)}>
                  <SelectTrigger id="edit-member-role" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {assignableRoles.map((r) => (
                      <SelectItem key={r} value={r}>{LABELS.roles[r]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" disabled={loadingRole || role === member.role}>
                {loadingRole && <Loader2 className="animate-spin" />}
                {loadingRole ? LABELS.savingRole : LABELS.saveRole}
              </Button>
            </form>
          </section>

          {/* Password reset */}
          <section className="border-t pt-5">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {LABELS.sectionPassword}
            </h3>
            <Button
              type="button"
              variant="outline"
              onClick={handlePasswordReset}
              disabled={loadingReset}
            >
              {loadingReset ? <Loader2 className="animate-spin" /> : <Key />}
              {loadingReset ? LABELS.sendingReset : LABELS.passwordReset}
            </Button>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
