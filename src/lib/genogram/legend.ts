/** Shared clinical-legend glyphs — the same marks the canvas actually draws. */

export const INK = "#231e18";
export const MUTED = "#6a6258";
export const MALE = "#c2d6ca";
export const FEMALE = "#e8c1a3";
export const UNKNOWN = "#e3dcc9";
export const DECEASED = "#a99d8a";
export const IP_RING = "#8a5a3c";
export const HOUSEHOLD = "#5b6b5e";
export const COND_MENTAL = "#5a4a78";
export const COND_PHYSICAL = "#8a3b32";

export type LegendKind =
  | "male"
  | "female"
  | "unknown"
  | "deceased"
  | "ip"
  | "cond_alcohol"
  | "cond_drugs"
  | "cond_mental"
  | "cond_physical"
  | "household"
  | "marriage"
  | "cohabitation"
  | "separation"
  | "divorce"
  | "widowed"
  | "dating"
  | "child"
  | "adopted"
  | "close"
  | "distant"
  | "cutoff"
  | "conflict";

export type GlyphEl = {
  tag: "rect" | "circle" | "line" | "polygon" | "path" | "ellipse";
  attrs: Record<string, string | number>;
};

export type GlyphSpec = {
  viewBox: string;
  width: number;
  height: number;
  els: GlyphEl[];
};

export const LEGEND_GROUPS: { title: string; items: { kind: LegendKind; label: string }[] }[] = [
  {
    title: "Personas",
    items: [
      { kind: "male", label: "Hombre" },
      { kind: "female", label: "Mujer" },
      { kind: "unknown", label: "Género s/d" },
      { kind: "deceased", label: "Fallecido/a" },
      { kind: "ip", label: "Paciente identificado" },
    ],
  },
  {
    title: "Marcas clínicas",
    items: [
      { kind: "cond_alcohol", label: "Alcohol / alcoholismo" },
      { kind: "cond_drugs", label: "Otras sustancias" },
      { kind: "cond_mental", label: "Enfermedad mental" },
      { kind: "cond_physical", label: "Enfermedad física" },
    ],
  },
  {
    title: "Convivencia",
    items: [{ kind: "household", label: "Núcleo familiar (viven juntos)" }],
  },
  {
    title: "Vínculos familiares",
    items: [
      { kind: "marriage", label: "Matrimonio" },
      { kind: "cohabitation", label: "Unión libre" },
      { kind: "separation", label: "Separados/as" },
      { kind: "divorce", label: "Divorciados/as" },
      { kind: "widowed", label: "Viudez" },
      { kind: "dating", label: "Noviazgo" },
      { kind: "child", label: "Hijos" },
      { kind: "adopted", label: "Adopción" },
    ],
  },
  {
    title: "Vínculos emocionales",
    items: [
      { kind: "close", label: "Cercana" },
      { kind: "distant", label: "Distante" },
      { kind: "cutoff", label: "Corte" },
      { kind: "conflict", label: "Conflicto" },
    ],
  },
];

export function glyphSpec(kind: LegendKind): GlyphSpec {
  switch (kind) {
    case "male":
      return {
        viewBox: "0 0 16 16",
        width: 14,
        height: 14,
        els: [{ tag: "rect", attrs: { x: 1.5, y: 1.5, width: 13, height: 13, fill: MALE, stroke: INK, "stroke-width": 1.6 } }],
      };
    case "female":
      return {
        viewBox: "0 0 16 16",
        width: 14,
        height: 14,
        els: [{ tag: "circle", attrs: { cx: 8, cy: 8, r: 6.4, fill: FEMALE, stroke: INK, "stroke-width": 1.6 } }],
      };
    case "unknown":
      return {
        viewBox: "0 0 16 16",
        width: 14,
        height: 14,
        els: [
          {
            tag: "polygon",
            attrs: { points: "8,1.6 14.6,14.2 1.4,14.2", fill: UNKNOWN, stroke: INK, "stroke-width": 1.6 },
          },
        ],
      };
    case "deceased":
      return {
        viewBox: "0 0 16 16",
        width: 14,
        height: 14,
        els: [
          { tag: "rect", attrs: { x: 1.5, y: 1.5, width: 13, height: 13, fill: DECEASED, stroke: INK, "stroke-width": 1.6 } },
          { tag: "line", attrs: { x1: 4, y1: 4, x2: 12, y2: 12, stroke: INK, "stroke-width": 1.6 } },
          { tag: "line", attrs: { x1: 12, y1: 4, x2: 4, y2: 12, stroke: INK, "stroke-width": 1.6 } },
        ],
      };
    case "ip":
      return {
        viewBox: "0 0 18 18",
        width: 16,
        height: 16,
        els: [
          {
            tag: "circle",
            attrs: { cx: 9, cy: 9, r: 8, fill: "none", stroke: IP_RING, "stroke-width": 1.5, "stroke-dasharray": "2 2.5" },
          },
          { tag: "circle", attrs: { cx: 9, cy: 9, r: 5.2, fill: FEMALE, stroke: INK, "stroke-width": 1.4 } },
        ],
      };
    case "cond_alcohol":
      return {
        viewBox: "0 0 16 16",
        width: 14,
        height: 14,
        els: [
          { tag: "rect", attrs: { x: 1.5, y: 1.5, width: 13, height: 13, fill: MALE, stroke: INK, "stroke-width": 1.6 } },
          { tag: "rect", attrs: { x: 1.5, y: 9, width: 13, height: 5.5, fill: INK } },
        ],
      };
    case "cond_drugs":
      return {
        viewBox: "0 0 16 16",
        width: 14,
        height: 14,
        els: [
          { tag: "rect", attrs: { x: 1.5, y: 1.5, width: 13, height: 13, fill: MALE, stroke: INK, "stroke-width": 1.6 } },
          { tag: "line", attrs: { x1: 2, y1: 14, x2: 8, y2: 8, stroke: INK, "stroke-width": 1.3 } },
          { tag: "line", attrs: { x1: 6, y1: 14, x2: 12, y2: 8, stroke: INK, "stroke-width": 1.3 } },
          { tag: "line", attrs: { x1: 10, y1: 14, x2: 14, y2: 10, stroke: INK, "stroke-width": 1.3 } },
        ],
      };
    case "cond_mental":
      return {
        viewBox: "0 0 16 16",
        width: 14,
        height: 14,
        els: [
          { tag: "rect", attrs: { x: 1.5, y: 1.5, width: 13, height: 13, fill: MALE, stroke: INK, "stroke-width": 1.6 } },
          { tag: "rect", attrs: { x: 1.5, y: 1.5, width: 6.5, height: 13, fill: COND_MENTAL } },
        ],
      };
    case "cond_physical":
      return {
        viewBox: "0 0 16 16",
        width: 14,
        height: 14,
        els: [
          { tag: "rect", attrs: { x: 1.5, y: 1.5, width: 13, height: 13, fill: MALE, stroke: INK, "stroke-width": 1.6 } },
          { tag: "rect", attrs: { x: 8, y: 1.5, width: 6.5, height: 13, fill: COND_PHYSICAL } },
        ],
      };
    case "household":
      return {
        viewBox: "0 0 22 14",
        width: 20,
        height: 12,
        els: [
          {
            tag: "ellipse",
            attrs: {
              cx: 11,
              cy: 7,
              rx: 9.5,
              ry: 5.4,
              fill: "none",
              stroke: HOUSEHOLD,
              "stroke-width": 1.5,
              "stroke-dasharray": "3.5 2.5",
            },
          },
        ],
      };
    case "marriage":
      return {
        viewBox: "0 0 22 12",
        width: 20,
        height: 12,
        els: [
          { tag: "line", attrs: { x1: 1, y1: 4, x2: 21, y2: 4, stroke: INK, "stroke-width": 1.7 } },
          { tag: "line", attrs: { x1: 1, y1: 8, x2: 21, y2: 8, stroke: INK, "stroke-width": 1.7 } },
        ],
      };
    case "cohabitation":
      return {
        viewBox: "0 0 22 12",
        width: 20,
        height: 12,
        els: [{ tag: "line", attrs: { x1: 1, y1: 6, x2: 21, y2: 6, stroke: INK, "stroke-width": 1.7, "stroke-dasharray": "4 3" } }],
      };
    case "separation":
      return {
        viewBox: "0 0 22 12",
        width: 20,
        height: 12,
        els: [
          { tag: "line", attrs: { x1: 1, y1: 4, x2: 21, y2: 4, stroke: INK, "stroke-width": 1.5, "stroke-dasharray": "4 3" } },
          { tag: "line", attrs: { x1: 1, y1: 8, x2: 21, y2: 8, stroke: INK, "stroke-width": 1.5, "stroke-dasharray": "4 3" } },
          { tag: "line", attrs: { x1: 9, y1: 1.5, x2: 13, y2: 10.5, stroke: INK, "stroke-width": 1.6 } },
        ],
      };
    case "divorce":
      return {
        viewBox: "0 0 22 12",
        width: 20,
        height: 12,
        els: [
          { tag: "line", attrs: { x1: 1, y1: 4, x2: 21, y2: 4, stroke: INK, "stroke-width": 1.5 } },
          { tag: "line", attrs: { x1: 1, y1: 8, x2: 21, y2: 8, stroke: INK, "stroke-width": 1.5 } },
          { tag: "line", attrs: { x1: 8, y1: 1.5, x2: 11, y2: 10.5, stroke: INK, "stroke-width": 1.6 } },
          { tag: "line", attrs: { x1: 11, y1: 1.5, x2: 14, y2: 10.5, stroke: INK, "stroke-width": 1.6 } },
        ],
      };
    case "widowed":
      return {
        viewBox: "0 0 22 12",
        width: 20,
        height: 12,
        els: [
          { tag: "line", attrs: { x1: 1, y1: 4, x2: 21, y2: 4, stroke: INK, "stroke-width": 1.5 } },
          { tag: "line", attrs: { x1: 1, y1: 8, x2: 21, y2: 8, stroke: INK, "stroke-width": 1.5 } },
          { tag: "line", attrs: { x1: 11, y1: 0.5, x2: 11, y2: 11.5, stroke: INK, "stroke-width": 1.6 } },
          { tag: "line", attrs: { x1: 7.5, y1: 3.5, x2: 14.5, y2: 3.5, stroke: INK, "stroke-width": 1.6 } },
        ],
      };
    case "dating":
      return {
        viewBox: "0 0 22 12",
        width: 20,
        height: 12,
        els: [{ tag: "line", attrs: { x1: 1, y1: 6, x2: 21, y2: 6, stroke: INK, "stroke-width": 1.7, "stroke-dasharray": "1.5 3" } }],
      };
    case "child":
      return {
        viewBox: "0 0 22 14",
        width: 20,
        height: 13,
        els: [
          { tag: "line", attrs: { x1: 2, y1: 3, x2: 20, y2: 3, stroke: INK, "stroke-width": 1.5 } },
          { tag: "line", attrs: { x1: 11, y1: 3, x2: 11, y2: 13, stroke: INK, "stroke-width": 1.5 } },
        ],
      };
    case "adopted":
      return {
        viewBox: "0 0 22 14",
        width: 20,
        height: 13,
        els: [
          { tag: "line", attrs: { x1: 2, y1: 3, x2: 20, y2: 3, stroke: INK, "stroke-width": 1.5 } },
          { tag: "line", attrs: { x1: 11, y1: 3, x2: 11, y2: 13, stroke: INK, "stroke-width": 1.5, "stroke-dasharray": "3 2.5" } },
        ],
      };
    case "close":
      return {
        viewBox: "0 0 22 12",
        width: 20,
        height: 12,
        els: [
          { tag: "line", attrs: { x1: 1, y1: 3, x2: 21, y2: 3, stroke: INK, "stroke-width": 1.35 } },
          { tag: "line", attrs: { x1: 1, y1: 6, x2: 21, y2: 6, stroke: INK, "stroke-width": 1.35 } },
          { tag: "line", attrs: { x1: 1, y1: 9, x2: 21, y2: 9, stroke: INK, "stroke-width": 1.35 } },
        ],
      };
    case "distant":
      return {
        viewBox: "0 0 22 12",
        width: 20,
        height: 12,
        els: [{ tag: "line", attrs: { x1: 1, y1: 6, x2: 21, y2: 6, stroke: INK, "stroke-width": 1.5, "stroke-dasharray": "2 3.5" } }],
      };
    case "cutoff":
      return {
        viewBox: "0 0 22 12",
        width: 20,
        height: 12,
        els: [
          { tag: "line", attrs: { x1: 1, y1: 6, x2: 8, y2: 6, stroke: INK, "stroke-width": 1.5 } },
          { tag: "line", attrs: { x1: 14, y1: 6, x2: 21, y2: 6, stroke: INK, "stroke-width": 1.5 } },
          { tag: "line", attrs: { x1: 8.5, y1: 1.5, x2: 10.5, y2: 10.5, stroke: INK, "stroke-width": 1.5 } },
          { tag: "line", attrs: { x1: 11.5, y1: 1.5, x2: 13.5, y2: 10.5, stroke: INK, "stroke-width": 1.5 } },
        ],
      };
    case "conflict":
      return {
        viewBox: "0 0 22 12",
        width: 20,
        height: 12,
        els: [
          {
            tag: "path",
            attrs: { d: "M1 9 L5 3 L9 9 L13 3 L17 9 L21 3", fill: "none", stroke: INK, "stroke-width": 1.5 },
          },
        ],
      };
  }
}

const REACT_ATTR: Record<string, string> = {
  "stroke-width": "strokeWidth",
  "stroke-dasharray": "strokeDasharray",
  "stroke-linecap": "strokeLinecap",
  "fill-rule": "fillRule",
};

export function reactAttrs(attrs: Record<string, string | number>): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(attrs)) out[REACT_ATTR[k] ?? k] = v;
  return out;
}
