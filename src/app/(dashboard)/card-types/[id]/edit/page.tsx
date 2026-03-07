/**
 * /card-types/[id]/edit — Edit Card Type Wizard
 *
 * The 4-step wizard pre-populated from the existing card type data.
 * Accessible to: master only
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
import type { WizardInitialData, FieldDefinitionDraft, ActionDefinitionDraft, FieldType, ActionType } from "@/hooks/useCardTypeWizard";

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

  // Map DB data to WizardInitialData
  const initialData: WizardInitialData = {
    cardTypeId: cardType.id,
    basicInfo: {
      name: cardType.name,
      description: cardType.description ?? "",
    },
    fields: cardType.fieldDefinitions
      .filter((f) => f.isActive)
      .sort((a, b) => a.position - b.position)
      .map((f, i): FieldDefinitionDraft => ({
        tempId: crypto.randomUUID(),
        id: f.id,
        name: f.name,
        label: f.label,
        fieldType: f.fieldType as FieldType,
        isRequired: f.isRequired,
        position: i,
        defaultValue: f.defaultValue ?? null,
        validationRules: f.validationRules as { rules: { rule: string; value: unknown; message?: string }[] } | null,
      })),
    actions: cardType.actionDefinitions
      .filter((a) => a.isActive)
      .map((a): ActionDefinitionDraft => ({
        tempId: crypto.randomUUID(),
        id: a.id,
        name: a.name,
        actionType: a.actionType as ActionType,
        config: a.config as Record<string, unknown> | null,
      })),
  };

  return (
    <DashboardShell title={`Editar: ${cardType.name}`} role={role}>
      <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
        <CardTypeWizard initialData={initialData} />
      </div>
    </DashboardShell>
  );
}
