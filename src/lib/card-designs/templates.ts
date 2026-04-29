/**
 * Sample card design templates.
 *
 * Each template is a complete CardDesignLayout (canvas + nodes) authored as a
 * starting point users can drop into the editor. Node IDs are placeholders;
 * the editor remaps them to fresh UUIDs on apply so duplicates are safe.
 *
 * Customizable fields are authored as static text/colors so the user can edit
 * them in-place. Codes (text, QR, barcode) use the dynamic `card_code` source
 * so each issued card resolves them automatically.
 */

import type { CardDesignLayout, LayoutNode } from "./types";

export interface DesignTemplate {
  id: string;
  name: string;
  description: string;
  kind: "card" | "passbook";
  /** Hint to the user about which parts of the template are meant to be edited. */
  customizableHints: string[];
  layout: CardDesignLayout;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

let _counter = 0;
const tid = (prefix: string) => `tpl-${prefix}-${++_counter}`;

// ─── Template 1 — Card with photo + QR (CR80 mm) ────────────────────────────

const photoCardTemplate: DesignTemplate = {
  id: "card-photo-id",
  name: "Carnet con Foto",
  description:
    "Tarjeta CR80 con franja superior de marca, foto del titular, nombre, cargo y código QR.",
  kind: "card",
  customizableHints: ["Nombre del titular", "Cargo / rol", "Color de marca"],
  layout: {
    version: 1,
    canvas: {
      width: 85.6,
      height: 54,
      unit: "mm",
      safeMargin: { top: 3, right: 3, bottom: 3, left: 3 },
      background: "#ffffff",
    },
    nodes: [
      // Top color band
      {
        id: tid("rect"),
        type: "rect",
        x: 0,
        y: 0,
        width: 85.6,
        height: 13,
        rotation: 0,
        zIndex: 0,
        locked: false,
        style: {
          fill: "#1f2a55",
          stroke: "#1f2a55",
          strokeWidth: 0,
          cornerRadius: 0,
        },
      } satisfies LayoutNode,
      // Header text on band
      {
        id: tid("text"),
        type: "text",
        x: 4,
        y: 3.5,
        width: 70,
        height: 6,
        rotation: 0,
        zIndex: 1,
        locked: false,
        content: { source: "static", staticValue: "CARNET DE ACCESO" },
        style: {
          fontFamily: "Arial",
          fontSize: 9,
          color: "#ffffff",
          align: "left",
          multiline: false,
          overflow: "truncate",
        },
      },
      // Photo placeholder (empty URL → renders as the dashed placeholder rect)
      {
        id: tid("img"),
        type: "image",
        x: 4,
        y: 17,
        width: 22,
        height: 30,
        rotation: 0,
        zIndex: 2,
        locked: false,
        content: { source: "static" },
        mode: "fill",
      },
      // Holder name
      {
        id: tid("text"),
        type: "text",
        x: 30,
        y: 18,
        width: 50,
        height: 7,
        rotation: 0,
        zIndex: 3,
        locked: false,
        content: { source: "static", staticValue: "Nombre del Titular" },
        style: {
          fontFamily: "Arial",
          fontSize: 11,
          color: "#1f2a55",
          align: "left",
          multiline: false,
          overflow: "truncate",
        },
      },
      // Role / sub-line
      {
        id: tid("text"),
        type: "text",
        x: 30,
        y: 27,
        width: 50,
        height: 6,
        rotation: 0,
        zIndex: 4,
        locked: false,
        content: { source: "static", staticValue: "Cargo / Rol" },
        style: {
          fontFamily: "Arial",
          fontSize: 8,
          color: "#5f6b8a",
          align: "left",
          multiline: false,
          overflow: "truncate",
        },
      },
      // Card code text
      {
        id: tid("text"),
        type: "text",
        x: 30,
        y: 42,
        width: 36,
        height: 5,
        rotation: 0,
        zIndex: 5,
        locked: false,
        content: { source: "card_code" },
        style: {
          fontFamily: "Courier New",
          fontSize: 8,
          color: "#1f2a55",
          align: "left",
          multiline: false,
          overflow: "truncate",
        },
      },
      // QR
      {
        id: tid("qr"),
        type: "qr",
        x: 67,
        y: 32,
        width: 15,
        height: 15,
        rotation: 0,
        zIndex: 6,
        locked: false,
        content: { source: "card_code" },
      },
    ],
  },
};

// ─── Template 2 — Event pass (CR80 mm) ──────────────────────────────────────

const eventPassTemplate: DesignTemplate = {
  id: "card-event-pass",
  name: "Pase de Evento",
  description:
    "Tarjeta CR80 con fondo oscuro, nombre del evento destacado y QR centrado.",
  kind: "card",
  customizableHints: ["Nombre del evento", "Subtítulo", "Color de fondo"],
  layout: {
    version: 1,
    canvas: {
      width: 85.6,
      height: 54,
      unit: "mm",
      safeMargin: { top: 3, right: 3, bottom: 3, left: 3 },
      background: "#0f172a",
    },
    nodes: [
      // Decorative accent stripe
      {
        id: tid("rect"),
        type: "rect",
        x: 0,
        y: 0,
        width: 85.6,
        height: 4,
        rotation: 0,
        zIndex: 0,
        locked: false,
        style: {
          fill: "#f59e0b",
          stroke: "#f59e0b",
          strokeWidth: 0,
          cornerRadius: 0,
        },
      },
      // Event name
      {
        id: tid("text"),
        type: "text",
        x: 4,
        y: 8,
        width: 78,
        height: 8,
        rotation: 0,
        zIndex: 1,
        locked: false,
        content: { source: "static", staticValue: "Nombre del Evento" },
        style: {
          fontFamily: "Georgia",
          fontSize: 13,
          color: "#ffffff",
          align: "center",
          multiline: false,
          overflow: "truncate",
        },
      },
      // Subtitle
      {
        id: tid("text"),
        type: "text",
        x: 4,
        y: 17,
        width: 78,
        height: 5,
        rotation: 0,
        zIndex: 2,
        locked: false,
        content: { source: "static", staticValue: "ACCESO GENERAL" },
        style: {
          fontFamily: "Arial",
          fontSize: 8,
          color: "#f59e0b",
          align: "center",
          multiline: false,
          overflow: "truncate",
        },
      },
      // QR centered
      {
        id: tid("qr"),
        type: "qr",
        x: 33.8,
        y: 22,
        width: 18,
        height: 18,
        rotation: 0,
        zIndex: 3,
        locked: false,
        content: { source: "card_code" },
      },
      // Holder name
      {
        id: tid("text"),
        type: "text",
        x: 4,
        y: 41,
        width: 78,
        height: 5,
        rotation: 0,
        zIndex: 4,
        locked: false,
        content: { source: "static", staticValue: "Titular del pase" },
        style: {
          fontFamily: "Arial",
          fontSize: 9,
          color: "#ffffff",
          align: "center",
          multiline: false,
          overflow: "truncate",
        },
      },
      // Code
      {
        id: tid("text"),
        type: "text",
        x: 4,
        y: 47,
        width: 78,
        height: 4,
        rotation: 0,
        zIndex: 5,
        locked: false,
        content: { source: "card_code" },
        style: {
          fontFamily: "Courier New",
          fontSize: 7,
          color: "#94a3b8",
          align: "center",
          multiline: false,
          overflow: "truncate",
        },
      },
    ],
  },
};

// ─── Template 3 — Passbook style pass (340×440 px) ──────────────────────────

const passbookTemplate: DesignTemplate = {
  id: "passbook-generic",
  name: "Passbook Genérico",
  description:
    "Pase digital tipo Wallet con cabecera de marca, datos del titular y código de barras grande.",
  kind: "passbook",
  customizableHints: ["Nombre de marca", "Logo", "Color de cabecera"],
  layout: {
    version: 1,
    canvas: {
      width: 340,
      height: 440,
      unit: "px",
      safeMargin: { top: 16, right: 16, bottom: 16, left: 16 },
      background: "#ffffff",
    },
    nodes: [
      // Header band
      {
        id: tid("rect"),
        type: "rect",
        x: 0,
        y: 0,
        width: 340,
        height: 80,
        rotation: 0,
        zIndex: 0,
        locked: false,
        style: {
          fill: "#0d9488",
          stroke: "#0d9488",
          strokeWidth: 0,
          cornerRadius: 0,
        },
      },
      // Logo placeholder
      {
        id: tid("img"),
        type: "image",
        x: 20,
        y: 18,
        width: 44,
        height: 44,
        rotation: 0,
        zIndex: 1,
        locked: false,
        content: { source: "static" },
        mode: "fit",
      },
      // Brand name (header)
      {
        id: tid("text"),
        type: "text",
        x: 76,
        y: 28,
        width: 244,
        height: 26,
        rotation: 0,
        zIndex: 2,
        locked: false,
        content: { source: "static", staticValue: "Mi Marca" },
        style: {
          fontFamily: "Helvetica",
          fontSize: 22,
          color: "#ffffff",
          align: "left",
          multiline: false,
          overflow: "truncate",
        },
      },
      // Section: Titular label
      {
        id: tid("text"),
        type: "text",
        x: 20,
        y: 100,
        width: 300,
        height: 14,
        rotation: 0,
        zIndex: 3,
        locked: false,
        content: { source: "static", staticValue: "TITULAR" },
        style: {
          fontFamily: "Arial",
          fontSize: 11,
          color: "#64748b",
          align: "left",
          multiline: false,
          overflow: "truncate",
        },
      },
      // Section: Titular value
      {
        id: tid("text"),
        type: "text",
        x: 20,
        y: 116,
        width: 300,
        height: 26,
        rotation: 0,
        zIndex: 4,
        locked: false,
        content: { source: "static", staticValue: "Nombre del titular" },
        style: {
          fontFamily: "Helvetica",
          fontSize: 20,
          color: "#0f172a",
          align: "left",
          multiline: false,
          overflow: "truncate",
        },
      },
      // Section: Localización label
      {
        id: tid("text"),
        type: "text",
        x: 20,
        y: 158,
        width: 300,
        height: 14,
        rotation: 0,
        zIndex: 5,
        locked: false,
        content: { source: "static", staticValue: "LOCALIZACIÓN" },
        style: {
          fontFamily: "Arial",
          fontSize: 11,
          color: "#64748b",
          align: "left",
          multiline: false,
          overflow: "truncate",
        },
      },
      // Section: Localización value
      {
        id: tid("text"),
        type: "text",
        x: 20,
        y: 174,
        width: 300,
        height: 22,
        rotation: 0,
        zIndex: 6,
        locked: false,
        content: { source: "static", staticValue: "Madrid · Sala Principal" },
        style: {
          fontFamily: "Helvetica",
          fontSize: 16,
          color: "#0f172a",
          align: "left",
          multiline: false,
          overflow: "truncate",
        },
      },
      // Divider
      {
        id: tid("line"),
        type: "line",
        x1: 20,
        y1: 220,
        x2: 320,
        y2: 220,
        zIndex: 7,
        locked: false,
        style: { stroke: "#e2e8f0", strokeWidth: 1 },
      },
      // Barcode
      {
        id: tid("barcode"),
        type: "barcode128",
        x: 30,
        y: 250,
        width: 280,
        height: 80,
        rotation: 0,
        zIndex: 8,
        locked: false,
        content: { source: "card_code" },
      },
      // Card code text under barcode
      {
        id: tid("text"),
        type: "text",
        x: 20,
        y: 336,
        width: 300,
        height: 16,
        rotation: 0,
        zIndex: 9,
        locked: false,
        content: { source: "card_code" },
        style: {
          fontFamily: "Courier New",
          fontSize: 13,
          color: "#0f172a",
          align: "center",
          multiline: false,
          overflow: "truncate",
        },
      },
      // Footer brand
      {
        id: tid("text"),
        type: "text",
        x: 20,
        y: 408,
        width: 300,
        height: 14,
        rotation: 0,
        zIndex: 10,
        locked: false,
        content: { source: "static", staticValue: "veredillas.app" },
        style: {
          fontFamily: "Arial",
          fontSize: 10,
          color: "#94a3b8",
          align: "center",
          multiline: false,
          overflow: "truncate",
        },
      },
    ],
  },
};

// ─── Public API ─────────────────────────────────────────────────────────────

export const SAMPLE_TEMPLATES: readonly DesignTemplate[] = [
  photoCardTemplate,
  eventPassTemplate,
  passbookTemplate,
];

/**
 * Returns the templates compatible with a given design kind.
 */
export function getTemplatesForKind(kind: "card" | "passbook"): DesignTemplate[] {
  return SAMPLE_TEMPLATES.filter((t) => t.kind === kind);
}

/**
 * Clones a template's layout and assigns fresh UUIDs to every node so it can
 * be safely applied to an existing design without ID collisions.
 */
export function cloneTemplateLayout(template: DesignTemplate): CardDesignLayout {
  return {
    ...template.layout,
    canvas: {
      ...template.layout.canvas,
      safeMargin: { ...template.layout.canvas.safeMargin },
    },
    nodes: template.layout.nodes.map((n) => ({
      ...n,
      id: crypto.randomUUID(),
    })) as LayoutNode[],
  };
}
