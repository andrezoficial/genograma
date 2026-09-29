export type Gender = "male" | "female" | "unknown";

export type StructuralRelType =
  | "marriage"
  | "cohabitation"
  | "separation"
  | "divorce"
  | "widowed"
  | "dating"
  | "parent_child"
  | "adopted"
  | "sibling";

export type EmotionalRelType = "close" | "distant" | "cutoff" | "conflict";

export type RelType = StructuralRelType | EmotionalRelType;

/** McGoldrick-style inner marks on a person symbol. */
export type Condition = "alcohol" | "drugs" | "mental" | "physical";

export const CONDITIONS: Condition[] = ["alcohol", "drugs", "mental", "physical"];

export const CONDITION_LABELS: Record<Condition, string> = {
  alcohol: "Alcohol / alcoholismo",
  drugs: "Otras sustancias",
  mental: "Enfermedad mental",
  physical: "Enfermedad física",
};

export type Person = {
  id: string;
  name: string;
  gender: Gender;
  age: number | null;
  birthYear: number | null;
  deathYear: number | null;
  deceased: boolean;
  identifiedPatient: boolean;
  occupation: string;
  notes: string;
  generation: number;
  household: number | null;
  x: number;
  y: number;
  conditions: Condition[];
};

export type Relationship = {
  id: string;
  type: RelType;
  a: string;
  b: string;
};

export type Household = {
  id: number;
  label: string;
  /** Offset of the household label relative to its default position above the dashed ellipse. */
  labelDx?: number;
  labelDy?: number;
};

export type GenogramData = {
  persons: Person[];
  relationships: Relationship[];
  households?: Household[];
};

export const DEFAULT_HOUSEHOLD_LABEL = "Viven juntos";

export const UNION_TYPES: RelType[] = [
  "marriage",
  "cohabitation",
  "separation",
  "divorce",
  "widowed",
  "dating",
];

export const PARENT_TYPES: RelType[] = ["parent_child", "adopted"];

export const REL_LABELS: Record<RelType, string> = {
  marriage: "Casados / matrimonio",
  cohabitation: "Unión libre (de hecho)",
  separation: "Separados/as",
  divorce: "Divorciados/as",
  widowed: "Viudez (pareja fallecida)",
  dating: "Noviazgo / pareja sin convivir",
  parent_child: "Padre/madre → hijo/a",
  adopted: "Adopción",
  sibling: "Hermanos",
  close: "Relación cercana",
  distant: "Relación distante",
  cutoff: "Corte relacional",
  conflict: "Conflicto",
};

export function normalizeConditions(raw: unknown): Condition[] {
  if (!Array.isArray(raw)) return [];
  const out: Condition[] = [];
  for (const v of raw) {
    if ((v === "alcohol" || v === "drugs" || v === "mental" || v === "physical") && !out.includes(v)) {
      out.push(v);
    }
  }
  return out;
}

export function toggleCondition(list: Condition[], c: Condition): Condition[] {
  return list.includes(c) ? list.filter((x) => x !== c) : [...list, c];
}

export function emptyPerson(partial: Partial<Person> & { id: string; name: string }): Person {
  const { conditions, ...rest } = partial;
  return {
    gender: "unknown",
    age: null,
    birthYear: null,
    deathYear: null,
    deceased: false,
    identifiedPatient: false,
    occupation: "",
    notes: "",
    generation: 0,
    household: null,
    x: 120,
    y: 80,
    ...rest,
    conditions: normalizeConditions(conditions),
  };
}

export function sanitizeGenogram(data: GenogramData): GenogramData {
  const persons = (data.persons ?? [])
    .map((p, i) =>
      emptyPerson({
        ...p,
        id: p.id || `p${i + 1}`,
        name: String(p.name ?? "").trim(),
      }),
    )
    .filter((p) => p.name);
  const ids = new Set(persons.map((p) => p.id));
  const relationships = (data.relationships ?? []).filter(
    (r) => r && ids.has(r.a) && ids.has(r.b) && r.a !== r.b && r.type,
  );
  const usedHouseholds = new Set(persons.map((p) => p.household).filter((n): n is number => n != null));
  const households = (data.households ?? [])
    .filter((h) => h && typeof h.id === "number" && usedHouseholds.has(h.id))
    .map((h) => ({
      id: h.id,
      label: String(h.label ?? "").trim() || DEFAULT_HOUSEHOLD_LABEL,
      labelDx: typeof h.labelDx === "number" && Number.isFinite(h.labelDx) ? h.labelDx : 0,
      labelDy: typeof h.labelDy === "number" && Number.isFinite(h.labelDy) ? h.labelDy : 0,
    }));
  return { persons, relationships, households };
}

const CONDITION_PATTERNS: [Condition, RegExp][] = [
  ["alcohol", /alcoholismo|alcoh[oó]lic[oa]s?|bebedor(?:a)?s?\s+problem|problemas?\s+con\s+el\s+alcohol|abuso\s+de\s+alcohol/i],
  ["drugs", /drogadicc|toxicoman|otras?\s+sustancias|consume\s+drogas|adicci[oó]n\s+a\s+(?:la\s+)?(?:droga|sustancia)/i],
  ["mental", /enfermedad\s+mental|depresi[oó]n|esquizofrenia|trastorno\s+bipolar|trastorno\s+ansioso|ansiedad\s+generalizada/i],
  ["physical", /enfermedad\s+cr[oó]nica|c[aá]ncer\b|diabetes|enfermedad\s+f[ií]sica/i],
];

/** Marks clinical conditions mentioned next to a known name. Mutates persons in place. */
export function applyConditionsFromText(persons: Person[], text: string): void {
  if (!text.trim() || persons.length === 0) return;
  const sentences = text.split(/[.\n;]+/).map((s) => s.trim()).filter(Boolean);
  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    for (const p of persons) {
      if (!p.name || !lower.includes(p.name.toLowerCase())) continue;
      for (const [cond, re] of CONDITION_PATTERNS) {
        if (re.test(sentence) && !p.conditions.includes(cond)) p.conditions.push(cond);
      }
    }
  }
}

export function personYears(p: Person): string {
  if (p.birthYear && p.deathYear) return `${p.birthYear}–${p.deathYear}`;
  if (p.deathYear) return `† ${p.deathYear}`;
  if (p.deceased && p.age != null) return `${p.age} años`;
  if (p.age != null) return `${p.age} años`;
  if (p.birthYear) return `${p.birthYear}–`;
  return "";
}

/** Split a long given name so it stays under the 36px-wide gender mark. */
export function splitDisplayName(name: string): string[] {
  const t = name.trim();
  if (!t) return [""];
  if (t.length <= 11) return [t];
  const parts = t.split(/\s+/);
  if (parts.length < 2) return [t];
  if (parts.length === 2) return [parts[0]!, parts[1]!];
  return [parts[0]!, parts.slice(1).join(" ")];
}

export function personCaptionDepth(p: Person): number {
  const lines = splitDisplayName(p.name).length;
  let y = 18 + 16 + lines * 13;
  if (personYears(p)) y += 14;
  if (p.occupation) y += 13;
  return y + 4;
}
