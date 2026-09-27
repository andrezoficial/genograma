import {
  DEFAULT_HOUSEHOLD_LABEL,
  emptyPerson,
  PARENT_TYPES,
  UNION_TYPES,
  type Gender,
  type GenogramData,
  type Person,
  type RelType,
  type Relationship,
} from "./types.ts";
import { genderFromWord, inferGenderFromName } from "./gender.ts";

const TOKEN = String.raw`\p{Lu}\p{L}+(?:-\p{Lu}\p{L}+)?`;
const PARTICLE = String.raw`(?:de(?:l|\s+l[ao]s?)?\s+)?`;
const NAME = String.raw`${TOKEN}(?:\s+${PARTICLE}${TOKEN})?`;
const AGE = String.raw`(?:de\s+)?(\d{1,3})(?:\s*años?)?`;

const STOP = new Set(
  [
    "Los",
    "Las",
    "El",
    "La",
    "De",
    "Del",
    "En",
    "Con",
    "Un",
    "Una",
    "Uno",
    "Y",
    "E",
    "O",
    "Tienen",
    "Tiene",
    "Tuvo",
    "Tuvieron",
    "Tengo",
    "Tuve",
    "Tenemos",
    "Tuvimos",
    "Padres",
    "Padre",
    "Madre",
    "Hijos",
    "Hijo",
    "Hija",
    "Falleció",
    "Fallecio",
    "Murió",
    "Murio",
    "Años",
    "Anos",
    "Llamada",
    "Llamado",
    "Llaman",
    "Llama",
    "Llamo",
    "Se",
    "Me",
    "Mi",
    "Mis",
    "Yo",
    "Estoy",
    "Somos",
    "Está",
    "Esta",
    "Están",
    "Estan",
    "Estaba",
    "Estaban",
    "Casada",
    "Casado",
    "Casados",
    "Casadas",
    "Casé",
    "Case",
    "Divorciada",
    "Divorciado",
    "Divorciados",
    "Separados",
    "Separada",
    "Separado",
    "Hermana",
    "Hermano",
    "Hermanos",
    "Hermanas",
    "Dos",
    "Tres",
    "Cuatro",
    "Cinco",
    "Seis",
    "Siete",
    "Ocho",
    "Nueve",
    "Diez",
    "Ellos",
    "Ellas",
    "También",
    "Tambien",
    "Además",
    "Ademas",
    "Pero",
    "Por",
    "Para",
    "Su",
    "Sus",
    "Nuestro",
    "Nuestra",
    "Nuestros",
    "Nuestras",
    "Al",
    "Lo",
    "Le",
    "Les",
    "Que",
    "Como",
    "Año",
    "Ano",
    "Mes",
    "Hoy",
    "Ahora",
    "Don",
    "Doña",
    "Dona",
    "Paciente",
    "Identificado",
    "Identificada",
    "Familia",
    "Genograma",
    "Abuelo",
    "Abuela",
    "Abuelos",
    "Abuelas",
    "Tío",
    "Tio",
    "Tía",
    "Tia",
    "Nieto",
    "Nieta",
    "Nietos",
    "Vive",
    "Viven",
    "Convive",
    "Conviven",
    "Junto",
    "Junta",
    "Juntos",
    "Juntas",
    "Misma",
    "Casa",
    "Nació",
    "Nacio",
    "Nacida",
    "Nacido",
    "Fue",
    "Fueron",
    "Era",
    "Eran",
    "Es",
    "Son",
    "Adoptada",
    "Adoptado",
    "Adoptados",
    "Mantiene",
    "Mantienen",
    "Hay",
    "Muy",
    "Cercana",
    "Cercano",
    "Cercanas",
    "Cercanos",
    "Distante",
    "Distantes",
    "Cortó",
    "Corto",
    "Rompió",
    "Rompio",
    "Relación",
    "Relacion",
    "Conflicto",
    "Índice",
    "Indice",
    "Viudo",
    "Viuda",
    "Exesposo",
    "Exesposa",
    "Esposo",
    "Esposa",
    "Marido",
    "Mujer",
    "Hombre",
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
  ].map((w) => w.toLowerCase()),
);

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

export const EXAMPLE_TEXT = `María de 45 años está casada con Juan de 48.
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
};

function makeBuilder(): Builder {
  return { persons: [], relationships: [], nameToId: {}, nextP: 1, nextR: 1, selfId: null };
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
      if (opts.gender && opts.gender !== "unknown" && p.gender === "unknown") p.gender = opts.gender;
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
  const id = getOrCreate(b, "Consultante", {
    identifiedPatient: true,
    gender: opts.gender ?? "unknown",
  });
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

function parseNamedPeople(chunk: string): { name: string; age: number | null; gender: Gender | null }[] {
  const parts = chunk
    .split(/,|;| y | e /i)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: { name: string; age: number | null; gender: Gender | null }[] = [];
  for (const part of parts) {
    const m = part.match(new RegExp(`^(${NAME})(?:\\s+${AGE})?`, "u"));
    if (!m) continue;
    const name = cleanName(m[1]);
    if (!name) continue;
    const age = m[2] ? Number(m[2]) : null;
    const gender = genderFromWord(part);
    out.push({ name, age, gender });
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
  if (/\b(tengo|tuve|tenemos|tuvimos)\b/i.test(sentence)) {
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
    .replace(/\b(\p{L}[\p{L}'-]*?)\s*\((\d{1,3})\)/gu, "$1 de $2 años")
    .replace(/\b(\p{L}[\p{L}'-]*?),\s*(\d{1,3})\s*años/giu, "$1 de $2 años");

  return normalized.replace(/[\p{L}]+(?:-[\p{L}]+)*/gu, (word) => {
    const lower = word.toLowerCase();
    if (STOP.has(lower)) return lower;
    if (["de", "del", "la", "las", "los", "y", "e"].includes(lower)) return lower;
    if (word.length < 2) return word;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
}

export function parseFamilyText(text: string): GenogramData {
  const b = makeBuilder();
  const cleaned = preprocess(text).trim();
  if (!cleaned) return { persons: [], relationships: [] };

  const sentences = cleaned
    .split(/[\.\n;]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  let allTogether = false;

  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    const deceased = /falleci[oó]|muri[oó]|difunt[oa]|está fallecid|ya no vive/.test(lower);
    const deathYearMatch = lower.match(/falleci[oó]\s+en\s+(\d{4})|muri[oó]\s+en\s+(\d{4})|en\s+(\d{4})\s+falleci/);
    const deathYear = deathYearMatch ? Number(deathYearMatch[1] || deathYearMatch[2] || deathYearMatch[3]) : null;
    const birthYearMatch = lower.match(/naci[oó]\s+en\s+(\d{4})/);
    const birthYear = birthYearMatch ? Number(birthYearMatch[1]) : null;
    const identified = /paciente identificad[oa]|consultante|caso [ií]ndice/.test(lower);

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
      addRel(b, "marriage", p1, p2);
    }

    const miPariente = sentence.match(
      new RegExp(
        `mi\\s+(padre|madre|hermano|hermana|esposo|esposa|marido|mujer|exesposo|exesposa)\\s+(?:se\\s+llama|es)\\s+(${NAME})(?:\\s+${AGE})?`,
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
      else if (role === "exesposo" || role === "exesposa") addRel(b, "divorce", self, other);
      else addRel(b, "marriage", self, other);
    }

    const marriageRe = new RegExp(
      `(${NAME})(?:\\s+${AGE})?\\s+(?:est[aá]\\s+)?casad([oa])\\s+con\\s+(${NAME})(?:\\s+${AGE})?`,
      "u",
    );
    const marriageRe2 = new RegExp(`(${NAME})\\s+(?:y|e)\\s+(${NAME})\\s+(?:est[aá]n\\s+)?casad[oa]s`, "u");
    const spouseRe = new RegExp(
      `(${NAME})\\s+(?:es\\s+)?(?:el\\s+|la\\s+)?(esposo|esposa|marido|mujer|exesposo|exesposa)\\s+de\\s+(${NAME})`,
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
      addRel(b, "marriage", getOrCreate(b, n1, { gender: g1 }), getOrCreate(b, n2, { deceased: true }));
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
    const childOfRe = new RegExp(`(${NAME})\\s+(?:es|era)\\s+hij([oa])\\s+de\\s+(${NAME})(?:\\s+(?:y|e)\\s+(${NAME}))?`, "u");
    const fatherRe = new RegExp(`(?:el\\s+)?padre\\s+de\\s+(${NAME})\\s+(?:es|se\\s+llama)\\s+(${NAME})`, "u");
    const motherRe = new RegExp(`(?:la\\s+)?madre\\s+de\\s+(${NAME})\\s+(?:es|se\\s+llama)\\s+(${NAME})`, "u");
    const isFatherRe = new RegExp(`(${NAME})\\s+es\\s+(?:el\\s+)?padre\\s+de\\s+(${NAME})`, "u");
    const isMotherRe = new RegExp(`(${NAME})\\s+es\\s+(?:la\\s+)?madre\\s+de\\s+(${NAME})`, "u");
    const adoptedRe = new RegExp(`(${NAME})\\s+(?:fue\\s+)?adoptad([oa])\\s+por\\s+(${NAME})(?:\\s+(?:y|e)\\s+(${NAME}))?`, "u");

    if ((m = sentence.match(parentsRe))) {
      const child = getOrCreate(b, cleanName(m[1]));
      const p1 = getOrCreate(b, cleanName(m[2]));
      const p2 = getOrCreate(b, cleanName(m[3]));
      addRel(b, "parent_child", p1, child);
      addRel(b, "parent_child", p2, child);
      addRel(b, "marriage", p1, p2);
    } else if ((m = sentence.match(parentsOfRe))) {
      const p1 = getOrCreate(b, cleanName(m[1]));
      const p2 = getOrCreate(b, cleanName(m[2]));
      const child = getOrCreate(b, cleanName(m[3]));
      addRel(b, "parent_child", p1, child);
      addRel(b, "parent_child", p2, child);
      addRel(b, "marriage", p1, p2);
    } else if ((m = sentence.match(childOfRe))) {
      const child = getOrCreate(b, cleanName(m[1]), { gender: m[2] === "a" ? "female" : "male" });
      const p1 = getOrCreate(b, cleanName(m[3]));
      addRel(b, "parent_child", p1, child);
      if (m[4]) {
        const p2 = getOrCreate(b, cleanName(m[4]));
        addRel(b, "parent_child", p2, child);
        addRel(b, "marriage", p1, p2);
      }
    } else if ((m = sentence.match(isFatherRe))) {
      const father = getOrCreate(b, cleanName(m[1]), { gender: "male" });
      addRel(b, "parent_child", father, getOrCreate(b, cleanName(m[2])));
    } else if ((m = sentence.match(isMotherRe))) {
      const mother = getOrCreate(b, cleanName(m[1]), { gender: "female" });
      addRel(b, "parent_child", mother, getOrCreate(b, cleanName(m[2])));
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
        addRel(b, "marriage", p1, p2);
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
      addRel(b, "marriage", g1, g2);
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
      `(?:tienen|tiene|tuvieron|tuvo|tengo|tuve|tenemos|tuvimos)\\s+(?:un|una|uno|dos|tres|cuatro|cinco|seis|\\d+)?\\s*hijos?\\s*(?:llamad[oa]s?)?\\s*[:,]?\\s*(.+)`,
      "iu",
    );
    const childrenRe2 = new RegExp(
      `(?:tienen|tiene|tuvieron|tuvo|tengo|tuve|tenemos|tuvimos)\\s+(?:un[oa]?\\s+)?hij([oa])\\s+(?:llamad[oa]\\s+)?(${NAME})`,
      "iu",
    );
    if ((m = sentence.match(childrenRe))) {
      const kids = parseNamedPeople(m[1]);
      if (kids.length > 0) {
        const parentIds = parentsForChildren(
          b,
          sentence,
          kids.map((k) => k.name),
        );
        for (const kid of kids) {
          const cid = getOrCreate(b, kid.name, { age: kid.age, gender: kid.gender });
          for (const pid of parentIds) addRel(b, "parent_child", pid, cid);
        }
      }
    } else if ((m = sentence.match(childrenRe2))) {
      const g: Gender = m[1] === "a" ? "female" : "male";
      const cid = getOrCreate(b, cleanName(m[2]), { gender: g });
      const parentIds = parentsForChildren(b, sentence, [cleanName(m[2])]);
      for (const pid of parentIds) addRel(b, "parent_child", pid, cid);
    }

    const sibRe = new RegExp(
      `(${NAME})\\s+tiene\\s+(?:una?|dos|tres|\\d+)?\\s*herman([oa])s?\\s+(?:llamad[oa]s?\\s+)?(?:[:,]?\\s*)(.+)`,
      "u",
    );
    const sibRe2 = new RegExp(`(${NAME})(?:\\s*,\\s*(${NAME}))*\\s+(?:y|e)\\s+(${NAME})\\s+son\\s+herman[oa]s`, "u");
    const sibRe3 = new RegExp(`(${NAME})\\s+es\\s+herman([oa])\\s+de\\s+(${NAME})`, "u");
    const tengoHermano = sentence.match(
      new RegExp(`tengo\\s+(?:una?|dos|tres|\\d+)?\\s*herman([oa])s?\\s+(?:llamad[oa]s?\\s+)?(?:[:,]?\\s*)(.+)`, "u"),
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

    const simple = sentence.matchAll(new RegExp(`(${NAME})\\s+${AGE}`, "gu"));
    for (const sm of simple) {
      const name = cleanName(sm[1]);
      if (!name) continue;
      getOrCreate(b, name, {
        age: Number(sm[2]),
        deceased: deceased,
        deathYear,
        birthYear,
        identifiedPatient: identified,
      });
    }

    if (deceased) {
      const names = sentence.match(new RegExp(NAME, "gu")) ?? [];
      for (const n of names) {
        const name = cleanName(n);
        if (!name) continue;
        getOrCreate(b, name, { deceased: true, deathYear });
      }
    }

    if (identified) {
      const names = sentence.match(new RegExp(NAME, "gu")) ?? [];
      for (const n of names) {
        const name = cleanName(n);
        if (!name) continue;
        getOrCreate(b, name, { identifiedPatient: true });
      }
    }

    if (birthYear) {
      const names = sentence.match(new RegExp(NAME, "gu")) ?? [];
      for (const n of names) {
        const name = cleanName(n);
        if (!name) continue;
        getOrCreate(b, name, { birthYear });
      }
    }
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

  if (allTogether) {
    linkHousehold(
      b,
      b.persons.map((p) => p.id),
    );
  }

  const usedHouseholds = [
    ...new Set(b.persons.map((p) => p.household).filter((n): n is number => n != null)),
  ].sort((a, c) => a - c);

  return {
    persons: b.persons,
    relationships: b.relationships,
    households: usedHouseholds.map((id) => ({ id, label: DEFAULT_HOUSEHOLD_LABEL })),
  };
}
