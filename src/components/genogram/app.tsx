import { useEffect, useRef } from "react";
import { Download, FileJson, RotateCcw, RotateCw, Trash2, UnfoldHorizontal, Upload } from "lucide-react";
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
import { boundingBox } from "@/lib/genogram/layout";
import { downloadBlob, exportPngElement, exportSvgElement } from "@/lib/genogram/export";
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

  useEffect(() => {
    hydrate();
  }, [hydrate]);

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
    const box = boundingBox(persons, 70, 800, 500);
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
    useGenogram.setState({ status: "PNG descargado." });
  }

  function onExportSvg() {
    const clone = preparedSvg();
    if (!clone) return;
    exportSvgElement(clone);
    useGenogram.setState({ status: "SVG descargado." });
  }

  function onExportJson() {
    downloadBlob(
      "genograma.json",
      new Blob([JSON.stringify({ persons, relationships }, null, 2)], { type: "application/json" }),
    );
    useGenogram.setState({ status: "JSON descargado." });
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
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 bg-bar px-3 text-bar-foreground sm:px-5">
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
            size="sm"
            className="bg-bar-foreground text-bar hover:opacity-90"
            onClick={onExportPng}
          >
            <Download /> PNG
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-10 hidden text-bar-foreground hover:bg-white/10 hover:text-bar-foreground sm:inline-flex"
            onClick={onExportJson}
            aria-label="Exportar JSON"
          >
            <FileJson />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-10 hidden text-bar-foreground hover:bg-white/10 hover:text-bar-foreground sm:inline-flex"
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
          <Credits variant="icon" />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-10 text-bar-foreground hover:bg-white/10 hover:text-bar-foreground"
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

      <nav className="grid h-12 shrink-0 grid-cols-2 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] lg:hidden">
        <button
          type="button"
          className={cn("text-sm font-medium", panel === "datos" ? "text-foreground" : "text-muted-foreground")}
          onClick={() => setPanel("datos")}
        >
          Datos
        </button>
        <button
          type="button"
          className={cn("text-sm font-medium", panel === "lienzo" ? "text-foreground" : "text-muted-foreground")}
          onClick={() => setPanel("lienzo")}
        >
          Lienzo
        </button>
      </nav>
    </div>
  );
}
