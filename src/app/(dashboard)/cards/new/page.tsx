/**
 * /cards/new — Create card
 *
 * Requires ?cardTypeId=uuid in the URL.
 * If missing, shows a card type picker instead.
 * Accessible to: admin | master
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdmin, AuthenticationError, AuthorizationError } from "@/lib/api";
import {
  listCardTypes,
  getCardTypeWithFullSchema,
} from "@/lib/dal";
import DashboardShell from "@/components/layout/DashboardShell";
import CardNewClient from "./CardNewClient";
import { Button } from "@/components/ui/button";
import type { FieldDefinitionShape } from "@/lib/validation/types";
import type { ValidationRules } from "@/lib/validation/types";

export const dynamic = "force-dynamic";

const TEXT = {
  TITLE:        "Nuevo carnet",
  PICK_TYPE:    "Selecciona el tipo de tarjeta:",
  NO_TYPES_PRE: "No hay tipos de tarjeta. Crea uno primero en",
  TYPES_LINK:   "Tipos de Tarjeta",
  TYPE_LABEL:   "Tipo:",
  BACK_TO_CARDS: "Volver a Carnets",
} as const;

interface NewCardPageProps {
  searchParams: Promise<{ cardTypeId?: string }>;
}

export default async function NewCardPage({ searchParams }: NewCardPageProps) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  let context;
  try {
    context = await requireAdmin();
  } catch (e) {
    if (e instanceof AuthenticationError) redirect("/login");
    if (e instanceof AuthorizationError) redirect("/cards");
    redirect("/login");
  }

  const { tenantId, role } = context;
  const { cardTypeId } = await searchParams;

  // ── No card type selected → show picker ──────────────────────────────────
  if (!cardTypeId) {
    const cardTypes = await listCardTypes(tenantId).catch(() => []);
    return (
      <DashboardShell title={TEXT.TITLE} role={role}>
        <div className="mx-auto max-w-[480px]">
          <Link
            href="/cards"
            className="mb-5 flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            {TEXT.BACK_TO_CARDS}
          </Link>

          <h1 className="mb-1.5 font-heading text-[22px] font-extrabold text-foreground">
            {TEXT.TITLE}
          </h1>
          <p className="mb-6 text-sm text-muted-foreground">
            {TEXT.PICK_TYPE}
          </p>

          {cardTypes.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              {TEXT.NO_TYPES_PRE}{" "}
              <Link href="/card-types/new" className="text-primary hover:underline">
                {TEXT.TYPES_LINK}
              </Link>
              .
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {cardTypes.map((ct) => (
                <Button
                  key={ct.id}
                  asChild
                  variant="outline"
                  className="h-auto w-full justify-start px-4.5 py-3.5 text-sm font-semibold"
                >
                  <Link href={`/cards/new?cardTypeId=${ct.id}`}>{ct.name}</Link>
                </Button>
              ))}
            </div>
          )}
        </div>
      </DashboardShell>
    );
  }

  // ── Card type selected → show form ────────────────────────────────────────
  let schema;
  try {
    schema = await getCardTypeWithFullSchema(cardTypeId, tenantId);
  } catch {
    redirect("/cards/new");
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

  return (
    <DashboardShell title={TEXT.TITLE} role={role}>
      <div className="mx-auto max-w-[600px] rounded-2xl border bg-card p-7">
        <h1 className="mb-1 font-heading text-xl font-extrabold text-foreground">
          {TEXT.TITLE}
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          {TEXT.TYPE_LABEL} <strong>{schema.name}</strong>
        </p>

        <CardNewClient cardTypeId={cardTypeId} fields={fields} />
      </div>
    </DashboardShell>
  );
}
