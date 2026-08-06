/**
 * Card Design — "Carnet Personal" (tenant Veredillas II)
 *
 * One-off, RE-RUNNABLE script that recreates the legacy printed personal card
 * as a `card_designs` row and links it to the "Carnet Personal" card type.
 *
 * The layout is a pixel-for-pixel transcription of the cards produced by the
 * old Java system (measured off the 488×296 px renders embedded in the legacy
 * `imprimir.pdf`): 1 px black outer frame, header box with the community logo
 * and title, framed photo on the left, a two-row data box on the right, the
 * card code bottom-left and a CODE128 barcode bottom-right.
 *
 * Everything that varies per card is bound to a field definition (or to the
 * card code), so issuing a card only requires filling the card's own data:
 *
 *   Nombre    → field `nombre`     Calle  → field `calle`
 *   Apellidos → field `apellido`   Portal → field `bloque`
 *   Foto      → field `foto`       Piso   → field `vivienda`
 *   ID + code → the card's `code`  Letra  → field `letra`
 *
 * (The legacy labels "Portal" / "Piso" are kept because that is what the
 * printed card said; they map onto the `bloque` / `vivienda` fields the legacy
 * importer created — see scripts/legacyDBMigration/import.ts.)
 *
 * Re-running is safe: the design is looked up by name and its layout is
 * rewritten in place, the card-type link is created only if missing, and the
 * logo is re-uploaded only when the current layout has no image key.
 *
 * Run against the Dockerized local Postgres:
 *   pnpm design:veredillas-personal:local-db
 * Or against whatever `.env.local` points at (Neon):
 *   pnpm design:veredillas-personal
 */

import { config } from "dotenv";
// Mirror the legacy importer: .env.local-db wins for the DB vars when the
// dotenv-cli overlay requested it, .env.local supplies S3/MinIO credentials.
config({ path: ".env.local-db" });
config({ path: ".env.local" });

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { and, eq } from "drizzle-orm";

import { db } from "../src/lib/db";
import * as schema from "../src/lib/db/schema";
import { getPhotoStorage } from "../src/lib/storage";
import { buildObjectKey } from "../src/lib/storage/keys";
import {
  createCardDesign,
  linkDesignToCardType,
  listCardDesigns,
  updateCardDesign,
} from "../src/lib/dal/card-designs";
import type {
  CardDesignLayout,
  LayoutNode,
  TextNode,
} from "../src/lib/card-designs/types";

// ─── Config ──────────────────────────────────────────────────────────────────

const TENANT_NAME = "Veredillas II";
const CARD_TYPE_NAME = "Carnet Personal";
const DESIGN_NAME = "Carnet Personal Veredillas II";
const DESIGN_DESCRIPTION =
  "Reproducción del carnet personal impreso del sistema anterior: cabecera con logo, foto enmarcada, datos de vivienda y código de barras.";

/** Canvas = the exact pixel size the legacy system exported (100 × 61 mm at print). */
const CANVAS = { width: 488, height: 296 } as const;

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGO_PATH = join(__dirname, "assets", "veredillas-logo.png");

// ─── Layout constants (all measured on the legacy render) ────────────────────

const FONT = "Arial" as const;
/** Body size: cap height 13 px on the legacy card. */
const SIZE_BODY = 18;
/** Small size: subtitle and the ID line. */
const SIZE_SMALL = 14;
/** Canvas `textBaseline: "top"` sits ~1 px above the cap line at these sizes. */
const CAP_OFFSET = 1;
const LINE_HEIGHT = 1.3;

const BLACK = "#000000";
const BLUE = "#0000ff";
const WHITE = "#ffffff";
/** The photo frame is a lighter grey than the boxes on the legacy card. */
const PHOTO_FRAME = "#a9a9a9";

/** Field names this design binds to, resolved to IDs at run time. */
const FIELD_NAMES = [
  "foto",
  "nombre",
  "apellido",
  "calle",
  "bloque",
  "vivienda",
  "letra",
] as const;

type FieldName = (typeof FIELD_NAMES)[number];
type FieldIds = Record<FieldName, string>;

// ─── Node builders ───────────────────────────────────────────────────────────

let zIndex = 0;
const nextZ = () => zIndex++;

interface TextArgs {
  /** Left edge of the glyphs on the legacy card (the node sits 1 px left of it). */
  inkX: number;
  /** Top edge of the capital letters on the legacy card. */
  capY: number;
  width: number;
  size?: number;
  bold?: boolean;
  color?: string;
  content: TextNode["content"];
}

/**
 * Text node positioned by where its ink lands, not by its box: the renderer
 * draws with `textBaseline: "top"`, so the node's `y` is the cap line minus a
 * constant. `width` is the author's box — the renderer condenses longer values
 * into it, so give dynamic values all the room the layout allows.
 */
function text({
  inkX,
  capY,
  width,
  size = SIZE_BODY,
  bold = false,
  color = BLACK,
  content,
}: TextArgs): TextNode {
  return {
    id: crypto.randomUUID(),
    type: "text",
    x: inkX - 1,
    y: capY - CAP_OFFSET,
    width,
    height: size * LINE_HEIGHT,
    rotation: 0,
    zIndex: nextZ(),
    locked: false,
    content,
    style: {
      fontFamily: FONT,
      fontSize: size,
      fontWeight: bold ? "bold" : "normal",
      color,
      align: "left",
      multiline: false,
      overflow: "truncate",
    },
  };
}

/** Label + value pair sharing one baseline. */
function row(args: {
  capY: number;
  labelInkX: number;
  labelWidth: number;
  label: string;
  valueInkX: number;
  valueWidth: number;
  fieldDefinitionId: string;
}): TextNode[] {
  return [
    text({
      inkX: args.labelInkX,
      capY: args.capY,
      width: args.labelWidth,
      bold: true,
      content: { source: "static", staticValue: args.label },
    }),
    text({
      inkX: args.valueInkX,
      capY: args.capY,
      width: args.valueWidth,
      content: { source: "field", fieldDefinitionId: args.fieldDefinitionId },
    }),
  ];
}

/**
 * Frame drawn as a stroked rect. Coordinates are half-pixel offset so the 1 px
 * stroke, which canvas centres on the path, lands on whole pixels.
 */
function frame(
  x: number,
  y: number,
  width: number,
  height: number,
  stroke: string,
): LayoutNode {
  return {
    id: crypto.randomUUID(),
    type: "rect",
    x: x + 0.5,
    y: y + 0.5,
    width: width - 1,
    height: height - 1,
    rotation: 0,
    zIndex: nextZ(),
    locked: false,
    style: { fill: WHITE, stroke, strokeWidth: 1, cornerRadius: 0 },
  };
}

// ─── Layout ──────────────────────────────────────────────────────────────────

function buildLayout(fields: FieldIds, logoObjectKey: string): CardDesignLayout {
  zIndex = 0;

  const nodes: LayoutNode[] = [
    // Frames, back to front: card outline, header, photo, data box.
    frame(0, 0, CANVAS.width, CANVAS.height, BLACK),
    frame(7, 7, 468, 61, BLACK),
    frame(7, 74, 114, 155, PHOTO_FRAME),
    frame(134, 74, 330, 178, BLACK),

    // Divider between the "quién" and "dónde" halves of the data box.
    {
      id: crypto.randomUUID(),
      type: "line",
      x1: 134,
      y1: 168.5,
      x2: 464,
      y2: 168.5,
      zIndex: nextZ(),
      locked: false,
      style: { stroke: BLACK, strokeWidth: 1 },
    },

    // Community logo (header, left).
    {
      id: crypto.randomUUID(),
      type: "image",
      x: 19,
      y: 19,
      width: 67,
      height: 33,
      rotation: 0,
      zIndex: nextZ(),
      locked: false,
      content: { source: "static", staticObjectKey: logoObjectKey },
      mode: "fit",
    },

    // Holder photo, inset 1 px so the frame stays visible around it.
    {
      id: crypto.randomUUID(),
      type: "image",
      x: 8,
      y: 75,
      width: 112,
      height: 153,
      rotation: 0,
      zIndex: nextZ(),
      locked: false,
      content: { source: "field", fieldDefinitionId: fields.foto },
      mode: "fill",
    },

    // Header texts.
    text({
      inkX: 135,
      capY: 18,
      width: 300,
      content: {
        source: "static",
        staticValue: "Carnet de Acceso Veredillas II",
      },
    }),
    text({
      inkX: 172,
      capY: 46,
      width: 145,
      size: SIZE_SMALL,
      color: BLUE,
      content: { source: "static", staticValue: "CARNET PERSONAL" },
    }),

    // Data box — upper half: who the card belongs to.
    ...row({
      capY: 93,
      labelInkX: 150,
      labelWidth: 120,
      label: "Nombre",
      valueInkX: 279,
      valueWidth: 182,
      fieldDefinitionId: fields.nombre,
    }),
    ...row({
      capY: 121,
      labelInkX: 150,
      labelWidth: 120,
      label: "Apellidos:",
      valueInkX: 279,
      valueWidth: 182,
      fieldDefinitionId: fields.apellido,
    }),

    // Data box — lower half: where the holder lives.
    ...row({
      capY: 192,
      labelInkX: 142,
      labelWidth: 70,
      label: "Calle:",
      valueInkX: 224,
      valueWidth: 100,
      fieldDefinitionId: fields.calle,
    }),
    ...row({
      capY: 192,
      labelInkX: 328,
      labelWidth: 78,
      label: "Portal:",
      valueInkX: 408,
      valueWidth: 52,
      fieldDefinitionId: fields.bloque,
    }),
    ...row({
      capY: 227,
      labelInkX: 142,
      labelWidth: 70,
      label: "Piso:",
      valueInkX: 212,
      valueWidth: 110,
      fieldDefinitionId: fields.vivienda,
    }),
    ...row({
      capY: 227,
      labelInkX: 328,
      labelWidth: 78,
      label: "Letra:",
      valueInkX: 408,
      valueWidth: 52,
      fieldDefinitionId: fields.letra,
    }),

    // Card code, printed and encoded.
    text({
      inkX: 8,
      capY: 261,
      width: 30,
      size: SIZE_SMALL,
      bold: true,
      content: { source: "static", staticValue: "ID:" },
    }),
    text({
      inkX: 41,
      capY: 261,
      width: 90,
      size: SIZE_SMALL,
      bold: true,
      content: { source: "card_code" },
    }),
    {
      id: crypto.randomUUID(),
      type: "barcode128",
      x: 168,
      y: 256,
      width: 163,
      height: 36,
      rotation: 0,
      zIndex: nextZ(),
      locked: false,
      content: { source: "card_code" },
    },
  ];

  return {
    version: 1,
    canvas: {
      width: CANVAS.width,
      height: CANVAS.height,
      unit: "px",
      safeMargin: { top: 7, right: 7, bottom: 7, left: 7 },
      background: WHITE,
    },
    nodes,
  };
}

// ─── Lookups ─────────────────────────────────────────────────────────────────

async function resolveTenantId(): Promise<string> {
  const [tenant] = await db
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.name, TENANT_NAME))
    .limit(1);
  if (!tenant) throw new Error(`Tenant "${TENANT_NAME}" no encontrado.`);
  return tenant.id;
}

async function resolveCardTypeId(tenantId: string): Promise<string> {
  const [cardType] = await db
    .select()
    .from(schema.cardTypes)
    .where(
      and(
        eq(schema.cardTypes.tenantId, tenantId),
        eq(schema.cardTypes.name, CARD_TYPE_NAME),
      ),
    )
    .limit(1);
  if (!cardType) {
    throw new Error(
      `Tipo de tarjeta "${CARD_TYPE_NAME}" no encontrado en ${TENANT_NAME}.`,
    );
  }
  return cardType.id;
}

async function resolveFieldIds(cardTypeId: string): Promise<FieldIds> {
  const rows = await db
    .select()
    .from(schema.fieldDefinitions)
    .where(
      and(
        eq(schema.fieldDefinitions.cardTypeId, cardTypeId),
        eq(schema.fieldDefinitions.isActive, true),
      ),
    );

  const byName = new Map(rows.map((r) => [r.name, r.id]));
  const missing = FIELD_NAMES.filter((n) => !byName.has(n));
  if (missing.length > 0) {
    throw new Error(
      `Faltan campos en "${CARD_TYPE_NAME}": ${missing.join(", ")}.`,
    );
  }

  return Object.fromEntries(
    FIELD_NAMES.map((n) => [n, byName.get(n)!]),
  ) as FieldIds;
}

/** Returns the object key of the first static image node in a stored layout. */
function existingLogoKey(layout: unknown): string | null {
  const nodes = (layout as CardDesignLayout | null)?.nodes;
  if (!Array.isArray(nodes)) return null;
  for (const node of nodes) {
    if (node.type !== "image" || node.content.source !== "static") continue;
    const key = node.content.staticObjectKey;
    if (key) return key;
  }
  return null;
}

async function uploadLogo(tenantId: string, designId: string): Promise<string> {
  const bytes = readFileSync(LOGO_PATH);
  const key = buildObjectKey({
    kind: "card-design-image",
    tenantId,
    ownerId: designId,
    mime: "image/png",
  });
  const { uploadUrl, requiredHeaders } = await getPhotoStorage().getUploadUrl({
    key,
    contentType: "image/png",
    contentLength: bytes.length,
    ttlSeconds: 120,
  });
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: requiredHeaders,
    body: bytes,
  });
  if (!res.ok) {
    throw new Error(`Fallo subiendo el logo (${res.status}): ${await res.text()}`);
  }
  return key;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const tenantId = await resolveTenantId();
  const cardTypeId = await resolveCardTypeId(tenantId);
  const fields = await resolveFieldIds(cardTypeId);
  console.log(`Tenant ${TENANT_NAME} · tipo ${CARD_TYPE_NAME} · campos OK`);

  const existing = (await listCardDesigns(tenantId, { kind: "card" })).find(
    (d) => d.name === DESIGN_NAME,
  );

  const design =
    existing ??
    (await createCardDesign(tenantId, {
      name: DESIGN_NAME,
      description: DESIGN_DESCRIPTION,
      kind: "card",
      widthUnits: CANVAS.width,
      heightUnits: CANVAS.height,
      unit: "px",
    }));
  console.log(`${existing ? "Reutilizando" : "Creado"} diseño ${design.id}`);

  const logoKey = existingLogoKey(design.layout) ?? (await uploadLogo(tenantId, design.id));
  console.log(`Logo: ${logoKey}`);

  await updateCardDesign(tenantId, design.id, {
    description: DESIGN_DESCRIPTION,
    widthUnits: CANVAS.width,
    heightUnits: CANVAS.height,
    unit: "px",
    // The DAL takes the layout as opaque jsonb; it is typed here at build time.
    layout: buildLayout(fields, logoKey) as unknown as Record<string, unknown>,
  });
  console.log("Layout escrito.");

  const [link] = await db
    .select()
    .from(schema.cardTypeDesigns)
    .where(
      and(
        eq(schema.cardTypeDesigns.cardTypeId, cardTypeId),
        eq(schema.cardTypeDesigns.kind, "card"),
      ),
    )
    .limit(1);

  if (!link) {
    await linkDesignToCardType(tenantId, design.id, cardTypeId);
    console.log(`Vinculado a "${CARD_TYPE_NAME}".`);
  } else if (link.cardDesignId !== design.id) {
    console.warn(
      `⚠️  "${CARD_TYPE_NAME}" ya tiene otro diseño de tipo card vinculado (${link.cardDesignId}). Desvincúlalo para usar este.`,
    );
  } else {
    console.log(`Ya estaba vinculado a "${CARD_TYPE_NAME}".`);
  }

  console.log(`\nListo → /card-designs/${design.id}/edit`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
