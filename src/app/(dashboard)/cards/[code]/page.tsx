/**
 * /cards/[code] — Card Detail
 *
 * Shows all field values for a card + executable actions + scan validation alerts.
 * Accessible to: operator | admin | master
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { Edit, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireOperator, getCurrentUserProfile, AuthenticationError, AuthorizationError } from "@/lib/api";
import {
  getCardByCode,
  getActionsForCardType,
  getDashboardSettings,
  getScanValidationsByCardType,
  listDesignsForCardType,
} from "@/lib/dal";
import { signCardPhotos } from "@/lib/dal/photo-urls";
import { signPhotoForReadOptional } from "@/lib/storage/read";
import { validateScan, hasErrorLevelFailures } from "@/lib/validation/scan-validator";
import { resolveLifecycleGate } from "@/lib/server/lifecycle";
import type { CardDesignLayout } from "@/lib/card-designs/types";
import DashboardShell from "@/components/layout/DashboardShell";
import CardDetailClient from "@/components/cards/CardDetailClient";
import CardStatusBadge from "@/components/shared/CardStatusBadge";
import CardDesignPreviewButton from "@/components/card-designs/CardDesignPreviewButton";

export const dynamic = "force-dynamic";

const TEXT = {
  SHELL_TITLE:    "Detalle de carnet",
  BACK_CARDS:     "Todos los carnets",
  BACK_ARCHIVED:  "Papelera",
  BACK_DASHBOARD: "Vista principal",
  BTN_EDIT:       "Editar",
  CREATED:        "Creado:",
  UPDATED:        "Modificado:",
} as const;

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
  const backHref =
    from === "cards" ? "/cards" : from === "archived" ? "/archived" : "/dashboard";
  const backLabel =
    from === "cards"
      ? TEXT.BACK_CARDS
      : from === "archived"
        ? TEXT.BACK_ARCHIVED
        : TEXT.BACK_DASHBOARD;
  const isAdmin = role === "admin" || role === "master";

  // ── Data ──────────────────────────────────────────────────────────────────
  let card;
  try {
    const raw = await getCardByCode(decodedCode, tenantId);
    // Replace photo object keys with short-lived signed URLs before passing
    // to client components / the design renderer.
    card = await signCardPhotos(raw);
  } catch {
    redirect("/cards");
  }

  // Fetch actions, scan validations, dashboard settings, linked designs, and
  // the current user's topbar profile in parallel
  const [actions, svRules, settings, linkedDesigns, userProfile] = await Promise.all([
    getActionsForCardType(card.cardTypeId).catch(() => []),
    getScanValidationsByCardType(card.cardTypeId).catch(() => []),
    getDashboardSettings(tenantId).catch(() => null),
    listDesignsForCardType(tenantId, card.cardTypeId).catch(() => []),
    getCurrentUserProfile(),
  ]);

  // Run scan validations (pure, never throws)
  const scanResult = validateScan(card.fields, svRules);

  // Lifecycle gate — gates the action buttons and is surfaced by the status
  // badge. The detail page itself stays informational (no scan log, no
  // auto-actions); only manual action execution is affected.
  const lifecycleGate = resolveLifecycleGate(
    card.status,
    settings?.allowOverrideOnError ?? false,
  );

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

  // Flatten card field values into the shapes render.ts expects.
  // After signCardPhotos(), photo `f.value` is already a signed URL.
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

  // Pre-sign every static object key referenced by the preview layout's
  // image nodes so the renderer can resolve them without round-tripping.
  const staticImageUrls: Record<string, string> = {};
  if (previewLayout) {
    const keys = previewLayout.nodes
      .filter((n) => n.type === "image" && n.content.source === "static")
      .map((n) => {
        const c = (n as { content: { staticObjectKey?: string } }).content;
        return c.staticObjectKey ?? null;
      })
      .filter((k): k is string => typeof k === "string" && k.length > 0);
    await Promise.all(
      Array.from(new Set(keys)).map(async (k) => {
        const url = await signPhotoForReadOptional(k);
        if (url) staticImageUrls[k] = url;
      }),
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <DashboardShell
      title={TEXT.SHELL_TITLE}
      role={role}
      userName={userProfile.name ?? undefined}
      userAvatarUrl={userProfile.avatarUrl}
    >
      <div className="mx-auto max-w-[720px]">
        {/* Back + edit — static, no state needed */}
        <div className="mb-5 flex items-center justify-between">
          <Link
            href={backHref}
            className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            {backLabel}
          </Link>

          <div className="flex items-center gap-2">
            {previewLayout && (
              <CardDesignPreviewButton
                layout={previewLayout}
                fieldValues={fieldValues}
                photoValues={photoValues}
                staticImageUrls={staticImageUrls}
                cardCode={card.code}
                designName={previewDesign!.name}
              />
            )}
            {isAdmin && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/cards/${encodeURIComponent(decodedCode)}/edit`}>
                  <Edit className="size-3.5" strokeWidth={1.8} />
                  {TEXT.BTN_EDIT}
                </Link>
              </Button>
            )}
          </div>
        </div>

        {/* Lifecycle status — informational indicator (neutral, not a state color) */}
        <div className="mb-4">
          <CardStatusBadge status={card.status} />
        </div>

        {/*
          CardDetailClient manages:
          - card state (refreshed after each action)
          - scanResult state (re-evaluated after each action)
          - hasBlockingErrors (disables action buttons when true)
          - lifecycleGate (gates action buttons by card status)
          This page does NOT log a scan entry or run auto-actions.
        */}
        <CardDetailClient
          initialCard={card}
          actions={actions}
          initialScanResult={scanResult}
          initialHasBlockingErrors={hasErrorLevelFailures(scanResult)}
          allowOverrideOnError={settings?.allowOverrideOnError ?? false}
          lifecycleGate={lifecycleGate}
        />

        {/* Metadata footer — static */}
        <div className="mt-4 flex gap-5 text-xs text-muted-foreground">
          <span>
            {TEXT.CREATED}{" "}
            {new Date(card.createdAt).toLocaleDateString("es-ES", {
              day: "2-digit", month: "2-digit", year: "numeric",
            })}
          </span>
          {card.updatedAt && card.updatedAt !== card.createdAt && (
            <span>
              {TEXT.UPDATED}{" "}
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
