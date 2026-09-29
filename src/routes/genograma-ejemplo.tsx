import { createFileRoute } from "@tanstack/react-router";
import { H2, SeoPage } from "@/components/seo-page";
import { SITE_URL } from "@/lib/seo";

const TITLE = "Ejemplo de genograma familiar (tres generaciones) | Genograma Free";
const DESCRIPTION = "Mira un ejemplo de genograma familiar de tres generaciones con texto de partida, cómo se interpreta y cómo crear uno igual gratis en Genograma Free.";

export const Route = createFileRoute("/genograma-ejemplo")({
  head: () => ({
    meta: [{ title: TITLE }, { name: "description", content: DESCRIPTION }],
    links: [{ rel: "canonical", href: `${SITE_URL}/genograma-ejemplo` }],
  }),
  component: Example,
});

function Example() {
  return (
    <SeoPage
      h1="Ejemplo de genograma familiar de tres generaciones"
      intro="Ver un ejemplo ayuda a entender cómo se organiza la información. Aquí tienes una descripción familiar de partida y cómo se convierte en genograma."
      current="/genograma-ejemplo"
    >
      <H2>La descripción de la familia</H2>
      <blockquote className="border-l-4 border-border pl-4 italic">
        María, de 45 años, está casada con Juan, de 48. Tienen dos hijos: Laura, de 15, y Pedro, de 12. Adoptaron a Sofía,
        de 8. Los padres de María son Carmen y José; José falleció en 2018. María tiene una hermana, Ana, que vive en unión
        libre con Diego. María es la paciente identificada y es muy cercana a Laura; Pedro y Juan tienen una relación
        distante.
      </blockquote>
      <H2>Cómo se lee</H2>
      <ul className="list-disc space-y-2 pl-6">
        <li>Generación 1: Carmen y José (José con una X por su fallecimiento).</li>
        <li>Generación 2: María y su hermana Ana, con sus respectivas parejas, Juan y Diego.</li>
        <li>Generación 3: Laura, Pedro y Sofía (adoptada, con línea punteada).</li>
        <li>María lleva doble borde por ser la paciente identificada.</li>
        <li>Las líneas emocionales muestran la cercanía con Laura y la distancia entre Pedro y Juan.</li>
      </ul>
      <H2>Cómo crear uno igual</H2>
      <p>
        En Genograma Free pega una descripción como la de arriba y pulsa «Generar genograma»: el programa detecta personas,
        edades, parejas, hijos y relaciones, y dibuja el mapa. También puedes cargar el ejemplo integrado y editarlo a tu
        gusto, y exportar el resultado en PNG, SVG o JSON.
      </p>
    </SeoPage>
  );
}
