import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Nombres de archivos con hash (/assets/index-AbC123.js) que aparecen en un HTML. */
export function assetsOf(html: string): Set<string> {
  return new Set(html.match(/\/assets\/[\w.-]+\.(?:js|css)/g) ?? []);
}

/** True si la página recién pedida usa archivos que la página abierta no tiene. */
export function hasNewAssets(current: Set<string>, fresh: Set<string>): boolean {
  if (current.size === 0 || fresh.size === 0) return false;
  for (const f of fresh) if (!current.has(f)) return true;
  return false;
}

/**
 * Avisa cuando hay una versión nueva publicada y deja actualizar con un toque. Revisa al volver a la
 * pestaña o app, al restaurar la página desde memoria y cada 5 minutos. Los datos del genograma
 * están guardados en el dispositivo, así que actualizar no los pierde.
 */
export function UpdateBanner() {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    const current = assetsOf(document.documentElement.outerHTML);
    if (current.size === 0) return; // desarrollo: no hay archivos con hash
    let last = 0;

    async function check(force = false) {
      if (document.visibilityState !== "visible") return;
      if (!force && Date.now() - last < 60_000) return;
      last = Date.now();
      try {
        const res = await fetch(window.location.pathname, { cache: "no-store", headers: { Accept: "text/html" } });
        if (!res.ok) return;
        if (hasNewAssets(current, assetsOf(await res.text()))) setStale(true);
      } catch {
        /* sin conexión: se intenta más tarde */
      }
    }

    const onVisible = () => void check();
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) void check(true);
    };
    void check();
    const timer = setInterval(onVisible, 5 * 60_000);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("pageshow", onShow);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("pageshow", onShow);
    };
  }, []);

  if (!stale) return null;
  return (
    <div className="flex shrink-0 items-center justify-between gap-3 bg-primary px-3 py-2 text-sm text-primary-foreground" role="status">
      <span>Hay una versión nueva de la app.</span>
      <Button type="button" size="sm" variant="secondary" onClick={() => window.location.reload()}>
        <RefreshCw /> Actualizar
      </Button>
    </div>
  );
}
