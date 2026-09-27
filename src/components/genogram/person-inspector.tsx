import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { REL_LABELS, type Gender, type Person } from "@/lib/genogram/types";
import { useGenogram } from "@/lib/genogram/store";
import { cn } from "@/lib/utils";

const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35";

export function PersonInspector({ person }: { person: Person }) {
  const updatePerson = useGenogram((s) => s.updatePerson);
  const removePerson = useGenogram((s) => s.removePerson);
  const removeRelationship = useGenogram((s) => s.removeRelationship);
  const relationships = useGenogram((s) => s.relationships);
  const persons = useGenogram((s) => s.persons);
  const checkpoint = useGenogram((s) => s.checkpoint);
  const [name, setName] = useState(person.name);
  const [occupation, setOccupation] = useState(person.occupation);
  const [notes, setNotes] = useState(person.notes);
  const [age, setAge] = useState(person.age?.toString() ?? "");
  const [birthYear, setBirthYear] = useState(person.birthYear?.toString() ?? "");
  const [deathYear, setDeathYear] = useState(person.deathYear?.toString() ?? "");
  const [household, setHousehold] = useState(person.household?.toString() ?? "");

  useEffect(() => {
    setName(person.name);
    setOccupation(person.occupation);
    setNotes(person.notes);
    setAge(person.age?.toString() ?? "");
    setBirthYear(person.birthYear?.toString() ?? "");
    setDeathYear(person.deathYear?.toString() ?? "");
    setHousehold(person.household?.toString() ?? "");
  }, [
    person.id,
    person.name,
    person.occupation,
    person.notes,
    person.age,
    person.birthYear,
    person.deathYear,
    person.household,
  ]);

  const related = relationships.filter((r) => r.a === person.id || r.b === person.id);
  const nameOf = (id: string) => persons.find((p) => p.id === id)?.name ?? id;
  const householdOptions = Array.from(
    new Set(persons.map((p) => p.household).filter((n): n is number => n != null)),
  ).sort((a, b) => a - b);

  return (
    <div className="space-y-3">
      <div>
        <p className="font-display text-lg font-medium tracking-tight">{person.name}</p>
        <p className="text-xs text-muted-foreground">Seleccionado en el mapa</p>
      </div>
      <div>
        <Label htmlFor="edit-name">Nombre</Label>
        <Input
          id="edit-name"
          value={name}
          onFocus={() => checkpoint()}
          onChange={(e) => {
            setName(e.target.value);
            updatePerson(person.id, { name: e.target.value }, { history: false });
          }}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor="edit-gender">Género</Label>
          <select
            id="edit-gender"
            className={selectClass}
            value={person.gender}
            onChange={(e) => updatePerson(person.id, { gender: e.target.value as Gender })}
          >
            <option value="male">Hombre</option>
            <option value="female">Mujer</option>
            <option value="unknown">Desconocido</option>
          </select>
        </div>
        <div>
          <Label htmlFor="edit-age">Edad</Label>
          <Input
            id="edit-age"
            inputMode="numeric"
            value={age}
            onFocus={() => checkpoint()}
            onChange={(e) => {
              setAge(e.target.value);
              const n = e.target.value === "" ? null : Number(e.target.value);
              updatePerson(person.id, { age: n != null && Number.isFinite(n) ? n : null }, { history: false });
            }}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor="edit-birth">Nacimiento</Label>
          <Input
            id="edit-birth"
            inputMode="numeric"
            placeholder="año"
            value={birthYear}
            onFocus={() => checkpoint()}
            onChange={(e) => {
              setBirthYear(e.target.value);
              const n = e.target.value === "" ? null : Number(e.target.value);
              updatePerson(person.id, { birthYear: n != null && Number.isFinite(n) ? n : null }, { history: false });
            }}
          />
        </div>
        <div>
          <Label htmlFor="edit-death">Defunción</Label>
          <Input
            id="edit-death"
            inputMode="numeric"
            placeholder="año"
            value={deathYear}
            onFocus={() => checkpoint()}
            onChange={(e) => {
              setDeathYear(e.target.value);
              const n = e.target.value === "" ? null : Number(e.target.value);
              updatePerson(
                person.id,
                {
                  deathYear: n != null && Number.isFinite(n) ? n : null,
                  deceased: n != null && Number.isFinite(n) ? true : person.deceased,
                },
                { history: false },
              );
            }}
          />
        </div>
      </div>
      <label className="flex min-h-10 items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4 accent-primary"
          checked={person.deceased}
          onChange={(e) => updatePerson(person.id, { deceased: e.target.checked })}
        />
        Fallecido/a
      </label>
      <label className="flex min-h-10 items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4 accent-primary"
          checked={person.identifiedPatient}
          onChange={(e) => updatePerson(person.id, { identifiedPatient: e.target.checked })}
        />
        Paciente identificado (doble trazo)
      </label>
      <div>
        <Label htmlFor="edit-household">Núcleo familiar (con quién vive)</Label>
        <Input
          id="edit-household"
          inputMode="numeric"
          placeholder="Nº de núcleo, ej. 1"
          value={household}
          onFocus={() => checkpoint()}
          onChange={(e) => {
            setHousehold(e.target.value);
            const n = e.target.value === "" ? null : Number(e.target.value);
            updatePerson(
              person.id,
              { household: n != null && Number.isFinite(n) ? n : null },
              { history: false },
            );
          }}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Asigna el mismo número a quienes conviven; se encierran en un círculo punteado en el mapa.
        </p>
        {householdOptions.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {householdOptions.map((n) => (
              <button
                key={n}
                type="button"
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs",
                  person.household === n ? "border-ink bg-secondary font-semibold" : "border-input text-muted-foreground",
                )}
                onClick={() => {
                  setHousehold(String(n));
                  updatePerson(person.id, { household: n });
                }}
              >
                Núcleo {n}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div>
        <Label htmlFor="edit-occ">Ocupación</Label>
        <Input
          id="edit-occ"
          value={occupation}
          onFocus={() => checkpoint()}
          onChange={(e) => {
            setOccupation(e.target.value);
            updatePerson(person.id, { occupation: e.target.value }, { history: false });
          }}
        />
      </div>
      <div>
        <Label htmlFor="edit-notes">Notas clínicas</Label>
        <Input
          id="edit-notes"
          value={notes}
          onFocus={() => checkpoint()}
          onChange={(e) => {
            setNotes(e.target.value);
            updatePerson(person.id, { notes: e.target.value }, { history: false });
          }}
        />
      </div>
      {related.length > 0 ? (
        <div>
          <Label>Vínculos</Label>
          <ul className="space-y-1">
            {related.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 rounded-md bg-secondary px-2 py-1.5 text-sm">
                <span className="min-w-0 truncate">
                  {REL_LABELS[r.type]} · {nameOf(r.a === person.id ? r.b : r.a)}
                </span>
                <button
                  type="button"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeRelationship(r.id)}
                  aria-label="Quitar vínculo"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <Separator />
      <Button type="button" variant="destructive" className="w-full" onClick={() => removePerson(person.id)}>
        <Trash2 /> Eliminar persona
      </Button>
    </div>
  );
}
