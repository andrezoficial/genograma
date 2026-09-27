import assert from "node:assert/strict";
import { test } from "node:test";
import { EXAMPLE_TEXT, parseFamilyText } from "./parser.ts";
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
  const data = parseFamilyText(EXAMPLE_TEXT);
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
  assert.ok(hasRel(data, "marriage", "Carmen", "José"));
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
