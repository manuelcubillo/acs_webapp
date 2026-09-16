/**
 * Card designs for the demo tenant — one per card type.
 *
 * Both are `kind: "card"` badge layouts on a CR80-proportioned canvas
 * (85.6 × 54 mm expressed as 856 × 540 px, i.e. 10 px per mm), and both declare
 * the physical export size so "Descargar PNG" produces a real credit-card-sized
 * image at 300 DPI instead of the legacy raster.
 *
 * Everything that varies per card is bound to a field definition or to the
 * card's own code, so issuing a card is all it takes to get a printable badge.
 *
 * Colours are literal here on purpose: `card_designs.layout` is print artwork
 * stored as data, not a React component, and the renderer writes the strings
 * straight into the Canvas context. The design-token rule governs components.
 */

import { and, eq } from "drizzle-orm";

import { db } from "../../src/lib/db";
import * as schema from "../../src/lib/db/schema";
import {
  createCardDesign,
  linkDesignToCardType,
  listCardDesigns,
  updateCardDesign,
} from "../../src/lib/dal/card-designs";
import type {
  Barcode128Node,
  CardDesignLayout,
  ImageNode,
  LayoutNode,
  LineNode,
  RectNode,
  TextNode,
  TextContent,
  WebSafeFont,
} from "../../src/lib/card-designs/types";

// ─── Canvas + palette ────────────────────────────────────────────────────────

/** CR80 at 10 px per mm. Kept in px so font sizes read as tenths of a mm. */
const CANVAS = { width: 856, height: 540 } as const;
/** Physical size of the downloaded PNG. */
const EXPORT_CM = { width: 8.56, height: 5.4 } as const;

const FONT: WebSafeFont = "Helvetica";

const WHITE = "#ffffff";
const INK = "#0f172a";
const MUTED = "#64748b";
const HAIRLINE = "#e2e8f0";
const PHOTO_FRAME = "#cbd5e1";

// ─── Node builders ───────────────────────────────────────────────────────────

let zIndex = 0;
const nextZ = () => zIndex++;

interface TextArgs {
  x: number;
  y: number;
  width: number;
  size: number;
  content: TextContent;
  bold?: boolean;
  color?: string;
  align?: "left" | "center" | "right";
}

function text({
  x,
  y,
  width,
  size,
  content,
  bold = false,
  color = INK,
  align = "left",
}: TextArgs): TextNode {
  return {
    id: crypto.randomUUID(),
    type: "text",
    x,
    y,
    width,
    height: Math.round(size * 1.25),
    rotation: 0,
    zIndex: nextZ(),
    locked: false,
    content,
    style: {
      fontFamily: FONT,
      fontSize: size,
      fontWeight: bold ? "bold" : "normal",
      color,
      align,
      multiline: false,
      overflow: "truncate",
    },
  };
}

/**
 * Height the editor's text auto-resize writes for a given font size.
 *
 * Selecting a static text node in the design editor hugs it to its rendered
 * extent: the height becomes 1.3 × the font size, the width the measured width
 * of that exact string. Nodes the user has touched therefore carry values this
 * builder cannot compute (it has no font metrics), so they are transcribed
 * literally — and matching them is what keeps opening the design from
 * reporting an unsaved change.
 */
const hugged = (size: number): number => size * 1.3;

/** Static caption — a label printed on every card of this type. */
const label = (
  x: number,
  y: number,
  width: number,
  value: string,
  color = MUTED,
  size = 16,
): TextNode =>
  text({ x, y, width, size, bold: true, color, content: { source: "static", staticValue: value } });

/** Value pulled from one of the card's fields. */
const field = (
  x: number,
  y: number,
  width: number,
  size: number,
  fieldDefinitionId: string,
  opts: { bold?: boolean; color?: string } = {},
): TextNode =>
  text({ x, y, width, size, content: { source: "field", fieldDefinitionId }, ...opts });

function rect(args: {
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  cornerRadius?: number;
}): RectNode {
  return {
    id: crypto.randomUUID(),
    type: "rect",
    x: args.x,
    y: args.y,
    width: args.width,
    height: args.height,
    rotation: 0,
    zIndex: nextZ(),
    locked: false,
    style: {
      fill: args.fill,
      stroke: args.stroke ?? args.fill,
      strokeWidth: args.strokeWidth ?? 0,
      cornerRadius: args.cornerRadius ?? 0,
    },
  };
}

function hairline(x1: number, y: number, x2: number): LineNode {
  return {
    id: crypto.randomUUID(),
    type: "line",
    x1,
    y1: y,
    x2,
    y2: y,
    zIndex: nextZ(),
    locked: false,
    style: { stroke: HAIRLINE, strokeWidth: 2 },
  };
}

function photo(fieldDefinitionId: string): ImageNode {
  return {
    id: crypto.randomUUID(),
    type: "image",
    x: 46,
    y: 150,
    width: 212,
    height: 272,
    rotation: 0,
    zIndex: nextZ(),
    locked: false,
    content: { source: "field", fieldDefinitionId },
    mode: "fill",
  };
}

function barcode(): Barcode128Node {
  return {
    id: crypto.randomUUID(),
    type: "barcode128",
    x: 520,
    y: 464,
    width: 296,
    height: 64,
    rotation: 0,
    zIndex: nextZ(),
    locked: false,
    content: { source: "card_code" },
  };
}

// ─── Shared chrome ───────────────────────────────────────────────────────────

/**
 * Coloured header band, community name, template name and a corner chip.
 *
 * `chipExtent` overrides the chip caption's box for a design whose chip the
 * user has auto-resized in the editor.
 */
function header(
  accent: string,
  soft: string,
  subtitle: string,
  chip: string,
  chipExtent?: { width: number; height: number },
): LayoutNode[] {
  return [
    rect({ x: 0, y: 0, width: CANVAS.width, height: 112, fill: accent }),
    text({
      x: 40,
      y: 26,
      width: 560,
      size: 30,
      bold: true,
      color: WHITE,
      content: { source: "static", staticValue: "COMUNIDAD DE VECINOS" },
    }),
    text({
      x: 40,
      y: 66,
      width: 480,
      size: 22,
      color: soft,
      content: { source: "static", staticValue: subtitle },
    }),
    rect({ x: 636, y: 30, width: 180, height: 52, fill: WHITE, cornerRadius: 26 }),
    {
      ...text({
        x: 636,
        y: 44,
        width: chipExtent?.width ?? 180,
        size: 22,
        bold: true,
        color: accent,
        align: "center",
        content: { source: "static", staticValue: chip },
      }),
      ...(chipExtent ? { height: chipExtent.height } : {}),
    },
  ];
}

/** Framed photo well on the left of the card body. */
function photoWell(photoFieldId: string): LayoutNode[] {
  return [
    rect({
      x: 40,
      y: 144,
      width: 224,
      height: 284,
      fill: WHITE,
      stroke: PHOTO_FRAME,
      strokeWidth: 2,
      cornerRadius: 12,
    }),
    photo(photoFieldId),
  ];
}

/** Bottom strip: the card code, printed and encoded as CODE128. */
function codeStrip(): LayoutNode[] {
  return [
    hairline(40, 456, 816),
    { ...label(40, 470, 104.7822265625, "Nº DE CARNET", MUTED, 14), height: hugged(14) },
    text({
      x: 40,
      y: 490,
      width: 300,
      size: 30,
      bold: true,
      content: { source: "card_code" },
    }),
    barcode(),
  ];
}

// ─── Layouts ─────────────────────────────────────────────────────────────────

export interface AccesoPersonalFields {
  photo: string;
  name: string;
  surname: string;
  street: string;
  num: string;
  letter: string;
  dateIni: string;
  dateEnd: string;
  specialPass: string;
}

/** Resident badge: holder, dwelling, validity window and special-pass flag. */
export function buildAccesoPersonalLayout(f: AccesoPersonalFields): CardDesignLayout {
  zIndex = 0;
  const ACCENT = "#4338ca";
  const SOFT = "#c7d2fe";

  const nodes: LayoutNode[] = [
    ...header(ACCENT, SOFT, "Acceso personal", "PERSONAL"),
    ...photoWell(f.photo),

    label(300, 148, 300, "TITULAR"),
    field(300, 172, 516, 34, f.name, { bold: true }),
    field(300, 216, 516, 26, f.surname),

    hairline(300, 268, 816),

    label(300, 282, 300, "VIVIENDA"),
    field(300, 304, 380, 24, f.street),
    label(300, 346, 44, "Piso", MUTED, 15),
    field(348, 342, 60, 24, f.num),
    label(420, 346, 54, "Letra", MUTED, 15),
    field(478, 342, 60, 24, f.letter),

    hairline(300, 386, 816),

    label(300, 398, 300, "VIGENCIA"),
    field(300, 420, 150, 22, f.dateIni),
    text({
      x: 456,
      y: 420,
      width: 20,
      size: 22,
      color: MUTED,
      content: { source: "static", staticValue: "–" },
    }),
    field(484, 420, 150, 22, f.dateEnd),

    label(660, 398, 156, "PASE ESPECIAL"),
    field(660, 420, 156, 22, f.specialPass),

    ...codeStrip(),
  ];

  return layout(nodes);
}

export interface BonoAccesosFields {
  photo: string;
  street: string;
  num: string;
  letter: string;
}

/** Pass-book badge: dwelling plus the remaining-passes counter. */
export function buildBonoAccesosLayout(f: BonoAccesosFields): CardDesignLayout {
  zIndex = 0;
  const ACCENT = "#0f766e";
  const SOFT = "#99f6e4";

  const nodes: LayoutNode[] = [
    ...header(ACCENT, SOFT, "Bono de accesos", "BONO", { width: 70, height: hugged(22) }),
    ...photoWell(f.photo),

    { ...label(300, 148, 79.5703125, "VIVIENDA"), height: hugged(16) },
    field(300, 170, 516, 32, f.street, { bold: true }),
    { ...label(300, 228, 35.67724609375, "Piso", MUTED, 15), height: hugged(15) },
    field(348, 222, 60, 26, f.num),
    { ...label(420, 228, 40.6796875, "Letra", MUTED, 15), height: hugged(15) },
    field(478, 222, 60, 26, f.letter),

    hairline(300, 272, 816),

    rect({
      x: 300,
      y: 288,
      width: 250,
      height: 140,
      fill: "#ecfdf5",
      stroke: "#5eead4",
      strokeWidth: 2,
      cornerRadius: 16,
    }),
    { ...label(318, 306, 53.74609375, "PASES", ACCENT, 15), height: hugged(15) },
    // The counter is a static "20", not `f.numAccess`: the design was edited to
    // print a fixed figure, so every bono badge carries it whatever the card's
    // own `num_access` says. Deliberate — confirmed 2026-09-11.
    {
      ...text({
        x: 318,
        y: 330,
        width: 79.63671875,
        size: 68,
        bold: true,
        color: "#115e59",
        content: { source: "static", staticValue: "20" },
      }),
      height: hugged(68),
    },

    ...codeStrip(),
  ];

  return layout(nodes);
}

function layout(nodes: LayoutNode[]): CardDesignLayout {
  return {
    version: 1,
    canvas: {
      width: CANVAS.width,
      height: CANVAS.height,
      unit: "px",
      safeMargin: { top: 24, right: 24, bottom: 24, left: 24 },
      background: WHITE,
    },
    nodes,
  };
}

// ─── Persistence ─────────────────────────────────────────────────────────────

/**
 * Create (or rewrite) a design by name and make sure it is the card design
 * linked to `cardTypeId`.
 *
 * Re-runnable: the design is looked up by name, its layout is replaced in
 * place, and the link is only created when the slot is free.
 */
export async function writeDesign(args: {
  tenantId: string;
  cardTypeId: string;
  name: string;
  description: string;
  layout: CardDesignLayout;
}): Promise<string> {
  const existing = (await listCardDesigns(args.tenantId, { kind: "card" })).find(
    (d) => d.name === args.name,
  );

  const design =
    existing ??
    (await createCardDesign(args.tenantId, {
      name: args.name,
      description: args.description,
      kind: "card",
      widthUnits: CANVAS.width,
      heightUnits: CANVAS.height,
      unit: "px",
    }));

  await updateCardDesign(args.tenantId, design.id, {
    description: args.description,
    widthUnits: CANVAS.width,
    heightUnits: CANVAS.height,
    unit: "px",
    outputWidthCm: EXPORT_CM.width,
    outputHeightCm: EXPORT_CM.height,
    outputLockAspect: true,
    // The DAL takes the layout as opaque jsonb; it is typed at build time here.
    layout: args.layout as unknown as Record<string, unknown>,
  });

  const [link] = await db
    .select()
    .from(schema.cardTypeDesigns)
    .where(
      and(
        eq(schema.cardTypeDesigns.cardTypeId, args.cardTypeId),
        eq(schema.cardTypeDesigns.kind, "card"),
      ),
    )
    .limit(1);

  if (!link) {
    await linkDesignToCardType(args.tenantId, design.id, args.cardTypeId);
  } else if (link.cardDesignId !== design.id) {
    await db
      .delete(schema.cardTypeDesigns)
      .where(eq(schema.cardTypeDesigns.id, link.id));
    await linkDesignToCardType(args.tenantId, design.id, args.cardTypeId);
  }

  return design.id;
}
