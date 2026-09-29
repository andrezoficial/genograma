import { createFileRoute } from "@tanstack/react-router";
import { H2, SeoPage } from "@/components/seo-page";
import { SITE_URL } from "@/lib/seo";

const TITLE = "Simbología del genograma: significado de cada símbolo | Genograma Free";
const DESCRIPTION = "Todos los símbolos del genograma explicados: hombre, mujer, fallecimiento, matrimonio, divorcio, hijos, adopción y tipos de relación. Crea el tuyo gratis online.";

export const Route = createFileRoute("/simbologia-genograma")({
  head: () => ({
    meta: [{ title: TITLE }, { name: "description", content: DESCRIPTION }],
    links: [{ rel: "canonical", href: `${SITE_URL}/simbologia-genograma` }],
  }),
  component: Symbols,
});

function Symbols() {
  return (
    <SeoPage
      h1="Simbología del genograma: qué significa cada símbolo"
      intro="Un genograma se lee como un mapa: cada figura y cada línea tienen un significado. Esta es la simbología básica que se usa en psicología, terapia familiar y trabajo social."
      current="/simbologia-genograma"
    >
      <H2>Personas</H2>
      <ul className="list-disc space-y-2 pl-6">
        <li>Cuadrado: hombre. Círculo: mujer.</li>
        <li>Figura con doble borde: persona índice o paciente identificado.</li>
        <li>X sobre la figura: persona fallecida; se suele anotar el año y la edad.</li>
        <li>Rombo o figura distinta: persona de género no binario o sin dato de género.</li>
        <li>Figura de trazo punteado: embarazo o aborto, según se indique en la leyenda.</li>
      </ul>
      <H2>Vínculos de pareja</H2>
      <ul className="list-disc space-y-2 pl-6">
        <li>Línea continua entre dos figuras: matrimonio.</li>
        <li>Línea discontinua: unión libre o convivencia sin matrimonio.</li>
        <li>Una barra (/) sobre la línea: separación.</li>
        <li>Dos barras (//) sobre la línea: divorcio.</li>
      </ul>
      <H2>Hijos y hermanos</H2>
      <ul className="list-disc space-y-2 pl-6">
        <li>Los hijos cuelgan de la línea de la pareja, ordenados de mayor a menor de izquierda a derecha.</li>
        <li>Los hijos adoptivos se unen con una línea punteada.</li>
        <li>Los gemelos salen de un mismo punto de la línea de la pareja.</li>
      </ul>
      <H2>Convivencia y relaciones emocionales</H2>
      <ul className="list-disc space-y-2 pl-6">
        <li>Un contorno que agrupa figuras indica quiénes viven en el mismo hogar.</li>
        <li>Línea doble o gruesa: vínculo muy cercano.</li>
        <li>Línea en zigzag: relación conflictiva.</li>
        <li>Línea de puntos: relación distante.</li>
        <li>Línea cortada con una barra: ruptura o corte de la relación.</li>
      </ul>
      <p>
        No existe un estándar único: algunos autores usan variantes. Lo importante es incluir una leyenda en tu genograma
        para que quien lo lea entienda los símbolos. Genograma Free dibuja los símbolos por ti y genera la leyenda.
      </p>
    </SeoPage>
  );
}
