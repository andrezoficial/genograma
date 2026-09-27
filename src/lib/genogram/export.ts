export type ReportMeta = {
  title: string;
  professional: string;
  date: string;
  notes: string;
};

const REPORT_LEGEND: Array<{ label: string; kind: "square" | "circle" | "deceased" | "line" | "dashed" | "double" | "zigzag" }> = [
  { label: "Hombre", kind: "square" },
  { label: "Mujer", kind: "circle" },
  { label: "Fallecido/a", kind: "deceased" },
  { label: "Matrimonio", kind: "double" },
  { label: "Unión / separación", kind: "dashed" },
  { label: "Corte relacional", kind: "double" },
  { label: "Conflicto", kind: "zigzag" },
];

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/**
 * Wraps the current genogram SVG with a printable clinical report frame:
 * title block (case, professional, date), the diagram itself, a full legend
 * and a confidentiality footer. Returns a standalone SVG ready to rasterize.
 */
export function buildReportSvg(
  svg: SVGSVGElement,
  box: { minX: number; minY: number; width: number; height: number },
  meta: ReportMeta,
): SVGSVGElement {
  const HEADER_H = 108;
  const LEGEND_H = 96;
  const FOOTER_H = 34;
  const totalH = HEADER_H + box.height + LEGEND_H + FOOTER_H;
  const ink = "#231e18";
  const muted = "#6a6258";
  const paper = "#f3ece1";
  const font = "Source Sans 3, Segoe UI, sans-serif";
  const display = "Newsreader, Georgia, serif";

  const out = svgEl("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    viewBox: `${box.minX} ${box.minY - HEADER_H} ${box.width} ${totalH}`,
    width: Math.round(box.width),
    height: Math.round(totalH),
  }) as unknown as SVGSVGElement;

  out.appendChild(svgEl("rect", { x: box.minX, y: box.minY - HEADER_H, width: box.width, height: totalH, fill: paper }));

  const left = box.minX + 28;
  const top = box.minY - HEADER_H;
  const title = svgEl("text", { x: left, y: top + 34, "font-family": display, "font-size": 24, "font-style": "italic", fill: ink });
  title.textContent = meta.title || "Genograma familiar";
  out.appendChild(title);

  const meta1 = svgEl("text", { x: left, y: top + 60, "font-family": font, "font-size": 12.5, "font-weight": 600, fill: muted });
  meta1.textContent = [meta.professional ? `Profesional: ${meta.professional}` : null, meta.date ? `Fecha: ${meta.date}` : null]
    .filter(Boolean)
    .join("   ·   ");
  out.appendChild(meta1);

  if (meta.notes) {
    const notes = svgEl("text", { x: left, y: top + 80, "font-family": font, "font-size": 11.5, fill: muted, "font-style": "italic" });
    notes.textContent = meta.notes.length > 140 ? meta.notes.slice(0, 137) + "…" : meta.notes;
    out.appendChild(notes);
  }

  out.appendChild(
    svgEl("line", { x1: left, y1: top + 92, x2: box.minX + box.width - 28, y2: top + 92, stroke: ink, "stroke-width": 1, opacity: 0.35 }),
  );

  const world = svg.querySelector("[data-world]") as SVGGElement | null;
  if (world) {
    const clonedWorld = world.cloneNode(true) as SVGGElement;
    clonedWorld.removeAttribute("transform");
    out.appendChild(clonedWorld);
  }

  const legendY = box.minY + box.height + 30;
  const legendLabel = svgEl("text", {
    x: left,
    y: legendY,
    "font-family": font,
    "font-size": 10,
    "font-weight": 700,
    "letter-spacing": 0.6,
    fill: muted,
  });
  legendLabel.textContent = "LEYENDA";
  out.appendChild(legendLabel);

  let lx = left;
  const ly = legendY + 24;
  for (const item of REPORT_LEGEND) {
    if (item.kind === "square") {
      out.appendChild(svgEl("rect", { x: lx, y: ly - 8, width: 16, height: 16, fill: "#c2d6ca", stroke: ink, "stroke-width": 1.5 }));
    } else if (item.kind === "circle") {
      out.appendChild(svgEl("circle", { cx: lx + 8, cy: ly, r: 8, fill: "#e8c1a3", stroke: ink, "stroke-width": 1.5 }));
    } else if (item.kind === "deceased") {
      out.appendChild(svgEl("rect", { x: lx, y: ly - 8, width: 16, height: 16, fill: "#a99d8a", stroke: ink, "stroke-width": 1.5 }));
      out.appendChild(svgEl("line", { x1: lx + 3, y1: ly - 5, x2: lx + 13, y2: ly + 5, stroke: paper, "stroke-width": 1.6 }));
      out.appendChild(svgEl("line", { x1: lx + 13, y1: ly - 5, x2: lx + 3, y2: ly + 5, stroke: paper, "stroke-width": 1.6 }));
    } else if (item.kind === "double") {
      out.appendChild(svgEl("line", { x1: lx, y1: ly - 2, x2: lx + 16, y2: ly - 2, stroke: ink, "stroke-width": 1.6 }));
      out.appendChild(svgEl("line", { x1: lx, y1: ly + 2, x2: lx + 16, y2: ly + 2, stroke: ink, "stroke-width": 1.6 }));
    } else if (item.kind === "dashed") {
      out.appendChild(svgEl("line", { x1: lx, y1: ly, x2: lx + 16, y2: ly, stroke: ink, "stroke-width": 1.6, "stroke-dasharray": "4 3" }));
    } else if (item.kind === "zigzag") {
      out.appendChild(svgEl("path", { d: `M ${lx} ${ly + 5} L ${lx + 4} ${ly - 5} L ${lx + 8} ${ly + 5} L ${lx + 12} ${ly - 5} L ${lx + 16} ${ly + 5}`, fill: "none", stroke: ink, "stroke-width": 1.6 }));
    }
    const label = svgEl("text", { x: lx + 22, y: ly + 4, "font-family": font, "font-size": 11.5, fill: ink });
    label.textContent = item.label;
    out.appendChild(label);
    lx += 22 + item.label.length * 6.4 + 22;
  }

  const footerY = box.minY + box.height + LEGEND_H + FOOTER_H - 10;
  out.appendChild(
    svgEl("line", { x1: box.minX, y1: footerY - 20, x2: box.minX + box.width, y2: footerY - 20, stroke: ink, "stroke-width": 1, opacity: 0.2 }),
  );
  const footer = svgEl("text", { x: left, y: footerY, "font-family": font, "font-size": 10, fill: muted });
  footer.textContent = "Documento clínico · uso confidencial · genograma.app";
  out.appendChild(footer);

  return out;
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportSvgElement(svg: SVGSVGElement, filename = "genograma.svg") {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  const blob = new Blob([new XMLSerializer().serializeToString(clone)], {
    type: "image/svg+xml;charset=utf-8",
  });
  downloadBlob(filename, blob);
}

export async function exportPngElement(svg: SVGSVGElement, filename = "genograma.png") {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const vb = svg.viewBox.baseVal;
  const width = Math.max(800, (vb.width || svg.clientWidth || 900) * 2);
  const height = Math.max(500, (vb.height || svg.clientHeight || 560) * 2);
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  const xml = new XMLSerializer().serializeToString(clone);
  const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("No se pudo rasterizar el SVG"));
    img.src = url;
  });
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#f3ece1";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  await new Promise<void>((resolve) => {
    canvas.toBlob((blob) => {
      if (blob) downloadBlob(filename, blob);
      resolve();
    }, "image/png");
  });
}
