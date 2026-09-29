import { useEffect, useRef, useState } from "react";
import { ClipboardList, Download, FileJson, FileText, MoreVertical, Network, RotateCcw, RotateCw, Trash2, UnfoldHorizontal, Upload } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { boundingBox } from "@/lib/genogram/layout";
import { buildReportSvg, downloadBlob, exportPngElement, exportSvgElement, type ReportMeta } from "@/lib/genogram/export";
import { useGenogram } from "@/lib/genogram/store";
import { cn } from "@/lib/utils";
import { GenogramCanvas } from "./canvas";
import { Credits } from "./credits";
import { Sidebar } from "./sidebar";

export function GenogramApp() {
  const hydrate = useGenogram((s) => s.hydrate);
  const hydrated = useGenogram((s) => s.hydrated);
  const persons = useGenogram((s) => s.persons);
  const relationships = useGenogram((s) => s.relationships);
  const households = useGenogram((s) => s.households);
  const layout = useGenogram((s) => s.layout);
  const undo = useGenogram((s) => s.undo);
  const redo = useGenogram((s) => s.redo);
  const clear = useGenogram((s) => s.clear);
  const loadData = useGenogram((s) => s.loadData);
  const select = useGenogram((s) => s.select);
  const selectedId = useGenogram((s) => s.selectedId);
  const removePerson = useGenogram((s) => s.removePerson);
  const past = useGenogram((s) => s.past);
  const future = useGenogram((s) => s.future);
  const panel = useGenogram((s) => s.panel);
  const setPanel = useGenogram((s) => s.setPanel);
  const svgRef = useRef<SVGSVGElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const selected = persons.find((p) => p.id === selectedId) ?? null;
  const [reportOpen, setReportOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const status = useGenogram((s) => s.status);
  const [toast, setToast] = useState<string | null>(null);
  const [reportMeta, setReportMeta] = useState<ReportMeta>({
    title: "",
    professional: "",
    date: new Date().toISOString().slice(0, 10),
    notes: "",
  });

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // En el celular la barra de estado del panel "Datos" queda oculta: mostramos los avisos sobre el lienzo.
  useEffect(() => {
    if (!status || status === "Listo.") return;
    setToast(status);
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [status]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (typing) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        removePerson(selectedId);
      }
      if (e.key === "Escape") select(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, selectedId, removePerson, select]);

  function preparedSvg() {
    const svg = svgRef.current;
    if (!svg || persons.length === 0) return null;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const world = clone.querySelector("[data-world]") as SVGGElement | null;
    world?.removeAttribute("transform");
    const box = boundingBox(persons, 70, 800, 500, households);
    clone.setAttribute("viewBox", `${box.minX} ${box.minY} ${box.width} ${box.height}`);
    clone.setAttribute("width", String(Math.round(box.width)));
    clone.setAttribute("height", String(Math.round(box.height)));
    const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bg.setAttribute("x", String(box.minX));
    bg.setAttribute("y", String(box.minY));
    bg.setAttribute("width", String(box.width));
    bg.setAttribute("height", String(box.height));
    bg.setAttribute("fill", "#f3ece1");
    clone.insertBefore(bg, clone.firstChild);
    return clone;
  }

  async function onExportPng() {
    const clone = preparedSvg();
    if (!clone) return;
    await exportPngElement(clone);
    useGenogram.setState({ status: "PNG listo." });
  }

  function onExportSvg() {
    const clone = preparedSvg();
    if (!clone) return;
    exportSvgElement(clone);
    useGenogram.setState({ status: "SVG listo." });
  }

  async function onExportReport() {
    const svg = svgRef.current;
    if (!svg || persons.length === 0) return;
    const box = boundingBox(persons, 70, 800, 500, households);
    const reportSvg = buildReportSvg(svg, box, reportMeta);
    document.body.appendChild(reportSvg);
    const filenameBase = (reportMeta.title || "genograma-informe").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
    await exportPngElement(reportSvg, `${filenameBase || "genograma-informe"}.png`);
    reportSvg.remove();
    setReportOpen(false);
    useGenogram.setState({ status: "Informe listo." });
  }

  function onExportJson() {
    downloadBlob(
      "genograma.json",
      new Blob([JSON.stringify({ persons, relationships }, null, 2)], { type: "application/json" }),
    );
    useGenogram.setState({ status: "JSON listo." });
  }

  function onImportJson(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as { persons?: unknown; relationships?: unknown };
        if (!Array.isArray(parsed.persons)) throw new Error("invalid");
        loadData(
          { persons: parsed.persons as typeof persons, relationships: (parsed.relationships as typeof relationships) ?? [] },
          "Archivo importado.",
        );
      } catch {
        useGenogram.setState({ status: "No se pudo leer ese JSON." });
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-background">
      <header className="flex h-[calc(3rem+env(safe-area-inset-top))] shrink-0 items-center justify-between gap-3 bg-bar px-3 pt-[env(safe-area-inset-top)] text-bar-foreground sm:px-5">
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className="font-display text-lg leading-none font-medium italic tracking-tight">Genograma</h1>
          <p className="hidden text-xs tracking-wide text-bar-foreground/55 sm:block">ficha familiar</p>
          <span className="hidden h-3 w-px bg-bar-foreground/20 md:block" aria-hidden />
          <Credits variant="bar" />
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-10 text-bar-foreground hover:bg-white/10 hover:text-bar-foreground"
            disabled={past.length === 0}
            onClick={undo}
            aria-label="Deshacer"
          >
            <RotateCcw />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-10 text-bar-foreground hover:bg-white/10 hover:text-bar-foreground"
            disabled={future.length === 0}
            onClick={redo}
            aria-label="Rehacer"
          >
            <RotateCw />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="hidden text-bar-foreground hover:bg-white/10 hover:text-bar-foreground sm:inline-flex"
            onClick={layout}
          >
            <UnfoldHorizontal /> Organizar
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-10 text-bar-foreground hover:bg-white/10 hover:text-bar-foreground sm:hidden"
            onClick={layout}
            aria-label="Organizar"
          >
            <UnfoldHorizontal />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="hidden text-bar-foreground hover:bg-white/10 hover:text-bar-foreground md:inline-flex"
            onClick={onExportSvg}
          >
            <Download /> SVG
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={persons.length === 0}
            className="hidden text-bar-foreground hover:bg-white/10 hover:text-bar-foreground md:inline-flex"
            onClick={() => setReportOpen(true)}
          >
            <ClipboardList /> Informe
          </Button>
          <Button
            type="button"
            size="sm"
            className="bg-bar-foreground text-bar hover:opacity-90 max-sm:size-10 max-sm:px-0"
            onClick={onExportPng}
            aria-label="Descargar PNG"
          >
            <Download /> <span className="hidden sm:inline">PNG</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="hidden size-10 text-bar-foreground hover:bg-white/10 hover:text-bar-foreground md:inline-flex"
            onClick={onExportJson}
            aria-label="Exportar JSON"
          >
            <FileJson />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="hidden size-10 text-bar-foreground hover:bg-white/10 hover:text-bar-foreground md:inline-flex"
            onClick={() => fileRef.current?.click()}
            aria-label="Importar JSON"
          >
            <Upload />
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImportJson(f);
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-10 text-bar-foreground hover:bg-white/10 hover:text-bar-foreground md:hidden"
            onClick={() => setMenuOpen(true)}
            aria-label="Más opciones"
          >
            <MoreVertical />
          </Button>
          <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="hidden size-10 text-bar-foreground hover:bg-white/10 hover:text-bar-foreground md:inline-flex"
                aria-label="Limpiar"
              >
                <Trash2 />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Vaciar el genograma?</AlertDialogTitle>
                <AlertDialogDescription>Se quitan todas las personas y vínculos de este documento. Puedes deshacerlo después.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={clear}>Vaciar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className={cn("min-h-0 lg:flex lg:w-[320px] lg:shrink-0", panel === "datos" ? "flex h-full" : "hidden")}>
          <Sidebar />
        </div>
        <div className={cn("relative min-h-0 min-w-0 flex-1 flex-col", panel === "lienzo" ? "flex" : "hidden lg:flex")}>
          {hydrated ? <GenogramCanvas svgRef={svgRef} /> : <div className="flex-1 bg-paper" />}
          {toast && panel === "lienzo" ? (
            <div
              className={cn(
                "pointer-events-none absolute right-3 left-3 z-20 rounded-lg bg-bar px-3 py-2 text-center text-xs font-medium text-bar-foreground shadow-[var(--shadow-border)] lg:hidden",
                selected ? "bottom-24" : "bottom-3",
              )}
              role="status"
            >
              {toast}
            </div>
          ) : null}
          {selected && panel === "lienzo" ? (
            <div className="absolute right-3 bottom-3 left-3 z-20 rounded-xl bg-card p-3 shadow-[var(--shadow-border)] lg:hidden">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{selected.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {selected.gender === "female" ? "Mujer" : selected.gender === "male" ? "Hombre" : "Género desconocido"}
                    {selected.age != null ? ` · ${selected.age} años` : ""}
                    {selected.deceased ? " · fallecido/a" : ""}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    useGenogram.getState().setSidebarTab("personas");
                    setPanel("datos");
                  }}
                >
                  Editar
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {menuOpen ? (
        <div className="fixed inset-0 z-40 bg-black/30 md:hidden" onClick={() => setMenuOpen(false)}>
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-card p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[var(--shadow-border)]"
            onClick={(e) => e.stopPropagation()}
          >
            {(
              [
                [Download, "Descargar SVG", () => onExportSvg(), false],
                [ClipboardList, "Informe clínico", () => setReportOpen(true), persons.length === 0],
                [FileJson, "Exportar JSON", () => onExportJson(), false],
                [Upload, "Importar JSON", () => fileRef.current?.click(), false],
                [Trash2, "Vaciar genograma", () => setClearOpen(true), false],
              ] as const
            ).map(([Icon, label, action, disabled]) => (
              <button
                key={label}
                type="button"
                disabled={disabled}
                className="flex h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-base disabled:opacity-40"
                onClick={() => {
                  setMenuOpen(false);
                  action();
                }}
              >
                <Icon className="size-5 text-muted-foreground" /> {label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {reportOpen ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4" onClick={() => setReportOpen(false)}>
          <form
            className="w-full max-w-sm rounded-xl bg-card p-4 shadow-[var(--shadow-border)]"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              onExportReport();
            }}
          >
            <p className="font-display text-lg font-medium tracking-tight">Informe clínico</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Genera una imagen lista para el expediente: título, profesional, fecha y leyenda completa incluidos.
            </p>
            <label className="mt-3 block text-xs font-medium tracking-wide text-muted-foreground">
              Título del caso
              <Input
                className="mt-1.5"
                placeholder="Ficha familiar — Familia XX"
                value={reportMeta.title}
                onChange={(e) => setReportMeta((m) => ({ ...m, title: e.target.value }))}
              />
            </label>
            <label className="mt-3 block text-xs font-medium tracking-wide text-muted-foreground">
              Profesional
              <Input
                className="mt-1.5"
                placeholder="Nombre del/de la profesional"
                value={reportMeta.professional}
                onChange={(e) => setReportMeta((m) => ({ ...m, professional: e.target.value }))}
              />
            </label>
            <label className="mt-3 block text-xs font-medium tracking-wide text-muted-foreground">
              Fecha
              <Input
                type="date"
                className="mt-1.5"
                value={reportMeta.date}
                onChange={(e) => setReportMeta((m) => ({ ...m, date: e.target.value }))}
              />
            </label>
            <label className="mt-3 block text-xs font-medium tracking-wide text-muted-foreground">
              Notas breves (opcional)
              <Textarea
                className="mt-1.5"
                rows={2}
                placeholder="Motivo de consulta, observación clínica…"
                value={reportMeta.notes}
                onChange={(e) => setReportMeta((m) => ({ ...m, notes: e.target.value }))}
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setReportOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">
                <Download /> Descargar informe
              </Button>
            </div>
          </form>
        </div>
      ) : null}

      <nav className="grid shrink-0 grid-cols-2 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] lg:hidden">
        {(
          [
            ["datos", "Datos", FileText],
            ["lienzo", "Lienzo", Network],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            className={cn(
              "flex h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium",
              panel === id ? "text-foreground" : "text-muted-foreground",
            )}
            onClick={() => setPanel(id)}
            aria-current={panel === id}
          >
            <Icon className="size-5" />
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
