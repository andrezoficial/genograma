import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

export const RELATED = [
  { to: "/guia-genograma", label: "Cómo hacer un genograma paso a paso" },
  { to: "/simbologia-genograma", label: "Simbología del genograma" },
  { to: "/genograma-ejemplo", label: "Ejemplo de genograma familiar" },
  { to: "/genograma-trabajo-social", label: "Genograma en trabajo social" },
] as const;

/** Estructura común de las páginas de contenido (una sola h1, enlaces internos y llamada a la acción). */
export function SeoPage({ h1, intro, current, children }: { h1: string; intro: string; current: string; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10 leading-relaxed">
      <nav className="mb-8 text-sm">
        <Link to="/" className="underline underline-offset-4">
          ← Crear mi genograma
        </Link>
      </nav>
      <h1 className="font-display text-3xl font-semibold italic">{h1}</h1>
      <p className="mt-4 text-muted-foreground">{intro}</p>
      <div className="mt-6 space-y-4">{children}</div>
      <p className="mt-12">
        <Link to="/" className="rounded-md bg-primary px-4 py-3 text-primary-foreground">
          Crear mi genograma gratis
        </Link>
      </p>
      <aside className="mt-12 border-t border-border pt-6 text-sm">
        <p className="font-semibold">Más sobre genogramas</p>
        <ul className="mt-2 space-y-1">
          {RELATED.filter((r) => r.to !== current).map((r) => (
            <li key={r.to}>
              <a href={r.to} className="underline underline-offset-4">
                {r.label}
              </a>
            </li>
          ))}
        </ul>
      </aside>
    </main>
  );
}

export const H2 = ({ children }: { children: ReactNode }) => (
  <h2 className="font-display mt-8 text-2xl font-semibold">{children}</h2>
);
