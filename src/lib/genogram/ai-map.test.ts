import assert from "node:assert/strict";
import { test } from "node:test";
import { mapAi } from "./ai-map.ts";

test("two people with the same name stay separate when relations use ids", () => {
  const d = mapAi(
    [
      { id: "p1", name: "Oliverio Escarraga", age: 83, deceased: true, deathYear: 2020, birthYear: 1937 },
      { id: "p2", name: "Oliver Escarraga", age: 43 },
      { id: "p3", name: "Oliver Escarraga", age: 20 },
      { id: "p4", name: "Valentina", age: 17 },
    ],
    [
      { type: "parent_child", from: "p1", to: "p2" },
      { type: "parent_child", from: "p2", to: "p4" },
      { type: "parent_child", from: "p3", to: "p4" },
      { type: "parent_child", from: "p2", to: "p4" }, // duplicate
      { type: "close", from: "p4", to: "p2" },
      { type: "nonsense", from: "p1", to: "p2" },
    ],
  );
  assert.equal(d.persons.length, 4);
  assert.equal(d.persons[0]!.deceased, true);
  assert.equal(d.relationships.filter((r) => r.type === "parent_child").length, 3);
  assert.ok(d.relationships.some((r) => r.type === "close"));
  assert.equal(d.relationships.length, 4);
});

test("an ambiguous bare name is refused, an unambiguous one still works", () => {
  const d = mapAi(
    [{ name: "Oliver Escarraga" }, { name: "Oliver Escarraga" }, { name: "Ana" }],
    [
      { type: "close", from: "Oliver Escarraga", to: "Ana" },
      { type: "close", from: "Ana", to: "Ana" },
    ],
  );
  assert.equal(d.relationships.length, 0);
  const ok = mapAi([{ name: "María" }, { name: "Juan" }], [{ type: "marriage", from: "María", to: "Juan" }]);
  assert.equal(ok.relationships.length, 1);
});

test("households come only from people that carry a household number", () => {
  const d = mapAi([{ id: "a", name: "A", household: 1 }, { id: "b", name: "B", household: 1 }, { id: "c", name: "C" }], []);
  assert.deepEqual(d.households?.map((h) => h.id), [1]);
  assert.equal(d.persons.find((p) => p.name === "C")!.household, null);
});
