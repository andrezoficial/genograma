import { useEffect, useState } from "react";
import { Copy, FilePlus2, Trash2, X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useGenogram } from "@/lib/genogram/store";
import { cn } from "@/lib/utils";

function formatWhen(ts: number): string {
  try {
    return new Date(ts).toLocaleString("es", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function CasesPanel({ onClose }: { onClose: () => void }) {
  const cases = useGenogram((s) => s.cases);
  const caseId = useGenogram((s) => s.caseId);
  const caseName = useGenogram((s) => s.caseName);
  const renameCase = useGenogram((s) => s.renameCase);
  const newCase = useGenogram((s) => s.newCase);
  const switchCase = useGenogram((s) => s.switchCase);
  const duplicateCase = useGenogram((s) => s.duplicateCase);
  const deleteCase = useGenogram((s) => s.deleteCase);
  const [name, setName] = useState(caseName);
  const [toDelete, setToDelete] = useState<string | null>(null);

  useEffect(() => {
    setName(caseName);
  }, [caseName, caseId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && toDelete == null) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, toDelete]);

  const commitName = () => {
    const clean = name.trim();
    if (clean && clean !== caseName) renameCase(clean);
    else setName(caseName);
  };

  const target = cases.find((c) => c.id === toDelete) ?? null;

  return (
    <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose}>
      <aside
        role="dialog"
        aria-label="Casos guardados"
        className="absolute inset-y-0 right-0 flex w-[min(100vw,380px)] flex-col bg-card text-card-foreground shadow-[var(--shadow-border)] max-sm:inset-x-0 max-sm:top-auto max-sm:max-h-[85dvh] max-sm:w-full max-sm:rounded-t-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <h2 className="font-display text-lg font-medium tracking-tight">Casos</h2>
          <Button type="button" variant="ghost" size="icon" className="size-9" onClick={onClose} aria-label="Cerrar">
            <X />
          </Button>
        </header>

        <div className="space-y-2 border-b px-4 py-3">
          <label htmlFor="case-name" className="text-sm font-medium">
            Nombre del caso abierto
          </label>
          <Input
            id="case-name"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                newCase();
                onClose();
              }}
            >
              <FilePlus2 /> Nuevo caso
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => duplicateCase()}>
              <Copy /> Duplicar
            </Button>
          </div>
        </div>

        <ul className="min-h-0 flex-1 divide-y overflow-y-auto pb-[env(safe-area-inset-bottom)]">
          {cases.length === 0 ? (
            <li className="px-4 py-6 text-sm text-muted-foreground">Aún no hay casos guardados.</li>
          ) : null}
          {cases.map((c) => {
            const active = c.id === caseId;
            return (
              <li key={c.id} className={cn("flex items-center gap-1 pr-2", active && "bg-accent")}>
                <button
                  type="button"
                  className="flex min-w-0 flex-1 flex-col gap-0.5 px-4 py-3 text-left"
                  aria-current={active ? "true" : undefined}
                  onClick={() => {
                    if (!active) switchCase(c.id);
                    onClose();
                  }}
                >
                  <span className="truncate text-sm font-medium">{c.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {c.count} {c.count === 1 ? "persona" : "personas"} · {formatWhen(c.updatedAt)}
                    {active ? " · abierto" : ""}
                  </span>
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-9 text-muted-foreground"
                  disabled={cases.length <= 1}
                  title={cases.length <= 1 ? "No puedes borrar el único caso" : undefined}
                  onClick={() => setToDelete(c.id)}
                  aria-label={`Eliminar ${c.name}`}
                >
                  <Trash2 />
                </Button>
              </li>
            );
          })}
        </ul>
      </aside>

      <AlertDialog open={target != null} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este caso?</AlertDialogTitle>
            <AlertDialogDescription>
              «{target?.name}» se borra de este navegador y no se puede recuperar. Exporta un JSON antes si quieres conservarlo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (target) deleteCase(target.id);
                setToDelete(null);
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
