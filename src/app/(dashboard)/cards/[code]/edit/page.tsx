/**
 * /cards/[code]/edit — Edit card field values
 *
 * The card code itself cannot be changed here.
 * Accessible to: admin | master
 */

import { redirect } from "next/navigation";
import { requireAdmin, getCurrentUserProfile, AuthenticationError, AuthorizationError } from "@/lib/api";
import {
  getCardByCode,
  getCardTypeWithFullSchema,
} from "@/lib/dal";
import { buildPhotoReadUrlMap } from "@/lib/dal/photo-urls";
import {
  resolveCardOrigin,
  type RawOriginParams,
} from "@/lib/cards/return-origin";
import DashboardShell from "@/components/layout/DashboardShell";
import CardEditClient from "./CardEditClient";
import CardLifecycleControls from "@/components/cards/CardLifecycleControls";
import type { FieldDefinitionShape } from "@/lib/validation/types";
import type { ValidationRules } from "@/lib/validation/types";

export const dynamic = "force-dynamic";

const TEXT = {
  TITLE:     "Editar carnet",
  CODE:      "Código:",
} as const;

interface EditCardPageProps {
  params: Promise<{ code: string }>;
  /**
   * The origin the card detail was reached from, forwarded here so leaving the
   * editor returns to that detail with its back link — and therefore the
   * operator's filtered list — still intact. See `@/lib/cards/return-origin`.
   */
  searchParams: Promise<RawOriginParams>;
}

export default async function EditCardPage({ params, searchParams }: EditCardPageProps) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  let context;
  try {
    context = await requireAdmin();
  } catch (e) {
    if (e instanceof AuthenticationError) redirect("/login");
    if (e instanceof AuthorizationError) redirect("/cards");
    throw e;
  }

  const { tenantId, role } = context;
  const [{ code }, originParams] = await Promise.all([params, searchParams]);
  const decodedCode = decodeURIComponent(code);

  // Cancelling or saving returns to the detail page carrying the same origin,
  // so its back link still points at the list the operator started from.
  const { forwardQuery, cardListQuery } = resolveCardOrigin(originParams);
  const detailHref = `/cards/${encodeURIComponent(decodedCode)}${forwardQuery}`;

  // ── Data ──────────────────────────────────────────────────────────────────
  let card;
  try {
    card = await getCardByCode(decodedCode, tenantId);
  } catch {
    redirect("/cards");
  }

  let schema;
  try {
    schema = await getCardTypeWithFullSchema(card.cardTypeId, tenantId);
  } catch {
    redirect("/cards");
  }

  const fields: FieldDefinitionShape[] = schema.fieldDefinitions
    .filter((f) => f.isActive)
    .map((f) => ({
      id: f.id,
      name: f.name,
      label: f.label,
      fieldType: f.fieldType,
      isRequired: f.isRequired,
      validationRules: f.validationRules as ValidationRules | null,
    }));

  // Build initial values map from existing field values.
  const initialValues: Record<string, unknown> = {};
  for (const fv of card.fields) {
    initialValues[fv.fieldDefinitionId] = fv.value;
  }

  // Pre-sign photo keys so the form can preview them without round-tripping.
  const [photoReadUrls, userProfile] = await Promise.all([
    buildPhotoReadUrlMap(card),
    getCurrentUserProfile(),
  ]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <DashboardShell
      title={TEXT.TITLE}
      role={role}
      userName={userProfile.name ?? undefined}
      userAvatarUrl={userProfile.avatarUrl}
    >
      <div className="mx-auto flex max-w-[600px] flex-col gap-6">
        <div className="rounded-xl border bg-card p-7">
          <h1 className="mb-1 font-heading text-xl font-extrabold text-foreground">
            {TEXT.TITLE}
          </h1>
          <p className="mb-6 text-sm text-muted-foreground">
            {TEXT.CODE}{" "}
            <span className="font-mono font-bold">{decodedCode}</span>
          </p>

          <CardEditClient
            cardId={card.id}
            cardCode={decodedCode}
            fields={fields}
            initialValues={initialValues}
            photoReadUrls={photoReadUrls}
            returnHref={detailHref}
          />
        </div>

        {/* Lifecycle state controls (admin) — activate / deactivate / archive. */}
        <CardLifecycleControls
          cardId={card.id}
          initialStatus={card.status}
          listQuery={cardListQuery}
        />
      </div>
    </DashboardShell>
  );
}
