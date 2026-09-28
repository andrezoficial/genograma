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
import { STOP } from "./stopwords.ts";

/**
 * Parser for the "narrative" way of describing a family: one paragraph per person, full names with
 * ages, emotional bonds ("vínculo estrecho con …"), lists of children after a colon, and a final
 * sentence about who lives together. It works in two passes:
 *   1. build the registry of people (merging "Marinella" with "Marinella Escarraga", telling two
 *      people with the same name apart by age, resolving nicknames such as "Oliverio");
 *   2. read every sentence again and create unions, filiation, emotional bonds and households.
 */

export type NarrativeOptions = { currentYear?: number };

/* ------------------------------------------------------------------ */
/* Detection                                                            */
/* ------------------------------------------------------------------ */

export function looksNarrative(text: string): boolean {
  return (
    /v[ií]nculo|progenitor|a\s+la\s+edad\s+de|hace\s+\d+\s+años|no\s+se\s+conoce|hij[oa]s?\s*:\s*(?:\n|$)|(?:viven|conviven|residen)\s*:/iu.test(
      text,
    ) && /\b\d{1,3}\s*años/iu.test(text)
  );
}

/* ------------------------------------------------------------------ */
/* Text helpers                                                         */
/* ------------------------------------------------------------------ */

const PARTICLES = new Set(["de", "del", "la", "las", "los"]);
const NUMBER_WORDS: Record<string, number> = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7 };

const strip = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const isUpper = (w: string) => /^\p{Lu}/u.test(w);
const isStop = (w: string) => STOP.has(w.toLowerCase());

function nameTokens(name: string): string[] {
  return name
    .split(/\s+/)
    .map(strip)
    .filter((t) => t && !PARTICLES.has(t));
}

function isSubseq(small: string[], big: string[]): boolean {
  let i = 0;
  for (const t of big) if (i < small.length && t === small[i]) i++;
  return i === small.length && small.length > 0;
}

function titleCase(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => (PARTICLES.has(w.toLowerCase()) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ");
}

/** Lowercase words that look like verbs/adjectives, so they are never absorbed as surnames. */
const VERBISH = /(?:ó|í|ía|ían|aba|aban|aron|ieron|ando|iendo|ado|ido|ada|ida|ados|idos|ar|er|ir|mente)$/iu;

/** "María Alejandra bueno Escarraga" → "María Alejandra Bueno Escarraga" (surnames typed in lowercase). */
function capitalizeSurnames(text: string): string {
  return text.replace(/(\p{Lu}\p{L}+)((?:[ \t]+[\p{L}]+)+)/gu, (whole, first: string, rest: string) => {
    if (isStop(first)) return whole;
    const words = rest.split(/([ \t]+)/);
    let prevIsName = true;
    let out = first;
    for (const w of words) {
      if (!w || /^[ \t]+$/.test(w)) {
        out += w;
        continue;
      }
      const lower = w.toLowerCase();
      if (prevIsName && !isUpper(w) && !isStop(w) && !PARTICLES.has(lower) && w.length >= 3 && !VERBISH.test(w)) {
        out += w.charAt(0).toUpperCase() + w.slice(1);
        prevIsName = true;
      } else {
        out += w;
        prevIsName = isUpper(w) && !isStop(w);
      }
    }
    return out;
  });
}

function normalize(text: string, notes: Map<string, string>): string {
  let t = text
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\s+([,.:;])/g, "$1")
    .replace(/^[ \t]*(?:[-*•·▪‣]|\d+[.)])[ \t]+/gmu, "");
  // "Edgar (no se conoce el apellido ni la edad)" → remember what is unknown, keep the name.
  t = t.replace(/(\p{Lu}\p{L}+)\s*\(\s*(no\s+se\s+conoce[^)]*)\)/giu, (_m, name: string, what: string) => {
    const w = what.toLowerCase();
    const parts: string[] = [];
    if (/apellido/.test(w)) parts.push("apellido");
    if (/edad/.test(w)) parts.push("edad");
    if (/nombre/.test(w)) parts.push("nombre completo");
    notes.set(strip(name), parts.length ? `Se desconoce: ${parts.join(" y ")}.` : "Datos incompletos.");
    return name;
  });
  return capitalizeSurnames(t);
}

/* ------------------------------------------------------------------ */
/* Mentions                                                             */
/* ------------------------------------------------------------------ */

type Mention = {
  start: number;
  end: number; // end of the name itself
  tail: number; // end including the age, if any
  text: string;
  tokens: string[];
  age: number | null;
  pid?: string;
};

type Tok = { text: string; start: number; end: number };

function tokenize(s: string): Tok[] {
  const out: Tok[] = [];
  for (const m of s.matchAll(/[\p{L}][\p{L}'’-]*|\d+/gu)) out.push({ text: m[0], start: m.index!, end: m.index! + m[0].length });
  return out;
}

function findMentions(s: string): Mention[] {
  const toks = tokenize(s);
  const isName = (t: Tok) => isUpper(t.text) && t.text.length >= 2 && !isStop(t.text) && !/^\d/.test(t.text);
  const out: Mention[] = [];
  let i = 0;
  while (i < toks.length) {
    if (!isName(toks[i]!)) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < toks.length) {
      const next = toks[j + 1]!;
      const gap = s.slice(toks[j]!.end, next.start);
      if (isName(next) && /^\s+$/.test(gap)) {
        j++;
        continue;
      }
      const after = toks[j + 2];
      if (
        PARTICLES.has(next.text.toLowerCase()) &&
        /^\s+$/.test(gap) &&
        after &&
        isName(after) &&
        /^\s+$/.test(s.slice(next.end, after.start))
      ) {
        j += 2;
        continue;
      }
      break;
    }
    const start = toks[i]!.start;
    const end = toks[j]!.end;
    const text = s.slice(start, end);
    const age = s.slice(end).match(/^\s*,?\s*(?:de\s+)?(\d{1,3})\s*años?\b/i);
    out.push({
      start,
      end,
      tail: age ? end + age[0].length : end,
      text,
      tokens: nameTokens(text),
      age: age ? Number(age[1]) : null,
    });
    i = j + 1;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Registry                                                             */
/* ------------------------------------------------------------------ */

type Registry = {
  persons: Person[];
  aliases: Map<string, string>; // bare nickname → person id
  notes: Map<string, string>;
  order: Map<string, number>;
  next: number;
};

function compatible(m: { tokens: string[]; age: number | null }, p: Person, both: boolean): boolean {
  const tp = nameTokens(p.name);
  const ok = isSubseq(m.tokens, tp) || (both && isSubseq(tp, m.tokens));
  if (!ok) return false;
  if (m.age != null && p.age != null && m.age !== p.age) return false;
  return true;
}

function createPerson(reg: Registry, name: string, age: number | null): Person {
  const id = `p${reg.next++}`;
  const p = emptyPerson({ id, name: titleCase(name), age, gender: inferGenderFromName(name) });
  reg.persons.push(p);
  reg.order.set(id, reg.order.size);
  return p;
}

function declare(reg: Registry, m: Mention): string | null {
  const cands = reg.persons.filter((p) => compatible(m, p, true));
  const exact = cands.filter((p) => nameTokens(p.name).join(" ") === m.tokens.join(" "));
  const pick = exact.length ? exact : cands;
  if (pick.length === 1) {
    const p = pick[0]!;
    if (m.tokens.length > nameTokens(p.name).length) p.name = titleCase(m.text);
    if (m.age != null && p.age == null) p.age = m.age;
    if (p.gender === "unknown") p.gender = inferGenderFromName(p.name);
    return p.id;
  }
  if (pick.length === 0) return createPerson(reg, m.text, m.age).id;
  if (m.age != null) {
    const same = pick.find((p) => p.age === m.age) ?? pick.find((p) => p.age == null);
    if (same) {
      if (same.age == null) same.age = m.age;
      return same.id;
    }
  }
  return null; // ambiguous bare mention: resolved later, with sentence context
}

const nick = (a: string, b: string) => a !== b && a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a)) && Math.abs(a.length - b.length) <= 3;

/** A lone nickname ("Oliverio") next to two people who share a first name ("Oliver") is the elder of them. */
function mergeNicknames(reg: Registry, remap: Map<string, string>) {
  for (const p of [...reg.persons]) {
    const toks = nameTokens(p.name);
    if (toks.length !== 1 || p.age != null) continue;
    const homonyms = new Map<string, Person[]>();
    for (const q of reg.persons) {
      if (q === p) continue;
      const first = nameTokens(q.name)[0]!;
      if (nick(toks[0]!, first)) homonyms.set(first, [...(homonyms.get(first) ?? []), q]);
    }
    const group = [...homonyms.values()].find((g) => g.length >= 2);
    if (!group) continue;
    const target = [...group].sort((a, b) => (b.age ?? -1) - (a.age ?? -1))[0]!;
    reg.aliases.set(toks[0]!, target.id);
    target.notes = target.notes ? `${target.notes} También aparece como «${p.name}».` : `También aparece como «${p.name}».`;
    remap.set(p.id, target.id);
    reg.persons.splice(reg.persons.indexOf(p), 1);
  }
}

function resolveMention(reg: Registry, m: Mention, exclude: Set<string>, preferDeceased = false): string | null {
  if (m.pid && reg.persons.some((p) => p.id === m.pid)) return m.pid;
  if (m.tokens.length === 1 && reg.aliases.has(m.tokens[0]!)) return reg.aliases.get(m.tokens[0]!)!;
  let cands = reg.persons.filter((p) => compatible(m, p, false));
  const exact = cands.filter((p) => nameTokens(p.name).join(" ") === m.tokens.join(" "));
  if (exact.length) cands = exact;
  if (cands.length === 0) cands = reg.persons.filter((p) => compatible(m, p, true));
  if (cands.length === 0) return null;
  if (cands.length > 1) {
    const others = cands.filter((p) => !exclude.has(p.id));
    if (others.length) cands = others;
  }
  if (cands.length > 1) {
    const wanted = cands.filter((p) => p.deceased === preferDeceased);
    if (wanted.length) cands = wanted;
  }
  if (cands.length > 1) cands = [...cands].sort((a, b) => (a.age ?? 999) - (b.age ?? 999));
  return cands[0]!.id;
}

/* ------------------------------------------------------------------ */
/* Sentence rules                                                       */
/* ------------------------------------------------------------------ */

const BOND_NOUN = String.raw`(?:relaci[oó]n|v[ií]nculo|lazo|apego)(?:\s+(?:emocional|afectiv[oa]))?`;
const TYPE_WORDS: [RelType, string][] = [
  ["close", String.raw`(?:muy\s+)?(?:estrech[oa]|cercan[oa]|unid[oa]|cari[nñ]os[oa]|afectuos[oa]|apegad[oa]|fuerte|buen[oa])`],
  ["distant", String.raw`(?:muy\s+)?(?:distante|lejan[oa]|fr[ií][oa]|distanciad[oa]|superficial)`],
  ["conflict", String.raw`(?:muy\s+)?(?:conflictiv[oa]|tens[oa]|hostil|de\s+conflicto)`],
  ["cutoff", String.raw`(?:roto|rota|cortad[oa]|inexistente)`],
];
const ANY_TYPE = new RegExp(String.raw`(?<![\p{L}])(${TYPE_WORDS.map(([, r]) => r).join("|")})(?![\p{L}])`, "giu");
const BOUNDARY = /\b(?:comparte|comparten|tiene|tienen|mantiene|mantienen)\b/i;
const KIN_TARGET = /\bsus?\s+(progenitor(?:a|es)?|padre|madre|padres|pap[aá]|mam[aá])\b/gi;

function typeOf(word: string): RelType {
  for (const [type, re] of TYPE_WORDS) if (new RegExp(`^${re}$`, "iu").test(word.trim())) return type;
  return "close";
}

type Ctx = {
  lastPair: [string, string] | null;
  lastKids: string[];
  pending: { parents: string[]; remaining: number; female: boolean } | null;
};

class Builder {
  rels: Relationship[] = [];
  nextR = 1;
  reg: Registry;
  constructor(reg: Registry) {
    this.reg = reg;
  }
  person(id: string) {
    return this.reg.persons.find((p) => p.id === id);
  }
  add(type: RelType, a: string | null | undefined, b: string | null | undefined) {
    if (!a || !b || a === b) return;
    const dup = this.rels.some((r) => r.type === type && ((r.a === a && r.b === b) || (r.a === b && r.b === a)));
    if (!dup) this.rels.push({ id: `r${this.nextR++}`, type, a, b });
  }
  hasUnion(a: string, b: string) {
    return this.rels.some((r) => UNION_TYPES.includes(r.type) && ((r.a === a && r.b === b) || (r.a === b && r.b === a)));
  }
  parentsOf(id: string) {
    return this.rels.filter((r) => PARENT_TYPES.includes(r.type) && r.b === id).map((r) => r.a);
  }
  /** Co-parents always need a union line; when the text does not say which kind, use the neutral one. */
  coParents(a: string, b: string) {
    if (a !== b && !this.hasUnion(a, b)) this.add("dating", a, b);
  }
}

const UNION_RULES: [RelType, RegExp][] = [
  ["cohabitation", /uni[oó]n\s+(?:de\s+hecho|libre)|concubinato|conviv(?:i[oó]|ieron|e|en)\s+con|vive\s+en\s+pareja|pareja\s+de\s+hecho/i],
  ["marriage", /se\s+cas(?:[oó]|aron)\s+con|casad[oa]s?\s+con|matrimonio\s+con|esposo|esposa/i],
  ["divorce", /divorci(?:[oó]|ad[oa])\s+de|se\s+divorciaron/i],
  ["separation", /se\s+separ(?:[oó]|aron)\s+de|separad[oa]\s+de/i],
  ["dating", /novi[oa]\s+de|noviazgo\s+con|sale\s+con|pareja\s+sin\s+convivir/i],
];

export function parseNarrative(text: string, opts: NarrativeOptions = {}): GenogramData {
  const year = opts.currentYear ?? new Date().getFullYear();
  const notes = new Map<string, string>();
  const cleaned = normalize(text, notes).trim();
  if (!cleaned) return { persons: [], relationships: [] };

  const sentences = cleaned
    .split(/(?<!\d)[.\n]+|\.(?=\s)/u)
    .map((s) => s.trim())
    .filter(Boolean);

  const reg: Registry = { persons: [], aliases: new Map(), notes, order: new Map(), next: 1 };
  const parsed = sentences.map((s) => ({ s, ms: findMentions(s) }));

  /* ---------- pass 1: people ---------- */
  for (const { s, ms } of parsed) {
    for (const m of ms) {
      const id = declare(reg, m);
      if (id && (m.tokens.length >= 2 || m.age != null)) m.pid = id;
    }
    applyDeath(reg, s, ms, year);
  }
  const remap = new Map<string, string>();
  mergeNicknames(reg, remap);
  for (const { ms } of parsed) for (const m of ms) if (m.pid && remap.has(m.pid)) m.pid = remap.get(m.pid);

  /* ---------- pass 2: relationships ---------- */
  const b = new Builder(reg);
  const ctx: Ctx = { lastPair: null, lastKids: [], pending: null };
  const households: string[][] = [];

  for (const { s, ms } of parsed) {
    const lower = s.toLowerCase();
    const hasDeath = DEATH_WORD.test(s);
    const exclude = new Set<string>();
    const first = ms[0];
    const ids = ms.map((m, i) => resolveMention(reg, m, i === 0 ? exclude : exclude, hasDeath && i === 0));
    // the sentence subject must not be matched again as one of its own targets
    const subjectId = first && first.start <= 1 ? ids[0] : null;
    if (subjectId) exclude.add(subjectId);
    ms.forEach((m, i) => {
      if (i > 0 && !m.pid) ids[i] = resolveMention(reg, m, exclude);
    });

    // --- a pending "Tuvieron tres hijos:" list: this line describes one of the kids ---
    let subjectIsKid = false;
    if (ctx.pending && subjectId && first!.start <= 1 && first!.age != null) {
      const kid = b.person(subjectId)!;
      if (ctx.pending.female && kid.gender === "unknown") kid.gender = "female";
      for (const pid of ctx.pending.parents) b.add("parent_child", pid, subjectId);
      if (ctx.pending.parents.length === 2) b.coParents(ctx.pending.parents[0]!, ctx.pending.parents[1]!);
      ctx.lastKids.push(subjectId);
      ctx.pending.remaining--;
      subjectIsKid = true;
      if (ctx.pending.remaining <= 0) ctx.pending = null;
    } else if (ctx.pending && !/hij[oa]s?\s*:?\s*$/i.test(s)) {
      ctx.pending = null;
    }

    // --- union between people ("compartió unión de hecho con …") ---
    for (const [type, re] of UNION_RULES) {
      const um = re.exec(s);
      if (!um) continue;
      const con = /\bcon\s*$|\bcon\b/i.test(s.slice(um.index, um.index + um[0].length + 6));
      const before = ms.map((m, i) => ({ m, i })).filter(({ m }) => m.end <= um.index);
      const after = ms.map((m, i) => ({ m, i })).filter(({ m }) => m.start >= um.index + um[0].length - (con ? 0 : 0));
      const a = before.length ? ids[before[before.length - 1]!.i] : null;
      const other = after.length ? ids[after[0]!.i] : null;
      if (a && other && a !== other) {
        b.add(type, a, other);
        ctx.lastPair = [a, other];
        break;
      }
    }

    // --- children: "tuvo dos hijos, el primero …" / "Tuvieron tres hijos:" ---
    const km = /(?:tuvieron|tuvo|tienen|tiene|tuvimos)\s+(?:(un|una|uno|dos|tres|cuatro|cinco|seis|siete|\d+)\s+)?(hij[oa]s?)\b\s*:?/i.exec(s);
    if (km) {
      const parents = ms
        .map((m, i) => ({ m, id: ids[i] }))
        .filter(({ m }) => m.end <= km.index)
        .map(({ id }) => id)
        .filter((x): x is string => Boolean(x));
      const plural = /^tuvieron|^tienen/i.test(km[0]);
      const parentIds = parents.length ? [...new Set(parents)] : plural && ctx.lastPair ? [...ctx.lastPair] : subjectId ? [subjectId] : [];
      const countWord = km[1]?.toLowerCase();
      const count = countWord ? (NUMBER_WORDS[countWord] ?? Number(countWord)) : null;
      const female = km[2]!.toLowerCase() === "hija" && (count === 1 || count == null);
      const tailStart = km.index + km[0].length;
      const tailMs = ms.map((m, i) => ({ m, id: ids[i] })).filter(({ m }) => m.start >= tailStart);
      if (parentIds.length === 2) b.coParents(parentIds[0]!, parentIds[1]!);
      if (tailMs.length === 0) {
        ctx.pending = { parents: parentIds, remaining: count ?? Infinity, female };
        ctx.lastKids = [];
      } else {
        ctx.lastKids = [];
        let prevKid: string | null = null;
        tailMs.forEach(({ m, id }, idx) => {
          if (!id) return;
          const link = s.slice(idx === 0 ? tailStart : tailMs[idx - 1]!.m.tail, m.start);
          const coParent = idx > 0 && /(?:^|[\s,])(?:con|hij[oa]\s+de|del?)\s*$/i.test(link.trim().length ? link : "");
          const childOf = /hij([oa])\s+de\s*$/i.exec(link.trim());
          if (coParent && prevKid) {
            for (const pid of parentIds) b.coParents(pid, id);
            b.add("parent_child", id, prevKid);
            if (childOf) {
              const kid = b.person(prevKid)!;
              if (kid.gender === "unknown") kid.gender = childOf[1]!.toLowerCase() === "a" ? "female" : "male";
            }
            const cp = b.person(id)!;
            if (cp.gender === "unknown") cp.gender = inferGenderFromName(cp.name);
            return;
          }
          for (const pid of parentIds) b.add("parent_child", pid, id);
          if (female && idx === 0) {
            const kid = b.person(id)!;
            if (kid.gender === "unknown") kid.gender = "female";
          }
          ctx.lastKids.push(id);
          prevKid = id;
        });
      }
    }

    // --- emotional bonds ---
    applyBonds(b, s, ms, ids, subjectId, ctx, subjectIsKid);

    // --- household ---
    const negated = /\bno\s+(?:vive|viven|conviven)|viven\s+separad/i.test(lower);
    if (!negated && /(?:misma\s+casa|mismo\s+(?:techo|hogar)|junt[oa]s?)/i.test(lower) && /\b(?:viven|conviven|residen|vive)\b/i.test(lower)) {
      const group = ids.filter((x): x is string => Boolean(x));
      if (new Set(group).size >= 2) households.push([...new Set(group)]);
    }
  }

  /* ---------- households ---------- */
  for (const group of households) {
    const members = group.map((id) => b.person(id)).filter((p): p is Person => Boolean(p));
    const existing = [...new Set(members.map((p) => p.household).filter((n): n is number => n != null))];
    const target = existing.length ? Math.min(...existing) : reg.persons.reduce((m, p) => Math.max(m, p.household ?? 0), 0) + 1;
    for (const p of reg.persons) if (group.includes(p.id) || (p.household != null && existing.includes(p.household))) p.household = target;
  }

  /* ---------- notes ---------- */
  for (const p of reg.persons) {
    const first = nameTokens(p.name);
    const n = first.length === 1 ? reg.notes.get(first[0]!) : undefined;
    if (n) p.notes = p.notes ? `${p.notes} ${n}` : n;
  }

  const used = [...new Set(reg.persons.map((p) => p.household).filter((n): n is number => n != null))].sort((x, y) => x - y);
  return {
    persons: reg.persons,
    relationships: b.rels,
    households: used.map((id) => ({ id, label: DEFAULT_HOUSEHOLD_LABEL })),
  };
}

/* ------------------------------------------------------------------ */
/* Death                                                                */
/* ------------------------------------------------------------------ */

const DEATH_WORD = /falleci(?:[oó]|eron|d[oa]s?)|muri(?:[oó]|eron)|difunt[oa]|finad[oa]|†/i;

function applyDeath(reg: Registry, s: string, ms: Mention[], year: number) {
  const dm = DEATH_WORD.exec(s);
  if (!dm) return;
  const before = ms.filter((m) => m.end <= dm.index && m.pid);
  const target = before[before.length - 1] ?? ms.find((m) => m.pid);
  const p = target?.pid ? reg.persons.find((x) => x.id === target.pid) : undefined;
  if (!p) return;
  p.deceased = true;
  const ago = /hace\s+(\d{1,3})\s*años?/i.exec(s);
  const inYear = /\ben\s+((?:19|20)\d{2})\b/.exec(s.slice(dm.index));
  const age = /(?:a\s+la\s+edad\s+de|a\s+los)\s+(\d{1,3})(?:\s*años?)?/i.exec(s);
  if (ago) p.deathYear = year - Number(ago[1]);
  else if (inYear) p.deathYear = Number(inYear[1]);
  if (age) p.age = Number(age[1]);
  if (p.deathYear && p.age != null && p.birthYear == null) p.birthYear = p.deathYear - p.age;
  if (p.gender === "unknown") p.gender = genderFromWord(dm[0]) ?? p.gender;
}

/* ------------------------------------------------------------------ */
/* Emotional bonds                                                      */
/* ------------------------------------------------------------------ */

type Item = { id: string | null; kind: "person" | "kin" | "between"; word?: string; pos: number };

function itemsIn(text: string, offset: number, ms: Mention[], ids: (string | null)[]): Item[] {
  const items: Item[] = [];
  ms.forEach((m, i) => {
    if (m.start >= offset && m.tail <= offset + text.length) items.push({ id: ids[i] ?? null, kind: "person", pos: m.start });
  });
  for (const k of text.matchAll(new RegExp(KIN_TARGET.source, "gi"))) items.push({ id: null, kind: "kin", word: k[1]!.toLowerCase(), pos: offset + k.index! });
  for (const k of text.matchAll(/\bentre\s+(?:ellos|ellas|s[ií])\b/gi)) items.push({ id: null, kind: "between", pos: offset + k.index! });
  return items.sort((x, y) => x.pos - y.pos);
}

function applyBonds(
  b: Builder,
  s: string,
  ms: Mention[],
  ids: (string | null)[],
  subjectId: string | null | undefined,
  ctx: Ctx,
  subjectIsKid: boolean,
) {
  const types = [...s.matchAll(ANY_TYPE)].filter((t) => {
    const before = s.slice(Math.max(0, t.index! - 45), t.index!);
    return new RegExp(`${BOND_NOUN}\\s*$|(?:\\by|,)\\s*$|${BOND_NOUN}\\s+(?:muy\\s+)?$`, "i").test(before) || /\b(?:tienen|tiene|tenían|tenia|mantienen|comparten|comparte)\s+(?:un[ao]?\s+)?$/i.test(before);
  });
  if (types.length === 0) return;

  // who is "talking"?
  let subjects: string[] = [];
  if (/^\s*(?:ambos|ambas|los\s+dos|las\s+dos)\s+hij[oa]s?\b/i.test(s) || /^\s*(?:ellos|ellas)\b/i.test(s)) subjects = [...ctx.lastKids];
  else if (/\bambos\b|\bambas\b/i.test(s) && !subjectId) subjects = ctx.lastPair ? [...ctx.lastPair] : [];
  else if (subjectId) subjects = [subjectId];
  else if (ctx.lastKids.length) subjects = [...ctx.lastKids];
  // "…, ambos tenían vínculo distante": both people of the union stated earlier in the sentence
  const ambos = /\bambos\b|\bambas\b/i.exec(s);
  if (ambos && ctx.lastPair && subjectId && ms.length >= 2) subjects = [...ctx.lastPair];
  if (subjects.length === 0) return;
  const group = subjects;

  const seg: { type: RelType; start: number; end: number; trailingFrom: number | null }[] = [];
  types.forEach((t, i) => {
    seg.push({ type: typeOf(t[0]), start: t.index! + t[0].length, end: i + 1 < types.length ? types[i + 1]!.index! : s.length, trailingFrom: null });
  });
  // "…con A, B y con C comparte un vínculo distante": the last "con" belongs to the NEXT type
  for (let i = 0; i < seg.length - 1; i++) {
    const text = s.slice(seg[i]!.start, seg[i]!.end);
    const cons = [...text.matchAll(/\bcon\s+/gi)];
    const lastCon = cons[cons.length - 1];
    if (lastCon && BOUNDARY.test(text.slice(lastCon.index!)) && cons.length >= 2) {
      seg[i + 1]!.trailingFrom = seg[i]!.start + lastCon.index!;
      seg[i]!.end = seg[i]!.start + lastCon.index!;
    } else if (lastCon && BOUNDARY.test(text.slice(lastCon.index!)) && cons.length === 1 && /^\s*(?:con|de)\s/i.test(text)) {
      // single "con X comparte un vínculo <type>" clause preceded only by the head noun of this segment
      seg[i + 1]!.trailingFrom = seg[i]!.start + lastCon.index!;
      seg[i]!.end = seg[i]!.start;
    }
  }

  for (const sg of seg) {
    let items: Item[] = [];
    if (sg.trailingFrom != null) {
      const text = s.slice(sg.trailingFrom, s.length);
      const cut = text.search(BOUNDARY);
      items = itemsIn(text.slice(0, cut < 0 ? text.length : cut), sg.trailingFrom, ms, ids);
    } else {
      const text = s.slice(sg.start, sg.end);
      if (/^\s*(?:con|de|hacia)\s/i.test(text)) {
        const cut = text.search(BOUNDARY);
        items = itemsIn(cut < 0 ? text : text.slice(0, cut), sg.start, ms, ids);
      }
    }
    if (items.length === 0) {
      // "ambos tenían vínculo distante": the group itself
      if (/\bambos\b|\bambas\b/i.test(s) && group.length === 2) b.add(sg.type, group[0], group[1]);
      continue;
    }
    for (const it of items) {
      if (it.kind === "between") {
        for (let x = 0; x < group.length; x++) for (let y = x + 1; y < group.length; y++) b.add(sg.type, group[x], group[y]);
      } else if (it.kind === "kin") {
        for (const sub of group) {
          const parents = b.parentsOf(sub);
          const want: Gender | null = /madre|mam[aá]|progenitora/.test(it.word!) ? "female" : /padre|pap[aá]|progenitor$/.test(it.word!) ? "male" : null;
          const picked = it.word === "padres" || it.word === "progenitores" ? parents : [parents.find((pid) => want && b.person(pid)?.gender === want) ?? (parents.length === 1 ? parents[0] : undefined)];
          for (const pid of picked) b.add(sg.type, sub, pid);
        }
      } else {
        for (const sub of group) b.add(sg.type, sub, it.id);
      }
    }
  }
  void subjectIsKid;
}

export const NARRATIVE_EXAMPLE_TEXT = `Oliver Escarraga fallecido hace 6 años, a la edad de 83 años, compartió unión de hecho con Elena Ceballos de 63 años, ambos tenían vínculo emocional distante. Tuvieron tres hijos:
Marinella Escarraga de 53 años, quien tiene vínculo emocional estrecho con Elena, Oliverio, Yaneth y con Oliver comparte un vínculo distante
Yaneth Escarraga de 47 años, quien tiene vínculo emocional estrecho con Elena, Oliverio, Marinella y con Oliver comparte un vínculo distante
Oliver Escarraga de 43 años quien tiene vínculo emocional distante con Elena, Oliverio, Yaneth y Marinella.
Marinella tuvo dos hijos, el primero, Camilo Escarraga de 32 años con Edgar (no se conoce el apellido ni la edad), María Alejandra Bueno Escarraga de 21 años hija de César Bueno. Ambos hijos tienen un vínculo estrecho con Marinella y entre ellos. Alejandra Bueno tiene una relación emocional distante con su progenitor.
Yaneth Escarraga tuvo una hija, Laura Montañez de 29 años, hija de Miguel Ángel Montañez de 53 años. Laura comparte un vínculo estrecho con Yaneth y distante con Miguel Ángel Montañez.
Oliver tuvo una hija, Valentina Escarraga de 17 años, con Judith Marciales de 42 años. Valentina tiene un vínculo estrecho con Judith y con Oliver.
Actualmente, en la misma casa viven: Elena Ceballos, Marinella Escarraga, Alejandra Bueno, Laura Montañez, Judith Marciales y Valentina Escarraga`;
