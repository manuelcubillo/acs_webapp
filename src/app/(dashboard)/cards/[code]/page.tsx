/**
 * /cards/[code] — Card Detail
 *
 * Shows all field values for a card + executable actions + scan validation alerts.
 * Accessible to: operator | admin | master
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { Edit, ArrowLeft } from "lucide-react";
import { requireOperator, AuthenticationError, AuthorizationError } from "@/lib/api";
import {
  getCardByCode,
  getActionsForCardType,
  getDashboardSettings,
  getScanValidationsByCardType,
  listDesignsForCardType,
} from "@/lib/dal";
import { validateScan, hasErrorLevelFailures } from "@/lib/validation/scan-validator";
import type { CardDesignLayout } from "@/lib/card-designs/types";
import DashboardShell from "@/components/layout/DashboardShell";
import CardDetailClient from "@/components/cards/CardDetailClient";
import CardDesignPreviewButton from "@/components/card-designs/CardDesignPreviewButton";

export const dynamic = "force-dynamic";

interface CardDetailPageProps {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ from?: string }>;
}

export default async function CardDetailPage({ params, searchParams }: CardDetailPageProps) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  let context;
  try {
    context = await requireOperator();
  } catch (e) {
    if (e instanceof AuthenticationError) redirect("/login");
    if (e instanceof AuthorizationError) redirect("/login");
    redirect("/login");
  }

  const { tenantId, role } = context;
  const [{ code }, { from }] = await Promise.all([params, searchParams]);
  const decodedCode = decodeURIComponent(code);

  // Dynamic back link based on where the user navigated from
  const backHref = from === "cards" ? "/cards" : "/dashboard";
  const backLabel = from === "cards" ? "Todos los carnets" : "Vista principal";
  const isAdmin = role === "admin" || role === "master";

  // ── Data ──────────────────────────────────────────────────────────────────
  let card;
  try {
    card = await getCardByCode(decodedCode, tenantId);
  } catch {
    redirect("/cards");
  }

  // Fetch actions, scan validations, dashboard settings, and linked designs in parallel
  const [actions, svRules, settings, linkedDesigns] = await Promise.all([
    getActionsForCardType(card.cardTypeId).catch(() => []),
    getScanValidationsByCardType(card.cardTypeId).catch(() => []),
    getDashboardSettings(tenantId).catch(() => null),
    listDesignsForCardType(tenantId, card.cardTypeId).catch(() => []),
  ]);

  // Run scan validations (pure, never throws)
  const scanResult = validateScan(card.fields, svRules);

  // Pick the "card" kind design (most common for physical card preview)
  const previewDesign = linkedDesigns.find((d) => d.kind === "card") ?? linkedDesigns[0] ?? null;
  const previewLayout = previewDesign
    ? (() => {
        try {
          const raw = previewDesign.layout as unknown;
          if (raw && typeof raw === "object" && "version" in (raw as object)) {
            return raw as CardDesignLayout;
          }
        } catch { /* fall through */ }
        return null;
      })()
    : null;

  // Flatten card field values into the shapes render.ts expects
  const fieldValues: Record<string, string> = {};
  const photoValues: Record<string, string> = {};
  for (const f of card.fields) {
    if (f.fieldType === "photo") {
      photoValues[f.fieldDefinitionId] = String(f.value ?? "");
    } else if (f.fieldType === "boolean") {
      fieldValues[f.fieldDefinitionId] = f.value ? "Sí" : "No";
    } else if (f.fieldType === "date" && f.value) {
      fieldValues[f.fieldDefinitionId] = new Date(f.value as string).toLocaleDateString("es-ES");
    } else {
      fieldValues[f.fieldDefinitionId] = String(f.value ?? "");
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <DashboardShell title="Detalle de carnet" role={role}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        {/* Back + edit — static, no state needed */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
        }}>
          <Link
            href={backHref}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              color: "var(--color-muted)", textDecoration: "none",
              fontSize: 13, fontWeight: 500,
            }}
          >
            <ArrowLeft size={15} />
            {backLabel}
          </Link>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {previewLayout && (
              <CardDesignPreviewButton
                layout={previewLayout}
                fieldValues={fieldValues}
                photoValues={photoValues}
                cardCode={card.code}
                designName={previewDesign!.name}
              />
            )}
            {isAdmin && (
              <Link
                href={`/cards/${encodeURIComponent(decodedCode)}/edit`}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "8px 14px", borderRadius: 8,
                  border: "1.5px solid var(--color-border)",
                  background: "#fff", textDecoration: "none",
                  fontSize: 13, fontWeight: 600,
                  color: "var(--color-dark)",
                }}
              >
                <Edit size={14} strokeWidth={1.8} />
                Editar
              </Link>
            )}
          </div>
        </div>

        {/*
          CardDetailClient manages:
          - card state (refreshed after each action)
          - scanResult state (re-evaluated after each action)
          - hasBlockingErrors (disables action buttons when true)
          This page does NOT log a scan entry or run auto-actions.
        */}
        <CardDetailClient
          initialCard={card}
          actions={actions}
          initialScanResult={scanResult}
          initialHasBlockingErrors={hasErrorLevelFailures(scanResult)}
          allowOverrideOnError={settings?.allowOverrideOnError ?? false}
        />

        {/* Metadata footer — static */}
        <div style={{
          marginTop: 16, fontSize: 12,
          color: "var(--color-muted)",
          display: "flex", gap: 20,
        }}>
          <span>
            Creado:{" "}
            {new Date(card.createdAt).toLocaleDateString("es-ES", {
              day: "2-digit", month: "2-digit", year: "numeric",
            })}
          </span>
          {card.updatedAt && card.updatedAt !== card.createdAt && (
            <span>
              Modificado:{" "}
              {new Date(card.updatedAt).toLocaleDateString("es-ES", {
                day: "2-digit", month: "2-digit", year: "numeric",
              })}
            </span>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
