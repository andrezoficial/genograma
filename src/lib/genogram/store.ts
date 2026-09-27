import { create } from "zustand";
import { autoLayout } from "./layout.ts";
import { parseFamilyText } from "./parser.ts";
import {
  DEFAULT_HOUSEHOLD_LABEL,
  emptyPerson,
  type Gender,
  type GenogramData,
  type Household,
  type Person,
  type RelType,
  type Relationship,
} from "./types.ts";

const STORAGE_KEY = "genograma.v2";

type Snapshot = GenogramData;
export type SidebarTab = "texto" | "manual" | "personas";
export type MobilePanel = "datos" | "lienzo";

type NewPerson = {
  name: string;
  gender: Gender;
  age: number | null;
  deceased: boolean;
  identifiedPatient?: boolean;
  occupation?: string;
  notes?: string;
  birthYear?: number | null;
  deathYear?: number | null;
  x?: number;
  y?: number;
};

type State = {
  persons: Person[];
  relationships: Relationship[];
  households: Household[];
  selectedId: string | null;
  status: string;
  hydrated: boolean;
  epoch: number;
  layoutEpoch: number;
  sidebarTab: SidebarTab;
  panel: MobilePanel;
  past: Snapshot[];
  future: Snapshot[];
  hydrate: () => void;
  persist: () => void;
  checkpoint: () => void;
  undo: () => void;
  redo: () => void;
  select: (id: string | null) => void;
  setSidebarTab: (tab: SidebarTab) => void;
  setPanel: (panel: MobilePanel) => void;
  loadFromText: (text: string) => { ok: boolean; message: string };
  loadData: (data: GenogramData, status: string) => void;
  addPerson: (input: NewPerson) => string | null;
  updatePerson: (id: string, patch: Partial<Person>, opts?: { history?: boolean }) => void;
  removePerson: (id: string) => void;
  addRelationship: (type: RelType, a: string, b: string) => void;
  removeRelationship: (id: string) => void;
  linkHousehold: (a: string, b: string) => void;
  setHouseholdLabel: (id: number, label: string) => void;
  movePerson: (id: string, x: number, y: number) => void;
  layout: () => void;
  clear: () => void;
};

function snap(s: { persons: Person[]; relationships: Relationship[]; households: Household[] }): Snapshot {
  return {
    persons: s.persons.map((p) => ({ ...p })),
    relationships: s.relationships.map((r) => ({ ...r })),
    households: s.households.map((h) => ({ ...h })),
  };
}

function nextIds(persons: Person[], relationships: Relationship[]) {
  const maxP = persons.reduce((m, p) => Math.max(m, Number(p.id.replace(/\D/g, "")) || 0), 0);
  const maxR = relationships.reduce((m, r) => Math.max(m, Number(r.id.replace(/\D/g, "")) || 0), 0);
  return { p: maxP + 1, r: maxR + 1 };
}

function sanitize(data: GenogramData): GenogramData {
  const persons = (data.persons ?? [])
    .map((p, i) =>
      emptyPerson({
        ...p,
        id: p.id || `p${i + 1}`,
        name: String(p.name ?? "").trim(),
      }),
    )
    .filter((p) => p.name);
  const ids = new Set(persons.map((p) => p.id));
  const relationships = (data.relationships ?? []).filter(
    (r) => r && ids.has(r.a) && ids.has(r.b) && r.a !== r.b && r.type,
  );
  const usedHouseholds = new Set(persons.map((p) => p.household).filter((n): n is number => n != null));
  const households = (data.households ?? [])
    .filter((h) => h && typeof h.id === "number" && usedHouseholds.has(h.id))
    .map((h) => ({ id: h.id, label: String(h.label ?? "").trim() || DEFAULT_HOUSEHOLD_LABEL }));
  return { persons, relationships, households };
}

const DEMO = `María de 45 años está casada con Juan de 48.
Tienen dos hijos: Laura de 15 y Pedro de 12.
Los padres de María se llaman Carmen y José.
José falleció en 2018.
María tiene una hermana llamada Ana.`;

export const useGenogram = create<State>((set, get) => ({
  persons: [],
  relationships: [],
  households: [],
  selectedId: null,
  status: "Listo.",
  hydrated: false,
  epoch: 0,
  layoutEpoch: 0,
  sidebarTab: "texto",
  panel: "lienzo",
  past: [],
  future: [],

  hydrate: () => {
    if (get().hydrated) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<GenogramData>;
        if (Array.isArray(parsed.persons) && parsed.persons.length > 0) {
          const clean = sanitize({
            persons: parsed.persons as Person[],
            relationships: (parsed.relationships as Relationship[]) ?? [],
            households: (parsed.households as Household[]) ?? [],
          });
          set({
            persons: clean.persons,
            relationships: clean.relationships,
            households: clean.households,
            hydrated: true,
            epoch: 1,
            layoutEpoch: 1,
            status: "Documento restaurado.",
          });
          return;
        }
      }
    } catch {
      /* ignore */
    }
    const parsed = parseFamilyText(DEMO);
    set({
      persons: autoLayout(parsed.persons, parsed.relationships),
      relationships: parsed.relationships,
      households: [],
      hydrated: true,
      epoch: 1,
      layoutEpoch: 1,
      status: "Ejemplo cargado. Edítalo o pega tu propia familia.",
    });
    get().persist();
  },

  persist: () => {
    const { persons, relationships, households } = get();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ persons, relationships, households }));
    } catch {
      /* ignore */
    }
  },

  checkpoint: () => {
    const { persons, relationships, households, past } = get();
    set({
      past: [...past, snap({ persons, relationships, households })].slice(-40),
      future: [],
    });
  },

  undo: () => {
    const { past, persons, relationships, households, future } = get();
    const prev = past[past.length - 1];
    if (!prev) return;
    set({
      past: past.slice(0, -1),
      future: [snap({ persons, relationships, households }), ...future].slice(0, 40),
      persons: prev.persons,
      relationships: prev.relationships,
      households: prev.households ?? [],
      epoch: get().epoch + 1,
      layoutEpoch: get().layoutEpoch + 1,
      status: "Deshecho.",
    });
    get().persist();
  },

  redo: () => {
    const { future, persons, relationships, households, past } = get();
    const next = future[0];
    if (!next) return;
    set({
      future: future.slice(1),
      past: [...past, snap({ persons, relationships, households })].slice(-40),
      persons: next.persons,
      relationships: next.relationships,
      households: next.households ?? [],
      epoch: get().epoch + 1,
      layoutEpoch: get().layoutEpoch + 1,
      status: "Rehecho.",
    });
    get().persist();
  },

  select: (id) =>
    set({
      selectedId: id,
      sidebarTab: id ? "personas" : get().sidebarTab,
    }),

  setSidebarTab: (tab) => set({ sidebarTab: tab }),
  setPanel: (panel) => set({ panel }),

  loadFromText: (text) => {
    const parsed = parseFamilyText(text);
    if (parsed.persons.length === 0) {
      set({ status: "No se detectaron personas. Usa nombres propios y frases como «casada con», «hijos», «padres»." });
      return { ok: false, message: get().status };
    }
    get().loadData(parsed, `Generado: ${parsed.persons.length} personas, ${parsed.relationships.length} vínculos.`);
    return { ok: true, message: get().status };
  },

  loadData: (data, status) => {
    const { persons, relationships, households, past } = get();
    const clean = sanitize(data);
    const laid = autoLayout(clean.persons, clean.relationships);
    set({
      past: [...past, snap({ persons, relationships, households })].slice(-40),
      future: [],
      persons: laid,
      relationships: clean.relationships,
      households: clean.households,
      selectedId: null,
      status,
      epoch: get().epoch + 1,
      layoutEpoch: get().layoutEpoch + 1,
      panel: "lienzo",
    });
    get().persist();
  },

  addPerson: (input) => {
    const name = input.name.trim();
    if (!name) {
      set({ status: "Escribe un nombre." });
      return null;
    }
    const { persons, relationships, households, past, selectedId } = get();
    const { p } = nextIds(persons, relationships);
    const id = `p${p}`;
    const selected = persons.find((x) => x.id === selectedId);
    const maxX = persons.reduce((m, person) => Math.max(m, person.x), 90);
    const person = emptyPerson({
      id,
      name,
      gender: input.gender,
      age: input.age,
      deceased: input.deceased,
      identifiedPatient: Boolean(input.identifiedPatient),
      occupation: input.occupation ?? "",
      notes: input.notes ?? "",
      birthYear: input.birthYear ?? null,
      deathYear: input.deathYear ?? null,
      x: input.x ?? (selected ? selected.x + 110 : maxX + 110),
      y: input.y ?? (selected ? selected.y : persons[0]?.y ?? 90),
      generation: selected?.generation ?? 0,
    });
    set({
      past: [...past, snap({ persons, relationships, households })].slice(-40),
      future: [],
      persons: [...persons, person],
      selectedId: id,
      sidebarTab: "personas",
      status: `Añadido: ${name}`,
      epoch: get().epoch + 1,
      panel: "lienzo",
    });
    get().persist();
    return id;
  },

  updatePerson: (id, patch, opts) => {
    const { persons, relationships, households, past } = get();
    const history = opts?.history !== false;
    set({
      past: history ? [...past, snap({ persons, relationships, households })].slice(-40) : past,
      future: history ? [] : get().future,
      persons: persons.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    });
    get().persist();
  },

  removePerson: (id) => {
    const { persons, relationships, households, past } = get();
    const remaining = persons.filter((p) => p.id !== id);
    const stillUsed = new Set(remaining.map((p) => p.household).filter((n): n is number => n != null));
    set({
      past: [...past, snap({ persons, relationships, households })].slice(-40),
      future: [],
      persons: remaining,
      relationships: relationships.filter((r) => r.a !== id && r.b !== id),
      households: households.filter((h) => stillUsed.has(h.id)),
      selectedId: get().selectedId === id ? null : get().selectedId,
      status: "Persona eliminada.",
      epoch: get().epoch + 1,
    });
    get().persist();
  },

  addRelationship: (type, a, b) => {
    if (!a || !b || a === b) {
      set({ status: "Selecciona dos personas distintas." });
      return;
    }
    const { persons, relationships, households, past } = get();
    const { r } = nextIds(persons, relationships);
    const nextRels = [...relationships, { id: `r${r}`, type, a, b }];
    set({
      past: [...past, snap({ persons, relationships, households })].slice(-40),
      future: [],
      relationships: nextRels,
      persons: autoLayout(persons, nextRels),
      status: "Vínculo creado.",
      epoch: get().epoch + 1,
      layoutEpoch: get().layoutEpoch + 1,
      panel: "lienzo",
    });
    get().persist();
  },

  removeRelationship: (id) => {
    const { persons, relationships, households, past } = get();
    set({
      past: [...past, snap({ persons, relationships, households })].slice(-40),
      future: [],
      relationships: relationships.filter((r) => r.id !== id),
      status: "Vínculo eliminado.",
    });
    get().persist();
  },

  linkHousehold: (a, b) => {
    if (!a || !b || a === b) {
      set({ status: "Selecciona dos personas distintas." });
      return;
    }
    const { persons, relationships, households, past } = get();
    const pa = persons.find((p) => p.id === a);
    const pb = persons.find((p) => p.id === b);
    if (!pa || !pb) return;

    let nextHouseholds = households;
    let targetId: number;
    let droppedId: number | null = null;

    if (pa.household != null && pb.household != null && pa.household !== pb.household) {
      // Merge b's group into a's group.
      targetId = pa.household;
      droppedId = pb.household;
      nextHouseholds = households.filter((h) => h.id !== droppedId);
    } else if (pa.household != null) {
      targetId = pa.household;
    } else if (pb.household != null) {
      targetId = pb.household;
    } else {
      targetId = households.reduce((m, h) => Math.max(m, h.id), 0) + 1;
      nextHouseholds = [...households, { id: targetId, label: DEFAULT_HOUSEHOLD_LABEL }];
    }

    const nextPersons = persons.map((p) => {
      if (p.id === a || p.id === b) return { ...p, household: targetId };
      if (droppedId != null && p.household === droppedId) return { ...p, household: targetId };
      return p;
    });

    set({
      past: [...past, snap({ persons, relationships, households })].slice(-40),
      future: [],
      persons: nextPersons,
      households: nextHouseholds,
      status: "Conviven: núcleo familiar actualizado.",
      epoch: get().epoch + 1,
      panel: "lienzo",
    });
    get().persist();
  },

  setHouseholdLabel: (id, label) => {
    const { persons, relationships, households, past } = get();
    const clean = label.trim() || DEFAULT_HOUSEHOLD_LABEL;
    const exists = households.some((h) => h.id === id);
    set({
      past: [...past, snap({ persons, relationships, households })].slice(-40),
      future: [],
      households: exists
        ? households.map((h) => (h.id === id ? { ...h, label: clean } : h))
        : [...households, { id, label: clean }],
    });
    get().persist();
  },

  movePerson: (id, x, y) => {
    set({
      persons: get().persons.map((p) => (p.id === id ? { ...p, x, y } : p)),
    });
  },

  layout: () => {
    const { persons, relationships, households, past } = get();
    set({
      past: [...past, snap({ persons, relationships, households })].slice(-40),
      future: [],
      persons: autoLayout(persons, relationships),
      status: "Organizado por generaciones.",
      epoch: get().epoch + 1,
      layoutEpoch: get().layoutEpoch + 1,
    });
    get().persist();
  },

  clear: () => {
    const { persons, relationships, households, past } = get();
    set({
      past: [...past, snap({ persons, relationships, households })].slice(-40),
      future: [],
      persons: [],
      relationships: [],
      households: [],
      selectedId: null,
      status: "Lienzo vacío. Pega un texto o añade personas.",
      epoch: get().epoch + 1,
      layoutEpoch: get().layoutEpoch + 1,
    });
    get().persist();
  },
}));
