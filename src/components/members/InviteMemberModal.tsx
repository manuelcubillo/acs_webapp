"use client";

/**
 * InviteMemberModal — two-tab modal for adding members.
 * Tab "Por email" — sends an invitation email (inviteMemberByEmailAction).
 * Tab "Usuario nuevo" — creates a new account and adds them directly (createAndAddMemberAction).
 */

import { useState } from "react";
import { Loader2, Mail, UserPlus } from "lucide-react";
import { inviteMemberByEmailAction } from "@/lib/actions/invitations";
import { createAndAddMemberAction } from "@/lib/actions/members";
import type { TenantRole } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  title: "Añadir miembro",
  tabEmail: "Por email",
  tabNew: "Usuario nuevo",
  emailLabel: "Email",
  emailPlaceholder: "usuario@ejemplo.com",
  nameLabel: "Nombre",
  namePlaceholder: "Nombre completo",
  usernameLabel: "Nombre de usuario",
  usernamePlaceholder: "usuario",
  usernameHint: "Solo letras minúsculas, números, guiones y puntos",
  passwordLabel: "Contraseña",
  roleLabel: "Rol",
  submitEmail: "Enviar invitación",
  submittingEmail: "Enviando…",
  submitNew: "Crear y añadir",
  submittingNew: "Creando…",
  cancel: "Cancelar",
  errUnknown: "Error desconocido.",
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
      setError(result.error ?? LABELS.errUnknown);
      return;
    }

    setSuccess(tab === "email" ? LABELS.successEmail : LABELS.successNew);
    setTimeout(() => {
      reset();
      onClose();
      onSuccess();
    }, 1200);
  }

  const handleOpenChange = (open: boolean) => {
    if (!open && !loading) handleClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={!loading} className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{LABELS.title}</DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <Tabs
          value={tab}
          onValueChange={(v) => { setTab(v as Tab); reset(); }}
        >
          <TabsList className="w-full">
            <TabsTrigger value="email" className="gap-1.5">
              <Mail className="size-3.5" />
              {LABELS.tabEmail}
            </TabsTrigger>
            <TabsTrigger value="new" className="gap-1.5">
              <UserPlus className="size-3.5" />
              {LABELS.tabNew}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-3.5">
            {/* Email — always shown */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-email">{LABELS.emailLabel}</Label>
              <Input
                id="invite-email"
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(""); }}
                placeholder={LABELS.emailPlaceholder}
              />
            </div>

            {/* Extra fields for "new user" tab */}
            {tab === "new" && (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="invite-name">{LABELS.nameLabel}</Label>
                  <Input
                    id="invite-name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => { setName(e.target.value); setError(""); }}
                    placeholder={LABELS.namePlaceholder}
                    minLength={1}
                    maxLength={100}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="invite-username">{LABELS.usernameLabel}</Label>
                  <Input
                    id="invite-username"
                    type="text"
                    required
                    value={username}
                    onChange={(e) => { setUsername(e.target.value.toLowerCase()); setError(""); }}
                    placeholder={LABELS.usernamePlaceholder}
                    minLength={2}
                    maxLength={50}
                    pattern="^[a-z0-9_.\-]+$"
                    title={LABELS.usernameHint}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="invite-password">{LABELS.passwordLabel}</Label>
                  <Input
                    id="invite-password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(""); }}
                    minLength={8}
                    maxLength={128}
                  />
                </div>
              </>
            )}

            {/* Role — always shown */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-role">{LABELS.roleLabel}</Label>
              <Select value={role} onValueChange={(v) => setRole(v as TenantRole)}>
                <SelectTrigger id="invite-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {assignableRoles.map((r) => (
                    <SelectItem key={r} value={r}>{LABELS.roles[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {success && (
              <Alert>
                <AlertDescription className="text-card-foreground">
                  {success}
                </AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter className="mt-5">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={loading}
            >
              {LABELS.cancel}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="animate-spin" />}
              {loading
                ? tab === "email" ? LABELS.submittingEmail : LABELS.submittingNew
                : tab === "email" ? LABELS.submitEmail : LABELS.submitNew}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
