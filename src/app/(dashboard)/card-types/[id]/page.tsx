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
import DashboardShell from "@/components/layout/DashboardShell";
import FieldTypeSelector from "@/components/card-types/fields/FieldTypeSelector";
import type { FieldType } from "@/lib/dal";
import {
  ArrowLeft,
  Pencil,
  CreditCard,
  LogIn,
  LogOut,
  CircleDot,
  CircleOff,
} from "lucide-react";

export const dynamic = "force-dynamic";

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

  const activeFields = cardType.fieldDefinitions.filter((f) => f.isActive);
  const activeActions = cardType.actionDefinitions.filter((a) => a.isActive);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <DashboardShell title={cardType.name} role={role}>
      {/* Breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
        <Link
          href="/card-types"
          style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--color-muted)", fontSize: 13, textDecoration: "none", fontWeight: 500 }}
        >
          <ArrowLeft size={14} strokeWidth={2} />
          Tipos de Tarjeta
        </Link>
        <span style={{ color: "var(--color-border)", fontSize: 13 }}>/</span>
        <span style={{ fontSize: 13, color: "var(--color-dark)", fontWeight: 600 }}>
          {cardType.name}
        </span>
      </div>

      {/* Header card */}
      <div
        className="card animate-fadein"
        style={{ padding: "24px 28px", marginBottom: 20 }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 18 }}>
          {/* Icon */}
          <div style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background: cardType.isActive ? "linear-gradient(135deg, #eef0ff, #dde1ff)" : "#f3f4f6",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: cardType.isActive ? "var(--color-primary)" : "var(--color-muted)",
            border: `2px solid ${cardType.isActive ? "#c7d2fe" : "#e5e7eb"}`,
            flexShrink: 0,
          }}>
            <CreditCard size={26} strokeWidth={1.6} />
          </div>

          {/* Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <h1 style={{
                fontSize: 22,
                fontWeight: 800,
                fontFamily: "var(--font-heading)",
                color: "var(--color-dark)",
                margin: 0,
              }}>
                {cardType.name}
              </h1>
              <span style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 11,
                fontWeight: 600,
                padding: "3px 9px",
                borderRadius: 6,
                background: cardType.isActive ? "#ecfdf5" : "#f3f4f6",
                color: cardType.isActive ? "#059669" : "#6b7094",
                border: `1px solid ${cardType.isActive ? "#a7f3d0" : "#e5e7eb"}`,
              }}>
                {cardType.isActive ? <CircleDot size={10} strokeWidth={2} /> : <CircleOff size={10} strokeWidth={2} />}
                {cardType.isActive ? "Activo" : "Inactivo"}
              </span>
            </div>
            {cardType.description && (
              <p style={{ fontSize: 13.5, color: "var(--color-secondary)", margin: "6px 0 0", lineHeight: 1.6 }}>
                {cardType.description}
              </p>
            )}
            <div style={{ display: "flex", gap: 20, marginTop: 10 }}>
              <StatChip label="Campos" value={activeFields.length} />
              <StatChip label="Obligatorios" value={activeFields.filter(f => f.isRequired).length} />
              <StatChip label="Acciones" value={activeActions.length} />
            </div>
          </div>

          {/* Edit button */}
          {isMaster && (
            <Link
              href={`/card-types/${cardType.id}/edit`}
              className="btn btn-secondary"
              style={{ flexShrink: 0 }}
            >
              <Pencil size={14} strokeWidth={2} />
              Editar
            </Link>
          )}
        </div>
      </div>

      {/* Two-column layout: fields + actions */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20, alignItems: "start" }}>

        {/* Fields */}
        <div className="card animate-fadein" style={{ padding: "0", overflow: "hidden" }}>
          <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--color-border-soft)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "var(--font-heading)", color: "var(--color-dark)" }}>
              Campos del esquema
            </div>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--color-muted)", background: "var(--color-page-bg)", padding: "2px 8px", borderRadius: 5 }}>
              {activeFields.length}
            </span>
          </div>

          {activeFields.length === 0 ? (
            <div style={{ padding: "36px 22px", textAlign: "center", color: "var(--color-muted)", fontSize: 13, fontStyle: "italic" }}>
              No hay campos definidos.
            </div>
          ) : (
            <div style={{ padding: "16px 22px", display: "flex", flexDirection: "column", gap: 10 }}>
              {activeFields.map((field, i) => (
                <div key={field.id} style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 14,
                  padding: "14px 16px",
                  background: "#fafbfc",
                  border: "1px solid var(--color-border-soft)",
                  borderRadius: 12,
                }}>
                  {/* Position */}
                  <div style={{ width: 22, height: 22, borderRadius: 6, background: "var(--color-primary-light)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "var(--color-primary)", flexShrink: 0 }}>
                    {i + 1}
                  </div>

                  {/* Field type selector (read-only) */}
                  <div style={{ flexShrink: 0, width: 180 }}>
                    <FieldTypeSelector
                      value={field.fieldType as FieldType}
                      onChange={() => {}}
                      readOnly
                    />
                  </div>

                  {/* Field info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--color-dark)" }}>
                        {field.label}
                      </span>
                      <span style={{ fontSize: 11.5, color: "var(--color-muted)" }}>
                        {field.name}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                      {field.isRequired && (
                        <Tag color="#dc2626" bg="#fef2f2">Obligatorio</Tag>
                      )}
                      {field.defaultValue != null && (
                        <Tag color="#6b7094" bg="#f3f4f6">
                          Defecto: {field.defaultValue}
                        </Tag>
                      )}
                      {(() => {
                        const vr = field.validationRules as { rules?: unknown[] } | null | undefined;
                        const count = vr?.rules?.length ?? 0;
                        return count > 0 ? (
                          <Tag color="#059669" bg="#ecfdf5">{count} regla(s)</Tag>
                        ) : null;
                      })()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="card animate-fadein" style={{ padding: "0", overflow: "hidden" }}>
          <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--color-border-soft)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "var(--font-heading)", color: "var(--color-dark)" }}>
              Acciones
            </div>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--color-muted)", background: "var(--color-page-bg)", padding: "2px 8px", borderRadius: 5 }}>
              {activeActions.length}
            </span>
          </div>
          {activeActions.length === 0 ? (
            <div style={{ padding: "36px 22px", textAlign: "center", color: "var(--color-muted)", fontSize: 13, fontStyle: "italic" }}>
              Sin acciones definidas.
            </div>
          ) : (
            <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
              {activeActions.map((action) => {
                const isEntry = action.actionType === "guest_entry";
                const Icon = isEntry ? LogIn : LogOut;
                const color = isEntry ? "#059669" : "#dc2626";
                const bg = isEntry ? "#ecfdf5" : "#fef2f2";
                return (
                  <div key={action.id} style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 12px",
                    background: "#fafbfc",
                    border: "1px solid var(--color-border-soft)",
                    borderRadius: 10,
                  }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: bg, display: "flex", alignItems: "center", justifyContent: "center", color, flexShrink: 0 }}>
                      <Icon size={15} strokeWidth={1.8} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-dark)" }}>
                        {action.name}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--color-muted)", marginTop: 2 }}>
                        {action.actionType}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Metadata footer */}
      <div style={{ marginTop: 20, padding: "12px 16px", background: "var(--color-subtle-bg)", borderRadius: 10, fontSize: 11.5, color: "var(--color-muted)", display: "flex", gap: 20 }}>
        <span>ID: <code style={{ fontFamily: "monospace", fontSize: 11 }}>{cardType.id}</code></span>
        <span>Creado: {new Date(cardType.createdAt).toLocaleDateString("es-ES")}</span>
        <span>Actualizado: {new Date(cardType.updatedAt).toLocaleDateString("es-ES")}</span>
      </div>
    </DashboardShell>
  );
}

function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <span style={{ fontSize: 14, fontWeight: 700, fontFamily: "var(--font-heading)", color: "var(--color-dark)" }}>{value}</span>
      <span style={{ fontSize: 12, color: "var(--color-muted)" }}>{label}</span>
    </div>
  );
}

function Tag({ color, bg, children }: { color: string; bg: string; children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 11,
      fontWeight: 600,
      padding: "2px 7px",
      borderRadius: 5,
      color,
      background: bg,
      border: `1px solid ${color}30`,
    }}>
      {children}
    </span>
  );
}
