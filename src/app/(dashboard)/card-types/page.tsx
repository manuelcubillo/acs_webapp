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
  AuthenticationError,
} from "@/lib/api";
import { getCardTypeWithFullSchema, listCardTypes } from "@/lib/dal";
import DashboardShell from "@/components/layout/DashboardShell";
import CardTypeList from "@/components/card-types/CardTypeList";
import type { CardTypeWithFullSchema } from "@/lib/dal";

export const dynamic = "force-dynamic";

export default async function CardTypesPage() {
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

  // ── Data fetching ─────────────────────────────────────────────────────────
  // listCardTypes returns CardType[], but we need full schema for the card stats.
  // Fetch basic list first, then enrich (small tenants won't have many types).
  const baseTypes = await listCardTypes(tenantId).catch(() => []);

  const cardTypes: CardTypeWithFullSchema[] = (
    await Promise.all(
      baseTypes.map((ct) =>
        getCardTypeWithFullSchema(ct.id, tenantId).catch(() => null),
      ),
    )
  ).filter((ct): ct is CardTypeWithFullSchema => ct !== null);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <DashboardShell title="Tipos de Tarjeta" role={role}>
      {/* Page header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 24,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 800,
              fontFamily: "var(--font-heading)",
              color: "var(--color-dark)",
              margin: 0,
            }}
          >
            Tipos de Tarjeta
          </h1>
          <p
            style={{
              fontSize: 13.5,
              color: "var(--color-secondary)",
              marginTop: 4,
            }}
          >
            {cardTypes.length === 0
              ? "No hay tipos definidos todavía."
              : `${cardTypes.length} tipo${cardTypes.length !== 1 ? "s" : ""} de tarjeta`}
          </p>
        </div>

        {isMaster && (
          <Link href="/card-types/new" className="btn btn-primary">
            <Plus size={16} strokeWidth={2} />
            Nuevo tipo
          </Link>
        )}
      </div>

      {/* List */}
      <CardTypeList cardTypes={cardTypes} canEdit={isMaster} />
    </DashboardShell>
  );
}
