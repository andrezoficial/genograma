import { glyphSpec, LEGEND_GROUPS, type LegendKind } from "./legend.ts";

export type ReportMeta = {
  title: string;
  professional: string;
  date: string;
  notes: string;
};

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

function appendGlyph(parent: SVGElement, kind: LegendKind, x: number, y: number) {
  const spec = glyphSpec(kind);
  const g = svgEl("g", { transform: `translate(${x} ${y - spec.height / 2})` });
  const inner = svgEl("svg", {
    x: 0,
    y: 0,
    width: spec.width,
    height: spec.height,
    viewBox: spec.viewBox,
  });
  for (const el of spec.els) {
    inner.appendChild(svgEl(el.tag, el.attrs));
  }
  g.appendChild(inner);
  parent.appendChild(g);
  return spec.width;
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
  const LEGEND_H = 168;
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

  const legendY = box.minY + box.height + 22;
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

  const maxX = box.minX + box.width - 28;
  let lx = left;
  let ly = legendY + 22;
  const colGap = 16;

  for (const group of LEGEND_GROUPS) {
    for (const item of group.items) {
      const spec = glyphSpec(item.kind);
      const labelW = item.label.length * 6.2;
      const need = spec.width + 6 + labelW + colGap;
      if (lx + need > maxX && lx > left) {
        lx = left;
        ly += 22;
      }
      appendGlyph(out, item.kind, lx, ly);
      const label = svgEl("text", {
        x: lx + spec.width + 6,
        y: ly + 4,
        "font-family": font,
        "font-size": 11,
        fill: ink,
      });
      label.textContent = item.label;
      out.appendChild(label);
      lx += need;
    }
  }

  const footerY = box.minY + box.height + LEGEND_H + FOOTER_H - 10;
  out.appendChild(
    svgEl("line", { x1: box.minX, y1: footerY - 20, x2: box.minX + box.width, y2: footerY - 20, stroke: ink, "stroke-width": 1, opacity: 0.2 }),
  );
  const footer = svgEl("text", { x: left, y: footerY, "font-family": font, "font-size": 10, fill: muted });
  footer.textContent = "Documento clínico · uso confidencial · Genograma Free";
  out.appendChild(footer);

  return out;
}

/**
 * En celulares abre la hoja de "Compartir" (guardar en Fotos/Archivos, WhatsApp, correo…), que es
 * mucho más práctica que una descarga. Devuelve true si el archivo ya quedó atendido (compartido o
 * cancelado por la persona); false si hay que descargarlo de la forma clásica.
 */
async function tryShare(filename: string, blob: Blob): Promise<boolean> {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function" || typeof navigator.canShare !== "function") {
    return false;
  }
  if (!window.matchMedia("(pointer: coarse)").matches) return false;
  const file = new File([blob], filename, { type: blob.type });
  if (!navigator.canShare({ files: [file] })) return false;
  try {
    await navigator.share({ files: [file], title: filename });
    return true;
  } catch (err) {
    return err instanceof DOMException && err.name === "AbortError";
  }
}

export async function downloadBlob(filename: string, blob: Blob) {
  if (await tryShare(filename, blob)) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Safari de iPhone necesita que la URL siga viva un momento
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
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
