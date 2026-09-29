import { create } from "zustand";
import { autoLayout } from "./layout.ts";
import { parseFamilyText } from "./parser.ts";
import {
  DEFAULT_HOUSEHOLD_LABEL,
  emptyPerson,
  PARENT_TYPES,
  sanitizeGenogram,
  type Gender,
  type GenogramData,
  type Household,
  type Person,
  type RelType,
  type Relationship,
} from "./types.ts";

/** Current-document key (kept so a previous version still finds the last family). */
const LEGACY_KEY = "genograma.v3";
const LIBRARY_KEY = "genograma.library.v1";

type Snapshot = GenogramData;
export type SidebarTab = "texto" | "manual" | "personas";
export type MobilePanel = "datos" | "lienzo";

export type CaseSummary = {
  id: string;
  name: string;
  updatedAt: number;
  count: number;
};

type CaseDoc = {
  id: string;
  name: string;
  updatedAt: number;
  persons: Person[];
  relationships: Relationship[];
  households: Household[];
  draftText: string;
};

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
  caseId: string;
  caseName: string;
  draftText: string;
  cases: CaseSummary[];
  focusId: string | null;
  focusEpoch: number;
  hydrate: () => void;
  persist: () => void;
  checkpoint: () => void;
  undo: () => void;
  redo: () => void;
  select: (id: string | null) => void;
  focusPerson: (id: string) => void;
  setSidebarTab: (tab: SidebarTab) => void;
  setPanel: (panel: MobilePanel) => void;
  setDraftText: (text: string) => void;
  renameCase: (name: string) => void;
  newCase: () => void;
  switchCase: (id: string) => void;
  duplicateCase: () => void;
  deleteCase: (id: string) => void;
  loadFromText: (text: string) => { ok: boolean; message: string };
  loadData: (data: GenogramData, status: string) => void;
  addPerson: (input: NewPerson) => string | null;
  updatePerson: (id: string, patch: Partial<Person>, opts?: { history?: boolean }) => void;
  removePerson: (id: string) => void;
  addRelationship: (type: RelType, a: string, b: string) => void;
  removeRelationship: (id: string) => void;
  updateRelationshipType: (id: string, type: RelType) => void;
  linkHousehold: (a: string, b: string) => void;
  setHouseholdLabel: (id: number, label: string) => void;
  moveHouseholdLabel: (id: number, dx: number, dy: number) => void;
  movePerson: (id: string, x: number, y: number) => void;
  layout: () => void;
  clear: () => void;
};

function snap(s: { persons: Person[]; relationships: Relationship[]; households: Household[] }): Snapshot {
  return {
    persons: s.persons.map((p) => ({ ...p, conditions: [...p.conditions] })),
    relationships: s.relationships.map((r) => ({ ...r })),
    households: s.households.map((h) => ({ ...h })),
  };
}

function nextIds(persons: Person[], relationships: Relationship[]) {
  const maxP = persons.reduce((m, p) => Math.max(m, Number(p.id.replace(/\D/g, "")) || 0), 0);
  const maxR = relationships.reduce((m, r) => Math.max(m, Number(r.id.replace(/\D/g, "")) || 0), 0);
  return { p: maxP + 1, r: maxR + 1 };
}

function makeCaseId() {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function summarize(doc: CaseDoc): CaseSummary {
  return { id: doc.id, name: doc.name, updatedAt: doc.updatedAt, count: doc.persons.length };
}

function asDoc(partial: Partial<CaseDoc> & { id: string }): CaseDoc {
  const clean = sanitizeGenogram({
    persons: (partial.persons as Person[]) ?? [],
    relationships: (partial.relationships as Relationship[]) ?? [],
    households: (partial.households as Household[]) ?? [],
  });
  return {
    id: partial.id,
    name: String(partial.name ?? "").trim() || "Caso",
    updatedAt: Number(partial.updatedAt) || Date.now(),
    persons: clean.persons,
    relationships: clean.relationships,
    households: clean.households ?? [],
    draftText: String(partial.draftText ?? ""),
  };
}

function readLibrary(): { currentId: string; cases: CaseDoc[] } | null {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { currentId?: string; cases?: Partial<CaseDoc>[] };
    if (!Array.isArray(parsed.cases) || parsed.cases.length === 0) return null;
    const cases = parsed.cases.map((c, i) => asDoc({ ...c, id: String(c.id || `c${i + 1}`) }));
    const currentId = cases.some((c) => c.id === parsed.currentId) ? parsed.currentId! : cases[0]!.id;
    return { currentId, cases };
  } catch {
    return null;
  }
}

function readLegacy(): GenogramData | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GenogramData>;
    if (!Array.isArray(parsed.persons) || parsed.persons.length === 0) return null;
    return sanitizeGenogram({
      persons: parsed.persons as Person[],
      relationships: (parsed.relationships as Relationship[]) ?? [],
      households: (parsed.households as Household[]) ?? [],
    });
  } catch {
    return null;
  }
}

const DEMO = `María de 45 años está casada con Juan de 48.
Tienen dos hijos: Laura de 15 y Pedro de 12.
Los padres de María se llaman Carmen y José.
José falleció en 2018.
María tiene una hermana llamada Ana.
María es la paciente identificada.
María, Juan, Laura y Pedro viven juntos.`;

let draftTimer: ReturnType<typeof setTimeout> | null = null;

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
  caseId: "c0",
  caseName: "Ejemplo",
  draftText: "",
  cases: [],
  focusId: null,
  focusEpoch: 0,

  hydrate: () => {
    if (get().hydrated) return;
    const lib = readLibrary();
    if (lib) {
      const current = lib.cases.find((c) => c.id === lib.currentId) ?? lib.cases[0]!;
      set({
        persons: current.persons,
        relationships: current.relationships,
        households: current.households,
        caseId: current.id,
        caseName: current.name,
        draftText: current.draftText,
        cases: lib.cases.map(summarize).sort((a, b) => b.updatedAt - a.updatedAt),
        hydrated: true,
        epoch: 1,
        layoutEpoch: 1,
        status: "Documento restaurado.",
      });
      return;
    }
    const legacy = readLegacy();
    if (legacy) {
      const id = makeCaseId();
      const doc: CaseDoc = {
        id,
        name: "Mi familia",
        updatedAt: Date.now(),
        persons: legacy.persons,
        relationships: legacy.relationships,
        households: legacy.households ?? [],
        draftText: "",
      };
      try {
        localStorage.setItem(LIBRARY_KEY, JSON.stringify({ currentId: id, cases: [doc] }));
      } catch {
        /* ignore */
      }
      set({
        persons: doc.persons,
        relationships: doc.relationships,
        households: doc.households,
        caseId: id,
        caseName: doc.name,
        draftText: "",
        cases: [summarize(doc)],
        hydrated: true,
        epoch: 1,
        layoutEpoch: 1,
        status: "Documento restaurado.",
      });
      return;
    }
    const parsed = parseFamilyText(DEMO);
    const id = makeCaseId();
    set({
      persons: autoLayout(parsed.persons, parsed.relationships),
      relationships: parsed.relationships,
      households: parsed.households ?? [],
      caseId: id,
      caseName: "Ejemplo",
      draftText: DEMO,
      hydrated: true,
      epoch: 1,
      layoutEpoch: 1,
      status: "Ejemplo cargado. Edítalo o pega tu propia familia.",
    });
    get().persist();
  },

  persist: () => {
    const { persons, relationships, households, caseId, caseName, draftText } = get();
    const current: CaseDoc = {
      id: caseId,
      name: caseName,
      updatedAt: Date.now(),
      persons,
      relationships,
      households,
      draftText,
    };
    try {
      localStorage.setItem(LEGACY_KEY, JSON.stringify({ persons, relationships, households }));
      const lib = readLibrary();
      const others = (lib?.cases ?? []).filter((c) => c.id !== caseId);
      const cases = [current, ...others];
      localStorage.setItem(LIBRARY_KEY, JSON.stringify({ currentId: caseId, cases }));
      set({ cases: cases.map(summarize).sort((a, b) => b.updatedAt - a.updatedAt) });
    } catch {
      set({ status: "No se pudo guardar en este navegador. Exporta un JSON para no perder el caso." });
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

  focusPerson: (id) =>
    set({
      selectedId: id,
      sidebarTab: "personas",
      focusId: id,
      focusEpoch: get().focusEpoch + 1,
    }),

  setSidebarTab: (tab) => set({ sidebarTab: tab }),
  setPanel: (panel) => set({ panel }),

  setDraftText: (text) => {
    set({ draftText: text });
    if (draftTimer) clearTimeout(draftTimer);
    draftTimer = setTimeout(() => get().persist(), 450);
  },

  renameCase: (name) => {
    const clean = name.trim() || "Caso";
    set({ caseName: clean });
    get().persist();
  },

  newCase: () => {
    get().persist();
    const id = makeCaseId();
    set({
      past: [],
      future: [],
      persons: [],
      relationships: [],
      households: [],
      selectedId: null,
      caseId: id,
      caseName: "Caso nuevo",
      draftText: "",
      status: "Caso nuevo. Pega un texto o añade personas.",
      epoch: get().epoch + 1,
      layoutEpoch: get().layoutEpoch + 1,
      panel: "datos",
      sidebarTab: "texto",
    });
    get().persist();
  },

  switchCase: (id) => {
    if (id === get().caseId) return;
    get().persist();
    const lib = readLibrary();
    const doc = lib?.cases.find((c) => c.id === id);
    if (!doc) return;
    set({
      past: [],
      future: [],
      persons: doc.persons,
      relationships: doc.relationships,
      households: doc.households,
      selectedId: null,
      caseId: doc.id,
      caseName: doc.name,
      draftText: doc.draftText,
      status: `Abierto: ${doc.name}.`,
      epoch: get().epoch + 1,
      layoutEpoch: get().layoutEpoch + 1,
      panel: "lienzo",
    });
    get().persist();
  },

  duplicateCase: () => {
    get().persist();
    const { persons, relationships, households, caseName, draftText } = get();
    const id = makeCaseId();
    const name = `${caseName.replace(/\s*\(copia\)\s*$/i, "")} (copia)`;
    set({
      past: [],
      future: [],
      persons: persons.map((p) => ({ ...p, conditions: [...p.conditions] })),
      relationships: relationships.map((r) => ({ ...r })),
      households: households.map((h) => ({ ...h })),
      selectedId: null,
      caseId: id,
      caseName: name,
      draftText,
      status: `Copia creada: ${name}.`,
      epoch: get().epoch + 1,
      layoutEpoch: get().layoutEpoch + 1,
    });
    get().persist();
  },

  deleteCase: (id) => {
    const lib = readLibrary();
    const cases = lib?.cases ?? [];
    if (cases.length <= 1) {
      set({ status: "No puedes borrar el único caso." });
      return;
    }
    const remaining = cases.filter((c) => c.id !== id);
    if (remaining.length === cases.length) return;
    const wasCurrent = get().caseId === id;
    const next = remaining.slice().sort((a, b) => b.updatedAt - a.updatedAt)[0]!;
    try {
      localStorage.setItem(
        LIBRARY_KEY,
        JSON.stringify({ currentId: wasCurrent ? next.id : get().caseId, cases: remaining }),
      );
    } catch {
      /* ignore */
    }
    if (wasCurrent) {
      set({
        past: [],
        future: [],
        persons: next.persons,
        relationships: next.relationships,
        households: next.households,
        selectedId: null,
        caseId: next.id,
        caseName: next.name,
        draftText: next.draftText,
        cases: remaining.map(summarize).sort((a, b) => b.updatedAt - a.updatedAt),
        status: `Abierto: ${next.name}.`,
        epoch: get().epoch + 1,
        layoutEpoch: get().layoutEpoch + 1,
        panel: "lienzo",
      });
      get().persist();
    } else {
      set({
        cases: remaining.map(summarize).sort((a, b) => b.updatedAt - a.updatedAt),
        status: "Caso eliminado.",
      });
    }
  },

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
    const clean = sanitizeGenogram(data);
    const laid = autoLayout(clean.persons, clean.relationships);
    set({
      past: [...past, snap({ persons, relationships, households })].slice(-40),
      future: [],
      persons: laid,
      relationships: clean.relationships,
      households: clean.households ?? [],
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
    const directed = PARENT_TYPES.includes(type);
    const dup = relationships.some((r) => {
      if (r.type !== type) return false;
      if (directed) return r.a === a && r.b === b;
      return (r.a === a && r.b === b) || (r.a === b && r.b === a);
    });
    if (dup) {
      set({ status: "Ese vínculo ya existe." });
      return;
    }
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

  updateRelationshipType: (id, type) => {
    const { persons, relationships, households, past } = get();
    const nextRels = relationships.map((r) => (r.id === id ? { ...r, type } : r));
    set({
      past: [...past, snap({ persons, relationships, households })].slice(-40),
      future: [],
      relationships: nextRels,
      status: "Tipo de vínculo actualizado.",
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

  moveHouseholdLabel: (id, dx, dy) => {
    set({
      households: get().households.map((h) =>
        h.id === id ? { ...h, labelDx: dx, labelDy: dy } : h,
      ),
    });
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
