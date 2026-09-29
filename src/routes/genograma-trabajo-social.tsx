import { createFileRoute } from "@tanstack/react-router";
import { H2, SeoPage } from "@/components/seo-page";
import { SITE_URL } from "@/lib/seo";

const TITLE = "Genograma en trabajo social: para qué sirve y cómo usarlo | Genograma Free";
const DESCRIPTION = "Qué es el genograma en trabajo social, para qué sirve en la intervención familiar, qué información recoger y cómo hacerlo gratis online con Genograma Free.";

export const Route = createFileRoute("/genograma-trabajo-social")({
  head: () => ({
    meta: [{ title: TITLE }, { name: "description", content: DESCRIPTION }],
    links: [{ rel: "canonical", href: `${SITE_URL}/genograma-trabajo-social` }],
  }),
  component: SocialWork,
});

function SocialWork() {
  return (
    <SeoPage
      h1="El genograma en trabajo social: para qué sirve y cómo usarlo"
      intro="En trabajo social el genograma es una herramienta de valoración: permite ver la estructura familiar, las redes de apoyo y los patrones que influyen en la situación de una persona o de una familia."
      current="/genograma-trabajo-social"
    >
      <H2>Para qué sirve</H2>
      <ul className="list-disc space-y-2 pl-6">
        <li>Entender la composición del hogar y quién convive con quién.</li>
        <li>Identificar redes de apoyo y personas de referencia.</li>
        <li>Detectar patrones que se repiten entre generaciones: enfermedades, adicciones, violencia, migración.</li>
        <li>Explicar el caso a otros profesionales con una imagen clara.</li>
        <li>Planificar la intervención y hacer seguimiento de los cambios.</li>
      </ul>
      <H2>Qué información conviene recoger</H2>
      <ul className="list-disc space-y-2 pl-6">
        <li>Nombres, edades y parentescos de al menos tres generaciones.</li>
        <li>Estado de la relación de pareja: matrimonio, unión libre, separación, divorcio.</li>
        <li>Quiénes viven juntos y quién se ocupa de los cuidados.</li>
        <li>Fallecimientos y eventos relevantes, con fechas.</li>
        <li>Calidad de los vínculos: cercanos, conflictivos, distantes o rotos.</li>
      </ul>
      <H2>Consejos prácticos</H2>
      <ul className="list-disc space-y-2 pl-6">
        <li>Construye el genograma junto a la familia: conversar mientras se dibuja genera confianza.</li>
        <li>Guarda la información con confidencialidad; usa iniciales si vas a compartir el gráfico.</li>
        <li>Actualiza el genograma cuando cambie la situación familiar.</li>
      </ul>
      <p>
        Con Genograma Free puedes escribir la historia familiar con tus palabras y obtener el genograma en segundos, sin
        registrarte. Tus datos se guardan en tu dispositivo.
      </p>
    </SeoPage>
  );
}
