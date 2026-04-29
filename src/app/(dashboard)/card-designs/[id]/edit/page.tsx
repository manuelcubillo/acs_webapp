/**
 * /card-designs/[id]/edit — Card Design Editor
 *
 * Loads the design and its linked card types (with field definitions).
 * Accessible to: master only.
 * The Konva canvas is dynamically imported (ssr: false) to avoid SSR issues.
 */

import { redirect, notFound } from "next/navigation";
import { requireMaster, AuthenticationError } from "@/lib/api";
import { getCardDesignById, listCardTypesForDesign } from "@/lib/dal";
import { signPhotoForReadOptional } from "@/lib/storage/read";
import type { CardDesignLayout } from "@/lib/card-designs/types";
import DashboardShell from "@/components/layout/DashboardShell";
import CardDesignEditorLoader from "@/components/card-designs/editor/CardDesignEditorLoader";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CardDesignEditPage({ params }: Props) {
  const { id } = await params;

  // ── Auth guard ──────────────────────────────────────────────────────────────
  let context;
  try {
    context = await requireMaster();
  } catch (e) {
    if (e instanceof AuthenticationError) redirect("/login");
    redirect("/dashboard");
  }

  const { tenantId, role } = context;

  // ── Data fetching ───────────────────────────────────────────────────────────
  let design;
  try {
    design = await getCardDesignById(tenantId, id);
  } catch {
    notFound();
  }

  const linkedCardTypes = await listCardTypesForDesign(tenantId, id).catch(() => []);

  // Pre-sign every static image object key referenced by the design layout
  // so the editor can render previews without round-tripping through storage.
  const initialStaticImageUrls: Record<string, string> = {};
  const layoutRaw = design.layout as unknown;
  if (layoutRaw && typeof layoutRaw === "object" && "version" in (layoutRaw as object)) {
    const layout = layoutRaw as CardDesignLayout;
    const keys = layout.nodes
      .filter((n) => n.type === "image" && n.content.source === "static")
      .map((n) => {
        const c = (n as { content: { staticObjectKey?: string } }).content;
        return c.staticObjectKey ?? null;
      })
      .filter((k): k is string => typeof k === "string" && k.length > 0);
    await Promise.all(
      Array.from(new Set(keys)).map(async (k) => {
        const url = await signPhotoForReadOptional(k);
        if (url) initialStaticImageUrls[k] = url;
      }),
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <DashboardShell title={design.name} role={role}>
      {/* Negate DashboardShell's 24px content padding so the editor fills the pane */}
      <div style={{ margin: -24, height: "calc(100% + 48px)" }}>
        <CardDesignEditorLoader
          design={design}
          linkedCardTypes={linkedCardTypes}
          initialStaticImageUrls={initialStaticImageUrls}
        />
      </div>
    </DashboardShell>
  );
}
