import { DEFAULT_HOUSEHOLD_LABEL, emptyPerson, type Gender, type GenogramData, type RelType } from "./types.ts";
import { inferGenderFromName } from "./gender.ts";

export const REL_TYPES: RelType[] = [
  "marriage",
  "cohabitation",
  "separation",
  "divorce",
  "widowed",
  "dating",
  "parent_child",
  "adopted",
  "sibling",
  "close",
  "distant",
  "cutoff",
  "conflict",
];

export type AiPerson = {
  id?: string;
  name: string;
  gender?: string;
  age?: number | null;
  birthYear?: number | null;
  deathYear?: number | null;
  deceased?: boolean;
  occupation?: string;
  notes?: string;
  identifiedPatient?: boolean;
  household?: number | null;
};

/** `from` / `to` are person ids (a name is accepted as a fallback when it is unambiguous). */
export type AiRel = { type: string; from: string; to: string };

function normGender(value: string | undefined): Gender {
  const v = (value ?? "").toLowerCase();
  if (v === "male" || v === "m" || v === "hombre" || v === "masculino") return "male";
  if (v === "female" || v === "f" || v === "mujer" || v === "femenino") return "female";
  return "unknown";
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function mapAi(persons: AiPerson[], rels: AiRel[]): GenogramData {
  const byKey = new Map<string, string>(); // model id (or lowercase name) → our id
  const nameCount = new Map<string, number>();
  const out = [] as ReturnType<typeof emptyPerson>[];

  for (const p of persons ?? []) {
    const name = String(p?.name ?? "").trim();
    if (!name) continue;
    const id = `p${out.length + 1}`;
    const deathYear = num(p.deathYear);
    out.push(
      emptyPerson({
        id,
        name,
        gender: p.gender ? normGender(p.gender) : inferGenderFromName(name),
        age: num(p.age),
        birthYear: num(p.birthYear),
        deathYear,
        deceased: Boolean(p.deceased) || deathYear != null,
        occupation: String(p.occupation ?? ""),
        notes: String(p.notes ?? ""),
        identifiedPatient: Boolean(p.identifiedPatient),
        household: typeof p.household === "number" ? p.household : null,
      }),
    );
    if (p.id != null && String(p.id).trim()) byKey.set(String(p.id).trim().toLowerCase(), id);
    const nk = name.toLowerCase();
    nameCount.set(nk, (nameCount.get(nk) ?? 0) + 1);
    if (!byKey.has(nk)) byKey.set(nk, id);
  }

  const lookup = (ref: string): string | undefined => {
    const k = String(ref ?? "").trim().toLowerCase();
    if (!k) return undefined;
    const hit = byKey.get(k);
    // a bare name shared by two people is ambiguous: refuse to guess
    if (hit && (nameCount.get(k) ?? 0) > 1 && !persons.some((p) => String(p.id ?? "").toLowerCase() === k)) return undefined;
    return hit;
  };

  const relationships: GenogramData["relationships"] = [];
  const seen = new Set<string>();
  for (const r of rels ?? []) {
    const a = lookup(r?.from);
    const b = lookup(r?.to);
    const type = REL_TYPES.includes(r?.type as RelType) ? (r.type as RelType) : null;
    if (!a || !b || !type || a === b) continue;
    const key = [type, ...[a, b].sort()].join("|");
    const directed = type === "parent_child" || type === "adopted" ? `${type}|${a}>${b}` : key;
    if (seen.has(directed)) continue;
    seen.add(directed);
    relationships.push({ id: `r${relationships.length + 1}`, type, a, b });
  }

  const used = [...new Set(out.map((p) => p.household).filter((n): n is number => n != null))].sort((x, y) => x - y);
  return {
    persons: out,
    relationships,
    households: used.map((id) => ({ id, label: DEFAULT_HOUSEHOLD_LABEL })),
  };
}
