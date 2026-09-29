# Genograma Free → Google Play Store

La app es una web (PWA) publicada en Vercel. Para Play Store se empaqueta como
**Trusted Web Activity (TWA)**: una app Android que abre tu sitio en pantalla
completa. Los cambios que publiques en Vercel se ven en la app sin volver a subirla.

## Antes de empezar
- Cuenta de Google Play Console (pago único de US$25).
- La app desplegada con HTTPS y dominio fijo (ej. `tramas.tudominio.com`).
  Si es un `*.vercel.app`, también sirve, pero un dominio propio es más estable.
- Node 18+ y Java 17 en tu computador.
- Cuentas personales nuevas: Google exige **prueba cerrada con 12 testers durante 14 días** antes de publicar en producción.

## Pasos
1. **Despliega** esta versión en Vercel y comprueba que abren:
   `/manifest.webmanifest`, `/icons/icon-512.png` y `/privacidad.html`.
2. (Ya hecho) El correo de contacto en `public/privacidad.html` es andrezoficialdev@gmail.com.
3. En `android/twa-manifest.json` reemplaza `genograma-rosy.vercel.app` por tu dominio (5 veces).
4. Instala y ejecuta Bubblewrap:
   ```bash
   npm i -g @bubblewrap/cli
   cd android
   bubblewrap init --manifest=https://genograma-rosy.vercel.app/manifest.webmanifest
   bubblewrap build
   ```
   (Te pedirá crear el keystore: **guárdalo y anota las contraseñas; si lo pierdes no podrás actualizar la app**.)
   Resultado: `app-release-bundle.aab`.
5. En Play Console → crea la app → sube el `.aab` (prueba interna/cerrada primero).
   Activa **Play App Signing**; en *Integridad de la app* copia la huella **SHA-256** del certificado de firma.
6. Pega esa huella en `public/.well-known/assetlinks.json` (y el `package_name` debe coincidir con `com.genogramafree.app`), vuelve a desplegar y verifica que abra en
   `https://genograma-rosy.vercel.app/.well-known/assetlinks.json`.
   Sin esto la app muestra una barra de URL del navegador.
7. Completa la ficha (abajo) y envía a revisión.

## Ficha de Play Store (borrador)
- **Nombre:** Genograma Free: Crear Online
- **Descripción corta (80):** Crea y exporta genogramas familiares de forma rápida y clara.
- **Descripción larga:** Genograma Free es una herramienta para psicólogos y trabajadores sociales que permite construir, editar y exportar genogramas. Describe a la familia con tus palabras o dibuja el mapa persona por persona, ajusta vínculos y símbolos, y exporta en imagen o archivo. Tus datos se guardan en tu dispositivo.
- **Ícono:** `public/icons/playstore-icon-512.png`
- **Categoría:** Salud y bienestar (o Productividad)
- Faltan: gráfico de funciones 1024×500 y 2–8 capturas de pantalla del celular.
- **Política de privacidad:** `https://genograma-rosy.vercel.app/privacidad.html`
- **Seguridad de los datos:** no se recopilan datos en servidores propios; el texto de «Generar con IA» se envía a un proveedor de IA de terceros para procesarlo. Decláralo en el formulario.
- Clasificación de contenido: cuestionario de Play Console (probablemente «Para todos»).

## Notas
- `genograma.v3` sigue siendo la clave de almacenamiento, para no perder los datos de quien ya usa la app.
- Modo sin conexión: `public/sw.js` guarda la app la primera vez que se abre con internet. Después abre sin conexión y tus datos siguen ahí. "Generar con IA" sí necesita internet; "Generar genograma" (análisis local) no. Si publicas una versión nueva, la app la recoge la siguiente vez que haya conexión.
- Si prefieres no usar la terminal: https://www.pwabuilder.com genera el mismo paquete Android pegando tu URL.

---

# SEO (que Google te encuentre)

Ya está hecho en el código: título y descripción optimizados, etiqueta canónica, datos estructurados
(WebApplication y FAQ), `robots.txt`, `sitemap.xml` y una página de contenido real en `/guia-genograma`
("cómo hacer un genograma", símbolos, preguntas frecuentes) enlazada desde la app.

## Lo que te toca
1. **Dominio:** cambia `genograma-rosy.vercel.app` en `src/lib/seo.ts`, `public/robots.txt` y `public/sitemap.xml`.
   Un dominio con la palabra clave (ej. `genogramafree.com`) ayuda bastante.
2. Publica y entra a **Google Search Console** → agrega tu dominio → *Sitemaps* → envía `sitemap.xml`
   → en *Inspección de URL* pide indexar `/` y `/guia-genograma`.
3. Haz lo mismo en **Bing Webmaster Tools** (importa desde Search Console).
4. Ficha de Play Store: usa "genograma" en la descripción larga varias veces, de forma natural. Play Store también posiciona en Google.
5. Consigue enlaces: perfil de Instagram, universidades o colegios de psicología, blogs de trabajo social.
6. Añade más páginas de contenido con el tiempo (ej. "genograma ejemplo", "simbología del genograma", "genograma para trabajo social"): cada una es una oportunidad de aparecer en búsquedas distintas.

Nadie puede garantizar la posición en Google; con un sitio nuevo suele tardar semanas en aparecer.
