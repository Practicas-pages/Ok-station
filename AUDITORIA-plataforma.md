# Auditoría de plataforma — Ok.station (2026-07-20)

Auditoría completa contra el marco "Comprehensive Web Platform Audit 2026"
(rastreo, Core Web Vitals, accesibilidad, móvil, OWASP, datos estructurados)
más criterios propios. **Cada punto fue verificado contra el código real**, no
es checklist teórico. Se indica dueño y prioridad de lo que queda.

Leyenda: ✅ cumple · 🟡 mejorable · 🔴 pendiente que sí importa

---

## 1. Regla de oro: "si importa para SEO, se renderiza en el servidor"

| Pieza | Estado | Evidencia |
|---|---|---|
| Fichas de producto (`producto.php`) | ✅ | Server-rendered con schema Product completo |
| Páginas de categoría (`categoria.php`) | ✅* | Server-rendered, ItemList + Breadcrumb. *Espera 2 líneas de `.htaccess` (ver `PARA-OSCAR-seo.md`) |
| Landing y páginas locales | ✅ | HTML estático |
| Catálogo de `/tienda` | 🟡 | Se pinta con JS (CSR). **Mitigado**: sitemap dinámico + categorías server-rendered dan el camino rastreable. No urge cambiarlo |

## 2. Rastreo e indexación (trabajado hoy — ver commits `e7a73f5`…`6665f4d`)

| Punto del marco | Estado |
|---|---|
| robots.txt en raíz, permite assets, bloquea privado | ✅ (ambas formas, `.html` y limpia) |
| Sitemap solo con URLs 200 (sin redirecciones) | ✅ (se quitaron 16 URLs que daban 301) |
| Sitemap de productos | ✅ dinámico desde la BD (60 fichas hoy, crece solo) |
| Canonical autorreferente | ✅ (48 correcciones: canonical + og:url + schema) |
| Soft 404 | ✅ `producto.php` y `categoria.php` devuelven 404 real; existen 404/403/500.html |
| hreflang | N/A (un solo idioma/región) |

## 3. Core Web Vitals

**Nota honesta:** el marco pide medir con datos de campo (CrUX, percentil 75 sobre
28 días). El sitio aún no tiene tráfico para eso — esto es análisis de laboratorio.
**Al lanzar: dar de alta el dominio en Google Search Console** (los comprobantes
`googleXXXX.html` ya están, falta revisar cobertura y CWV ahí).

### LCP (objetivo ≤ 2.5 s)
- 🟡 **El elemento LCP de la landing será la imagen del hero** (`hero-*.webp`), que
  aún no se sube. Cuando esté: agregar `<link rel="preload" as="image"
  href="assets/img/hero-tienda.webp" fetchpriority="high">` en el `<head>` de
  tienda.html (NO antes: precargar un 404 empeora las cosas).
- ✅ Formato WebP en todo lo previsto; fotos Icecat con `loading="lazy"`.
- ✅ Poppins con `display=swap` (sin "flash de texto invisible").
- ✅ gzip activo en producción (`deploy/nginx-seguridad.conf`) — los 208 KB de
  styles.css viajan ~30 KB.

### CLS (objetivo < 0.1)
- ✅ Las miniaturas de producto viven en contenedores de altura fija (CSS), y
  `categoria.php` declara `width/height` en sus `<img>`.
- ✅ El `?v=` + `publicar.sh` evita estilos viejos que muevan el layout.

### INP (objetivo ≤ 200 ms)
- 🟡 `tienda.html` pesa **192 KB** con ~1,000 líneas de JS inline: en un teléfono
  medio, el hilo principal se ocupa un buen rato al cargar. No es urgente
  (el catálogo pagina y los handlers son ligeros), pero si el CrUX sale mal,
  el primer sospechoso es este archivo.
- 🔴→OSCAR **`catalogo.js` es el único script que bloquea el render** (sin
  `defer`, línea ~1113 de tienda.html). El inline lee `window.OK_PRODUCTS` al
  parsear **con respaldo a `[]`** y hay repintado al cargar el catálogo, así que
  `defer` *parece* viable — pero como el repintado es tuyo, Oscar, no lo cambié
  sin tu confirmación. Si dices que sí, es agregar una palabra.

## 4. Accesibilidad

| Punto del marco | Estado |
|---|---|
| Labels asociados a inputs (cuenta.html) | ✅ 7 de 7, con `autocomplete` |
| "Problema del asterisco rojo" | ✅ no hay asteriscos sueltos |
| `aria-describedby` para errores/ayudas | 🟡 no se usa; los errores se pintan visualmente. Mejora recomendada para lectores de pantalla (dueño: equipo, cuenta.html/checkout) |
| `alt` en imágenes | ✅ (las "2 sin alt" eran falsos positivos: comentarios y tags PHP) |
| Skip-link "Saltar al contenido" | ✅ existe |
| ARIA como último recurso, HTML nativo primero | ✅ es el patrón general del sitio |

## 5. Móvil (mobile-first indexing)

| Punto | Estado |
|---|---|
| `viewport` en todas las páginas públicas | ✅ |
| Interstitials intrusivos | ✅ ninguno — OKi ya no se abre solo (commit de Oscar) y no hay popups al entrar |
| Botones/targets táctiles | ✅ botones píldora grandes en el header de la tienda |

## 6. Seguridad (OWASP Top 10:2025, revisión ligera)

**El estado real es mucho mejor que hace una semana** — la mayoría de los huecos
que estaban anotados ya los cerró el equipo:

| Hueco anotado | Estado |
|---|---|
| HSTS | ✅ en `nginx-seguridad.conf` (max-age 2 años, preload) |
| Contraseñas estilo NIST | ✅ 8–64 caracteres + lista de contraseñas comunes bloqueadas |
| Rate limit | ✅ login y registro (tope propio por IP, arreglado para CGNAT) |
| Runners CLI por HTTP | ✅ bloqueados |
| Vender dos veces la misma pieza | ✅ descuenta existencias al comprar (commit `2bc08ad`) |
| Inyección SQL | ✅ nada obvio: PDO con prepared statements en todo lo revisado |
| CSP / cabeceras | ✅ en `.htaccess` (Apache) y `nginx-seguridad.conf` (producción) |
| **Bloqueo >3% de cambio de precio en checkout** | 🔴 **ÚNICO pendiente serio.** `verificar-precios.php` audita, pero `create.php` no bloquea: si el sync está viejo y Exel subió el precio, se cobra el precio anterior (pérdida directa). Acordado en la junta del 14-jul. Dueño: equipo/Oscar |

## 7. Datos estructurados y metadatos

| Punto | Estado |
|---|---|
| JSON-LD válido y representativo | ✅ 46+ bloques válidos (LocalBusiness, FAQ, OnlineStore, Product, ItemList, Breadcrumb) |
| Breadcrumb con position/name/item | ✅ en fichas y categorías |
| Títulos únicos server-rendered | ✅ únicos, 38–59 caracteres, con ciudad |
| og:image 1200×630 | 🟡 `index` y `tienda` apuntan a `assets/img/hero-okstation.webp`, que **debe subirse en 1200×630** (está en la lista de imágenes pendientes). Las fichas usan la foto Icecat del producto ✅ |

## 8. Monitoreo (lo que sigue tras el lanzamiento)

1. **Google Search Console**: revisar "Cobertura" y "Core Web Vitals" a los ~28 días.
2. **PageSpeed Insights** sobre `/`, `/tienda` y una ficha, en móvil.
3. Los comprobantes de Search Console ya están en el repo.

---

# Plan de acción priorizado

| # | Qué | Dueño | Esfuerzo |
|---|---|---|---|
| 1 | 🔴 Bloqueo >3% de precio en `create.php` | Oscar/equipo | medio — es LA brecha de negocio |
| 2 | 🔴 Subir las imágenes pendientes (lista abajo) | sixseven | solo subirlas, ya está todo conectado |
| 3 | 🟡 2 líneas de `.htaccess` para `/categoria/…` | Oscar (listas en `PARA-OSCAR-seo.md`) | 10 s |
| 4 | 🟡 `defer` en catalogo.js (confirmar repintado) | Oscar | 1 palabra |
| 5 | 🟡 `preload` del hero cuando existan las imágenes | cualquiera | 1 línea |
| 6 | 🟡 `aria-describedby` en errores de formularios | equipo | chico |
| 7 | ⚪ Minificar styles.css / partir el JS de tienda.html | equipo, post-lanzamiento | solo si CrUX sale mal |

### Lista de imágenes pendientes (todo lo demás ya está conectado en el código)

```
assets/img/hero-tienda.webp            ~1920×800   (hero slide 1 — será el LCP)
assets/img/hero-tinta-toner.webp       ~1920×800
assets/img/hero-papel-cuadernos.webp   ~1920×800
assets/img/hero-ofertas.webp           ~1920×800
assets/img/hero-entrega.webp           ~1920×800
assets/img/tienda-en-accion.webp       ~1200×1000  (sección "Cómo funciona")
assets/img/hero-okstation.webp          1200×630   (og:image de index/tienda — Facebook/WhatsApp)
assets/img/okstation-logo.webp          158×24     (logo del navbar)
```

---

*Conclusión honesta: la plataforma está en buena forma — el grueso del marco 2026
ya se cumple. Lo que separa esto de "óptimo" son 2 cosas de negocio (bloqueo de
precio y las imágenes) y 3 ajustes chicos que necesitan el OK de Oscar.*
