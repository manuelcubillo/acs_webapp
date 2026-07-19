/**
 * /card-types — Card Type List
 *
 * Lists all card types for the current tenant.
 * Accessible to: operator | admin | master
 * Edit buttons shown to: master only
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import {
  requireOperator,
  getCurrentUserProfile,
  AuthenticationError,
} from "@/lib/api";
import { getCardTypeWithFullSchema, listCardTypes } from "@/lib/dal";
import DashboardShell from "@/components/layout/DashboardShell";
import CardTypeList from "@/components/card-types/CardTypeList";
import FlashMessage from "@/components/shared/FlashMessage";
import { Button } from "@/components/ui/button";
import type { CardTypeWithFullSchema } from "@/lib/dal";

export const dynamic = "force-dynamic";

const TEXT = {
  TITLE:        "Tipos de Carnets",
  EMPTY:        "No hay tipos definidos todavía.",
  COUNT_SINGLE: "tipo de tarjeta",
  COUNT_PLURAL: "tipos de tarjeta",
  BTN_NEW:      "Nuevo tipo",
} as const;

/**
 * Resolve a lifecycle redirect flash code to a message. `type-archived` carries
 * the cascade size in `n` (how many cards were archived with the type).
 */
function resolveFlash(flash?: string, n?: string): string | undefined {
  if (flash !== "type-archived") return undefined;
  const count = Number(n);
  if (!Number.isFinite(count) || count <= 0) {
    return "Tipo de carnet archivado. Se ha movido a la papelera.";
  }
  const cards = count === 1 ? "carnet" : "carnets";
  return `Tipo de carnet archivado, junto con ${count} ${cards}.`;
}

interface CardTypesPageProps {
  searchParams: Promise<{ flash?: string; n?: string }>;
}

export default async function CardTypesPage({
  searchParams,
}: CardTypesPageProps) {
  // ── Auth guard ────────────────────────────────────────────────────────────
  let context;
  try {
    context = await requireOperator();
  } catch (e) {
    if (e instanceof AuthenticationError) redirect("/login");
    redirect("/dashboard");
  }

  const { tenantId, role } = context;
  const isMaster = role === "master";

  const { flash, n } = await searchParams;
  const flashMessage = resolveFlash(flash, n);

  // ── Data fetching ─────────────────────────────────────────────────────────
  // listCardTypes returns CardType[], but we need full schema for the card stats.
  // Fetch basic list first, then enrich (small tenants won't have many types).
  const [baseTypes, userProfile] = await Promise.all([
    listCardTypes(tenantId).catch(() => []),
    getCurrentUserProfile(),
  ]);

  const cardTypes: CardTypeWithFullSchema[] = (
    await Promise.all(
      baseTypes.map((ct) =>
        getCardTypeWithFullSchema(ct.id, tenantId).catch(() => null),
      ),
    )
  ).filter((ct): ct is CardTypeWithFullSchema => ct !== null);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <DashboardShell
      title={TEXT.TITLE}
      role={role}
      userName={userProfile.name ?? undefined}
      userAvatarUrl={userProfile.avatarUrl}
    >
      {/* One-shot confirmation after a lifecycle redirect. */}
      <FlashMessage message={flashMessage} />

      {/* Page header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-extrabold text-foreground">
            {TEXT.TITLE}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {cardTypes.length === 0
              ? TEXT.EMPTY
              : `${cardTypes.length} ${cardTypes.length !== 1 ? TEXT.COUNT_PLURAL : TEXT.COUNT_SINGLE}`}
          </p>
        </div>

        {isMaster && (
          <Button asChild>
            <Link href="/card-types/new">
              <Plus className="size-4" strokeWidth={2} />
              {TEXT.BTN_NEW}
            </Link>
          </Button>
        )}
      </div>

      {/* List */}
      <CardTypeList cardTypes={cardTypes} canEdit={isMaster} />
    </DashboardShell>
  );
}
