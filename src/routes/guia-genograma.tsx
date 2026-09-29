import { createFileRoute, Link } from "@tanstack/react-router";
import { RELATED } from "@/components/seo-page";
import { SITE_NAME, SITE_URL } from "@/lib/seo";

const TITLE = "Cómo hacer un genograma familiar paso a paso (con símbolos) | Genograma Free";
const DESCRIPTION =
  "Aprende qué es un genograma, cómo hacerlo paso a paso, qué significan sus símbolos y ejemplos de uso en psicología y trabajo social. Crea el tuyo gratis online.";

const FAQ = [
  {
    q: "¿Qué es un genograma?",
    a: "Es una representación gráfica de la familia que muestra al menos tres generaciones, sus vínculos afectivos, eventos importantes y patrones de relación. Se usa en psicología, terapia familiar, trabajo social y medicina familiar.",
  },
  {
    q: "¿Cómo se hace un genograma paso a paso?",
    a: "Empieza por la pareja o la persona índice, añade a sus hijos, padres y hermanos, marca los vínculos (matrimonio, separación, convivencia), incorpora fechas y eventos relevantes y, por último, representa la calidad de las relaciones entre los miembros.",
  },
  {
    q: "¿Qué símbolos se usan en un genograma?",
    a: "Los hombres se dibujan con un cuadrado y las mujeres con un círculo. Una X indica fallecimiento, una línea continua une a las parejas y una línea cortada indica separación o divorcio. Los hijos cuelgan de la línea de la pareja.",
  },
  {
    q: "¿Genograma Free es gratis?",
    a: "Sí. Puedes crear, editar y exportar tu genograma en PNG, SVG o JSON sin registro. Tus datos se guardan en tu propio dispositivo.",
  },
];

export const Route = createFileRoute("/guia-genograma")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/guia-genograma` }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQ.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }),
      },
    ],
  }),
  component: Guide,
});

function Guide() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10 leading-relaxed">
      <nav className="mb-8 text-sm">
        <Link to="/" className="underline underline-offset-4">
          ← Crear mi genograma
        </Link>
      </nav>
      <h1 className="font-display text-3xl font-semibold italic">Cómo hacer un genograma familiar</h1>
      <p className="mt-4 text-muted-foreground">
        Guía práctica para psicólogos, trabajadores sociales y estudiantes. Con {SITE_NAME} puedes aplicar todo esto en
        minutos, gratis y sin registrarte.
      </p>

      <h2 className="font-display mt-10 text-2xl font-semibold">¿Qué es un genograma?</h2>
      <p className="mt-3">{FAQ[0]!.a}</p>

      <h2 className="font-display mt-10 text-2xl font-semibold">Cómo hacer un genograma paso a paso</h2>
      <ol className="mt-3 list-decimal space-y-2 pl-6">
        <li>Define a la persona índice (el consultante) y dibújala con un doble borde.</li>
        <li>Añade a su pareja, hijos, padres y hermanos, ordenando los hermanos del mayor al menor.</li>
        <li>Une a las parejas con la línea de vínculo que corresponda: matrimonio, unión libre, separación o divorcio.</li>
        <li>Escribe nombres, edades y fechas clave; marca los fallecimientos con una X.</li>
        <li>Agrega la calidad de las relaciones: cercana, conflictiva, distante o cortada.</li>
        <li>Anota eventos y patrones: enfermedades, adicciones, migraciones o violencia.</li>
      </ol>

      <h2 className="font-display mt-10 text-2xl font-semibold">Símbolos básicos del genograma</h2>
      <ul className="mt-3 list-disc space-y-2 pl-6">
        <li>Cuadrado: hombre. Círculo: mujer.</li>
        <li>X sobre la figura: persona fallecida.</li>
        <li>Línea continua entre figuras: matrimonio o pareja.</li>
        <li>Línea cortada: separación; dos rayas cruzadas: divorcio.</li>
        <li>Líneas de relación: unión estrecha, conflicto o distanciamiento.</li>
      </ul>

      <h2 className="font-display mt-10 text-2xl font-semibold">Preguntas frecuentes</h2>
      <div className="mt-3 space-y-5">
        {FAQ.map((f) => (
          <section key={f.q}>
            <h3 className="font-semibold">{f.q}</h3>
            <p className="mt-1">{f.a}</p>
          </section>
        ))}
      </div>

      <aside className="mt-10 text-sm">
        <p className="font-semibold">Más sobre genogramas</p>
        <ul className="mt-2 space-y-1">
          {RELATED.filter((r) => r.to !== "/guia-genograma").map((r) => (
            <li key={r.to}>
              <a href={r.to} className="underline underline-offset-4">
                {r.label}
              </a>
            </li>
          ))}
        </ul>
      </aside>

      <p className="mt-12">
        <Link to="/" className="rounded-md bg-primary px-4 py-3 text-primary-foreground">
          Crear mi genograma gratis
        </Link>
      </p>
    </main>
  );
}
