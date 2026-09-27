import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode, type RefObject } from "react";
import { ChevronDown, Link2, Maximize2, Minus, Plus, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  PARENT_TYPES,
  REL_LABELS,
  UNION_TYPES,
  personCaptionDepth,
  personYears,
  splitDisplayName,
  type Gender,
  type Household,
  type Person,
  type RelType,
  type Relationship,
} from "@/lib/genogram/types";
import { boundingBox } from "@/lib/genogram/layout";
import { useGenogram } from "@/lib/genogram/store";
import { LEGEND_GROUPS } from "@/lib/genogram/legend";
import { cn } from "@/lib/utils";
import { LegendGlyph } from "./legend-glyphs";

const INK = "#231e18";
const MUTED = "#6a6258";
const MALE = "#c2d6ca";
const FEMALE = "#e8c1a3";
const UNKNOWN = "#e3dcc9";
const DECEASED = "#a99d8a";
const ACCENT = "#2a332c";
const IP_RING = "#8a5a3c";
const TYPEFACE = "Source Sans 3, Segoe UI, sans-serif";
const HALF = 18;

const LINK_TYPES: RelType[] = [
  "marriage",
  "cohabitation",
  "separation",
  "divorce",
  "parent_child",
  "adopted",
  "sibling",
  "close",
  "distant",
  "cutoff",
  "conflict",
];

type View = { x: number; y: number; k: number };
type Tool = "select" | "add" | "link";

function fillOf(p: Person) {
  if (p.deceased) return DECEASED;
  if (p.gender === "female") return FEMALE;
  if (p.gender === "male") return MALE;
  return UNKNOWN;
}

function zigzag(x1: number, y1: number, x2: number, y2: number, amp = 6) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const steps = Math.max(7, Math.round(len / 11));
  let d = `M ${x1} ${y1}`;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const sign = i % 2 === 0 ? 1 : -1;
    const last = i === steps;
    d += ` L ${x1 + dx * t + (last ? 0 : nx * amp * sign)} ${y1 + dy * t + (last ? 0 : ny * amp * sign)}`;
  }
  return d;
}

function RelLayer({ persons, relationships }: { persons: Person[]; relationships: Relationship[] }) {
  const byId = useMemo(() => new Map(persons.map((p) => [p.id, p])), [persons]);
  const nodes: ReactNode[] = [];
  const covered = new Set<string>();

  function parentKey(id: string) {
    return relationships
      .filter((rel) => PARENT_TYPES.includes(rel.type) && rel.b === id)
      .map((rel) => rel.a)
      .sort()
      .join("|");
  }

  for (const r of relationships) {
    if (!UNION_TYPES.includes(r.type)) continue;
    const a = byId.get(r.a);
    const b = byId.get(r.b);
    if (!a || !b) continue;
    const left = a.x <= b.x ? a : b;
    const right = a.x <= b.x ? b : a;
    const y = (left.y + right.y) / 2;
    const x1 = left.x + HALF + 2;
    const x2 = right.x - HALF - 2;
    const midX = (left.x + right.x) / 2;
    const dashed = r.type === "cohabitation";
    const double = r.type === "marriage" || r.type === "divorce" || r.type === "separation";
    const sepDash = r.type === "separation" ? "5 4" : dashed ? "7 5" : undefined;

    nodes.push(
      <g key={r.id}>
        <line
          x1={x1}
          y1={y - (double ? 2.5 : 0)}
          x2={x2}
          y2={y - (double ? 2.5 : 0)}
          stroke={INK}
          strokeWidth={2}
          strokeDasharray={sepDash}
        />
        {double ? (
          <line
            x1={x1}
            y1={y + 2.5}
            x2={x2}
            y2={y + 2.5}
            stroke={INK}
            strokeWidth={2}
            strokeDasharray={r.type === "separation" ? "5 4" : undefined}
          />
        ) : null}
        {r.type === "divorce" || r.type === "separation" ? (
          <>
            <line x1={midX - 7} y1={y - 10} x2={midX + 1} y2={y + 10} stroke={INK} strokeWidth={2} />
            {r.type === "divorce" ? (
              <line x1={midX - 1} y1={y - 10} x2={midX + 7} y2={y + 10} stroke={INK} strokeWidth={2} />
            ) : null}
          </>
        ) : null}
      </g>,
    );

    const kids = persons.filter((p) => {
      const parents = relationships
        .filter((rel) => PARENT_TYPES.includes(rel.type) && rel.b === p.id)
        .map((rel) => rel.a);
      return parents.includes(a.id) && parents.includes(b.id);
    });
    if (kids.length === 0) continue;
    const barY = Math.min(...kids.map((k) => k.y)) - 50;
    const xs = kids.map((k) => k.x);
    const minX = Math.min(...xs, midX);
    const maxX = Math.max(...xs, midX);
    nodes.push(
      <g key={`${r.id}-kids`}>
        <path
          d={`M ${midX} ${y + 6} L ${midX} ${barY} M ${minX} ${barY} L ${maxX} ${barY}`}
          fill="none"
          stroke={INK}
          strokeWidth={1.6}
        />
        {kids.map((k) => {
          covered.add(k.id);
          const adopted = relationships.some((rel) => rel.type === "adopted" && rel.b === k.id);
          return (
            <line
              key={k.id}
              x1={k.x}
              y1={barY}
              x2={k.x}
              y2={k.y - HALF - 2}
              stroke={INK}
              strokeWidth={1.6}
              strokeDasharray={adopted ? "5 4" : undefined}
            />
          );
        })}
      </g>,
    );
  }

  const leftovers = new Map<string, Person[]>();
  for (const p of persons) {
    if (covered.has(p.id)) continue;
    const parents = relationships
      .filter((rel) => PARENT_TYPES.includes(rel.type) && rel.b === p.id)
      .map((rel) => rel.a)
      .sort();
    if (parents.length === 0) continue;
    const key = parents.join("|");
    const arr = leftovers.get(key) ?? [];
    arr.push(p);
    leftovers.set(key, arr);
  }
  leftovers.forEach((kids, key) => {
    const parentIds = key.split("|");
    const parents = parentIds.map((id) => byId.get(id)).filter((p): p is Person => Boolean(p));
    if (!parents.length) return;
    const midX = parents.reduce((s, p) => s + p.x, 0) / parents.length;
    const midY = parents.reduce((s, p) => s + p.y, 0) / parents.length;
    const barY = Math.min(...kids.map((k) => k.y)) - 50;
    const xs = kids.map((k) => k.x);
    const minX = Math.min(...xs, midX);
    const maxX = Math.max(...xs, midX);
    nodes.push(
      <g key={`solo-${key}`}>
        <path
          d={`M ${midX} ${midY + HALF + 2} L ${midX} ${barY} M ${minX} ${barY} L ${maxX} ${barY}`}
          fill="none"
          stroke={INK}
          strokeWidth={1.6}
        />
        {kids.map((k) => (
          <line
            key={k.id}
            x1={k.x}
            y1={barY}
            x2={k.x}
            y2={k.y - HALF - 2}
            stroke={INK}
            strokeWidth={1.6}
            strokeDasharray={
              relationships.some((rel) => rel.type === "adopted" && rel.b === k.id) ? "5 4" : undefined
            }
          />
        ))}
      </g>,
    );
  });

  for (const r of relationships) {
    if (r.type !== "sibling") continue;
    const a = byId.get(r.a);
    const b = byId.get(r.b);
    if (!a || !b) continue;
    const ka = parentKey(a.id);
    const kb = parentKey(b.id);
    if (ka && ka === kb) continue;
    const barY = Math.min(a.y, b.y) - 40;
    nodes.push(
      <path
        key={r.id}
        d={`M ${a.x} ${a.y - HALF} L ${a.x} ${barY} L ${b.x} ${barY} L ${b.x} ${b.y - HALF}`}
        fill="none"
        stroke={MUTED}
        strokeWidth={1.3}
      />,
    );
  }

  for (const r of relationships) {
    if (!["close", "distant", "cutoff", "conflict"].includes(r.type)) continue;
    const a = byId.get(r.a);
    const b = byId.get(r.b);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ox = (-dy / len) * 10;
    const oy = (dx / len) * 10;
    const x1 = a.x + ox;
    const y1 = a.y + oy;
    const x2 = b.x + ox;
    const y2 = b.y + oy;
    if (r.type === "conflict") {
      nodes.push(<path key={r.id} d={zigzag(x1, y1, x2, y2)} fill="none" stroke={INK} strokeWidth={1.6} />);
    } else if (r.type === "distant") {
      nodes.push(
        <line key={r.id} x1={x1} y1={y1} x2={x2} y2={y2} stroke={INK} strokeWidth={1.4} strokeDasharray="3 5" />,
      );
    } else if (r.type === "close") {
      nodes.push(
        <g key={r.id}>
          <line x1={x1} y1={y1 - 3} x2={x2} y2={y2 - 3} stroke={INK} strokeWidth={1.4} />
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={INK} strokeWidth={1.4} />
          <line x1={x1} y1={y1 + 3} x2={x2} y2={y2 + 3} stroke={INK} strokeWidth={1.4} />
        </g>,
      );
    } else {
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      nodes.push(
        <g key={r.id}>
          <line x1={x1} y1={y1} x2={mx - 8} y2={my - 2} stroke={INK} strokeWidth={1.5} />
          <line x1={mx + 8} y1={my + 2} x2={x2} y2={y2} stroke={INK} strokeWidth={1.5} />
          <line x1={mx - 6} y1={my - 8} x2={mx - 2} y2={my + 8} stroke={INK} strokeWidth={1.6} />
          <line x1={mx + 2} y1={my - 8} x2={mx + 6} y2={my + 8} stroke={INK} strokeWidth={1.6} />
        </g>,
      );
    }
  }

  return <g>{nodes}</g>;
}

const HOUSEHOLD_STROKE = "#5b6b5e";

function HouseholdLayer({
  persons,
  households,
  onLabelPointerDown,
}: {
  persons: Person[];
  households: Household[];
  onLabelPointerDown?: (e: PointerEvent, householdId: number, baseX: number, baseY: number) => void;
}) {
  const groups = new Map<number, Person[]>();
  for (const p of persons) {
    if (p.household == null) continue;
    const arr = groups.get(p.household) ?? [];
    arr.push(p);
    groups.set(p.household, arr);
  }
  if (groups.size === 0) return null;

  const metaOf = (id: number) => {
    const h = households.find((x) => x.id === id);
    return {
      label: h?.label || "Viven juntos",
      dx: h?.labelDx ?? 0,
      dy: h?.labelDy ?? 0,
    };
  };
  const PAD = 46;
  const nodes: ReactNode[] = [];
  groups.forEach((members, id) => {
    const minX = Math.min(...members.map((p) => p.x));
    const maxX = Math.max(...members.map((p) => p.x));
    const minY = Math.min(...members.map((p) => p.y));
    const maxY = Math.max(...members.map((p) => p.y));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const rx = (maxX - minX) / 2 + PAD;
    const ry = (maxY - minY) / 2 + PAD + 14;
    const { label, dx, dy } = metaOf(id);
    const baseX = cx;
    const baseY = cy - ry - 10;
    const lx = baseX + dx;
    const ly = baseY + dy;
    nodes.push(
      <g key={`household-${id}`}>
        <ellipse
          cx={cx}
          cy={cy}
          rx={rx}
          ry={ry}
          fill="none"
          stroke={HOUSEHOLD_STROKE}
          strokeWidth={1.6}
          strokeDasharray="6 6"
          opacity={0.75}
          pointerEvents="none"
        />
        <g
          style={{ cursor: "grab" }}
          onPointerDown={(e) => {
            e.stopPropagation();
            onLabelPointerDown?.(e, id, baseX, baseY);
          }}
        >
          {/* Invisible hit area so the label is easy to grab */}
          <rect x={lx - 72} y={ly - 16} width={144} height={22} fill="transparent" />
          <text
            x={lx}
            y={ly}
            textAnchor="middle"
            fontSize={11}
            fontWeight={700}
            letterSpacing={0.3}
            fill={HOUSEHOLD_STROKE}
            fontFamily={TYPEFACE}
            opacity={0.85}
            style={{ userSelect: "none" }}
          >
            {label.toUpperCase()}
          </text>
        </g>
      </g>,
    );
  });
  return <g>{nodes}</g>;
}

function PersonMark({
  person,
  selected,
  linking,
  onPointerDown,
}: {
  person: Person;
  selected: boolean;
  linking: boolean;
  onPointerDown: (e: PointerEvent) => void;
}) {
  const fill = fillOf(person);
  const stroke = linking ? ACCENT : selected ? ACCENT : INK;
  const sw = linking || selected ? 2.6 : 2;
  const years = personYears(person);
  const nameLines = splitDisplayName(person.name);
  const nameSize = nameLines.length > 1 || (nameLines[0]?.length ?? 0) > 10 ? 12 : 13.5;
  const nameY = HALF + 16;
  const yearsY = nameY + nameLines.length * 13 + 2;
  const occY = yearsY + (years ? 13 : 0);
  const hitH = personCaptionDepth(person) + 30;
  return (
    <g
      transform={`translate(${person.x} ${person.y})`}
      onPointerDown={onPointerDown}
      style={{ cursor: linking ? "pointer" : "grab" }}
    >
      <rect x={-36} y={-30} width={72} height={hitH} fill="transparent" />
      {person.identifiedPatient ? (
        person.gender === "female" ? (
          <circle r={HALF + 6} fill="none" stroke={IP_RING} strokeWidth={2} strokeDasharray="2 3" />
        ) : person.gender === "unknown" ? (
          <polygon
            points={`0,${-HALF - 7} ${HALF + 7},${HALF + 5} ${-HALF - 7},${HALF + 5}`}
            fill="none"
            stroke={IP_RING}
            strokeWidth={2}
            strokeDasharray="2 3"
          />
        ) : (
          <rect
            x={-HALF - 6}
            y={-HALF - 6}
            width={HALF * 2 + 12}
            height={HALF * 2 + 12}
            fill="none"
            stroke={IP_RING}
            strokeWidth={2}
            strokeDasharray="2 3"
          />
        )
      ) : null}
      {person.gender === "female" ? (
        <circle r={HALF} fill={fill} stroke={stroke} strokeWidth={sw} />
      ) : person.gender === "unknown" ? (
        <polygon
          points={`0,${-HALF - 2} ${HALF + 1},${HALF - 1} ${-HALF - 1},${HALF - 1}`}
          fill={fill}
          stroke={stroke}
          strokeWidth={sw}
        />
      ) : (
        <rect x={-HALF} y={-HALF} width={HALF * 2} height={HALF * 2} fill={fill} stroke={stroke} strokeWidth={sw} />
      )}
      {person.deceased ? (
        <>
          <line x1={-12} y1={-12} x2={12} y2={12} stroke={INK} strokeWidth={2.2} />
          <line x1={12} y1={-12} x2={-12} y2={12} stroke={INK} strokeWidth={2.2} />
        </>
      ) : null}
      <text
        y={nameY}
        textAnchor="middle"
        fontSize={nameSize}
        fontWeight={700}
        letterSpacing={0.1}
        fill={INK}
        fontFamily={TYPEFACE}
      >
        {nameLines.map((line, i) => (
          <tspan key={i} x={0} dy={i === 0 ? 0 : 13}>
            {line}
          </tspan>
        ))}
      </text>
      {years ? (
        <text
          y={yearsY}
          textAnchor="middle"
          fontSize={10.5}
          fontWeight={600}
          letterSpacing={0.3}
          fill={MUTED}
          fontFamily={TYPEFACE}
        >
          {years.toUpperCase()}
        </text>
      ) : null}
      {person.occupation ? (
        <text
          y={occY}
          textAnchor="middle"
          fontSize={10}
          fill={MUTED}
          fontStyle="italic"
          fontFamily={TYPEFACE}
        >
          {person.occupation.length > 18 ? `${person.occupation.slice(0, 17)}…` : person.occupation}
        </text>
      ) : null}
    </g>
  );
}

export function GenogramCanvas({ svgRef }: { svgRef: RefObject<SVGSVGElement | null> }) {
  const persons = useGenogram((s) => s.persons);
  const relationships = useGenogram((s) => s.relationships);
  const selectedId = useGenogram((s) => s.selectedId);
  const select = useGenogram((s) => s.select);
  const movePerson = useGenogram((s) => s.movePerson);
  const moveHouseholdLabel = useGenogram((s) => s.moveHouseholdLabel);
  const checkpoint = useGenogram((s) => s.checkpoint);
  const persist = useGenogram((s) => s.persist);
  const addPerson = useGenogram((s) => s.addPerson);
  const addRelationship = useGenogram((s) => s.addRelationship);
  const linkHousehold = useGenogram((s) => s.linkHousehold);
  const households = useGenogram((s) => s.households);
  const layoutEpoch = useGenogram((s) => s.layoutEpoch);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 40, y: 30, k: 1 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const [tool, setTool] = useState<Tool>("select");
  const [legendOpen, setLegendOpen] = useState(true);
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const [linkMenu, setLinkMenu] = useState<{ a: string; b: string } | null>(null);
  const [draft, setDraft] = useState<{ x: number; y: number; name: string; gender: Gender } | null>(null);
  const draftNameRef = useRef<HTMLInputElement>(null);
  const drag = useRef<null | {
    kind: "pan" | "person" | "household-label";
    id?: string;
    householdId?: number;
    sx: number;
    sy: number;
    vx: number;
    vy: number;
    px: number;
    py: number;
    moved: boolean;
  }>(null);

  const toWorld = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    const current = viewRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: (clientX - rect.left - current.x) / current.k,
      y: (clientY - rect.top - current.y) / current.k,
    };
  };

  const fit = () => {
    const el = wrapRef.current;
    if (!el || persons.length === 0) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (w < 40 || h < 40) return;
    const box = boundingBox(persons, 28, 80, 80, households);
    const toolW = 56;
    const pad = 16;
    const availW = Math.max(80, w - pad * 2 - toolW);
    const availH = Math.max(80, h - pad * 2);
    const k = Math.min(availW / box.width, availH / box.height, 1.45);
    const cx = box.minX + box.width / 2;
    const cy = box.minY + box.height / 2;
    setView({
      k,
      x: pad + availW / 2 - cx * k,
      y: pad + availH / 2 - cy * k,
    });
  };

  useEffect(() => {
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutEpoch]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let ready = false;
    const ro = new ResizeObserver(() => {
      if (!ready) {
        ready = true;
        fit();
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      const current = viewRef.current;
      const factor = e.deltaY > 0 ? 0.92 : 1.08;
      const nk = Math.min(2.6, Math.max(0.35, current.k * factor));
      const rect = svg.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const wx = (sx - current.x) / current.k;
      const wy = (sy - current.y) / current.k;
      setView({ k: nk, x: sx - wx * nk, y: sy - wy * nk });
    };
    svg.addEventListener("wheel", onWheelNative, { passive: false });
    return () => svg.removeEventListener("wheel", onWheelNative);
  }, [svgRef]);

  useEffect(() => {
    if (draft) draftNameRef.current?.focus();
  }, [draft]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setDraft(null);
      setLinkMenu(null);
      setLinkFrom(null);
      setTool("select");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const zoomBy = (factor: number) => {
    const el = wrapRef.current;
    const current = viewRef.current;
    const nk = Math.min(2.6, Math.max(0.35, current.k * factor));
    if (!el) {
      setView({ ...current, k: nk });
      return;
    }
    const sx = el.clientWidth / 2;
    const sy = el.clientHeight / 2;
    const wx = (sx - current.x) / current.k;
    const wy = (sy - current.y) / current.k;
    setView({ k: nk, x: sx - wx * nk, y: sy - wy * nk });
  };

  const placeDraft = (clientX: number, clientY: number) => {
    const w = toWorld(clientX, clientY);
    setDraft({ x: w.x, y: w.y, name: "", gender: "female" });
    setLinkMenu(null);
  };

  const confirmDraft = () => {
    if (!draft) return;
    const id = addPerson({
      name: draft.name,
      gender: draft.gender,
      age: null,
      deceased: false,
      x: draft.x,
      y: draft.y,
    });
    if (id) setDraft(null);
  };

  const onPointerDownBg = (e: PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    if (draft || linkMenu) {
      setDraft(null);
      setLinkMenu(null);
      return;
    }
    if (tool === "add") {
      placeDraft(e.clientX, e.clientY);
      return;
    }
    svgRef.current?.setPointerCapture(e.pointerId);
    const current = viewRef.current;
    drag.current = { kind: "pan", sx: e.clientX, sy: e.clientY, vx: current.x, vy: current.y, px: 0, py: 0, moved: false };
    select(null);
  };

  const onPointerDownPerson = (e: PointerEvent, person: Person) => {
    e.stopPropagation();
    if (tool === "add") {
      placeDraft(e.clientX, e.clientY);
      return;
    }
    if (tool === "link") {
      if (!linkFrom || linkFrom === person.id) {
        setLinkFrom(person.id);
        select(person.id);
      } else {
        setLinkMenu({ a: linkFrom, b: person.id });
        setLinkFrom(null);
      }
      return;
    }
    svgRef.current?.setPointerCapture(e.pointerId);
    select(person.id);
    checkpoint();
    const current = viewRef.current;
    drag.current = {
      kind: "person",
      id: person.id,
      sx: e.clientX,
      sy: e.clientY,
      vx: current.x,
      vy: current.y,
      px: person.x,
      py: person.y,
      moved: false,
    };
  };

  const onLabelPointerDown = (e: PointerEvent, householdId: number, _baseX: number, _baseY: number) => {
    if (tool !== "select") return;
    e.stopPropagation();
    svgRef.current?.setPointerCapture(e.pointerId);
    checkpoint();
    const h = households.find((x) => x.id === householdId);
    const current = viewRef.current;
    drag.current = {
      kind: "household-label",
      householdId,
      sx: e.clientX,
      sy: e.clientY,
      vx: current.x,
      vy: current.y,
      px: h?.labelDx ?? 0,
      py: h?.labelDy ?? 0,
      moved: false,
    };
  };

  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (Math.hypot(dx, dy) > 3) d.moved = true;
    if (d.kind === "pan") {
      setView({ k: viewRef.current.k, x: d.vx + dx, y: d.vy + dy });
    } else if (d.kind === "person" && d.id) {
      movePerson(d.id, d.px + dx / viewRef.current.k, d.py + dy / viewRef.current.k);
    } else if (d.kind === "household-label" && d.householdId != null) {
      moveHouseholdLabel(d.householdId, d.px + dx / viewRef.current.k, d.py + dy / viewRef.current.k);
    }
  };

  const onPointerUp = () => {
    if (
      (drag.current?.kind === "person" || drag.current?.kind === "household-label") &&
      drag.current.moved
    ) {
      persist();
    }
    drag.current = null;
  };

  const hint =
    tool === "add"
      ? "Pulsa el lienzo para colocar a una persona"
      : tool === "link"
        ? linkFrom
          ? "Elige la segunda persona"
          : "Elige la primera persona"
        : null;

  const nameOf = (id: string) => persons.find((p) => p.id === id)?.name ?? id;

  return (
    <div ref={wrapRef} className="relative min-h-0 flex-1 overflow-hidden bg-paper">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(to right, color-mix(in oklab, var(--color-ink) 7%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklab, var(--color-ink) 7%, transparent) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />
      {persons.length === 0 && !draft ? (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center px-6 text-center">
          <Users className="mb-3 size-8 text-muted-foreground/45" strokeWidth={1.4} />
          <p className="font-display text-lg font-medium tracking-tight">El mapa se dibuja aquí</p>
          <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
            Genera una familia desde texto, o pulsa Añadir y toca el lienzo.
          </p>
        </div>
      ) : null}
      <svg
        ref={svgRef}
        className={cn(
          "relative z-[1] h-full w-full touch-none select-none",
          tool === "add" ? "cursor-crosshair" : tool === "link" ? "cursor-pointer" : "",
        )}
        onPointerDown={onPointerDownBg}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={(e) => {
          e.preventDefault();
          placeDraft(e.clientX, e.clientY);
          setTool("add");
        }}
        data-world-svg
      >
        <g data-world transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          <HouseholdLayer persons={persons} households={households} onLabelPointerDown={onLabelPointerDown} />
          <RelLayer persons={persons} relationships={relationships} />
          {persons.map((p) => (
            <PersonMark
              key={p.id}
              person={p}
              selected={p.id === selectedId}
              linking={tool === "link" && (linkFrom === p.id || linkMenu?.a === p.id || linkMenu?.b === p.id)}
              onPointerDown={(e) => onPointerDownPerson(e, p)}
            />
          ))}
        </g>
      </svg>

      <div className="absolute top-3 left-3 z-10 flex gap-1.5">
        <Button
          type="button"
          variant={tool === "add" ? "default" : "outline"}
          size="sm"
          className={cn("h-10", tool !== "add" && "bg-card")}
          onClick={() => {
            setTool((t) => (t === "add" ? "select" : "add"));
            setLinkFrom(null);
            setLinkMenu(null);
          }}
        >
          <UserPlus />
          <span className="hidden sm:inline">Añadir</span>
        </Button>
        <Button
          type="button"
          variant={tool === "link" ? "default" : "outline"}
          size="sm"
          className={cn("h-10", tool !== "link" && "bg-card")}
          disabled={persons.length < 2}
          onClick={() => {
            setTool((t) => (t === "link" ? "select" : "link"));
            setLinkFrom(null);
            setLinkMenu(null);
            setDraft(null);
          }}
        >
          <Link2 />
          <span className="hidden sm:inline">Vincular</span>
        </Button>
      </div>

      <div className="absolute top-3 right-3 z-10 flex gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-10 bg-card"
          onClick={() => zoomBy(1.15)}
          aria-label="Acercar"
        >
          <Plus />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-10 bg-card"
          onClick={() => zoomBy(0.87)}
          aria-label="Alejar"
        >
          <Minus />
        </Button>
        <Button type="button" variant="outline" size="icon" className="size-10 bg-card" onClick={fit} aria-label="Ajustar a la vista">
          <Maximize2 />
        </Button>
      </div>

      {hint ? (
        <div className="absolute top-16 left-1/2 z-10 -translate-x-1/2 rounded-md bg-bar px-3 py-1.5 text-xs font-medium text-bar-foreground shadow-[var(--shadow-border)]">
          {hint}
        </div>
      ) : null}

      {draft ? (
        <form
          className="absolute top-1/2 left-1/2 z-20 w-[min(92vw,280px)] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-card p-4 shadow-[var(--shadow-border)]"
          onSubmit={(e) => {
            e.preventDefault();
            confirmDraft();
          }}
        >
          <p className="font-display text-lg font-medium tracking-tight">Nueva persona</p>
          <label className="mt-3 block text-xs font-medium tracking-wide text-muted-foreground">
            Nombre
            <Input
              ref={draftNameRef}
              className="mt-1.5"
              value={draft.name}
              placeholder="Nombre"
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <label className="mt-3 block text-xs font-medium tracking-wide text-muted-foreground">
            Género
            <select
              className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={draft.gender}
              onChange={(e) => setDraft({ ...draft, gender: e.target.value as Gender })}
            >
              <option value="female">Mujer</option>
              <option value="male">Hombre</option>
              <option value="unknown">Desconocido</option>
            </select>
          </label>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setDraft(null)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!draft.name.trim()}>
              Añadir
            </Button>
          </div>
        </form>
      ) : null}

      {linkMenu ? (
        <div className="absolute top-1/2 left-1/2 z-20 w-[min(92vw,280px)] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-card p-4 shadow-[var(--shadow-border)]">
          <p className="font-display text-lg font-medium tracking-tight">Vínculo</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {nameOf(linkMenu.a)} → {nameOf(linkMenu.b)}
          </p>
          <div className="mt-3 grid max-h-64 grid-cols-1 gap-1 overflow-y-auto">
            <button
              type="button"
              className="h-10 rounded-md border border-dashed px-3 text-left text-sm font-medium hover:bg-accent"
              style={{ borderColor: HOUSEHOLD_STROKE, color: HOUSEHOLD_STROKE }}
              onClick={() => {
                linkHousehold(linkMenu.a, linkMenu.b);
                setLinkMenu(null);
                setTool("select");
              }}
            >
              Viven juntos / conviven
            </button>
            {LINK_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                className="h-10 rounded-md px-3 text-left text-sm hover:bg-accent"
                onClick={() => {
                  addRelationship(t, linkMenu.a, linkMenu.b);
                  setLinkMenu(null);
                  setTool("select");
                }}
              >
                {REL_LABELS[t]}
              </button>
            ))}
          </div>
          <Button type="button" variant="outline" className="mt-3 w-full" onClick={() => setLinkMenu(null)}>
            Cancelar
          </Button>
        </div>
      ) : null}

      <div className="absolute bottom-3 left-3 z-10 hidden w-[280px] overflow-hidden rounded-xl border border-border bg-card/98 text-[11px] text-muted-foreground shadow-[var(--shadow-border)] sm:block">
        <button
          type="button"
          onClick={() => setLegendOpen((v) => !v)}
          className="flex w-full items-center justify-between px-3 py-2 font-semibold tracking-[0.08em] text-foreground/75 uppercase"
        >
          Leyenda clínica
          <ChevronDown className={cn("size-3.5 transition-transform", legendOpen ? "rotate-180" : "")} />
        </button>
        {legendOpen ? (
          <div className="space-y-2.5 border-t border-border px-3 py-2.5">
            {LEGEND_GROUPS.map((group) => (
              <div key={group.title}>
                <div className="mb-1 text-[10px] font-semibold tracking-[0.06em] text-foreground/55 uppercase">{group.title}</div>
                <div className={group.items.length === 1 ? "grid grid-cols-1 gap-1.5" : "grid grid-cols-2 gap-x-3 gap-y-1.5"}>
                  {group.items.map((item) => (
                    <span
                      key={item.kind}
                      className={cn(
                        "flex items-center gap-2",
                        item.kind === "ip" || item.kind === "household" ? "col-span-2" : "",
                      )}
                    >
                      <LegendGlyph kind={item.kind} />
                      {item.label}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
