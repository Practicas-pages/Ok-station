# OK.station — Integración en WordPress + Elementor

Esta guía publica el diseño estático (HTML/CSS/JS) dentro de WordPress usando
Elementor, **sin perder nada** del diseño ni de la interactividad.

Estrategia: un **child theme** encola `styles.css` y `app.js` y mete el SEO;
el **marcado** se pega en un único **widget HTML** de Elementor sobre una
plantilla en blanco (Canvas).

---

## Requisitos
- WordPress con el plugin **Elementor** (gratuito basta).
- Tema **Hello Elementor** instalado (es el recomendado para Elementor).
  > Si usas otro tema (Astra, GeneratePress…), abre
  > `okstation-child/style.css` y cambia la línea `Template:` por el
  > slug de tu tema padre.

---

## Paso 1 — Instalar el child theme
1. Copia `styles.css` y `app.js` (de la raíz del proyecto) dentro de:
   `okstation-child/assets/okstation/`
   (ver `LEEME.txt` en esa carpeta).
2. Comprime la carpeta **`okstation-child`** en un `.zip`.
3. En WordPress: **Apariencia → Temas → Añadir nuevo → Subir tema** → sube el zip.
4. **Activa** "OK.station Child".

> Alternativa por FTP: sube la carpeta `okstation-child` a
> `wp-content/themes/` y actívala.

Con esto ya se cargan Poppins, `styles.css`, `app.js` (con `defer`) y el
SEO/JSON-LD en la portada — todo automático.

---

## Paso 2 — Crear la página con plantilla en blanco
1. **Páginas → Añadir nueva**. Título: `Inicio` (o el que quieras).
2. En **Atributos de página → Plantilla**, elige **Elementor Canvas**
   (lienzo en blanco, sin header/footer del tema; usamos el del diseño).
3. Pulsa **Editar con Elementor**.

---

## Paso 3 — Pegar el marcado en un widget HTML
1. Arrastra el widget **HTML** al lienzo (búscalo en el panel izquierdo).
2. Abre tu `index.html` y copia **todo lo que está entre `<body …>` y `</body>`**,
   con **dos ajustes**:
   - **Quita** la última línea: `<script src="app.js" defer></script>`
     (ya lo encola el child theme).
   - **Añade al inicio** del contenido esta línea (el ancla que usan el logo
     y el botón "volver arriba"):
     ```html
     <a id="top"></a>
     ```
   > NO copies `<!DOCTYPE>`, `<head>`, ni las etiquetas `<html>`/`<body>`:
   > de eso se encarga WordPress.
3. Pega ese bloque en el widget HTML y pulsa **Actualizar**.

---

## Paso 4 — Marcar como página de inicio
**Ajustes → Lectura → Tu página de inicio muestra → Una página estática →
Página de inicio:** selecciona la página que creaste. Guarda.

(Esto hace que el SEO/JSON-LD del child theme se aplique correctamente,
porque está condicionado a `is_front_page()`.)

---

## Paso 5 — Datos pendientes (bloques `EDITAR`)
Edita directo en el widget HTML:
- **Reseñas reales** (hay 3 de ejemplo marcadas).
- **Horarios** y **redes sociales** reales (footer + puedes añadirlos al
  JSON-LD en `functions.php`: `openingHoursSpecification` y `sameAs`).
- **Imágenes** del local en la galería: sube tus fotos a
  **Medios**, copia su URL y reemplaza cada `div.store-gallery__placeholder`
  por:
  ```html
  <img src="URL-DE-TU-IMAGEN" alt="Descripción real" loading="lazy" decoding="async" width="800" height="600">
  ```
- **Favicon:** Apariencia → Personalizar → Identidad del sitio → Icono.
- **og-image** (1200×630): súbela a Medios y actualiza la URL en `functions.php`.

---

## Paso 6 — Verificación
- Abre la página y prueba: menú móvil, wizard de citas, subir fotos, FAQ.
- Recarga sin caché: `Ctrl + Shift + R`.
- SEO: pega la URL en el **Test de resultados enriquecidos de Google**
  para validar el JSON-LD (LocalBusiness).
- Rendimiento/accesibilidad: pasa **Lighthouse** (DevTools → Lighthouse).

---

## Notas
- **No uses** `critical.css`, `serve.ps1`, `image-slot.js` ni la carpeta
  `screenshots/` en WordPress: son del entorno estático/local.
- Si instalas **Yoast** o **Rank Math** para SEO, borra el bloque de `<meta>`
  Open Graph/Twitter de `functions.php` (deja solo el JSON-LD) para no duplicar.
- ¿Cambiaste `styles.css`/`app.js`? Vuelve a subirlos a
  `assets/okstation/`: el cache-busting por fecha de archivo refresca solo.
