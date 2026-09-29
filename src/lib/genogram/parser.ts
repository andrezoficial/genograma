import {
  DEFAULT_HOUSEHOLD_LABEL,
  emptyPerson,
  PARENT_TYPES,
  UNION_TYPES,
  applyConditionsFromText,
  type Gender,
  type GenogramData,
  type Person,
  type RelType,
  type Relationship,
} from "./types.ts";
import { genderFromWord, inferGenderFromName } from "./gender.ts";
import { STOP } from "./stopwords.ts";
import { looksNarrative, parseNarrative, type NarrativeOptions } from "./narrative.ts";

export { NARRATIVE_EXAMPLE_TEXT } from "./narrative.ts";

const TOKEN = String.raw`\p{Lu}\p{L}+(?:-\p{Lu}\p{L}+)?`;
const PARTICLE = String.raw`(?:de(?:l|\s+l[ao]s?)?\s+)?`;
const NAME = String.raw`${TOKEN}(?:\s+${PARTICLE}${TOKEN})?`;
const AGE = String.raw`(?:de\s+)?(\d{1,3})(?:\s*años?)?`;



/** Optional age right after a name: "de 45", "45 años", "de 45 años". */
const AG = String.raw`(?:\s+(?:de\s+)?\d{1,3}(?:\s*años?)?)?`;

function isNameToken(token: string): boolean {
  return new RegExp(`^${TOKEN}$`, "u").test(token) && !STOP.has(token.toLowerCase());
}

function titleCase(name: string): string {
  return name
    .split(/\s+/)
    .map((part) =>
      part
        .split("-")
        .map((bit) => {
          if (!bit) return bit;
          if (["de", "del", "la", "las", "los"].includes(bit.toLowerCase())) return bit.toLowerCase();
          return bit.charAt(0).toUpperCase() + bit.slice(1).toLowerCase();
        })
        .join("-"),
    )
    .join(" ");
}

function cleanName(raw: string): string {
  const stripped = raw.trim().replace(/^(el|la|los|las|don|doña|dona)\s+/i, "");
  const parts = stripped.split(/\s+/).filter((part) => {
    if (["de", "del", "la", "las", "los"].includes(part.toLowerCase())) return true;
    return isNameToken(part.charAt(0).toUpperCase() + part.slice(1));
  });
  if (parts.length === 0) return "";
  return titleCase(parts.slice(0, 3).join(" "));
}

/** Full example: exercises every item of the legend (people, household, family ties, emotional ties). */
export const EXAMPLE_TEXT = `María de 45 años está casada con Juan de 48.
Tienen dos hijos: Laura de 15 y Pedro de 12.
Adoptaron a Sofía de 8 años.
Los padres de María se llaman Carmen y José.
José falleció en 2018.
María tiene una hermana llamada Ana de 42.
Ana vive en unión libre con Diego de 44.
Alex de 20 años es hijo de Ana y Diego, de género no binario.
Juan tiene un hermano llamado Luis de 50.
Luis está divorciado de Rosa de 47.
Juan tiene otro hermano llamado Marcos de 46, que se separó de Elena de 44.
María es la paciente identificada.
María, Juan, Laura, Pedro y Sofía viven juntos.
Juan tiene alcoholismo.
Carmen padece depresión.
María es muy cercana a Laura.
Pedro y Juan tienen una relación distante.
Luis cortó la relación con Juan.
María y Ana tienen conflicto.`;

/** Short example (kept for tests and quick demos). */
export const BASIC_EXAMPLE_TEXT = `María de 45 años está casada con Juan de 48.
Tienen dos hijos: Laura de 15 y Pedro de 12.
Los padres de María se llaman Carmen y José.
José falleció en 2018.
María tiene una hermana llamada Ana.
María es la paciente identificada.
María, Juan, Laura y Pedro viven juntos.`;

type Builder = {
  persons: Person[];
  relationships: Relationship[];
  nameToId: Record<string, string>;
  nextP: number;
  nextR: number;
  selfId: string | null;
  /** People whose gender was stated as "no binario / s/d": never overwritten by name heuristics. */
  genderLocked: Set<string>;
};

function makeBuilder(): Builder {
  return {
    persons: [],
    relationships: [],
    nameToId: {},
    nextP: 1,
    nextR: 1,
    selfId: null,
    genderLocked: new Set(),
  };
}

function getOrCreate(
  b: Builder,
  rawName: string,
  opts: {
    gender?: Gender | null;
    age?: number | null;
    deceased?: boolean;
    deathYear?: number | null;
    birthYear?: number | null;
    identifiedPatient?: boolean;
  } = {},
): string {
  const name = cleanName(rawName);
  if (!name) return "";
  const key = name.toLowerCase();
  const existingId = b.nameToId[key];
  if (existingId) {
    const p = b.persons.find((x) => x.id === existingId);
    if (p) {
      if (opts.age != null && p.age == null) p.age = opts.age;
      if (opts.deceased) p.deceased = true;
      if (opts.deathYear) p.deathYear = opts.deathYear;
      if (opts.birthYear && p.birthYear == null) p.birthYear = opts.birthYear;
      if (opts.identifiedPatient) p.identifiedPatient = true;
      if (opts.gender && opts.gender !== "unknown" && p.gender === "unknown" && !b.genderLocked.has(p.id)) {
        p.gender = opts.gender;
      }
    }
    return existingId;
  }
  const id = `p${b.nextP++}`;
  b.nameToId[key] = id;
  const gender = opts.gender && opts.gender !== "unknown" ? opts.gender : inferGenderFromName(name);
  b.persons.push(
    emptyPerson({
      id,
      name,
      gender,
      age: opts.age ?? null,
      deceased: Boolean(opts.deceased),
      deathYear: opts.deathYear ?? null,
      birthYear: opts.birthYear ?? null,
      identifiedPatient: Boolean(opts.identifiedPatient),
    }),
  );
  return id;
}

function ensureSelf(b: Builder, opts: { gender?: Gender | null } = {}): string {
  if (b.selfId) {
    const p = b.persons.find((x) => x.id === b.selfId);
    if (p && opts.gender && opts.gender !== "unknown" && p.gender === "unknown") p.gender = opts.gender;
    return b.selfId;
  }
  const id = `p${b.nextP++}`;
  b.nameToId["consultante"] = id;
  b.persons.push(
    emptyPerson({
      id,
      name: "Consultante",
      gender: opts.gender && opts.gender !== "unknown" ? opts.gender : "unknown",
      identifiedPatient: true,
    }),
  );
  b.selfId = id;
  return id;
}

function nameSelf(
  b: Builder,
  rawName: string,
  opts: { gender?: Gender | null; age?: number | null } = {},
): string {
  const name = cleanName(rawName);
  if (!name) return ensureSelf(b, opts);
  if (b.selfId) {
    const p = b.persons.find((x) => x.id === b.selfId);
    if (p) {
      if (p.name === "Consultante") {
        delete b.nameToId["consultante"];
        p.name = name;
        b.nameToId[name.toLowerCase()] = p.id;
      }
      if (opts.gender && opts.gender !== "unknown") p.gender = opts.gender;
      if (opts.age != null) p.age = opts.age;
      p.identifiedPatient = true;
      return p.id;
    }
  }
  const id = getOrCreate(b, name, { ...opts, identifiedPatient: true });
  b.selfId = id;
  return id;
}

function addRel(b: Builder, type: RelType, a: string, bId: string) {
  if (!a || !bId || a === bId) return;
  const dup = b.relationships.some(
    (r) => r.type === type && ((r.a === a && r.b === bId) || (r.a === bId && r.b === a)),
  );
  if (dup) return;
  b.relationships.push({ id: `r${b.nextR++}`, type, a, b: bId });
}

/** Adds a marriage between two co-parents only when they have no union recorded yet. */
function ensureUnion(b: Builder, x: string, y: string) {
  if (!x || !y || x === y) return;
  const has = b.relationships.some(
    (r) => UNION_TYPES.includes(r.type) && ((r.a === x && r.b === y) || (r.a === y && r.b === x)),
  );
  if (!has) addRel(b, "marriage", x, y);
}

/** Groups the given person ids into the same "household" (the dotted circle),
 * merging with any household(s) they already belong to. */
function linkHousehold(b: Builder, ids: string[]) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length < 2) return;
  const people = uniqueIds
    .map((id) => b.persons.find((p) => p.id === id))
    .filter((p): p is Person => Boolean(p));
  if (people.length < 2) return;
  const existing = [...new Set(people.map((p) => p.household).filter((n): n is number => n != null))];
  let target: number;
  if (existing.length > 0) {
    target = Math.min(...existing);
  } else {
    const maxId = b.persons.reduce((m, p) => (p.household != null ? Math.max(m, p.household) : m), 0);
    target = maxId + 1;
  }
  for (const p of b.persons) {
    if (uniqueIds.includes(p.id) || (p.household != null && existing.includes(p.household))) {
      p.household = target;
    }
  }
}

function ageNear(sentence: string, name: string): number | null {
  const re = new RegExp(`${name}\\s+(?:de\\s+)?(\\d{1,3})(?:\\s*años?)?`, "iu");
  const m = sentence.match(re);
  if (m) return Number(m[1]);
  return null;
}

type NamedPerson = { name: string; age: number | null; gender: Gender | null; adopted: boolean };

const KID_FILLER = String.raw`^(?:(?:tambi[eé]n|adem[aá]s|otro|otra|un|una|el|la|los|las)\s+)*(?:(?:hij[oa]|ni[nñ][oa]|beb[eé])s?\s*)?(?:(adoptad[oa]s?|adoptiv[oa]s?)\s*)?(?:llamad[oa]s?\s+|de\s+nombre\s+)?`;

function parseNamedPeople(chunk: string): NamedPerson[] {
  const parts = chunk
    .split(/,|;| y | e /i)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: NamedPerson[] = [];
  for (const part of parts) {
    const filler = part.match(new RegExp(KID_FILLER, "iu"));
    const rest = filler ? part.slice(filler[0].length) : part;
    const m = rest.match(new RegExp(`^(${NAME})(?:\\s+${AGE})?`, "u"));
    if (!m) continue;
    const name = cleanName(m[1]);
    if (!name) continue;
    const age = m[2] ? Number(m[2]) : null;
    const gender = genderFromWord(part);
    out.push({ name, age, gender, adopted: Boolean(filler?.[1]) });
  }
  return out;
}

function lastUnion(b: Builder): { a: string; b: string } | null {
  const u = [...b.relationships].reverse().find((r) => UNION_TYPES.includes(r.type));
  return u ? { a: u.a, b: u.b } : null;
}

function parentsOf(b: Builder, id: string): string[] {
  return b.relationships.filter((r) => PARENT_TYPES.includes(r.type) && r.b === id).map((r) => r.a);
}

function idsMentioned(b: Builder, sentence: string, exclude: string[] = []): string[] {
  const ex = new Set(exclude.map((n) => n.toLowerCase()));
  return b.persons
    .filter((p) => !ex.has(p.name.toLowerCase()) && sentence.toLowerCase().includes(p.name.toLowerCase()))
    .map((p) => p.id);
}

function parentsForChildren(b: Builder, sentence: string, kidNames: string[]): string[] {
  const mentioned = idsMentioned(b, sentence, kidNames);
  if (mentioned.length) return mentioned;
  if (/\b(tengo|tuve|tenemos|tuvimos|adopt[eé]|adoptamos)\b/i.test(sentence)) {
    const self = ensureSelf(b);
    const union = lastUnion(b);
    if (union && (union.a === self || union.b === self)) return [union.a, union.b];
    return [self];
  }
  const union = lastUnion(b);
  return union ? [union.a, union.b] : [];
}

function preprocess(text: string): string {
  const normalized = text
    .replace(/\r/g, "")
    // bullets / numbering at the start of a line
    .replace(/^[ \t]*(?:[-*•·▪‣]|\d+[.)])[ \t]+/gmu, "")
    // "ex esposa", "ex-pareja" → "exesposa", "expareja"
    .replace(/\bex[\s-]+(esposo|esposa|marido|mujer|pareja|novio|novia)\b/giu, (_m, w: string) => `ex${w.toLowerCase()}`)
    .replace(/\b(\p{L}[\p{L}'-]*?)\s*\((\d{1,3})\)/gu, "$1 de $2 años")
    .replace(/\b(\p{L}[\p{L}'-]*?),\s*(\d{1,3})\s*años/giu, "$1 de $2 años");

  const capitalized = normalized.replace(/[\p{L}]+(?:-[\p{L}]+)*/gu, (word) => {
    const lower = word.toLowerCase();
    if (STOP.has(lower)) return lower;
    if (["de", "del", "la", "las", "los", "y", "e"].includes(lower)) return lower;
    if (word.length < 2) return word;
    // Verb/adjective endings that are never given names → keep as plain words.
    if (word.length >= 7 && /(?:aron|ieron|ando|iendo|ción|sión|mente)$/iu.test(word)) return lower;
    if (word.length >= 8 && /(?:ados|adas|idos|idas)$/iu.test(word)) return lower;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });

  // "José (fallecido) era el padre…" → "José fallecido. José era el padre…"
  // "Sam (género s/d) es hijo…" · "Pedro (paciente identificado) tiene…" — same idea.
  const NAME_TOKENS = String.raw`(\p{Lu}\p{L}+(?:\s+(?:de\s+|del\s+)?\p{Lu}\p{L}+)?)`;
  const ANNOTATION = String.raw`((?:falleci|muert|difunt|finad|paciente|consultante|g[eé]nero|no\s+binari|pi\b|s\/d|†)[^)]*)`;
  return capitalized.replace(new RegExp(String.raw`${NAME_TOKENS}\s*\(\s*${ANNOTATION}\)`, "giu"), (_m, name: string, note: string) => {
    const label = note.trim().toLowerCase();
    return `${name} ${label}. ${name}`;
  });
}

/* ------------------------------------------------------------------ */
/* Extra detectors: links, death, patient, gender, household, adoption */
/* ------------------------------------------------------------------ */

const NA = (g: string) => String.raw`(?<${g}>${NAME})${AG}`;
const PA = NA("a");
const PB = NA("b");
const P2 = String.raw`${PA}\s+(?:y|e)\s+${PB}`;
const NAME_LIST = String.raw`${NAME}${AG}(?:\s*(?:,|\s+y\s+|\s+e\s+)\s*${NAME}${AG})*`;

const L = (type: RelType, src: string): { type: RelType; re: RegExp } => ({
  type,
  re: new RegExp(src, "gu"),
});

/** Symmetric "pair" phrases. Each one has named groups (?<a>) and (?<b>). */
const LINK_PATTERNS: { type: RelType; re: RegExp }[] = [
  // ── Matrimonio ──
  L("marriage", String.raw`${PA}\s+se\s+cas[oó]\s+con\s+${PB}`),
  L(
    "marriage",
    String.raw`${P2}\s+(?:(?:est[aá]n|son)\s+casad[oa]s|se\s+casaron|casad[oa]s|son\s+(?:un\s+)?matrimonio|son\s+esposos)`,
  ),
  L("marriage", String.raw`matrimonio\s+(?:de|entre|formado\s+por)\s+${P2}`),
  // ── Unión de hecho ──
  L(
    "cohabitation",
    String.raw`${PA}\s+(?:vive|convive)\s+(?:en\s+)?(?:uni[oó]n\s+(?:libre|de\s+hecho)|concubinato|pareja)\s+con\s+${PB}`,
  ),
  L("cohabitation", String.raw`${PA}\s+(?:est[aá]\s+)?en\s+(?:uni[oó]n\s+(?:libre|de\s+hecho)|concubinato)\s+con\s+${PB}`),
  L(
    "cohabitation",
    String.raw`${P2}\s+(?:viven|conviven|est[aá]n|son|forman)\s+(?:en\s+|una\s+|como\s+)?(?:uni[oó]n\s+(?:libre|de\s+hecho)|concubinato|pareja(?:\s+de\s+hecho)?)`,
  ),
  L("cohabitation", String.raw`uni[oó]n\s+(?:libre|de\s+hecho)\s+(?:entre|de)\s+${P2}`),
  L("cohabitation", String.raw`${PA}\s+(?:es\s+)?(?:la\s+|el\s+)?(?:pareja|concubin[oa]|compa[nñ]er[oa])\s+de\s+${PB}`),
  // ── Separación ──
  L("separation", String.raw`${PA}\s+se\s+separ[oó]\s+de\s+${PB}`),
  L("separation", String.raw`${PA}\s+(?:est[aá]\s+)?separad[oa]\s+de\s+${PB}`),
  L("separation", String.raw`${P2}\s+(?:(?:est[aá]n|viven)\s+separad[oa]s|se\s+separaron|separad[oa]s)`),
  L("separation", String.raw`separaci[oó]n\s+(?:de|entre)\s+${P2}`),
  // ── Divorcio ──
  L("divorce", String.raw`${PA}\s+(?:est[aá]\s+)?(?:se\s+)?divorci(?:[oó]|ad[oa])\s+de\s+${PB}`),
  L("divorce", String.raw`${P2}\s+(?:(?:est[aá]n\s+)?divorciad[oa]s|se\s+divorciaron)`),
  L("divorce", String.raw`divorcio\s+(?:de|entre)\s+${P2}`),
  L(
    "divorce",
    String.raw`${PA}\s+(?:es\s+)?(?:la\s+|el\s+)?(?:exesposa|exesposo|exmarido|exmujer|expareja)\s+de\s+${PB}`,
  ),
  // ── Noviazgo ──
  L("dating", String.raw`${PA}\s+(?:es\s+)?(?:el\s+|la\s+)?novi[oa]\s+de\s+${PB}`),
  L("dating", String.raw`${P2}\s+(?:son\s+novi[oa]s|est[aá]n\s+de\s+novios|salen|tienen\s+(?:un\s+)?noviazgo)`),
  L("dating", String.raw`${PA}\s+(?:sale|est[aá]\s+saliendo)\s+con\s+${PB}`),
  // ── Cercana ──
  L("close", String.raw`${P2}\s+(?:son|est[aá]n|se\s+sienten)\s+(?:muy\s+)?(?:cercan[oa]s|unid[oa]s|apegad[oa]s)`),
  L(
    "close",
    String.raw`${P2}\s+(?:tienen|mantienen)\s+(?:una\s+)?(?:relaci[oó]n\s+)?(?:muy\s+)?(?:cercana|estrecha|unida|cari[nñ]osa|afectuosa)`,
  ),
  L("close", String.raw`${P2}\s+se\s+llevan\s+(?:muy\s+)?bien`),
  L("close", String.raw`${PA}\s+(?:es|est[aá])\s+(?:muy\s+)?(?:cercan[oa]|unid[oa]|apegad[oa])\s+(?:a|con|de)\s+${PB}`),
  L("close", String.raw`${PA}\s+(?:mantiene|tiene)\s+una\s+relaci[oó]n\s+(?:muy\s+)?(?:cercana|estrecha|unida)\s+con\s+${PB}`),
  // ── Distante ──
  L("distant", String.raw`${P2}\s+(?:son|est[aá]n)\s+(?:muy\s+)?(?:distantes|distanciad[oa]s|lejan[oa]s|fr[ií]os)`),
  L("distant", String.raw`${P2}\s+se\s+(?:han\s+)?distanci(?:aron|ado)`),
  L(
    "distant",
    String.raw`${P2}\s+(?:tienen|mantienen)\s+(?:una\s+)?relaci[oó]n\s+(?:muy\s+)?(?:distante|lejana|fr[ií]a|distanciada)`,
  ),
  L("distant", String.raw`${PA}\s+(?:est[aá]|se\s+ha\s+quedado)\s+(?:muy\s+)?distanciad[oa]\s+de\s+${PB}`),
  L("distant", String.raw`${PA}\s+se\s+(?:ha\s+)?distanci[oó]\s+de\s+${PB}`),
  L("distant", String.raw`${PA}\s+es\s+(?:muy\s+)?distante\s+(?:con|de|a|para)\s+${PB}`),
  L("distant", String.raw`${P2}\s+se\s+ven\s+poco`),
  // ── Corte ──
  L(
    "cutoff",
    String.raw`${PA}\s+(?:cort[oó]|rompi[oó]|ha\s+cortado|ha\s+roto)\s+(?:(?:la|el|toda|todo)\s+)?(?:relaci[oó]n|contacto|v[ií]nculo)\s+con\s+${PB}`,
  ),
  L(
    "cutoff",
    String.raw`${P2}\s+(?:no\s+se\s+(?:hablan|ven|tratan)|no\s+tienen\s+contacto|(?:est[aá]n\s+)?(?:cortad[oa]s|rot[oa]s)|(?:cortaron|rompieron)\s+(?:la\s+|el\s+)?(?:relaci[oó]n|contacto)|est[aá]n\s+sin\s+contacto)`,
  ),
  L("cutoff", String.raw`${PA}\s+no\s+(?:habla|ve|trata|tiene\s+contacto)\s+con\s+${PB}`),
  L("cutoff", String.raw`corte\s+(?:relacional\s+)?(?:entre|de)\s+${P2}`),
  // ── Conflicto ──
  L(
    "conflict",
    String.raw`${P2}\s+(?:(?:tienen|mantienen|hay)\s+(?:un\s+|una\s+)?(?:relaci[oó]n\s+)?(?:muy\s+)?(?:conflictiv[oa]|conflictos?)|(?:est[aá]n|viven)\s+(?:en\s+conflicto|pelead[oa]s|enfrentad[oa]s)|se\s+llevan\s+mal|discuten|pelean|se\s+pelean)`,
  ),
  L("conflict", String.raw`(?:(?:hay|existe)\s+(?:un\s+)?)?conflicto\s+(?:entre|de)\s+${P2}`),
  L(
    "conflict",
    String.raw`${PA}\s+(?:discute|pelea|se\s+pelea|tiene\s+(?:un\s+)?conflicto|est[aá]\s+en\s+conflicto|se\s+lleva\s+mal|est[aá]\s+pelead[oa])\s+con\s+${PB}`,
  ),
];

function applyLinks(b: Builder, sentence: string) {
  for (const { type, re } of LINK_PATTERNS) {
    re.lastIndex = 0;
    for (const m of sentence.matchAll(re)) {
      const an = m.groups?.["a"];
      const bn = m.groups?.["b"];
      if (!an || !bn) continue;
      const ida = getOrCreate(b, cleanName(an));
      const idb = getOrCreate(b, cleanName(bn));
      addRel(b, type, ida, idb);
    }
  }
  // "X enviudó de Y" / "X quedó viuda de Y" → Y is deceased.
  const widow = new RegExp(String.raw`${PA}\s+(?:enviud[oó]|qued[oó]\s+viud[oa])\s+de\s+${PB}`, "u").exec(sentence);
  if (widow?.groups) {
    addRel(
      b,
      "widowed",
      getOrCreate(b, cleanName(widow.groups["a"]!)),
      getOrCreate(b, cleanName(widow.groups["b"]!), { deceased: true }),
    );
  }
}

const DEATH_RE = new RegExp(
  String.raw`(?:falleci(?:[oó]|eron|d[oa]s?)|fallecen|muri(?:[oó]|eron)|muert[oa]s?|difunt[oa]s?|finad[oa]s?|ya\s+no\s+vive(?!\s+(?:con|en|junt|aqu))|ya\s+no\s+est[aá]\s+(?:con|entre)\s+nosotros)(?![\p{L}])|†|✝`,
  "iu",
);
const DEATH_CHAIN = new RegExp(
  String.raw`((?:${NAME}${AG}\s*(?:,\s*|\s+(?:y|e)\s+))*${NAME})${AG}\s*[,(]?\s*(?:ya\s+|tambi[eé]n\s+|est[aá]n?\s+|estaba\s+|era\s+|fue\s+)*$`,
  "u",
);
const KIN_OF = String.raw`(?:padre|madre|abuel[oa]|hermano|hermana|hij[oa]|esposo|esposa|marido|mujer|t[ií][oa])\s+de\s+${NAME}\s*,?\s*`;

function namesIn(text: string): string[] {
  return (text.match(new RegExp(NAME, "gu")) ?? []).map(cleanName).filter(Boolean);
}

function applyDeath(b: Builder, sentence: string) {
  const mk = DEATH_RE.exec(sentence);
  if (!mk) return;
  const pre = sentence.slice(0, mk.index);
  const post = sentence.slice(mk.index + mk[0].length);

  let subjects: string[] = [];
  const chain = DEATH_CHAIN.exec(pre);
  if (chain) {
    subjects = namesIn(chain[1]!);
  } else {
    const kin = new RegExp(String.raw`^\s*(?:(?:el|la|los|las)\s+)?${KIN_OF}(${NAME})`, "u").exec(post);
    if (kin) subjects = [cleanName(kin[1]!)];
    else {
      const first = namesIn(post)[0];
      if (first) subjects = [first];
    }
  }
  subjects = subjects.filter(Boolean);
  if (subjects.length === 0) return;

  const yearAfter = post.match(/\b((?:19|20)\d{2})\b/);
  const yearBefore = pre.match(/\b((?:19|20)\d{2})\b/g)?.filter((y) => !/naci[oó]\s+en\s+$/i.test(pre.slice(0, pre.indexOf(y))));
  const deathYear = yearAfter ? Number(yearAfter[1]) : yearBefore?.length ? Number(yearBefore[yearBefore.length - 1]) : null;
  const ageAt = post.match(/\ba\s+los\s+(\d{1,3})\s*años/i);
  for (const name of subjects) {
    getOrCreate(b, name, { deceased: true, deathYear, age: ageAt ? Number(ageAt[1]) : null });
  }
}

const PATIENT_KW = String.raw`(?:paciente\s+identificad[oa]|paciente\s+[ií]ndice|paciente|consultante|caso\s+[ií]ndice|persona\s+identificada|pi)`;

/** Returns true when the sentence names an identified patient (so the generic fallback is skipped). */
function applyPatient(b: Builder, sentence: string): boolean {
  const flag = (raw: string) => {
    const name = cleanName(raw);
    if (name) getOrCreate(b, name, { identifiedPatient: true });
    return Boolean(name);
  };
  let m: RegExpMatchArray | null;
  if (
    (m = sentence.match(
      new RegExp(
        String.raw`(${NAME})${AG}\s*,?\s*(?:es|ser[aá]|fue|es\s+considerad[oa]\s+como|es\s+considerad[oa])\s+(?:el\s+|la\s+)?${PATIENT_KW}(?![\p{L}])`,
        "u",
      ),
    ))
  ) {
    return flag(m[1]!);
  }
  if ((m = sentence.match(new RegExp(String.raw`(${NAME})${AG}\s*(?:,\s*|\(\s*)${PATIENT_KW}(?![\p{L}])`, "u")))) {
    return flag(m[1]!);
  }
  if ((m = sentence.match(new RegExp(String.raw`${PATIENT_KW}\s*(?:es|:|,|=)\s*(?:el\s+|la\s+)?(${NAME})`, "u")))) {
    return flag(m[1]!);
  }
  if (/\bsoy\s+(?:el|la)\s+(?:paciente|consultante)\b/i.test(sentence)) {
    const self = ensureSelf(b);
    const p = b.persons.find((x) => x.id === self);
    if (p) p.identifiedPatient = true;
    return true;
  }
  if (/paciente\s+identificad[oa]|consultante|caso\s+[ií]ndice|paciente\s+[ií]ndice/i.test(sentence)) {
    const first = namesIn(sentence)[0];
    if (first) getOrCreate(b, first, { identifiedPatient: true });
    return true;
  }
  return false;
}

const GENDER_UNKNOWN_RE =
  /g[eé]nero\s+(?:no\s+(?:especificado|especificada|definido|definida|binario|binaria|conocido)|desconocido|desconocida|indefinido|fluido|s\/d|sd|sin\s+(?:datos|especificar|definir))|no\s+binari[oa]e?|(?<![\p{L}])s\/d(?![\p{L}])/iu;

function applyGender(b: Builder, sentence: string) {
  const mk = GENDER_UNKNOWN_RE.exec(sentence);
  if (mk) {
    const head = sentence.slice(0, mk.index);
    const segment = head.slice(head.lastIndexOf(",") + 1);
    const inSegment = namesIn(segment);
    const subject = sentence.match(new RegExp(String.raw`^\s*(${NAME})${AG}\s+(?:es|era|tiene|est[aá])\b`, "u"));
    const before = namesIn(head);
    const after = namesIn(sentence.slice(mk.index + mk[0].length));
    const target =
      inSegment[inSegment.length - 1] ?? (subject ? cleanName(subject[1]!) : undefined) ?? before[before.length - 1] ?? after[0];
    if (target) {
      const id = getOrCreate(b, target);
      const p = b.persons.find((x) => x.id === id);
      if (p) {
        p.gender = "unknown";
        b.genderLocked.add(p.id);
      }
    }
  }
  const stated = sentence.match(
    new RegExp(String.raw`(${NAME})${AG}\s+es\s+(?:un\s+|una\s+)?(mujer|hombre|var[oó]n)(?![\p{L}])`, "u"),
  );
  if (stated) {
    const id = getOrCreate(b, cleanName(stated[1]!));
    const p = b.persons.find((x) => x.id === id);
    if (p && !b.genderLocked.has(p.id)) p.gender = stated[2] === "mujer" ? "female" : "male";
  }
}

function applyHousehold(b: Builder, sentence: string, lower: string) {
  const negated = /\bno\s+(?:vive|viven|conviven|convive)\b|\bya\s+no\s+(?:vive|viven)\b|viven\s+separad/.test(lower);
  const verb = /\b(?:viven|vive|conviven|convive|comparten|comparte|residen|reside)\b/.test(lower);
  const together = /junt[oa]s?|misma\s+casa|mismo\s+techo|mismo\s+hogar|\bcon\b/.test(lower);
  const nucleus = /n[uú]cleo\s+familiar|mismo\s+hogar|misma\s+casa|mismo\s+techo/.test(lower);
  if (negated || !((verb && together) || nucleus)) return;
  const ids: string[] = [];
  for (const m of sentence.matchAll(new RegExp(NAME, "gu"))) {
    const before = sentence.slice(0, m.index);
    if (/\b(?:en|desde|hacia)\s+(?:la\s+|el\s+|los\s+|las\s+)?$/.test(before)) continue; // places
    const name = cleanName(m[0]);
    if (name) ids.push(getOrCreate(b, name));
  }
  linkHousehold(b, ids);
}

function kidTypeFor(kid: NamedPerson, forceAdopted: boolean): RelType {
  return forceAdopted || kid.adopted ? "adopted" : "parent_child";
}

function attachKids(b: Builder, parentIds: string[], kids: NamedPerson[], adopted: boolean, defaultGender: Gender | null) {
  for (const kid of kids) {
    const cid = getOrCreate(b, kid.name, { age: kid.age, gender: kid.gender ?? defaultGender });
    for (const pid of parentIds) addRel(b, kidTypeFor(kid, adopted), pid, cid);
  }
}

function applyAdoptionAndKids(b: Builder, sentence: string) {
  let m: RegExpMatchArray | null;

  // "María y Juan adoptaron a Sofía de 8" · "Ana adoptó a Luis" · "Adoptamos a Sofía"
  const adoptRest = String.raw`adopt(?:aron|[oó]|an|amos|[eé])\s+(?:a\s+)?(?:un[ao]?\s+)?(?:(?:ni[nñ][oa]s?|beb[eé]|hij[oa]s?)\s+)?(?:llamad[oa]s?\s+|de\s+nombre\s+)?[:,]?\s*(?<kids>.+)`;
  if ((m = sentence.match(new RegExp(String.raw`${PA}(?:\s+(?:y|e)\s+${PB})?\s+${adoptRest}`, "u"))) && m.groups) {
    const parents = [m.groups["a"], m.groups["b"]]
      .filter((n): n is string => Boolean(n))
      .map((n) => getOrCreate(b, cleanName(n)));
    const kids = parseNamedPeople(m.groups["kids"]!);
    attachKids(b, parents, kids, true, null);
  } else if ((m = sentence.match(new RegExp(String.raw`(?:^|,\s*|\by\s+)${adoptRest}`, "u"))) && m.groups) {
    const kids = parseNamedPeople(m.groups["kids"]!);
    if (kids.length) {
      const parents = parentsForChildren(
        b,
        sentence,
        kids.map((k) => k.name),
      );
      attachKids(b, parents, kids, true, null);
    }
  }

  // "Sofía es hija adoptiva de María y Juan" · "Sofía fue adoptada por María"
  if (
    (m = sentence.match(
      new RegExp(
        String.raw`${PA}\s+(?:es|era|fue)\s+(?:(?:la|el)\s+)?(?:hij[oa]\s+)?(?:adoptiv[oa]|adoptad[oa])\s+(?:de|por)\s+${PB}(?:\s+(?:y|e)\s+(?<c>${NAME}))?`,
        "u",
      ),
    )) &&
    m.groups
  ) {
    const g: Gender = /hija|adoptada|adoptiva/.test(m[0]) ? "female" : "male";
    const child = getOrCreate(b, cleanName(m.groups["a"]!), { gender: g });
    for (const n of [m.groups["b"], m.groups["c"]]) {
      if (n) addRel(b, "adopted", getOrCreate(b, cleanName(n)), child);
    }
  } else if ((m = sentence.match(new RegExp(String.raw`${PA}\s+(?:es|era|fue)\s+adoptad([oa])\s*$`, "u"))) && m.groups) {
    const name = cleanName(m.groups["a"]!);
    const child = getOrCreate(b, name, { gender: m[3] === "a" ? "female" : "male" });
    for (const pid of parentsForChildren(b, sentence, [name])) addRel(b, "adopted", pid, child);
  }

  // "Los hijos de María y Juan son Laura y Pedro" · "Su hija se llama Laura" · "Sus hijos son ..."
  if (
    (m = sentence.match(
      new RegExp(
        String.raw`hij([oa])s?\s+(?<adop>adoptiv[oa]s?\s+)?de\s+${PA}(?:\s+(?:y|e)\s+${PB})?\s+(?:son|es|se\s+llama[n]?)\s*:?\s*(?<kids>.+)`,
        "u",
      ),
    )) &&
    m.groups
  ) {
    const parents = [m.groups["a"], m.groups["b"]]
      .filter((n): n is string => Boolean(n))
      .map((n) => getOrCreate(b, cleanName(n)));
    const g: Gender | null = /hijas?\b/.test(m[0]) ? "female" : /hijo\b/.test(m[0]) ? "male" : null;
    attachKids(b, parents, parseNamedPeople(m.groups["kids"]!), Boolean(m.groups["adop"]), g);
    if (parents.length === 2) ensureUnion(b, parents[0]!, parents[1]!);
  } else if (
    (m = sentence.match(
      new RegExp(String.raw`(?:^|\s)sus?\s+hij([oa])s?\s+(?<adop>adoptiv[oa]s?\s+)?(?:son|es|se\s+llama[n]?)\s*:?\s*(?<kids>.+)`, "u"),
    )) &&
    m.groups
  ) {
    const kids = parseNamedPeople(m.groups["kids"]!);
    if (kids.length) {
      const parents = parentsForChildren(
        b,
        sentence,
        kids.map((k) => k.name),
      );
      const g: Gender | null = /hijas?\b/.test(m[0]) ? "female" : /hijo\b/.test(m[0]) ? "male" : null;
      attachKids(b, parents, kids, Boolean(m.groups["adop"]), g);
    }
  }

  // "Laura y Pedro son hijos de María y Juan" · "Laura y Pedro son sus hijos"
  if (
    (m = sentence.match(
      new RegExp(
        String.raw`(?<kids>${NAME_LIST})\s+son\s+(?:los\s+|las\s+)?hij([oa])s\s+(?<adop>adoptiv[oa]s\s+)?de\s+${PA}(?:\s+(?:y|e)\s+${PB})?`,
        "u",
      ),
    )) &&
    m.groups
  ) {
    const parents = [m.groups["a"], m.groups["b"]]
      .filter((n): n is string => Boolean(n))
      .map((n) => getOrCreate(b, cleanName(n)));
    attachKids(b, parents, parseNamedPeople(m.groups["kids"]!), Boolean(m.groups["adop"]), null);
    if (parents.length === 2) ensureUnion(b, parents[0]!, parents[1]!);
  } else if (
    (m = sentence.match(new RegExp(String.raw`(?<kids>${NAME_LIST})\s+son\s+sus\s+hij([oa])s(?<adop>\s+adoptiv[oa]s)?`, "u"))) &&
    m.groups
  ) {
    const kids = parseNamedPeople(m.groups["kids"]!);
    const parents = parentsForChildren(
      b,
      sentence,
      kids.map((k) => k.name),
    );
    attachKids(b, parents, kids, Boolean(m.groups["adop"]), null);
  }
}

export function parseFamilyText(text: string, opts: NarrativeOptions = {}): GenogramData {
  if (looksNarrative(text)) {
    const narrative = parseNarrative(text, opts);
    if (narrative.persons.length > 0) {
      applyConditionsFromText(narrative.persons, text);
      return narrative;
    }
  }
  const b = makeBuilder();
  const cleaned = preprocess(text).trim();
  if (!cleaned) return { persons: [], relationships: [] };

  const sentences = cleaned
    // "Elena, que está divorciada de Mario" → keep the subject: "Elena está divorciada de Mario"
    .replace(/,\s*(?:que|quien)\s+/giu, " ")
    .split(/[.\n;]+|\s+(?:pero|mientras(?:\s+que)?|aunque)\s+/iu)
    .map((s) => s.trim())
    .filter(Boolean);

  let allTogether = false;

  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    const birthYearMatch = lower.match(/naci[oó]\s+en\s+(\d{4})/);
    const birthYear = birthYearMatch ? Number(birthYearMatch[1]) : null;

    let m: RegExpMatchArray | null;

    const meLlamo = sentence.match(new RegExp(`(?:me\\s+llamo|soy)\\s+(${NAME})(?:\\s+${AGE})?`, "u"));
    if (meLlamo && !/soy\s+hij/i.test(sentence)) {
      nameSelf(b, cleanName(meLlamo[1]), {
        gender: genderFromWord(sentence),
        age: meLlamo[2] ? Number(meLlamo[2]) : ageNear(sentence, cleanName(meLlamo[1])),
      });
    }

    const estoyCasad = sentence.match(
      new RegExp(`estoy\\s+casad([oa])\\s+con\\s+(${NAME})(?:\\s+${AGE})?`, "u"),
    );
    if (estoyCasad) {
      const g: Gender = estoyCasad[1] === "a" ? "female" : "male";
      const self = ensureSelf(b, { gender: g });
      const other = getOrCreate(b, cleanName(estoyCasad[2]), {
        gender: g === "female" ? "male" : "female",
        age: estoyCasad[3] ? Number(estoyCasad[3]) : null,
      });
      addRel(b, "marriage", self, other);
    }

    const meCase = sentence.match(new RegExp(`me\\s+cas[eé]\\s+con\\s+(${NAME})(?:\\s+${AGE})?`, "u"));
    if (meCase) {
      const self = ensureSelf(b, { gender: genderFromWord(sentence) });
      addRel(b, "marriage", self, getOrCreate(b, cleanName(meCase[1]), { age: meCase[2] ? Number(meCase[2]) : null }));
    }

    const misPadres = sentence.match(
      new RegExp(`mis\\s+padres\\s+(?:se\\s+llaman?|son)\\s+(${NAME})\\s+(?:y|e)\\s+(${NAME})`, "u"),
    );
    if (misPadres) {
      const self = ensureSelf(b);
      const p1 = getOrCreate(b, cleanName(misPadres[1]));
      const p2 = getOrCreate(b, cleanName(misPadres[2]));
      addRel(b, "parent_child", p1, self);
      addRel(b, "parent_child", p2, self);
      ensureUnion(b, p1, p2);
    }

    const miPariente = sentence.match(
      new RegExp(
        `mi\\s+(padre|madre|hermano|hermana|esposo|esposa|marido|mujer|exesposo|exesposa|exmarido|exmujer|novio|novia|pareja|hijo|hija)\\s+(?:se\\s+llama|es)\\s+(${NAME})(?:\\s+${AGE})?`,
        "u",
      ),
    );
    if (miPariente) {
      const role = miPariente[1].toLowerCase();
      const g = genderFromWord(role);
      const other = getOrCreate(b, cleanName(miPariente[2]), {
        gender: g,
        age: miPariente[3] ? Number(miPariente[3]) : null,
      });
      const selfG =
        role === "madre" || role === "esposa" || role === "mujer" || role === "hermana" || role === "exesposa"
          ? undefined
          : undefined;
      const self = ensureSelf(b, { gender: selfG ?? null });
      if (role === "padre" || role === "madre") addRel(b, "parent_child", other, self);
      else if (role === "hermano" || role === "hermana") addRel(b, "sibling", self, other);
      else if (role === "hijo" || role === "hija") addRel(b, "parent_child", self, other);
      else if (role === "novio" || role === "novia") addRel(b, "dating", self, other);
      else if (role === "pareja") addRel(b, "cohabitation", self, other);
      else if (role.startsWith("ex")) addRel(b, "divorce", self, other);
      else addRel(b, "marriage", self, other);
    }

    const marriageRe = new RegExp(
      `(${NAME})(?:,?\\s+${AGE})?,?\\s+(?:est[aá]\\s+)?casad([oa])\\s+con\\s+(${NAME})(?:,?\\s+${AGE})?`,
      "u",
    );
    const marriageRe2 = new RegExp(`(${NAME})\\s+(?:y|e)\\s+(${NAME})\\s+(?:est[aá]n\\s+)?casad[oa]s`, "u");
    const spouseRe = new RegExp(
      `(${NAME})\\s+(?:es\\s+)?(?:el\\s+|la\\s+)?(esposo|esposa|marido|mujer|exesposo|exesposa|exmarido|exmujer)\\s+de\\s+(${NAME})`,
      "u",
    );
    const cohabRe = new RegExp(`(${NAME})(?:\\s+${AGE})?\\s+(?:vive|convive)\\s+con\\s+(${NAME})`, "u");
    const widowRe = new RegExp(`(${NAME})\\s+(?:es\\s+|está\\s+)?viud([oa])\\s+de\\s+(${NAME})`, "u");

    if ((m = sentence.match(marriageRe))) {
      const g1: Gender = m[3] === "a" ? "female" : m[3] === "o" ? "male" : "unknown";
      const g2: Gender = g1 === "female" ? "male" : g1 === "male" ? "female" : "unknown";
      const n1 = cleanName(m[1]);
      const n2 = cleanName(m[4]);
      const id1 = getOrCreate(b, n1, { gender: g1, age: m[2] ? Number(m[2]) : ageNear(sentence, n1) });
      const id2 = getOrCreate(b, n2, { gender: g2, age: m[5] ? Number(m[5]) : ageNear(sentence, n2) });
      addRel(b, "marriage", id1, id2);
    } else if ((m = sentence.match(marriageRe2))) {
      addRel(b, "marriage", getOrCreate(b, cleanName(m[1])), getOrCreate(b, cleanName(m[2])));
    } else if ((m = sentence.match(spouseRe))) {
      const n1 = cleanName(m[1]);
      const n2 = cleanName(m[3]);
      const g = genderFromWord(m[2]);
      const type: RelType = /ex/.test(m[2].toLowerCase()) ? "divorce" : "marriage";
      const id1 = getOrCreate(b, n1, { gender: g });
      const id2 = getOrCreate(b, n2, { gender: g === "male" ? "female" : g === "female" ? "male" : "unknown" });
      addRel(b, type, id1, id2);
    } else if ((m = sentence.match(widowRe))) {
      const n1 = cleanName(m[1]);
      const n2 = cleanName(m[3]);
      const g1: Gender = m[2] === "a" ? "female" : "male";
      addRel(b, "widowed", getOrCreate(b, n1, { gender: g1 }), getOrCreate(b, n2, { deceased: true }));
    } else if ((m = sentence.match(cohabRe))) {
      const n1 = cleanName(m[1]);
      const n2 = cleanName(m[3]);
      const id1 = getOrCreate(b, n1, { age: m[2] ? Number(m[2]) : null });
      const id2 = getOrCreate(b, n2);
      addRel(b, "cohabitation", id1, id2);
      linkHousehold(b, [id1, id2]);
    }

    // "X y Y viven juntos", "X, Y y Z conviven", "viven en la misma casa" → same household circle.
    const householdLeadRe = new RegExp(
      `^((?:${NAME}\\s*,\\s*)*${NAME}\\s+(?:y|e)\\s+${NAME})\\s+(?:viven\\s+junt[oa]s|conviven|viven\\s+en\\s+la\\s+misma\\s+casa)`,
      "iu",
    );
    if ((m = sentence.match(householdLeadRe))) {
      const names = parseNamedPeople(m[1]).map((n) => n.name);
      linkHousehold(
        b,
        names.map((n) => getOrCreate(b, n)),
      );
    }

    // "Todos viven juntos" / "todos conviven" → everyone parsed so far goes in one household.
    if (
      /\btodos\b/u.test(lower) &&
      (/\bconviven\b/u.test(lower) || (/\bviven\b/u.test(lower) && /\bjunt[oa]s?\b/u.test(lower)))
    ) {
      allTogether = true;
    }

    const divRe = new RegExp(`(${NAME})\\s+(?:est[aá]\\s+)?divorciad([oa])\\s+de\\s+(${NAME})`, "u");
    const divRe2 = new RegExp(`(${NAME})\\s+(?:y|e)\\s+(${NAME})\\s+(?:est[aá]n\\s+)?(?:divorciad[oa]s|separad[oa]s)`, "u");
    const sepRe = new RegExp(`(${NAME})\\s+se\\s+separ[oó]\\s+de\\s+(${NAME})`, "u");
    if ((m = sentence.match(divRe))) {
      const n1 = cleanName(m[1]);
      const n2 = cleanName(m[3]);
      const g1: Gender = m[2] === "a" ? "female" : "male";
      addRel(b, "divorce", getOrCreate(b, n1, { gender: g1 }), getOrCreate(b, n2));
    } else if ((m = sentence.match(divRe2))) {
      addRel(
        b,
        /separad/.test(lower) ? "separation" : "divorce",
        getOrCreate(b, cleanName(m[1])),
        getOrCreate(b, cleanName(m[2])),
      );
    } else if ((m = sentence.match(sepRe))) {
      addRel(b, "separation", getOrCreate(b, cleanName(m[1])), getOrCreate(b, cleanName(m[2])));
    }

    const parentsRe = new RegExp(
      `padres?\\s+de\\s+(${NAME})\\s+(?:se\\s+llaman?|son|son\\s+llamados)\\s+(${NAME})\\s+(?:y|e)\\s+(${NAME})`,
      "u",
    );
    const parentsOfRe = new RegExp(
      `(${NAME})\\s+(?:y|e)\\s+(${NAME})\\s+(?:son|fueron)\\s+(?:los\\s+)?padres\\s+de\\s+(${NAME})`,
      "u",
    );
    const childOfRe = new RegExp(`(${NAME})${AG}\\s+(?:es|era)\\s+(?:el\\s+|la\\s+)?hij([oa])\\s+de\\s+(${NAME})${AG}(?:\\s+(?:y|e)\\s+(${NAME}))?`, "u");
    const fatherRe = new RegExp(`(?:el\\s+)?padre\\s+de\\s+(${NAME})\\s+(?:es|se\\s+llama)\\s+(${NAME})`, "u");
    const motherRe = new RegExp(`(?:la\\s+)?madre\\s+de\\s+(${NAME})\\s+(?:es|se\\s+llama)\\s+(${NAME})`, "u");
    const isFatherRe = new RegExp(`(${NAME})${AG}\\s+(?:es|era|fue)\\s+(?:el\\s+)?padre\\s+de\\s+(${NAME_LIST})`, "u");
    const isMotherRe = new RegExp(`(${NAME})${AG}\\s+(?:es|era|fue)\\s+(?:la\\s+)?madre\\s+de\\s+(${NAME_LIST})`, "u");
    const adoptedRe = new RegExp(`(${NAME})${AG}\\s+(?:es\\s+|fue\\s+)?adoptad([oa])\\s+por\\s+(${NAME})(?:\\s+(?:y|e)\\s+(${NAME}))?`, "u");

    if ((m = sentence.match(parentsRe))) {
      const child = getOrCreate(b, cleanName(m[1]));
      const p1 = getOrCreate(b, cleanName(m[2]));
      const p2 = getOrCreate(b, cleanName(m[3]));
      addRel(b, "parent_child", p1, child);
      addRel(b, "parent_child", p2, child);
      ensureUnion(b, p1, p2);
    } else if ((m = sentence.match(parentsOfRe))) {
      const p1 = getOrCreate(b, cleanName(m[1]));
      const p2 = getOrCreate(b, cleanName(m[2]));
      const child = getOrCreate(b, cleanName(m[3]));
      addRel(b, "parent_child", p1, child);
      addRel(b, "parent_child", p2, child);
      ensureUnion(b, p1, p2);
    } else if ((m = sentence.match(childOfRe))) {
      const child = getOrCreate(b, cleanName(m[1]), { gender: m[2] === "a" ? "female" : "male" });
      const p1 = getOrCreate(b, cleanName(m[3]));
      addRel(b, "parent_child", p1, child);
      if (m[4]) {
        const p2 = getOrCreate(b, cleanName(m[4]));
        addRel(b, "parent_child", p2, child);
        ensureUnion(b, p1, p2);
      }
    } else if ((m = sentence.match(isFatherRe))) {
      const father = getOrCreate(b, cleanName(m[1]), { gender: "male" });
      for (const kid of parseNamedPeople(m[2])) {
        addRel(b, "parent_child", father, getOrCreate(b, kid.name, { age: kid.age, gender: kid.gender }));
      }
    } else if ((m = sentence.match(isMotherRe))) {
      const mother = getOrCreate(b, cleanName(m[1]), { gender: "female" });
      for (const kid of parseNamedPeople(m[2])) {
        addRel(b, "parent_child", mother, getOrCreate(b, kid.name, { age: kid.age, gender: kid.gender }));
      }
    } else if ((m = sentence.match(fatherRe))) {
      const child = getOrCreate(b, cleanName(m[1]));
      const father = getOrCreate(b, cleanName(m[2]), { gender: "male" });
      addRel(b, "parent_child", father, child);
    } else if ((m = sentence.match(motherRe))) {
      const child = getOrCreate(b, cleanName(m[1]));
      const mother = getOrCreate(b, cleanName(m[2]), { gender: "female" });
      addRel(b, "parent_child", mother, child);
    } else if ((m = sentence.match(adoptedRe))) {
      const child = getOrCreate(b, cleanName(m[1]), { gender: m[2] === "a" ? "female" : "male" });
      const p1 = getOrCreate(b, cleanName(m[3]));
      addRel(b, "adopted", p1, child);
      if (m[4]) {
        const p2 = getOrCreate(b, cleanName(m[4]));
        addRel(b, "adopted", p2, child);
        ensureUnion(b, p1, p2);
      }
    }

    const grandparentsRe = new RegExp(
      `abuelos\\s+(maternos|paternos)?\\s*de\\s+(${NAME})\\s+(?:se\\s+llaman?|son)\\s+(${NAME})\\s+(?:y|e)\\s+(${NAME})`,
      "u",
    );
    if ((m = sentence.match(grandparentsRe))) {
      const child = getOrCreate(b, cleanName(m[2]));
      const g1 = getOrCreate(b, cleanName(m[3]));
      const g2 = getOrCreate(b, cleanName(m[4]));
      ensureUnion(b, g1, g2);
      const side = (m[1] ?? "").toLowerCase();
      const existingParents = parentsOf(b, child);
      let mid: string | null = null;
      if (side === "maternos") {
        mid =
          existingParents.map((id) => b.persons.find((p) => p.id === id)).find((p) => p?.gender === "female")?.id ??
          existingParents[0] ??
          null;
      } else if (side === "paternos") {
        mid =
          existingParents.map((id) => b.persons.find((p) => p.id === id)).find((p) => p?.gender === "male")?.id ??
          existingParents[0] ??
          null;
      } else {
        mid = existingParents[0] ?? null;
      }
      if (mid) {
        addRel(b, "parent_child", g1, mid);
        addRel(b, "parent_child", g2, mid);
      } else {
        addRel(b, "parent_child", g1, child);
        addRel(b, "parent_child", g2, child);
      }
    }

    const childrenRe = new RegExp(
      `(?:tienen|tiene|tuvieron|tuvo|tengo|tuve|tenemos|tuvimos)\\s+(?:con\\s+${NAME}\\s+)?(?:un|una|uno|otr[oa]|dos|tres|cuatro|cinco|seis|\\d+)?\\s*(hij[oa]s?)\\s*(adoptiv[oa]s?|adoptad[oa]s?)?\\s*(?:llamad[oa]s?)?\\s*[:,]?\\s*(.+)`,
      "iu",
    );
    const childrenRe2 = new RegExp(
      `(?:tienen|tiene|tuvieron|tuvo|tengo|tuve|tenemos|tuvimos)\\s+(?:un[oa]?\\s+)?hij([oa])\\s+(?:llamad[oa]\\s+)?(${NAME})`,
      "iu",
    );
    if ((m = sentence.match(childrenRe))) {
      const kids = parseNamedPeople(m[3]);
      if (kids.length > 0) {
        const kidNames = kids.map((k) => k.name);
        const lead = sentence.slice(0, (m.index ?? 0) + m[0].length - m[3].length);
        const leadIds = namesIn(lead)
          .filter((n) => !kidNames.includes(n))
          .map((n) => getOrCreate(b, n));
        const parentIds = leadIds.length
          ? [...new Set(leadIds)]
          : parentsForChildren(b, sentence, kidNames);
        const word = m[1].toLowerCase();
        const defaultGender: Gender | null = word === "hija" || word === "hijas" ? "female" : word === "hijo" ? "male" : null;
        attachKids(b, parentIds, kids, Boolean(m[2]), defaultGender);
      }
    } else if ((m = sentence.match(childrenRe2))) {
      const g: Gender = m[1] === "a" ? "female" : "male";
      const cid = getOrCreate(b, cleanName(m[2]), { gender: g });
      const parentIds = parentsForChildren(b, sentence, [cleanName(m[2])]);
      for (const pid of parentIds) addRel(b, "parent_child", pid, cid);
    } else if ((m = sentence.match(/^\s*hij([oa])s?\s*:\s*(.+)$/iu))) {
      // "Hijos: Mateo 10, Sara 8" (sin verbo): se cuelgan de la última pareja mencionada
      const kids = parseNamedPeople(m[2]);
      if (kids.length > 0) {
        const defaultGender: Gender | null = m[1].toLowerCase() === "a" ? "female" : "male";
        const parentIds = parentsForChildren(
          b,
          sentence,
          kids.map((k) => k.name),
        );
        attachKids(b, parentIds, kids, false, kids.length === 1 ? defaultGender : null);
      }
    }

    const sibRe = new RegExp(
      `(${NAME})${AG}\\s+tiene\\s+(?:una?|otr[oa]|dos|tres|\\d+)?\\s*herman([oa])s?\\s+(?:llamad[oa]s?\\s+)?(?:[:,]?\\s*)(.+)`,
      "u",
    );
    const sibRe2 = new RegExp(`(${NAME})(?:\\s*,\\s*(${NAME}))*\\s+(?:y|e)\\s+(${NAME})\\s+son\\s+herman[oa]s`, "u");
    const sibRe3 = new RegExp(`(${NAME})${AG}\\s+es\\s+(?:el\\s+|la\\s+)?herman([oa])\\s+de\\s+(${NAME})`, "u");
    const tengoHermano = sentence.match(
      new RegExp(`tengo\\s+(?:una?|otr[oa]|dos|tres|\\d+)?\\s*herman([oa])s?\\s+(?:llamad[oa]s?\\s+)?(?:[:,]?\\s*)(.+)`, "u"),
    );
    if ((m = sentence.match(sibRe2))) {
      const names = [m[1], m[2], m[3]].filter(Boolean).map(cleanName);
      const ids = names.map((n) => getOrCreate(b, n));
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) addRel(b, "sibling", ids[i]!, ids[j]!);
      }
    } else if ((m = sentence.match(sibRe3))) {
      const g: Gender = m[2] === "a" ? "female" : "male";
      addRel(b, "sibling", getOrCreate(b, cleanName(m[1]), { gender: g }), getOrCreate(b, cleanName(m[3])));
    } else if (tengoHermano) {
      const self = ensureSelf(b);
      const g2: Gender = tengoHermano[1] === "a" ? "female" : "male";
      const others = parseNamedPeople(tengoHermano[2]);
      const list = others.length ? others : [{ name: cleanName(tengoHermano[2]), age: null, gender: g2 }];
      for (const other of list) {
        if (!other.name) continue;
        addRel(b, "sibling", self, getOrCreate(b, other.name, { gender: other.gender ?? g2, age: other.age }));
      }
    } else if ((m = sentence.match(sibRe))) {
      const id1 = getOrCreate(b, cleanName(m[1]));
      const g2: Gender = m[2] === "a" ? "female" : "male";
      const others = parseNamedPeople(m[3]);
      if (others.length === 0) {
        const single = cleanName(m[3]);
        if (single) addRel(b, "sibling", id1, getOrCreate(b, single, { gender: g2 }));
      } else {
        for (const other of others) {
          addRel(b, "sibling", id1, getOrCreate(b, other.name, { gender: other.gender ?? g2, age: other.age }));
        }
      }
    }

    const conflictRe = new RegExp(
      `(${NAME})\\s+(?:y|e)\\s+(${NAME})\\s+(?:tienen|hay|mantienen)\\s+(?:un\\s+)?conflicto`,
      "u",
    );
    const closeRe = new RegExp(`(${NAME})\\s+(?:es|est[aá])\\s+muy\\s+cercan[oa]\\s+(?:a|con)\\s+(${NAME})`, "u");
    const distantRe = new RegExp(`(${NAME})\\s+(?:y|e)\\s+(${NAME})\\s+(?:est[aá]n|tienen una relación)\\s+distantes?`, "u");
    const cutoffRe = new RegExp(`(${NAME})\\s+(?:cort[oó]|rompi[oó])\\s+(?:la\\s+)?relaci[oó]n\\s+con\\s+(${NAME})`, "u");
    if ((m = sentence.match(conflictRe))) {
      addRel(b, "conflict", getOrCreate(b, cleanName(m[1])), getOrCreate(b, cleanName(m[2])));
    }
    if ((m = sentence.match(closeRe))) {
      addRel(b, "close", getOrCreate(b, cleanName(m[1])), getOrCreate(b, cleanName(m[2])));
    }
    if ((m = sentence.match(distantRe))) {
      addRel(b, "distant", getOrCreate(b, cleanName(m[1])), getOrCreate(b, cleanName(m[2])));
    }
    if ((m = sentence.match(cutoffRe))) {
      addRel(b, "cutoff", getOrCreate(b, cleanName(m[1])), getOrCreate(b, cleanName(m[2])));
    }

    applyLinks(b, sentence);
    applyAdoptionAndKids(b, sentence);
    applyHousehold(b, sentence, lower);

    const simple = sentence.matchAll(new RegExp(`(${NAME})\\s+${AGE}`, "gu"));
    for (const sm of simple) {
      const name = cleanName(sm[1]);
      if (!name) continue;
      getOrCreate(b, name, { age: Number(sm[2]) });
    }

    for (const am of sentence.matchAll(new RegExp(`(${NAME})[^\\p{Lu}.]{0,40}?\\btiene\\s+(\\d{1,3})\\s*años`, "gu"))) {
      const name = cleanName(am[1]!);
      if (name && !/^(?:hij|herman)/i.test(name)) getOrCreate(b, name, { age: Number(am[2]) });
    }

    applyDeath(b, sentence);
    applyPatient(b, sentence);

    if (birthYear) {
      const mk = /naci[oó]/i.exec(sentence);
      const before = mk ? namesIn(sentence.slice(0, mk.index)) : [];
      const target = before[before.length - 1] ?? namesIn(sentence)[0];
      if (target) getOrCreate(b, target, { birthYear });
    }

    applyGender(b, sentence);
  }

  for (const r of [...b.relationships]) {
    if (r.type !== "sibling") continue;
    const pa = parentsOf(b, r.a);
    const pb = parentsOf(b, r.b);
    if (pa.length && !pb.length) {
      for (const p of pa) addRel(b, "parent_child", p, r.b);
    } else if (pb.length && !pa.length) {
      for (const p of pb) addRel(b, "parent_child", p, r.a);
    }
  }

  const parentsByChild = new Map<string, string[]>();
  for (const r of b.relationships) {
    if (!PARENT_TYPES.includes(r.type)) continue;
    parentsByChild.set(r.b, [...(parentsByChild.get(r.b) ?? []), r.a]);
  }
  for (const ps of parentsByChild.values()) {
    const unique = [...new Set(ps)];
    if (unique.length !== 2) continue;
    const hasUnion = b.relationships.some(
      (r) =>
        UNION_TYPES.includes(r.type) &&
        ((r.a === unique[0] && r.b === unique[1]) || (r.a === unique[1] && r.b === unique[0])),
    );
    if (!hasUnion) addRel(b, "marriage", unique[0]!, unique[1]!);
  }

  // "vive con" between parent/child or siblings is a shared home, not a couple.
  const kinPair = (x: string, y: string) =>
    b.relationships.some(
      (r) =>
        (PARENT_TYPES.includes(r.type) || r.type === "sibling") &&
        ((r.a === x && r.b === y) || (r.a === y && r.b === x)),
    );
  b.relationships = b.relationships.filter((r) => r.type !== "cohabitation" || !kinPair(r.a, r.b));

  // One union state per couple: divorce/widowhood > separation > marriage > cohabitation > dating.
  const UNION_RANK: Partial<Record<RelType, number>> = {
    dating: 0,
    cohabitation: 1,
    marriage: 2,
    separation: 3,
    divorce: 4,
    widowed: 4,
  };
  b.relationships = b.relationships.filter((r) => {
    const rank = UNION_RANK[r.type];
    if (rank == null) return true;
    return !b.relationships.some((o) => {
      const orank = UNION_RANK[o.type];
      return o !== r && orank != null && orank > rank && ((o.a === r.a && o.b === r.b) || (o.a === r.b && o.b === r.a));
    });
  });

  if (allTogether) {
    linkHousehold(
      b,
      b.persons.map((p) => p.id),
    );
  }

  const usedHouseholds = [
    ...new Set(b.persons.map((p) => p.household).filter((n): n is number => n != null)),
  ].sort((a, c) => a - c);

  applyConditionsFromText(b.persons, text);

  return {
    persons: b.persons,
    relationships: b.relationships,
    households: usedHouseholds.map((id) => ({ id, label: DEFAULT_HOUSEHOLD_LABEL })),
  };
}
