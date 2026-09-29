import { createServerFn } from "@tanstack/react-start";
import { mapAi, type AiPerson, type AiRel } from "./ai-map.ts";

/**
 * Turns a family description into structured data (people + relationships). The AI never draws
 * anything: the app lays out and renders the genogram from this JSON.
 *
 * Providers (all speak the OpenAI "chat/completions" format). First key found wins, in this order:
 *   GEMINI_API_KEY → Google AI Studio (free tier). Model override: GEMINI_MODEL.
 *   OPENAI_API_KEY → OpenAI (ChatGPT models). Model override: OPENAI_MODEL.
 *   XAI_API_KEY    → xAI Grok. Model override: XAI_MODEL.
 * Set AI_PROVIDER=openai|gemini|xai to force one when several keys are present.
 */
type Provider = { name: string; url: string; key: string; model: string };

function provider(): Provider | null {
  const all: Record<string, () => Provider | null> = {
    gemini: () => {
      const key = process.env["GEMINI_API_KEY"]?.trim();
      return key
        ? {
            name: "gemini",
            url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
            key,
            model: process.env["GEMINI_MODEL"]?.trim() || "gemini-3.5-flash",
          }
        : null;
    },
    openai: () => {
      const key = process.env["OPENAI_API_KEY"]?.trim();
      return key
        ? {
            name: "openai",
            url: "https://api.openai.com/v1/chat/completions",
            key,
            model: process.env["OPENAI_MODEL"]?.trim() || "gpt-5-mini",
          }
        : null;
    },
    xai: () => {
      const key = process.env["XAI_API_KEY"]?.trim();
      return key
        ? {
            name: "xai",
            url: "https://api.x.ai/v1/chat/completions",
            key,
            model: process.env["XAI_MODEL"]?.trim() || "grok-4.5",
          }
        : null;
    },
  };
  const forced = process.env["AI_PROVIDER"]?.trim().toLowerCase();
  if (forced && all[forced]) return all[forced]();
  return all["gemini"]!() ?? all["openai"]!() ?? all["xai"]!();
}

/** OpenAI's newer models reject `max_tokens` and a custom `temperature`; the others still expect them. */
function tuning(cfg: Provider) {
  return cfg.name === "openai" ? { max_completion_tokens: 8000 } : { temperature: 0, max_tokens: 8000 };
}

function systemPrompt(year: number) {
  return [
    "Eres un experto en genogramas clínicos. Extrae personas y vínculos de una descripción familiar en español.",
    'Responde SOLO JSON válido: {"persons":[{"id":"p1","name":"","gender":"male|female|unknown","age":null,"birthYear":null,"deathYear":null,"deceased":false,"occupation":"","notes":"","identifiedPatient":false,"conditions":[],"household":null}],"relationships":[{"type":"","from":"p1","to":"p2"}]}.',
    "Tipos de relación: marriage, cohabitation (unión libre / unión de hecho), separation, divorce, widowed, dating, parent_child, adopted, sibling, close, distant, cutoff, conflict.",
    "REGLAS:",
    `- El año actual es ${year}. «Fallecido hace 6 años» → deceased true y deathYear ${year - 6}; si dice la edad al morir, ponla en age y birthYear = deathYear − age.`,
    '- Cada persona lleva un id único ("p1", "p2"…). En "relationships", from y to son SIEMPRE ids, nunca nombres.',
    "- Dos personas distintas pueden llamarse igual (p. ej. padre e hijo). Sepáralas por edad y crea una entrada para cada una. Un apodo o variante del nombre (Oliverio / Oliver) puede ser la misma persona: no la dupliques si la edad y el apellido coinciden.",
    '- Une "Marinella" con "Marinella Escarraga" si es claramente la misma persona, y usa el nombre más completo.',
    "- En parent_child, from es el progenitor y to el hijo. Cada hijo debe tener parent_child con AMBOS progenitores si el texto los menciona (incluida la pareja de la que nació, aunque solo se nombre como «con Edgar» o «hija de César»).",
    "- Para cada par de progenitores de un mismo hijo, agrega también una relación de unión entre ellos. Si el texto no dice de qué tipo, usa dating.",
    '- Vínculos emocionales: estrecho / cercano / unido → close; distante / frío → distant; conflicto / pelea → conflict; corte / no se hablan → cutoff. «X tiene vínculo estrecho con A, B y C» son tres relaciones close desde X. «Ambos hijos … y entre ellos» incluye también la relación entre los hijos. «Su progenitor» es el padre o madre de esa persona.',
    "- Si el texto dice quiénes viven juntos, pon el mismo número entero en household (empezando en 1) SOLO a esas personas.",
    "- Si no se conoce un dato (apellido, edad), déjalo en null y explícalo en notes (por ejemplo «Se desconoce apellido y edad»).",
    "- identifiedPatient true solo para quien el texto marca como paciente identificado o consultante.",
    "- conditions: lista con alcohol, drugs, mental o physical solo si el texto lo dice de esa persona (alcoholismo, otras sustancias, enfermedad mental, enfermedad física).",
    "- No inventes personas, edades ni vínculos que no estén en el texto. Ignora encabezados de chat (fecha, hora, nombre del remitente) y texto repetido.",
  ].join("\n");
}

const FAIL = { ok: false as const, error: "No se pudo interpretar el texto con IA." };

export const parseFamilyWithAi = createServerFn({ method: "POST" })
  .validator((input: { text: string }) => {
    const text = (input?.text ?? "").trim();
    if (!text) throw new Error("Escribe un texto primero.");
    if (text.length > 8000) throw new Error("El texto es demasiado largo.");
    return { text };
  })
  .handler(async ({ data }) => {
    const cfg = provider();
    if (!cfg) return { ok: false as const, error: "La generación con IA no está disponible ahora." };

    let res: Response;
    try {
      res = await fetch(cfg.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.key}` },
        signal: AbortSignal.timeout(60_000),
        body: JSON.stringify({
          model: cfg.model,
          ...tuning(cfg),
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt(new Date().getFullYear()) },
            { role: "user", content: data.text },
          ],
        }),
      });
    } catch (err) {
      console.error(`[ai] ${cfg.name} fetch failed`, err);
      return { ok: false as const, error: `No se pudo conectar con ${cfg.name} (${cfg.model}).` };
    }
    if (!res.ok) {
      let detail = "";
      try {
        const raw = await res.text();
        try {
          const j = JSON.parse(raw) as { error?: { message?: string } } | { error?: { message?: string } }[];
          detail = (Array.isArray(j) ? j[0] : j)?.error?.message ?? raw;
        } catch {
          detail = raw;
        }
      } catch {
        /* ignore */
      }
      detail = detail.replace(/\s+/g, " ").slice(0, 200);
      console.error(`[ai] ${cfg.name} ${cfg.model} → HTTP ${res.status}: ${detail}`);
      return { ok: false as const, error: `${cfg.name} (${cfg.model}) respondió ${res.status}: ${detail || "sin detalle"}` };
    }

    let body: { choices?: { message?: { content?: string }; finish_reason?: string }[] };
    try {
      body = (await res.json()) as typeof body;
    } catch {
      return FAIL;
    }
    const choice = body.choices?.[0];
    if (choice?.finish_reason === "length") {
      return { ok: false as const, error: "La respuesta de la IA quedó incompleta. Prueba con un texto más corto." };
    }
    const raw = (choice?.message?.content ?? "").replace(/```(?:json)?/gi, "").trim();
    try {
      const parsed = JSON.parse(raw) as { persons?: AiPerson[]; relationships?: AiRel[] };
      const mapped = mapAi(parsed.persons ?? [], parsed.relationships ?? []);
      if (mapped.persons.length === 0) return { ok: false as const, error: "La IA no encontró personas en el texto." };
      return { ok: true as const, data: mapped };
    } catch {
      return { ok: false as const, error: "La IA devolvió un resultado ilegible." };
    }
  });
