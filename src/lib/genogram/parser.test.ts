import assert from "node:assert/strict";
import { test } from "node:test";
import { BASIC_EXAMPLE_TEXT, EXAMPLE_TEXT, parseFamilyText } from "./parser.ts";
import { PARENT_TYPES, UNION_TYPES } from "./types.ts";

function names(data: ReturnType<typeof parseFamilyText>) {
  return data.persons.map((p) => p.name).sort();
}

function hasRel(data: ReturnType<typeof parseFamilyText>, type: string, a: string, b: string) {
  const id = (n: string) => data.persons.find((p) => p.name === n)?.id;
  const ia = id(a);
  const ib = id(b);
  return data.relationships.some(
    (r) => r.type === type && ((r.a === ia && r.b === ib) || (r.a === ib && r.b === ia)),
  );
}

function parentOf(data: ReturnType<typeof parseFamilyText>, parent: string, child: string) {
  const id = (n: string) => data.persons.find((p) => p.name === n)?.id;
  return data.relationships.some((r) => PARENT_TYPES.includes(r.type) && r.a === id(parent) && r.b === id(child));
}

test("example family has seven people and core ties", () => {
  const data = parseFamilyText(BASIC_EXAMPLE_TEXT);
  assert.deepEqual(names(data), ["Ana", "Carmen", "José", "Juan", "Laura", "María", "Pedro"]);
  assert.equal(data.persons.find((p) => p.name === "María")?.age, 45);
  assert.equal(data.persons.find((p) => p.name === "Juan")?.age, 48);
  assert.equal(data.persons.find((p) => p.name === "Laura")?.age, 15);
  assert.equal(data.persons.find((p) => p.name === "Pedro")?.age, 12);
  assert.equal(data.persons.find((p) => p.name === "José")?.deceased, true);
  assert.equal(data.persons.find((p) => p.name === "José")?.deathYear, 2018);
  assert.equal(data.persons.find((p) => p.name === "María")?.gender, "female");
  assert.equal(data.persons.find((p) => p.name === "Juan")?.gender, "male");
  assert.equal(data.persons.find((p) => p.name === "María")?.identifiedPatient, true);
  assert.ok(hasRel(data, "marriage", "María", "Juan"));
  assert.ok(hasRel(data, "marriage", "Carmen", "José"));
  assert.ok(parentOf(data, "María", "Laura"));
  assert.ok(parentOf(data, "Juan", "Pedro"));
  assert.ok(parentOf(data, "Carmen", "María"));
  assert.ok(parentOf(data, "José", "Ana"));
  assert.ok(hasRel(data, "sibling", "María", "Ana"));
  const nucleo = data.persons.filter((p) => ["María", "Juan", "Laura", "Pedro"].includes(p.name));
  assert.ok(nucleo.every((p) => p.household != null));
  assert.equal(new Set(nucleo.map((p) => p.household)).size, 1);
  assert.equal(data.persons.find((p) => p.name === "Ana")?.household, null);
  assert.ok((data.households ?? []).length >= 1);
});

test("empty text yields nothing", () => {
  const data = parseFamilyText("   ");
  assert.equal(data.persons.length, 0);
});

test("lowercase spanish still parses", () => {
  const data = parseFamilyText(
    "maría de 45 años está casada con juan de 48. tienen dos hijos: laura de 15 y pedro de 12.",
  );
  assert.ok(hasRel(data, "marriage", "María", "Juan"));
  assert.ok(parentOf(data, "María", "Laura"));
  assert.ok(parentOf(data, "Juan", "Pedro"));
  assert.equal(data.persons.find((p) => p.name === "María")?.age, 45);
});

test("first person family", () => {
  const data = parseFamilyText(
    "Me llamo Lucía. Estoy casada con Marcos. Tengo dos hijos: Sofía y Diego. Mis padres se llaman Carmen y José. Tengo una hermana llamada Ana.",
  );
  const self = data.persons.find((p) => p.identifiedPatient);
  assert.equal(self?.name, "Lucía");
  assert.ok(hasRel(data, "marriage", "Lucía", "Marcos"));
  assert.ok(parentOf(data, "Lucía", "Sofía"));
  assert.ok(parentOf(data, "Marcos", "Diego"));
  assert.ok(parentOf(data, "Carmen", "Lucía"));
  assert.ok(parentOf(data, "José", "Ana"));
  assert.ok(hasRel(data, "sibling", "Lucía", "Ana"));
});

test("X es hija de A y B", () => {
  const data = parseFamilyText("Sofía es hija de Carmen y José.");
  assert.ok(parentOf(data, "Carmen", "Sofía"));
  assert.ok(parentOf(data, "José", "Sofía"));
  assert.ok(hasRel(data, "marriage", "Carmen", "José"));
  assert.equal(data.persons.find((p) => p.name === "Sofía")?.gender, "female");
});

test("X es el padre de Y", () => {
  const data = parseFamilyText("Juan es el padre de Pedro.");
  assert.ok(parentOf(data, "Juan", "Pedro"));
  assert.equal(data.persons.find((p) => p.name === "Juan")?.gender, "male");
});

test("divorce and conflict", () => {
  const data = parseFamilyText("Lucía está divorciada de Marcos. Lucía y Marcos tienen conflicto.");
  assert.ok(hasRel(data, "divorce", "Lucía", "Marcos"));
  assert.ok(hasRel(data, "conflict", "Lucía", "Marcos"));
});

test("compound names and parenthetical ages", () => {
  const data = parseFamilyText("José Luis (50) está casado con Ana María (48). Tienen un hijo: Carlos.");
  assert.ok(data.persons.some((p) => p.name === "José Luis"));
  assert.ok(data.persons.some((p) => p.name === "Ana María"));
  assert.equal(data.persons.find((p) => p.name === "José Luis")?.age, 50);
  assert.ok(parentOf(data, "José Luis", "Carlos"));
  assert.ok(parentOf(data, "Ana María", "Carlos"));
});

test("co-parents infer a union", () => {
  const data = parseFamilyText("Laura es hija de María. Laura es hija de Juan.");
  assert.ok(parentOf(data, "María", "Laura"));
  assert.ok(parentOf(data, "Juan", "Laura"));
  assert.ok(UNION_TYPES.some((t) => hasRel(data, t, "María", "Juan")));
});

test("siblings share parents", () => {
  const data = parseFamilyText("Los padres de María se llaman Carmen y José. María tiene un hermano llamado Luis.");
  assert.ok(parentOf(data, "Carmen", "Luis"));
  assert.ok(parentOf(data, "José", "Luis"));
});

test("widowhood marks the deceased spouse", () => {
  const data = parseFamilyText("Carmen es viuda de José.");
  assert.ok(hasRel(data, "widowed", "Carmen", "José"));
  assert.equal(data.persons.find((p) => p.name === "José")?.deceased, true);
});

test("household list includes every named person", () => {
  const data = parseFamilyText("María, Juan, Laura y Pedro viven juntos.");
  const nucleo = data.persons.filter((p) => ["María", "Juan", "Laura", "Pedro"].includes(p.name));
  assert.equal(nucleo.length, 4);
  assert.ok(nucleo.every((p) => p.household != null));
  assert.equal(new Set(nucleo.map((p) => p.household)).size, 1);
});

test("identified patient feminine form", () => {
  const data = parseFamilyText("Laura de 15 años. Laura es la paciente identificada.");
  assert.equal(data.persons.find((p) => p.name === "Laura")?.identifiedPatient, true);
});

/* ---------- Full legend: every item must be detected ---------- */

function person(data: ReturnType<typeof parseFamilyText>, name: string) {
  const p = data.persons.find((x) => x.name === name);
  assert.ok(p, `person ${name} should exist`);
  return p;
}

function checkFullLegend(data: ReturnType<typeof parseFamilyText>) {
  // Personas
  assert.equal(person(data, "Juan").gender, "male");
  assert.equal(person(data, "María").gender, "female");
  assert.equal(person(data, "Alex").gender, "unknown", "Género s/d");
  assert.equal(person(data, "José").deceased, true, "Fallecido");
  assert.equal(person(data, "José").deathYear, 2018);
  assert.equal(person(data, "María").identifiedPatient, true, "Paciente identificado");
  assert.equal(data.persons.filter((p) => p.identifiedPatient).length, 1);
  // Convivencia (núcleo familiar)
  const home = ["María", "Juan", "Laura", "Pedro", "Sofía"].map((n) => person(data, n).household);
  assert.ok(home.every((h) => h != null) && new Set(home).size === 1);
  assert.equal(person(data, "Carmen").household, null);
  // Vínculos familiares
  assert.ok(hasRel(data, "marriage", "María", "Juan"), "Matrimonio");
  assert.ok(hasRel(data, "cohabitation", "Ana", "Diego"), "Unión de hecho");
  assert.ok(hasRel(data, "separation", "Marcos", "Elena"), "Separación");
  assert.ok(hasRel(data, "divorce", "Luis", "Rosa"), "Divorcio");
  assert.ok(parentOf(data, "María", "Laura") && parentOf(data, "Juan", "Pedro"), "Hijos");
  assert.ok(parentOf(data, "Ana", "Alex") && parentOf(data, "Diego", "Alex"));
  assert.ok(
    data.relationships.some((r) => r.type === "adopted" && r.b === person(data, "Sofía").id),
    "Adopción",
  );
  assert.ok(hasRel(data, "sibling", "María", "Ana"));
  assert.ok(hasRel(data, "sibling", "Juan", "Marcos"));
  // Vínculos emocionales
  assert.ok(hasRel(data, "close", "María", "Laura"), "Cercana");
  assert.ok(hasRel(data, "distant", "Pedro", "Juan"), "Distante");
  assert.ok(hasRel(data, "cutoff", "Luis", "Juan"), "Corte");
  assert.ok(hasRel(data, "conflict", "María", "Ana"), "Conflicto");
}

test("full example detects every item of the legend", () => {
  const data = parseFamilyText(EXAMPLE_TEXT);
  assert.equal(data.persons.length, 14);
  assert.ok(!data.persons.some((p) => /^(Se|Separó|Consultante)/.test(p.name)));
  checkFullLegend(data);
  // the divorce/separation must not also leave a marriage behind
  assert.ok(!hasRel(data, "marriage", "Luis", "Rosa"));
  assert.ok(!hasRel(data, "marriage", "Ana", "Diego"));
});

test("full example still works in lowercase", () => {
  checkFullLegend(parseFamilyText(EXAMPLE_TEXT.toLowerCase()));
});

const PHRASES: [string, string, string, string][] = [
  // [text, relation type, a, b]
  ["Ana y Diego viven en unión libre.", "cohabitation", "Ana", "Diego"],
  ["Ana y Diego son pareja de hecho.", "cohabitation", "Ana", "Diego"],
  ["Ana está en unión de hecho con Diego.", "cohabitation", "Ana", "Diego"],
  ["Luis y Rosa están divorciados.", "divorce", "Luis", "Rosa"],
  ["Luis se divorció de Rosa.", "divorce", "Luis", "Rosa"],
  ["Rosa es la exesposa de Luis.", "divorce", "Rosa", "Luis"],
  ["Marcos y Elena están separados.", "separation", "Marcos", "Elena"],
  ["Marcos se separó de Elena.", "separation", "Marcos", "Elena"],
  ["Carlos y Sara se casaron.", "marriage", "Carlos", "Sara"],
  ["Pedro es el esposo de Laura.", "marriage", "Pedro", "Laura"],
  ["Ana es novia de Pedro.", "dating", "Ana", "Pedro"],
  ["Laura y Pedro son cercanos.", "close", "Laura", "Pedro"],
  ["Laura y Pedro tienen una relación muy cercana.", "close", "Laura", "Pedro"],
  ["Laura y Pedro se llevan muy bien.", "close", "Laura", "Pedro"],
  ["Laura y Pedro están distanciados.", "distant", "Laura", "Pedro"],
  ["Laura y Pedro tienen una relación distante.", "distant", "Laura", "Pedro"],
  ["Laura y Pedro no se hablan.", "cutoff", "Laura", "Pedro"],
  ["Laura cortó el contacto con Pedro.", "cutoff", "Laura", "Pedro"],
  ["Laura y Pedro están en conflicto.", "conflict", "Laura", "Pedro"],
  ["Laura y Pedro se llevan mal.", "conflict", "Laura", "Pedro"],
  ["Laura discute con Pedro.", "conflict", "Laura", "Pedro"],
];

for (const [text, type, a, b] of PHRASES) {
  test(`phrase: ${text}`, () => {
    const data = parseFamilyText(text);
    assert.ok(hasRel(data, type, a, b), `expected ${type} between ${a} and ${b}`);
  });
}

test("unknown gender wording", () => {
  for (const t of ["Alex es de género no binario.", "Alex, género no especificado, tiene 20 años.", "Alex (género s/d) es hijo de Ana."]) {
    assert.equal(person(parseFamilyText(t), "Alex").gender, "unknown", t);
  }
  assert.equal(person(parseFamilyText("Alex (género s/d) es hijo de Ana."), "Ana").gender, "female");
});

test("deceased applies only to the subject", () => {
  const d1 = parseFamilyText("Carmen y José fallecieron.");
  assert.ok(person(d1, "Carmen").deceased && person(d1, "José").deceased);
  const d2 = parseFamilyText("José (fallecido) era el padre de María.");
  assert.ok(person(d2, "José").deceased);
  assert.equal(person(d2, "María").deceased, false);
  assert.ok(parentOf(d2, "José", "María"));
  const d3 = parseFamilyText("María y Juan viven juntos. Juan murió en 2020.");
  assert.equal(person(d3, "María").deceased, false);
  assert.equal(person(d3, "Juan").deathYear, 2020);
});

test("identified patient wording", () => {
  for (const t of ["El consultante es Pedro.", "Paciente identificado: Pedro.", "Pedro (paciente identificado) tiene 30 años."]) {
    const d = parseFamilyText(t);
    assert.equal(d.persons.length, 1, t);
    assert.equal(person(d, "Pedro").identifiedPatient, true, t);
  }
});

test("adoption wording", () => {
  for (const t of [
    "Luis y Marta adoptaron a Sofía.",
    "Sofía es hija adoptiva de Luis y Marta.",
    "Sofía fue adoptada por Luis y Marta.",
    "Luis y Marta tienen una hija adoptada llamada Sofía.",
  ]) {
    const d = parseFamilyText(t);
    const sofia = person(d, "Sofía").id;
    assert.ok(d.relationships.filter((r) => r.type === "adopted" && r.b === sofia).length === 2, t);
  }
});

test("children wording", () => {
  const forms = [
    "Luis y Marta tienen tres hijos: Ana, Pedro y Lucía.",
    "Los hijos de Luis y Marta son Ana, Pedro y Lucía.",
    "Ana, Pedro y Lucía son hijos de Luis y Marta.",
  ];
  for (const t of forms) {
    const d = parseFamilyText(t);
    for (const kid of ["Ana", "Pedro", "Lucía"]) {
      assert.ok(parentOf(d, "Luis", kid) && parentOf(d, "Marta", kid), `${t} → ${kid}`);
    }
  }
  const d = parseFamilyText("Luis es el padre de Ana y Pedro.");
  assert.ok(parentOf(d, "Luis", "Ana") && parentOf(d, "Luis", "Pedro"));
});

test("household wording", () => {
  for (const t of ["Núcleo familiar: Luis, Marta y Ana.", "luis, marta y ana conviven.", "Luis, Marta y Ana viven en la misma casa."]) {
    const d = parseFamilyText(t);
    assert.equal(new Set(d.persons.map((p) => p.household)).size, 1, t);
    assert.ok(d.persons.every((p) => p.household != null), t);
  }
  const apart = parseFamilyText("Ana y Diego viven separados.");
  assert.ok(apart.persons.every((p) => p.household == null));
});

test("living with a parent is a shared home, not a couple", () => {
  const d = parseFamilyText("Carmen tiene una hija llamada Ana. Ana vive con Carmen.");
  assert.ok(!d.relationships.some((r) => r.type === "cohabitation"));
  assert.equal(person(d, "Ana").household, person(d, "Carmen").household);
});
