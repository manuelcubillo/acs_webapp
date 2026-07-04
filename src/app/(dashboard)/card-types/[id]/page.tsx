/**
 * /card-types/[id] — Card Type Detail
 *
 * Shows the full schema of a card type: fields and action definitions.
 * Accessible to: operator | admin | master
 * Edit button shown to: master only
 */

import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import {
  requireOperator,
  AuthenticationError,
} from "@/lib/api";
import { getCardTypeWithFullSchema } from "@/lib/dal";
import { listDesignsForCardType } from "@/lib/dal";
import DashboardShell from "@/components/layout/DashboardShell";
import CardTypeLinkedDesigns from "@/components/card-types/CardTypeLinkedDesigns";
import { FieldTypeDisplay } from "@/components/card-types/fields/FieldTypeSelector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Pencil,
  CreditCard,
  TrendingUp,
  TrendingDown,
  CheckSquare,
  Square,
  AlertCircle,
  AlertTriangle,
  CircleDot,
  CircleOff,
} from "lucide-react";
import type { ActionDefinitionWithField, ScanValidationWithField, FieldType } from "@/lib/dal";

export const dynamic = "force-dynamic";

const TEXT = {
  BREADCRUMB:        "Tipos de Tarjeta",
  ACTIVE:            "Activo",
  INACTIVE:          "Inactivo",
  BTN_EDIT:          "Editar",
  STAT_FIELDS:       "Campos",
  STAT_REQUIRED:     "Obligatorios",
  STAT_ACTIONS:      "Acciones",
  STAT_VALIDATIONS:  "Validaciones",
  SECTION_FIELDS:    "Campos del esquema",
  SECTION_ACTIONS:   "Acciones",
  SECTION_SCANVAL:   "Validaciones de escaneo",
  EMPTY_FIELDS:      "No hay campos definidos.",
  EMPTY_ACTIONS:     "Sin acciones definidas.",
  EMPTY_SCANVAL:     "Sin validaciones definidas.",
  REQUIRED:          "Obligatorio",
  DEFAULT_PREFIX:    "Defecto:",
  SEVERITY_ERROR:    "Error",
  SEVERITY_WARNING:  "Aviso",
  META_ID:           "ID:",
  META_CREATED:      "Creado:",
  META_UPDATED:      "Actualizado:",
} as const;

// ─── Action type display metadata ─────────────────────────────────────────────
// Decorative action-type categories (NOT access-control state). Uses the
// Tailwind emerald/rose palette + brand/neutral tokens, matching CardActions.tsx.
const ACTION_TYPE_META_DETAIL = {
  increment: { icon: TrendingUp,   classes: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400", label: "Incrementar" },
  decrement: { icon: TrendingDown, classes: "bg-rose-500/15 text-rose-600 dark:text-rose-400", label: "Decrementar" },
  check:     { icon: CheckSquare,  classes: "bg-accent text-primary", label: "Marcar Sí" },
  uncheck:   { icon: Square,       classes: "bg-muted text-muted-foreground", label: "Marcar No" },
} as const;

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CardTypeDetailPage({ params }: PageProps) {
  const { id } = await params;

  // ── Auth guard ─────────────────────────────────────────────────────────────
  let context;
  try {
    context = await requireOperator();
  } catch (e) {
    if (e instanceof AuthenticationError) redirect("/login");
    redirect("/dashboard");
  }

  const { tenantId, role } = context;
  const isMaster = role === "master";

  // ── Data fetching ──────────────────────────────────────────────────────────
  let cardType;
  try {
    cardType = await getCardTypeWithFullSchema(id, tenantId);
  } catch {
    notFound();
  }

  const linkedDesigns = await listDesignsForCardType(tenantId, id).catch(() => []);

  const activeFields = cardType.fieldDefinitions.filter((f) => f.isActive);
  const activeActions = (cardType.actionDefinitions as ActionDefinitionWithField[]).filter((a) => a.isActive);
  const activeScanValidations = (cardType.scanValidations as ScanValidationWithField[]).filter((sv) => sv.isActive);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <DashboardShell title={cardType.name} role={role}>
      {/* Breadcrumb */}
      <div className="mb-6 flex items-center gap-2">
        <Link
          href="/card-types"
          className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" strokeWidth={2} />
          {TEXT.BREADCRUMB}
        </Link>
        <span className="text-sm text-border">/</span>
        <span className="text-sm font-semibold text-foreground">
          {cardType.name}
        </span>
      </div>

      {/* Header card */}
      <div className="animate-fadein mb-6 rounded-xl border bg-card px-7 py-6 shadow-sm">
        <div className="flex items-start gap-4.5">
          {/* Icon */}
          <div
            className={cn(
              "flex size-14 shrink-0 items-center justify-center rounded-xl border",
              cardType.isActive
                ? "bg-accent text-primary"
                : "bg-muted text-muted-foreground",
            )}
          >
            <CreditCard className="size-6.5" strokeWidth={1.6} />
          </div>

          {/* Info */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-heading text-[22px] font-extrabold text-foreground">
                {cardType.name}
              </h1>
              <Badge variant={cardType.isActive ? "outline" : "secondary"}>
                {cardType.isActive ? (
                  <CircleDot strokeWidth={2} />
                ) : (
                  <CircleOff strokeWidth={2} />
                )}
                {cardType.isActive ? TEXT.ACTIVE : TEXT.INACTIVE}
              </Badge>
            </div>
            {cardType.description && (
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {cardType.description}
              </p>
            )}
            <div className="mt-2.5 flex gap-5">
              <StatChip label={TEXT.STAT_FIELDS} value={activeFields.length} />
              <StatChip label={TEXT.STAT_REQUIRED} value={activeFields.filter(f => f.isRequired).length} />
              <StatChip label={TEXT.STAT_ACTIONS} value={activeActions.length} />
              <StatChip label={TEXT.STAT_VALIDATIONS} value={activeScanValidations.length} />
            </div>
          </div>

          {/* Edit button */}
          {isMaster && (
            <Button asChild variant="secondary" className="shrink-0">
              <Link href={`/card-types/${cardType.id}/edit`}>
                <Pencil strokeWidth={2} />
                {TEXT.BTN_EDIT}
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Layout: fields (wide) + right column (actions + scan validations) */}
      <div className="grid items-start gap-6 [grid-template-columns:1fr_320px]">

        {/* Fields */}
        <div className="animate-fadein overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <div className="font-heading text-sm font-bold text-foreground">
              {TEXT.SECTION_FIELDS}
            </div>
            <Badge variant="outline">{activeFields.length}</Badge>
          </div>

          {activeFields.length === 0 ? (
            <div className="px-5 py-9 text-center text-sm italic text-muted-foreground">
              {TEXT.EMPTY_FIELDS}
            </div>
          ) : (
            <div className="flex flex-col gap-2.5 px-5 py-4">
              {activeFields.map((field, i) => (
                <div
                  key={field.id}
                  className="flex items-start gap-3.5 rounded-xl border bg-muted/40 px-4 py-3.5"
                >
                  {/* Position */}
                  <div className="flex size-5.5 shrink-0 items-center justify-center rounded-md bg-accent text-[11px] font-bold text-primary">
                    {i + 1}
                  </div>

                  {/* Field type (read-only, compact chip) */}
                  <div className="w-32 shrink-0">
                    <FieldTypeDisplay value={field.fieldType as FieldType} />
                  </div>

                  {/* Field info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">
                        {field.label}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {field.name}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {field.isRequired && (
                        <Badge variant="outline">{TEXT.REQUIRED}</Badge>
                      )}
                      {field.defaultValue != null && (
                        <Badge variant="outline">
                          {TEXT.DEFAULT_PREFIX} {field.defaultValue}
                        </Badge>
                      )}
                      {(() => {
                        const vr = field.validationRules as { rules?: unknown[] } | null | undefined;
                        const count = vr?.rules?.length ?? 0;
                        return count > 0 ? (
                          <Badge variant="outline">{count} regla(s)</Badge>
                        ) : null;
                      })()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right column: actions + scan validations stacked */}
        <div className="flex flex-col gap-6">
          {/* Actions */}
          <div className="animate-fadein overflow-hidden rounded-xl border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div className="font-heading text-sm font-bold text-foreground">
                {TEXT.SECTION_ACTIONS}
              </div>
              <Badge variant="outline">{activeActions.length}</Badge>
            </div>
            {activeActions.length === 0 ? (
              <div className="px-5 py-6 text-center text-sm italic text-muted-foreground">
                {TEXT.EMPTY_ACTIONS}
              </div>
            ) : (
              <div className="flex flex-col gap-2 px-3.5 py-3">
                {activeActions.map((action) => {
                  const actionMeta = ACTION_TYPE_META_DETAIL[action.actionType as keyof typeof ACTION_TYPE_META_DETAIL] ?? ACTION_TYPE_META_DETAIL.increment;
                  const Icon = actionMeta.icon;
                  const amount = (action.config as { amount?: number } | null)?.amount;
                  return (
                    <div
                      key={action.id}
                      className="flex items-center gap-2.5 rounded-[10px] border bg-muted/40 px-3 py-2.5"
                    >
                      <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", actionMeta.classes)}>
                        <Icon className="size-3.5" strokeWidth={1.8} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-foreground">
                          {action.name}
                        </div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          {actionMeta.label}
                          {amount != null && ` · ${amount}`}
                          {` → `}
                          <span className="text-foreground/80">
                            {(action as ActionDefinitionWithField).targetFieldLabel}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Linked designs */}
          <CardTypeLinkedDesigns
            cardTypeId={cardType.id}
            linkedDesigns={linkedDesigns}
            isMaster={isMaster}
          />

          {/* Scan Validations */}
          <div className="animate-fadein overflow-hidden rounded-xl border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div className="font-heading text-sm font-bold text-foreground">
                {TEXT.SECTION_SCANVAL}
              </div>
              <Badge variant="outline">{activeScanValidations.length}</Badge>
            </div>
            {activeScanValidations.length === 0 ? (
              <div className="px-5 py-6 text-center text-sm italic text-muted-foreground">
                {TEXT.EMPTY_SCANVAL}
              </div>
            ) : (
              <div className="flex flex-col gap-2 px-3.5 py-3">
                {activeScanValidations.map((sv) => {
                  // Severity IS an access-control validation outcome → state tokens.
                  const isError = sv.severity === "error";
                  const Icon = isError ? AlertCircle : AlertTriangle;
                  const iconWrap = isError
                    ? "bg-state-denied text-state-denied-icon"
                    : "bg-state-warning text-state-warning-icon";
                  const badgeClasses = isError
                    ? "bg-state-denied border-state-denied-border text-state-denied-foreground"
                    : "bg-state-warning border-state-warning-border text-state-warning-foreground";
                  return (
                    <div
                      key={sv.id}
                      className="flex items-start gap-2.5 rounded-[10px] border bg-muted/40 px-3 py-2.5"
                    >
                      <div className={cn("mt-px flex size-7 shrink-0 items-center justify-center rounded-md", iconWrap)}>
                        <Icon className="size-3.5" strokeWidth={1.8} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-foreground">
                          {sv.errorMessage}
                        </div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          {(sv as ScanValidationWithField).fieldLabel} · {sv.rule}
                        </div>
                      </div>
                      <Badge className={cn("shrink-0", badgeClasses)}>
                        {isError ? TEXT.SEVERITY_ERROR : TEXT.SEVERITY_WARNING}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Metadata footer */}
      <div className="mt-6 flex gap-5 rounded-[10px] bg-muted px-4 py-3 text-[11px] text-muted-foreground">
        <span>{TEXT.META_ID} <code className="font-mono text-[11px]">{cardType.id}</code></span>
        <span>{TEXT.META_CREATED} {new Date(cardType.createdAt).toLocaleDateString("es-ES")}</span>
        <span>{TEXT.META_UPDATED} {new Date(cardType.updatedAt).toLocaleDateString("es-ES")}</span>
      </div>
    </DashboardShell>
  );
}

function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="font-heading text-sm font-bold text-foreground">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
