import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { CreditCard, IdCard, Users, Settings, ArrowRight } from "lucide-react";
import { auth } from "@/lib/auth";
import { requireOperator, AuthenticationError } from "@/lib/api";
import { listCardTypes, listCards } from "@/lib/dal";
import DashboardShell from "@/components/layout/DashboardShell";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  let context;
  try {
    context = await requireOperator();
  } catch (e) {
    if (e instanceof AuthenticationError) redirect("/login");
    // tenantId null → usuario sin tenant asignado
    redirect("/login");
  }

  const { tenantId, role } = context;
  const isMaster = role === "master";
  const isAdmin = role === "admin" || isMaster;

  // ── Stats rápidas ─────────────────────────────────────────────────────────
  const cardTypes = await listCardTypes(tenantId).catch(() => []);

  // Recoge el total de carnets del primer tipo disponible (aproximación rápida)
  const firstType = cardTypes[0] ?? null;
  const firstTypeCards = firstType
    ? await listCards(firstType.id, tenantId, { limit: 1 }).catch(() => null)
    : null;
  const totalCardsApprox = firstTypeCards?.total ?? 0;

  // ── Accesos rápidos ───────────────────────────────────────────────────────
  const quickLinks = [
    {
      href: "/card-types",
      icon: CreditCard,
      label: "Tipos de Tarjeta",
      description: `${cardTypes.length} tipo${cardTypes.length !== 1 ? "s" : ""} configurado${cardTypes.length !== 1 ? "s" : ""}`,
      show: true,
    },
    {
      href: "/cards",
      icon: IdCard,
      label: "Carnets",
      description: firstType
        ? `Ver carnets de ${firstType.name}`
        : "Ver todos los carnets",
      show: true,
    },
    {
      href: "/members",
      icon: Users,
      label: "Miembros",
      description: "Gestionar usuarios del tenant",
      show: isMaster,
    },
    {
      href: "/settings",
      icon: Settings,
      label: "Configuración",
      description: "Modo de escaneo y ajustes",
      show: isMaster,
    },
  ].filter((l) => l.show);

  return (
    <DashboardShell title="Vista Principal" role={role}>
      {/* Bienvenida */}
      <div style={{ marginBottom: 28 }}>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 800,
            fontFamily: "var(--font-heading)",
            color: "var(--color-dark)",
            margin: 0,
          }}
        >
          Vista Principal
        </h1>
        <p style={{ fontSize: 13.5, color: "var(--color-secondary)", marginTop: 4 }}>
          Bienvenido · rol: <strong>{role}</strong>
        </p>
      </div>

      {/* Accesos rápidos */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap: 14,
        }}
      >
        {quickLinks.map(({ href, icon: Icon, label, description }) => (
          <Link
            key={href}
            href={href}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "18px 20px",
              borderRadius: 14,
              border: "1px solid var(--color-border)",
              background: "#fff",
              textDecoration: "none",
              gap: 14,
              transition: "box-shadow 0.15s",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 10,
                  background: "#e0e7ff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Icon size={20} color="var(--color-primary)" strokeWidth={1.8} />
              </div>
              <div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: "var(--color-dark)",
                  }}
                >
                  {label}
                </div>
                <div style={{ fontSize: 12, color: "var(--color-muted)", marginTop: 2 }}>
                  {description}
                </div>
              </div>
            </div>
            <ArrowRight size={16} color="var(--color-muted)" />
          </Link>
        ))}
      </div>

      {/* Aviso si no hay tipos de tarjeta y es master */}
      {cardTypes.length === 0 && isMaster && (
        <div
          style={{
            marginTop: 24,
            padding: "16px 20px",
            borderRadius: 12,
            background: "#fefce8",
            border: "1px solid #fde68a",
            fontSize: 13,
            color: "#92400e",
          }}
        >
          Todavía no hay tipos de tarjeta.{" "}
          <Link href="/card-types/new" style={{ color: "var(--color-primary)", fontWeight: 600 }}>
            Crea el primero →
          </Link>
        </div>
      )}
    </DashboardShell>
  );
}
