# Rediseño visual — resumen para el equipo

Cambios aplicados pensando en uso clínico (psicología / trabajo social). Ningún
cambio toca autenticación, base de datos ni la lógica de generación con IA.

## 1. Paleta (`src/styles.css`)
- `--color-male`, `--color-female`, `--color-unknown`, `--color-deceased` se
  oscurecieron/saturaron para que se distingan también en fotocopia o PDF en
  blanco y negro (algo habitual en expedientes clínicos).
- Nuevo token `--color-ip-ring` para el anillo de "paciente identificado".

## 2. Nodos de persona (`src/components/genogram/canvas.tsx` → `PersonMark`)
- Nombre en negrita 700 (antes 600) para escanear el árbol más rápido.
- Edad/años en mayúsculas pequeñas con más peso, como etiqueta secundaria.
- El anillo de "paciente identificado" ya no comparte color con la selección
  (antes ambos usaban el verde de acento); ahora usa un color propio
  (`#8a5a3c`, terracota) con trazo discontinuo, inequívoco en pantalla e
  impreso.
- La "×" de fallecido pasa a tinta (`INK`) para mantener contraste sobre el
  nuevo relleno, más oscuro, de "fallecido".

## 3. Leyenda (`canvas.tsx`, dentro de `GenogramCanvas`)
- Ahora es plegable (antes ocupaba espacio fijo y podía tapar el lienzo).
- Se amplió: antes solo cubría género/fallecido/matrimonio/hijos. Ahora
  incluye también adopción, paciente identificado y los 4 vínculos emocionales
  (cercana, distante, corte, conflicto) — el estándar Bowen/McGoldrick que
  un profesional espera poder leer directamente en el mapa.

## 4. Modo "Informe clínico" (nuevo)
- Nuevo botón **Informe** junto a SVG/PNG en la barra superior
  (`src/components/genogram/app.tsx`).
- Abre un formulario breve: título del caso, profesional, fecha, notas
  opcionales.
- Genera un PNG de alta resolución con encabezado (título + profesional +
  fecha + notas), el genograma completo y una leyenda impresa al pie, listo
  para adjuntar a un expediente — sin la barra de herramientas de edición.
- Lógica de construcción del SVG del informe en
  `src/lib/genogram/export.ts` → `buildReportSvg`.

## Pendiente / sugerido para una siguiente vuelta
- Persistir metadatos del informe (título/profesional) por documento en la
  base de datos, en vez de reintroducirlos cada vez.
- Exportar el informe también como PDF (hoy es PNG de alta resolución).
- Revisar accesibilidad de color para daltonismo (deuteranopía) en
  hombre/mujer — hoy se distinguen por forma + color, lo cual ya cubre el
  caso más común, pero conviene testear.
