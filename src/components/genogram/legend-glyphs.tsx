import { glyphSpec, reactAttrs, type LegendKind } from "@/lib/genogram/legend";

export function LegendGlyph({ kind }: { kind: LegendKind }) {
  const g = glyphSpec(kind);
  return (
    <svg width={g.width} height={g.height} viewBox={g.viewBox} aria-hidden className="shrink-0">
      {g.els.map((el, i) => {
        const a = reactAttrs(el.attrs);
        switch (el.tag) {
          case "rect":
            return <rect key={i} {...a} />;
          case "circle":
            return <circle key={i} {...a} />;
          case "line":
            return <line key={i} {...a} />;
          case "polygon":
            return <polygon key={i} {...a} />;
          case "path":
            return <path key={i} {...a} />;
          case "ellipse":
            return <ellipse key={i} {...a} />;
        }
      })}
    </svg>
  );
}
