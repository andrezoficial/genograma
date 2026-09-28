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

/* ---------------- narrative style (one paragraph per person) ---------------- */

const NARRATIVE = `Oliver Escarraga fallecido hace 6 años , a la edad de 83 años , compartió unión de hecho con Elena Ceballos de 63 años, ambos tenían vínculo emocional distante. Tuvieron tres hijos :
Marinella Escarraga de 53 años , quien tiene vínculo emocional estrecho con Elena , Oliverio , Yaneth y con Oliver comparte un vínculo distante 
Yaneth Escarraga de 47 años , quien tiene vínculo emocional estrecho con Elena , Oliverio , Marinella y con Oliver comparte un vínculo distante 
Oliver Escarraga de 43 años quien tiene vínculo emocional distante con Elena , Oliverio , Yaneth y Marinella. 
Marinella tuvo dos hijos el primero , Camilo Escarraga de 32 años con Edgar (no se conoce el apellido ni la edad ) , María Alejandra bueno Escarraga de 21 años hija de César bueno. Ambos hijos tienen un vínculo estrecho con Marinella y entre ellos . Alejandra bueno tiene una relación emocional distante con su progenitor . 
Yaneth Escarraga tuvo una hija , Laura Montañez de 29 años , hija de Miguel Ángel Montañez de 53 años . Laura comparte un vínculo estrecho con Yaneth y distante con Miguel Ángel Montañez .
Oliver tuvo una hija , Valentina Escarraga de 17 años , con Judith marciales de 42 años . Valentina tiene un vínculo estrecho con Judith y con Oliver . 
Actualmente , en la misma casa viven : Elena Ceballos ,  Marinella Escarraga , Alejandra Bueno , Laura Montañez , Judith marciales y Valentina Escarraga`;

test("narrative: people, homonyms, nicknames and unknown data", () => {
  const d = parseFamilyText(NARRATIVE, { currentYear: 2026 });
  assert.equal(d.persons.length, 13);
  const olivers = d.persons.filter((p) => p.name === "Oliver Escarraga");
  assert.equal(olivers.length, 2, "father and son share a name");
  const father = olivers.find((p) => p.age === 83)!;
  const son = olivers.find((p) => p.age === 43)!;
  assert.ok(father.deceased);
  assert.equal(father.deathYear, 2020);
  assert.equal(father.birthYear, 1937);
  assert.ok(!son.deceased);
  const edgar = d.persons.find((p) => p.name === "Edgar")!;
  assert.equal(edgar.age, null);
  assert.match(edgar.notes, /apellido/);
  assert.equal(d.persons.find((p) => p.name === "María Alejandra Bueno Escarraga")?.age, 21);
  for (const bad of ["Hace", "Edad", "Primero", "Actualmente"]) assert.ok(!d.persons.some((p) => p.name === bad));
});

test("narrative: unions, filiation and half-siblings", () => {
  const d = parseFamilyText(NARRATIVE, { currentYear: 2026 });
  const id = (n: string, age?: number) => d.persons.find((p) => p.name === n && (age == null || p.age === age))!.id;
  const rel = (type: string, a: string, b: string) =>
    d.relationships.some((r) => r.type === type && ((r.a === a && r.b === b) || (r.a === b && r.b === a)));
  const parent = (a: string, c: string) => d.relationships.some((r) => PARENT_TYPES.includes(r.type) && r.a === a && r.b === c);
  const father = id("Oliver Escarraga", 83);
  const son = id("Oliver Escarraga", 43);
  assert.ok(rel("cohabitation", father, id("Elena Ceballos")));
  for (const kid of [id("Marinella Escarraga"), id("Yaneth Escarraga"), son]) {
    assert.ok(parent(father, kid));
    assert.ok(parent(id("Elena Ceballos"), kid));
  }
  assert.ok(parent(id("Marinella Escarraga"), id("Camilo Escarraga")));
  assert.ok(parent(id("Edgar"), id("Camilo Escarraga")));
  assert.ok(parent(id("César Bueno"), id("María Alejandra Bueno Escarraga")));
  assert.ok(!parent(id("Edgar"), id("María Alejandra Bueno Escarraga")));
  assert.ok(parent(id("Miguel Ángel Montañez"), id("Laura Montañez")));
  assert.ok(parent(son, id("Valentina Escarraga")));
  assert.ok(parent(id("Judith Marciales"), id("Valentina Escarraga")));
});

test("narrative: emotional bonds (both word orders, nicknames, kin and 'entre ellos')", () => {
  const d = parseFamilyText(NARRATIVE, { currentYear: 2026 });
  const id = (n: string, age?: number) => d.persons.find((p) => p.name === n && (age == null || p.age === age))!.id;
  const rel = (type: string, a: string, b: string) =>
    d.relationships.some((r) => r.type === type && ((r.a === a && r.b === b) || (r.a === b && r.b === a)));
  const father = id("Oliver Escarraga", 83);
  const son = id("Oliver Escarraga", 43);
  const mar = id("Marinella Escarraga");
  const yan = id("Yaneth Escarraga");
  const ele = id("Elena Ceballos");
  assert.ok(rel("distant", father, ele), "ambos tenían vínculo distante");
  assert.ok(rel("close", mar, ele) && rel("close", mar, yan));
  assert.ok(rel("close", mar, father), "Oliverio is the elder Oliver");
  assert.ok(rel("distant", mar, son) && rel("distant", yan, son));
  assert.ok(!rel("close", mar, son));
  assert.ok(rel("distant", son, ele) && rel("distant", son, father));
  const cam = id("Camilo Escarraga");
  const ale = id("María Alejandra Bueno Escarraga");
  assert.ok(rel("close", cam, mar) && rel("close", ale, mar) && rel("close", cam, ale));
  assert.ok(rel("distant", ale, id("César Bueno")), "su progenitor");
  assert.ok(!rel("distant", ale, id("Marinella Escarraga")));
  assert.ok(rel("close", id("Laura Montañez"), yan));
  assert.ok(rel("distant", id("Laura Montañez"), id("Miguel Ángel Montañez")));
  assert.ok(rel("close", id("Valentina Escarraga"), id("Judith Marciales")));
  assert.ok(rel("close", id("Valentina Escarraga"), son));
});

test("narrative: household is only the people listed", () => {
  const d = parseFamilyText(NARRATIVE, { currentYear: 2026 });
  const home = d.persons.filter((p) => p.household != null).map((p) => p.name).sort();
  assert.deepEqual(home, [
    "Elena Ceballos",
    "Judith Marciales",
    "Laura Montañez",
    "Marinella Escarraga",
    "María Alejandra Bueno Escarraga",
    "Valentina Escarraga",
  ]);
  assert.equal(new Set(d.persons.map((p) => p.household).filter((h) => h != null)).size, 1);
});

/* ---------------- pasted chat: two copies, WhatsApp header, nickname for the father ---------------- */

const CHAT_PASTE = `Oliverio Escarraga fallecido hace 6 años , a la edad de 83 años , compartió unión de hecho con Elena Ceballos de 63 años, ambos tenían vínculo emocional distante. Tuvieron tres hijos :
Marinella Escarraga de 53 años , quien tiene vínculo emocional estrecho con Elena , Oliverio , Yaneth y con Oliver comparte un vínculo distante
Oliver Escarraga de 43 años quien tiene vínculo emocional distante con Elena , Oliverio , Yaneth y Marinella.
[5:16 p. m., 28/9/2026] Amor 🐨🧨: Oliver Escarraga fallecido hace 6 años , a la edad de 83 años , compartió unión de hecho con Elena Ceballos de 63 años, ambos tenían vínculo emocional distante. Tuvieron tres hijos :
Marinella Escarraga de 53 años , quien tiene vínculo emocional estrecho con Elena , Oliverio , Yaneth y con Oliver comparte un vínculo distante
Yaneth Escarraga de 47 años , quien tiene vínculo emocional estrecho con Elena , Oliverio , Marinella y con Oliver comparte un vínculo distante
Oliver Escarraga de 43 años quien tiene vínculo emocional distante con Elena , Oliverio , Yaneth y Marinella.`;

test("chat paste: header removed and the duplicated father is a single person", () => {
  const d = parseFamilyText(CHAT_PASTE, { currentYear: 2026 });
  assert.ok(!d.persons.some((p) => /amor/i.test(p.name)), "no person from the chat header");
  assert.deepEqual(names(d), ["Elena Ceballos", "Marinella Escarraga", "Oliver Escarraga", "Oliverio Escarraga", "Yaneth Escarraga"]);
  const dead = d.persons.filter((p) => p.deceased);
  assert.equal(dead.length, 1);
  assert.equal(dead[0]!.name, "Oliverio Escarraga");
  assert.equal(d.persons.find((p) => p.name === "Oliver Escarraga")?.deceased, false);
  // kids are not duplicated
  const kids = d.relationships.filter((r) => r.type === "parent_child" && r.a === dead[0]!.id);
  assert.equal(kids.length, 3);
});

test("layout: a partner without parents sits on the row of their partner", async () => {
  const { autoLayout } = await import("./layout.ts");
  const d = parseFamilyText(NARRATIVE, { currentYear: 2026 });
  const laid = autoLayout(d.persons, d.relationships);
  const gen = (n: string) => laid.find((p) => p.name === n)!.generation;
  assert.equal(gen("Edgar"), gen("Marinella Escarraga"));
  assert.equal(gen("César Bueno"), gen("Marinella Escarraga"));
  assert.equal(gen("Miguel Ángel Montañez"), gen("Yaneth Escarraga"));
  const son = laid.find((p) => p.name === "Oliver Escarraga" && p.age === 43)!;
  assert.equal(gen("Judith Marciales"), son.generation);
  assert.ok(gen("Camilo Escarraga") > gen("Edgar"));
});
