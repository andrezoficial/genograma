import { createServerFn } from "@tanstack/react-start";
import { emptyPerson, type Gender, type GenogramData, type RelType } from "./types.ts";
import { inferGenderFromName } from "./gender.ts";

const REL_TYPES: RelType[] = [
  "marriage",
  "cohabitation",
  "separation",
  "divorce",
  "parent_child",
  "adopted",
  "sibling",
  "close",
  "distant",
  "cutoff",
  "conflict",
];

type AiPerson = {
  name: string;
  gender?: string;
  age?: number | null;
  birthYear?: number | null;
  deathYear?: number | null;
  deceased?: boolean;
  occupation?: string;
  notes?: string;
  identifiedPatient?: boolean;
};

type AiRel = {
  type: string;
  from: string;
  to: string;
};

function normGender(value: string | undefined): Gender {
  const v = (value ?? "").toLowerCase();
  if (v === "male" || v === "m" || v === "hombre" || v === "masculino") return "male";
  if (v === "female" || v === "f" || v === "mujer" || v === "femenino") return "female";
  return "unknown";
}

function mapAi(persons: AiPerson[], rels: AiRel[]): GenogramData {
  const nameToId = new Map<string, string>();
  const outPersons = persons
    .map((p, i) => {
      const name = (p.name ?? "").trim();
      if (!name) return null;
      const id = `p${i + 1}`;
      nameToId.set(name.toLowerCase(), id);
      return emptyPerson({
        id,
        name,
        gender: p.gender ? normGender(p.gender) : inferGenderFromName(name),
        age: typeof p.age === "number" ? p.age : null,
        birthYear: typeof p.birthYear === "number" ? p.birthYear : null,
        deathYear: typeof p.deathYear === "number" ? p.deathYear : null,
        deceased: Boolean(p.deceased) || typeof p.deathYear === "number",
        occupation: p.occupation ?? "",
        notes: p.notes ?? "",
        identifiedPatient: Boolean(p.identifiedPatient),
      });
    })
    .filter((p): p is NonNullable<typeof p> => p != null);

  const outRels: GenogramData["relationships"] = [];
  let ri = 1;
  for (const r of rels) {
    const a = nameToId.get((r.from ?? "").trim().toLowerCase());
    const b = nameToId.get((r.to ?? "").trim().toLowerCase());
    const type = REL_TYPES.includes(r.type as RelType) ? (r.type as RelType) : null;
    if (!a || !b || !type || a === b) continue;
    outRels.push({ id: `r${ri++}`, type, a, b });
  }
  return { persons: outPersons, relationships: outRels };
}

export const parseFamilyWithAi = createServerFn({ method: "POST" })
  .validator((input: { text: string }) => {
    const text = (input?.text ?? "").trim();
    if (!text) throw new Error("Escribe un texto primero.");
    if (text.length > 8000) throw new Error("El texto es demasiado largo.");
    return { text };
  })
  .handler(async ({ data }) => {
    const apiKey = process.env["XAI_API_KEY"]?.trim();
    if (!apiKey) {
      return { ok: false as const, error: "La generación con IA no está disponible ahora." };
    }

    let res: Response;
    try {
      res = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        signal: AbortSignal.timeout(45_000),
        body: JSON.stringify({
          model: "grok-4.5",
          temperature: 0,
          max_tokens: 1800,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "Eres un experto en genogramas clínicos. Extrae personas y vínculos de una descripción familiar en español. Responde SOLO JSON válido con esta forma: {\"persons\":[{\"name\",\"gender\":\"male|female|unknown\",\"age\":null,\"birthYear\":null,\"deathYear\":null,\"deceased\":false,\"occupation\":\"\",\"notes\":\"\",\"identifiedPatient\":false}],\"relationships\":[{\"type\":\"marriage|cohabitation|separation|divorce|parent_child|adopted|sibling|close|distant|cutoff|conflict\",\"from\":\"Nombre\",\"to\":\"Nombre\"}]}. En parent_child, from es el progenitor y to el hijo. No inventes gente que no esté en el texto. Si un hermano comparte padres, incluye también parent_child a esos padres.",
            },
            { role: "user", content: data.text },
          ],
        }),
      });
    } catch {
      return { ok: false as const, error: "No se pudo interpretar el texto con IA." };
    }

    if (!res.ok) {
      return { ok: false as const, error: "No se pudo interpretar el texto con IA." };
    }

    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = body.choices?.[0]?.message?.content ?? "";
    const jsonStr = raw.replace(/```(?:json)?/gi, "").trim();
    try {
      const parsed = JSON.parse(jsonStr) as { persons?: AiPerson[]; relationships?: AiRel[] };
      const mapped = mapAi(parsed.persons ?? [], parsed.relationships ?? []);
      if (mapped.persons.length === 0) {
        return { ok: false as const, error: "La IA no encontró personas en el texto." };
      }
      return { ok: true as const, data: mapped };
    } catch {
      return { ok: false as const, error: "La IA devolvió un resultado ilegible." };
    }
  });
