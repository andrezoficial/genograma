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

export function emptyPerson(partial: Partial<Person> & { id: string; name: string }): Person {
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
    ...partial,
  };
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

