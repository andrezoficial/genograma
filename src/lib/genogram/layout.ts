import { PARENT_TYPES, UNION_TYPES, personCaptionDepth, type Person, type Relationship } from "./types.ts";

const COL = 128;
const ROW = 158;
const COUPLE = 108;
const MIN = 112;
const TOP = 72;

export function autoLayout(persons: Person[], relationships: Relationship[]): Person[] {
  if (persons.length === 0) return persons;
  const ids = persons.map((p) => p.id);
  const byId = new Map(persons.map((p) => [p.id, { ...p }]));

  const parentsOf = new Map<string, string[]>();
  const childrenOf = new Map<string, string[]>();
  for (const r of relationships) {
    if (!PARENT_TYPES.includes(r.type)) continue;
    parentsOf.set(r.b, [...(parentsOf.get(r.b) ?? []), r.a]);
    childrenOf.set(r.a, [...(childrenOf.get(r.a) ?? []), r.b]);
  }

  const gen = new Map<string, number>();
  const visiting = new Set<string>();
  function depth(id: string): number {
    const cached = gen.get(id);
    if (cached != null) return cached;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const ps = parentsOf.get(id) ?? [];
    const d = ps.length === 0 ? 0 : Math.max(...ps.map(depth)) + 1;
    visiting.delete(id);
    gen.set(id, d);
    return d;
  }
  ids.forEach(depth);
  const minGen = Math.min(...[...gen.values()]);
  ids.forEach((id) => gen.set(id, (gen.get(id) ?? 0) - minGen));

  type Union = { a: string; b: string; type: string };
  const unions: Union[] = [];
  for (const r of relationships) {
    if (!UNION_TYPES.includes(r.type)) continue;
    unions.push({ a: r.a, b: r.b, type: r.type });
  }

  const rows: string[][] = [];
  for (const id of ids) {
    const g = gen.get(id) ?? 0;
    if (!rows[g]) rows[g] = [];
    rows[g].push(id);
  }

  function parentKey(id: string) {
    return (parentsOf.get(id) ?? []).slice().sort().join("|");
  }

  function spouseInRow(id: string, row: string[]): string | null {
    for (const u of unions) {
      const other = u.a === id ? u.b : u.b === id ? u.a : null;
      if (other && row.includes(other)) return other;
    }
    return null;
  }

  rows.forEach((row, gi) => {
    row.sort((a, b) => parentKey(a).localeCompare(parentKey(b)) || a.localeCompare(b));
    const ordered: string[] = [];
    const used = new Set<string>();
    for (const id of row) {
      if (used.has(id)) continue;
      const spouses = unions
        .map((u) => (u.a === id ? u.b : u.b === id ? u.a : null))
        .filter((s): s is string => Boolean(s) && row.includes(s!) && !used.has(s!));
      const me = byId.get(id)!;
      if (spouses.length === 0) {
        ordered.push(id);
        used.add(id);
        continue;
      }
      if (spouses.length === 1) {
        const other = byId.get(spouses[0])!;
        const maleLeft = me.gender === "male" || other.gender === "female";
        if (maleLeft) ordered.push(id, spouses[0]);
        else ordered.push(spouses[0], id);
        used.add(id);
        used.add(spouses[0]);
        continue;
      }
      ordered.push(spouses[0], id, ...spouses.slice(1));
      used.add(id);
      spouses.forEach((s) => used.add(s));
    }
    for (const id of row) if (!used.has(id)) ordered.push(id);
    rows[gi] = ordered;
  });

  rows.forEach((row, gi) => {
    row.forEach((id, i) => {
      const p = byId.get(id)!;
      p.generation = gi;
      p.x = 90 + i * COL;
      p.y = TOP + gi * ROW;
    });
  });

  for (let iter = 0; iter < 80; iter++) {
    const t = iter < 20 ? 0.85 : 0.45;

    for (const u of unions) {
      const a = byId.get(u.a);
      const b = byId.get(u.b);
      if (!a || !b) continue;
      if (a.generation !== b.generation) continue;
      const left = a.x <= b.x ? a : b;
      const right = a.x <= b.x ? b : a;
      const mid = (left.x + right.x) / 2;
      left.x += (mid - COUPLE / 2 - left.x) * t;
      right.x += (mid + COUPLE / 2 - right.x) * t;
    }

    const groups = new Map<string, string[]>();
    for (const id of ids) {
      const ps = parentsOf.get(id) ?? [];
      if (ps.length === 0) continue;
      const key = [...ps].sort().join("|");
      const arr = groups.get(key) ?? [];
      arr.push(id);
      groups.set(key, arr);
    }
    for (const [key, children] of groups) {
      const pxs = key
        .split("|")
        .map((id) => byId.get(id)?.x)
        .filter((x): x is number => x != null);
      if (!pxs.length) continue;
      const mid = pxs.reduce((s, x) => s + x, 0) / pxs.length;
      const unique = [...new Set(children)].sort((a, b) => byId.get(a)!.x - byId.get(b)!.x);
      const span = (unique.length - 1) * COL;
      const start = mid - span / 2;
      unique.forEach((id, i) => {
        const p = byId.get(id)!;
        p.x += (start + i * COL - p.x) * t;
      });
    }

    rows.forEach((row) => {
      const sorted = [...row].sort((a, b) => byId.get(a)!.x - byId.get(b)!.x);
      for (let i = 1; i < sorted.length; i++) {
        const prev = byId.get(sorted[i - 1])!;
        const cur = byId.get(sorted[i])!;
        const couple = spouseInRow(prev.id, row) === cur.id;
        const min = couple ? COUPLE : MIN;
        const gap = cur.x - prev.x;
        if (gap < min) {
          const push = (min - gap) / 2;
          prev.x -= push;
          cur.x += push;
        }
      }
    });
  }

  let minX = Infinity;
  for (const p of byId.values()) minX = Math.min(minX, p.x);
  const shift = 90 - minX;
  for (const p of byId.values()) p.x += shift;

  return ids.map((id) => byId.get(id)!);
}

export function boundingBox(
  persons: Person[],
  pad = 80,
  minW = 0,
  minH = 0,
  households: { id: number; labelDx?: number; labelDy?: number }[] = [],
) {
  if (persons.length === 0) return { minX: 0, minY: 0, width: Math.max(minW, 800), height: Math.max(minH, 500) };
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const p of persons) {
    minX = Math.min(minX, p.x - 36);
    maxX = Math.max(maxX, p.x + 36);
    minY = Math.min(minY, p.y - 28);
    maxY = Math.max(maxY, p.y + personCaptionDepth(p));
  }
  const groups = new Map<number, Person[]>();
  for (const p of persons) {
    if (p.household == null) continue;
    const arr = groups.get(p.household) ?? [];
    arr.push(p);
    groups.set(p.household, arr);
  }
  const offsetOf = (id: number) => {
    const h = households.find((x) => x.id === id);
    return { dx: h?.labelDx ?? 0, dy: h?.labelDy ?? 0 };
  };
  groups.forEach((members, id) => {
    const hx0 = Math.min(...members.map((p) => p.x));
    const hx1 = Math.max(...members.map((p) => p.x));
    const hy0 = Math.min(...members.map((p) => p.y));
    const hy1 = Math.max(...members.map((p) => p.y));
    const cx = (hx0 + hx1) / 2;
    const cy = (hy0 + hy1) / 2;
    const rx = (hx1 - hx0) / 2 + 46;
    const ry = (hy1 - hy0) / 2 + 60;
    const { dx, dy } = offsetOf(id);
    // Default label sits at (cx, cy - ry - 10); account for drag offset + text extent
    const labelX = cx + dx;
    const labelY = cy - ry - 10 + dy;
    minX = Math.min(minX, cx - rx, labelX - 70);
    maxX = Math.max(maxX, cx + rx, labelX + 70);
    minY = Math.min(minY, cy - ry - 36 + Math.min(0, dy), labelY - 14);
    maxY = Math.max(maxY, cy + ry, labelY + 6);
  });
  return {
    minX: minX - pad,
    minY: minY - pad,
    width: Math.max(minW, maxX - minX + pad * 2),
    height: Math.max(minH, maxY - minY + pad * 2),
  };
}
