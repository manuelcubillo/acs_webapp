/**
 * /dashboard — Vista Principal
 *
 * Main dashboard for all roles (operator | admin | master).
 * Shows the tenant name, a quick-scan shortcut, summary stats,
 * and the most recent action log entries.
 *
 * Accessible to: operator | admin | master
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { ScanLine, CreditCard, Activity } from "lucide-react";
import {
  requireOperator,
  AuthenticationError,
  AuthorizationError,
} from "@/lib/api";
import { listCardTypes, getRecentActions, getTenantById } from "@/lib/dal";
import DashboardShell from "@/components/layout/DashboardShell";
import QuickCodeInput from "./QuickCodeInput";
import type { ActionLog, CardType } from "@/lib/dal";

export const dynamic = "force-dynamic";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format a Date (or ISO string) as a relative label in Spanish. */
function formatRelativeTime(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "ahora mismo";
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `hace ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  return `hace ${diffD}d`;
}

/** Turn an action log metadata blob into a human-readable description. */
function actionLabel(meta: unknown): string {
  const m = meta as Record<string, unknown> | null;
  if (!m) return "—";
  const type = m.action_type as string | undefined;
  const field = m.target_field as string | undefined;
  const before = m.before_value;
  const after = m.after_value;
  const change =
    before != null && after != null ? ` (${before} → ${after})` : "";
  const labels: Record<string, string> = {
    increment: "Incremento",
    decrement: "Decremento",
    check: "Marcado",
    uncheck: "Desmarcado",
  };
  const typeLabel = type ? (labels[type] ?? type) : "Acción";
  return `${typeLabel} en ${field ?? "—"}${change}`;
}

// ─── StatCard sub-component ───────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon,
  href,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  href?: string;
}) {
  const inner = (
    <div
      style={{
        background: "#fff",
        border: "1px solid var(--color-border)",
        borderRadius: 12,
        padding: "18px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        transition: "box-shadow 0.15s",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          color: "var(--color-primary)",
        }}
      >
        {icon}
        <span
          style={{
            fontSize: 12.5,
            fontWeight: 500,
            color: "var(--color-secondary)",
          }}
        >
          {label}
        </span>
      </div>
      <div
        style={{
          fontSize: 30,
          fontWeight: 800,
          fontFamily: "var(--font-heading)",
          color: "var(--color-dark)",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} style={{ textDecoration: "none" }}>
        {inner}
      </Link>
    );
  }

  return inner;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  // ── Auth guard ────────────────────────────────────────────────────────────
  let context;
  try {
    context = await requireOperator();
  } catch (e) {
    if (e instanceof AuthenticationError) redirect("/login");
    if (e instanceof AuthorizationError) redirect("/login");
    redirect("/login");
  }

  const { tenantId, role } = context;

  // ── Data fetching (parallel) ───────────────────────────────────────────────
  const [cardTypes, recentActions, tenant] = await Promise.all([
    listCardTypes(tenantId).catch(() => [] as CardType[]),
    getRecentActions(tenantId, 10).catch(() => [] as ActionLog[]),
    getTenantById(tenantId).catch(() => null),
  ]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <DashboardShell title="Vista Principal" role={role}>

      {/* ── Welcome ─────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 28 }}>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 800,
            fontFamily: "var(--font-heading)",
            color: "var(--color-dark)",
            margin: 0,
          }}
        >
          {tenant?.name ?? "Panel de Control"}
        </h1>
        <p
          style={{
            fontSize: 13.5,
            color: "var(--color-secondary)",
            marginTop: 4,
          }}
        >
          Vista general del sistema de control de acceso.
        </p>
      </div>

      {/* ── Quick actions ────────────────────────────────────────────────── */}
      {/*
        Left:  manual code input + optional "Buscar" button (appears after
               100 ms of inactivity — distinguishes human vs. scanner).
        Right: camera / QR scanner shortcut.
      */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 32,
        }}
      >
        <QuickCodeInput />

        <Link
          href="/cards/scan"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            background: "linear-gradient(135deg, #4f5bff, #7c3aed)",
            color: "#fff",
            borderRadius: 12,
            padding: "0 24px",
            height: 48,
            fontSize: 15,
            fontWeight: 700,
            textDecoration: "none",
            boxShadow: "0 4px 16px rgba(79,91,255,0.22)",
            flexShrink: 0,
            whiteSpace: "nowrap",
          }}
        >
          <ScanLine size={20} strokeWidth={2} />
          Escanear Carnet
        </Link>
      </div>

      {/* ── Stats ────────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
          gap: 16,
          marginBottom: 36,
        }}
      >
        <StatCard
          label="Tipos de Tarjeta"
          value={cardTypes.length}
          icon={<CreditCard size={18} strokeWidth={1.8} />}
          href="/card-types"
        />
        <StatCard
          label="Acciones Recientes"
          value={recentActions.length}
          icon={<Activity size={18} strokeWidth={1.8} />}
        />
      </div>

      {/* ── Recent activity ───────────────────────────────────────────────── */}
      <div>
        <h2
          style={{
            fontSize: 15,
            fontWeight: 700,
            fontFamily: "var(--font-heading)",
            color: "var(--color-dark)",
            margin: "0 0 12px",
          }}
        >
          Actividad Reciente
        </h2>

        {recentActions.length === 0 ? (
          <div
            style={{
              background: "#fff",
              border: "1px solid var(--color-border)",
              borderRadius: 12,
              padding: "36px 24px",
              textAlign: "center",
              color: "var(--color-muted)",
              fontSize: 14,
            }}
          >
            No hay actividad registrada todavía.
          </div>
        ) : (
          <div
            style={{
              background: "#fff",
              border: "1px solid var(--color-border)",
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            {recentActions.map((log, idx) => (
              <div
                key={log.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 20px",
                  borderBottom:
                    idx < recentActions.length - 1
                      ? "1px solid var(--color-border-soft)"
                      : "none",
                }}
              >
                {/* Description */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13.5,
                      fontWeight: 600,
                      color: "var(--color-dark)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {actionLabel(log.metadata)}
                  </div>
                  <Link
                    href={`/cards/${log.cardId}`}
                    style={{
                      fontSize: 12,
                      color: "var(--color-muted)",
                      marginTop: 2,
                      display: "block",
                      textDecoration: "none",
                    }}
                  >
                    Carnet: {log.cardId}
                  </Link>
                </div>

                {/* Time */}
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--color-secondary)",
                    flexShrink: 0,
                    marginLeft: 16,
                  }}
                >
                  {formatRelativeTime(log.executedAt)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
