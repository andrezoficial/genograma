import { useMemo, useState } from "react";
import { Sparkles, UserPlus, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { parseFamilyWithAi } from "@/lib/genogram/ai";
import { EXAMPLE_TEXT, parseFamilyText } from "@/lib/genogram/parser";
import { useGenogram } from "@/lib/genogram/store";
import { REL_LABELS, type Gender, type RelType } from "@/lib/genogram/types";
import { cn } from "@/lib/utils";
import { Credits } from "./credits";
import { PersonInspector } from "./person-inspector";

const selectClass =
  "h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35";

export function Sidebar() {
  const [text, setText] = useState(EXAMPLE_TEXT);
  const [aiBusy, setAiBusy] = useState(false);
  const [name, setName] = useState("");
  const [gender, setGender] = useState<Gender>("female");
  const [age, setAge] = useState("");
  const [deceased, setDeceased] = useState(false);
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [relType, setRelType] = useState<RelType>("marriage");

  const persons = useGenogram((s) => s.persons);
  const selectedId = useGenogram((s) => s.selectedId);
  const select = useGenogram((s) => s.select);
  const status = useGenogram((s) => s.status);
  const tab = useGenogram((s) => s.sidebarTab);
  const setTab = useGenogram((s) => s.setSidebarTab);
  const loadFromText = useGenogram((s) => s.loadFromText);
  const loadData = useGenogram((s) => s.loadData);
  const addPerson = useGenogram((s) => s.addPerson);
  const addRelationship = useGenogram((s) => s.addRelationship);
  const selected = persons.find((p) => p.id === selectedId) ?? null;
  const preview = useMemo(() => (text.trim() ? parseFamilyText(text) : { persons: [], relationships: [] }), [text]);

  function submitPerson() {
    const id = addPerson({
      name,
      gender,
      age: age === "" ? null : Number(age),
      deceased,
    });
    if (id) {
      setName("");
      setAge("");
      setDeceased(false);
    }
  }

  async function generateAi() {
    if (!text.trim()) return;
    setAiBusy(true);
    try {
      const res = await parseFamilyWithAi({ data: { text } });
      if (res.ok) {
        loadData(res.data, `IA: ${res.data.persons.length} personas, ${res.data.relationships.length} vínculos.`);
      } else {
        const local = loadFromText(text);
        useGenogram.setState({
          status: local.ok ? `${res.error} Se usó el analizador local.` : res.error,
        });
      }
    } catch {
      loadFromText(text);
      useGenogram.setState({ status: "IA no disponible. Se usó el analizador local." });
    } finally {
      setAiBusy(false);
    }
  }

  return (
    <aside className="flex h-full min-h-0 w-full flex-col border-border bg-card lg:w-[320px] lg:border-r">
      <div className="grid grid-cols-3 border-b border-border">
        {(
          [
            ["texto", "Texto"],
            ["manual", "Manual"],
            ["personas", "Ficha"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={cn(
              "h-11 border-b-2 text-sm font-medium transition-colors duration-150",
              tab === id
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === "texto" ? (
          <div>
            <div className="mb-1.5 flex items-end justify-between gap-2">
              <Label htmlFor="family-text" className="mb-0">
                Descripción familiar
              </Label>
              <button
                type="button"
                className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                onClick={() => setText(EXAMPLE_TEXT)}
              >
                Cargar ejemplo
              </button>
            </div>
            <Textarea
              id="family-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="María está casada con Juan. Tienen dos hijos: Laura y Pedro."
            />
            <p className="mb-3 mt-2 text-xs text-muted-foreground">
              Detecta personas (hombre, mujer, género s/d, fallecido, paciente identificado), convivencia («viven juntos»), vínculos familiares (matrimonio, unión libre, separación, divorcio, hijos, adopción, hermanos) y vínculos emocionales (cercana, distante, corte, conflicto). También vale en minúsculas o en primera persona («estoy casada», «tengo dos hijos»).
            </p>
            {preview.persons.length > 0 ? (
              <div className="mb-3 rounded-xl bg-secondary px-3 py-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {preview.persons.length} persona{preview.persons.length === 1 ? "" : "s"}
                </span>
                {" · "}
                {preview.relationships.length} vínculo{preview.relationships.length === 1 ? "" : "s"}
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {preview.persons.slice(0, 12).map((p) => (
                    <span key={p.id} className="rounded-full bg-card px-2 py-0.5 text-[11px] text-foreground">
                      {p.name}
                    </span>
                  ))}
                </div>
              </div>
            ) : text.trim() ? (
              <p className="mb-3 text-xs text-destructive">No se detectan nombres todavía.</p>
            ) : null}
            <Button type="button" className="h-11 w-full" onClick={() => loadFromText(text)}>
              <Wand2 /> Generar genograma
            </Button>
            <Button type="button" variant="outline" className="mt-2 h-11 w-full" disabled={aiBusy} onClick={generateAi}>
              <Sparkles /> {aiBusy ? "Interpretando…" : "Generar con IA"}
            </Button>
          </div>
        ) : null}

        {tab === "manual" ? (
          <div>
            <Label htmlFor="new-name">Añadir persona</Label>
            <Input
              id="new-name"
              value={name}
              placeholder="Nombre"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitPerson();
              }}
            />
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="new-gender">Género</Label>
                <select
                  id="new-gender"
                  className={selectClass}
                  value={gender}
                  onChange={(e) => setGender(e.target.value as Gender)}
                >
                  <option value="male">Hombre</option>
                  <option value="female">Mujer</option>
                  <option value="unknown">Desconocido</option>
                </select>
              </div>
              <div>
                <Label htmlFor="new-age">Edad</Label>
                <Input id="new-age" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} />
              </div>
            </div>
            <label className="mt-2 flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={deceased}
                onChange={(e) => setDeceased(e.target.checked)}
              />
              Fallecido/a
            </label>
            <Button type="button" className="mt-2 h-11 w-full" onClick={submitPerson}>
              <UserPlus /> Añadir persona
            </Button>

            <div className="my-5 h-px bg-border" />

            <Label>Crear vínculo</Label>
            <select className={cn(selectClass, "mb-2")} value={fromId || selectedId || ""} onChange={(e) => setFromId(e.target.value)}>
              <option value="">Persona 1…</option>
              {persons.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              className={cn(selectClass, "mb-2")}
              value={relType}
              onChange={(e) => setRelType(e.target.value as RelType)}
            >
              {(Object.keys(REL_LABELS) as RelType[]).map((t) => (
                <option key={t} value={t}>
                  {REL_LABELS[t]}
                </option>
              ))}
            </select>
            <select className={cn(selectClass, "mb-3")} value={toId} onChange={(e) => setToId(e.target.value)}>
              <option value="">Persona 2…</option>
              {persons.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <Button type="button" variant="outline" className="h-11 w-full" onClick={() => addRelationship(relType, fromId || selectedId || "", toId)}>
              Crear vínculo
            </Button>
          </div>
        ) : null}

        {tab === "personas" ? (
          <div className="space-y-4">
            {selected ? (
              <PersonInspector person={selected} />
            ) : (
              <p className="text-sm text-muted-foreground">Selecciona a alguien en el mapa o en la lista.</p>
            )}
            <div>
              <Label>Personas</Label>
              <ul className="mt-1 space-y-0.5">
                {persons.length === 0 ? (
                  <li className="text-sm italic text-muted-foreground">Ninguna todavía</li>
                ) : (
                  persons.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => select(p.id)}
                        className={cn(
                          "flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left text-sm",
                          selectedId === p.id ? "bg-accent text-foreground" : "hover:bg-secondary",
                        )}
                      >
                        <span
                          className={cn(
                            "size-2.5 shrink-0 border border-ink",
                            p.gender === "female"
                              ? "rounded-full bg-female"
                              : p.gender === "male"
                                ? "bg-male"
                                : "rotate-45 bg-unknown",
                          )}
                        />
                        <span className="truncate">
                          {p.name}
                          {p.age != null ? ` (${p.age})` : ""}
                          {p.deceased ? " †" : ""}
                        </span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
        ) : null}
      </div>

      <div className="border-t border-border px-4 py-2">
        <p className="text-xs text-muted-foreground">{status}</p>
        <Credits />
      </div>
    </aside>
  );
}
