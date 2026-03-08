/**
 * /card-types/[id]/edit — Edit Card Type Wizard
 *
 * The 5-step wizard pre-populated from the existing card type data.
 * Accessible to: master only
 *
 * Key mapping convention:
 *   Each existing FieldDefinitionDraft uses the DB field `id` as its `tempId`.
 *   This allows ActionDefinitionDraft.targetFieldTempId and
 *   ScanValidationDraft.fieldTempId to directly reference existing field IDs,
 *   which simplifies the tempId→realId resolution in the hook's submit logic.
 */

import { redirect, notFound } from "next/navigation";
import {
  requireMaster,
  AuthenticationError,
  AuthorizationError,
} from "@/lib/api";
import { getCardTypeWithFullSchema } from "@/lib/dal";
import DashboardShell from "@/components/layout/DashboardShell";
import CardTypeWizard from "@/components/card-types/CardTypeWizard";
import type {
  WizardInitialData,
  FieldDefinitionDraft,
  ActionDefinitionDraft,
  ScanValidationDraft,
  FieldType,
  ActionType,
  ScanValidationSeverity,
} from "@/hooks/useCardTypeWizard";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditCardTypePage({ params }: PageProps) {
  const { id } = await params;

  // ── Auth guard ─────────────────────────────────────────────────────────────
  let context;
  try {
    context = await requireMaster();
  } catch (e) {
    if (e instanceof AuthenticationError) redirect("/login");
    if (e instanceof AuthorizationError) redirect(`/card-types/${id}`);
    redirect("/login");
  }

  const { tenantId, role } = context;

  // ── Data fetching ──────────────────────────────────────────────────────────
  let cardType;
  try {
    cardType = await getCardTypeWithFullSchema(id, tenantId);
  } catch {
    notFound();
  }

  // Map DB fields to FieldDefinitionDraft.
  // Convention: tempId === field.id (DB UUID) so actions and scan validations
  // can reference them by targetFieldTempId / fieldTempId directly.
  const fieldDrafts: FieldDefinitionDraft[] = cardType.fieldDefinitions
    .filter((f) => f.isActive)
    .sort((a, b) => a.position - b.position)
    .map((f, i) => ({
      tempId: f.id,       // <— key convention: tempId === DB id
      id: f.id,
      name: f.name,
      label: f.label,
      fieldType: f.fieldType as FieldType,
      isRequired: f.isRequired,
      position: i,
      defaultValue: f.defaultValue ?? null,
      validationRules: f.validationRules as { rules: { rule: string; value: unknown; message?: string }[] } | null,
    }));

  // Map action definitions. targetFieldTempId === targetFieldDefinitionId
  // (which matches the field draft's tempId === field.id convention).
  const actionDrafts: ActionDefinitionDraft[] = cardType.actionDefinitions
    .filter((a) => a.isActive)
    .map((a) => ({
      tempId: crypto.randomUUID(),
      id: a.id,
      name: a.name,
      actionType: a.actionType as ActionType,
      targetFieldTempId: a.targetFieldDefinitionId,  // DB ID matches field tempId
      config: a.config as { amount?: number } | null,
      icon: a.icon ?? null,
      color: a.color ?? null,
      position: a.position,
    }));

  // Map scan validation definitions. fieldTempId === fieldDefinitionId.
  const scanValidationDrafts: ScanValidationDraft[] = cardType.scanValidations
    .filter((sv) => sv.isActive)
    .sort((a, b) => a.position - b.position)
    .map((sv) => ({
      tempId: crypto.randomUUID(),
      id: sv.id,
      fieldTempId: sv.fieldDefinitionId,   // DB ID matches field tempId
      rule: sv.rule,
      value: sv.value,
      errorMessage: sv.errorMessage,
      severity: sv.severity as ScanValidationSeverity,
      position: sv.position,
    }));

  const initialData: WizardInitialData = {
    cardTypeId: cardType.id,
    basicInfo: {
      name: cardType.name,
      description: cardType.description ?? "",
    },
    fields: fieldDrafts,
    actions: actionDrafts,
    scanValidations: scanValidationDrafts,
  };

  return (
    <DashboardShell title={`Editar: ${cardType.name}`} role={role}>
      <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
        <CardTypeWizard initialData={initialData} />
      </div>
    </DashboardShell>
  );
}
