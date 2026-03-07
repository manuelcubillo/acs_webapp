/**
 * /cards/[code] — Card Detail
 *
 * Shows all field values for a card + executable actions.
 * Accessible to: operator | admin | master
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { Edit, ArrowLeft, Trash2 } from "lucide-react";
import { requireOperator, AuthenticationError, AuthorizationError } from "@/lib/api";
import {
  getCardByCode,
  getActionsForCardType,
} from "@/lib/dal";
import DashboardShell from "@/components/layout/DashboardShell";
import DynamicFieldRenderer from "@/components/cards/DynamicFieldRenderer";
import CardActions from "@/components/cards/CardActions";

export const dynamic = "force-dynamic";

interface CardDetailPageProps {
  params: Promise<{ code: string }>;
}

export default async function CardDetailPage({ params }: CardDetailPageProps) {
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
  const { code } = await params;
  const decodedCode = decodeURIComponent(code);
  const isAdmin = role === "admin" || role === "master";

  // ── Data ──────────────────────────────────────────────────────────────────
  let card;
  try {
    card = await getCardByCode(decodedCode, tenantId);
  } catch {
    redirect("/cards");
  }

  const actions = await getActionsForCardType(card.cardTypeId).catch(() => []);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <DashboardShell title="Detalle de carnet" role={role}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        {/* Back + actions */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 20,
          }}
        >
          <Link
            href="/cards"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              color: "var(--color-muted)",
              textDecoration: "none",
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            <ArrowLeft size={15} />
            Todos los carnets
          </Link>

          {isAdmin && (
            <div style={{ display: "flex", gap: 8 }}>
              <Link
                href={`/cards/${encodeURIComponent(decodedCode)}/edit`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: "1.5px solid var(--color-border)",
                  background: "#fff",
                  textDecoration: "none",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--color-dark)",
                }}
              >
                <Edit size={14} strokeWidth={1.8} />
                Editar
              </Link>
            </div>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 20 }}>
          {/* Card panel */}
          <div
            style={{
              background: "#fff",
              borderRadius: 14,
              border: "1px solid var(--color-border)",
              padding: 24,
            }}
          >
            {/* Code header */}
            <div style={{ marginBottom: 20 }}>
              <span
                style={{
                  display: "inline-block",
                  fontFamily: "monospace",
                  fontSize: 13,
                  fontWeight: 700,
                  color: "var(--color-muted)",
                  background: "#f3f4f6",
                  padding: "4px 10px",
                  borderRadius: 6,
                  marginBottom: 6,
                }}
              >
                {card.code}
              </span>
            </div>

            {/* Field values */}
            {card.fields.length === 0 ? (
              <p style={{ color: "var(--color-muted)", fontSize: 14 }}>
                Este carnet no tiene campos.
              </p>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                  gap: 18,
                }}
              >
                {card.fields.map((fv) => (
                  <div
                    key={fv.fieldDefinitionId}
                    style={{ display: "flex", flexDirection: "column", gap: 4 }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: "var(--color-muted)",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      {fv.label}
                    </span>
                    <DynamicFieldRenderer
                      fieldType={fv.fieldType}
                      value={fv.value}
                      label={fv.label}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions sidebar */}
          {actions.length > 0 && (
            <div
              style={{
                background: "#fff",
                borderRadius: 14,
                border: "1px solid var(--color-border)",
                padding: 20,
                minWidth: 180,
                alignSelf: "start",
              }}
            >
              <CardActions
                cardId={card.id}
                actions={actions}
              />
            </div>
          )}
        </div>

        {/* Metadata footer */}
        <div
          style={{
            marginTop: 16,
            fontSize: 12,
            color: "var(--color-muted)",
            display: "flex",
            gap: 20,
          }}
        >
          <span>
            Creado:{" "}
            {new Date(card.createdAt).toLocaleDateString("es-ES", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
            })}
          </span>
          {card.updatedAt && card.updatedAt !== card.createdAt && (
            <span>
              Modificado:{" "}
              {new Date(card.updatedAt).toLocaleDateString("es-ES", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
              })}
            </span>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
