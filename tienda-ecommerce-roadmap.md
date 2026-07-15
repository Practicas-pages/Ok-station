# Tienda / E-commerce OkStation — Roadmap (proveedor Exel + Icecat)

> Origen: junta con dirección del 2026-07-14. Objetivo: montar el catálogo de
> productos físicos de la tienda, alimentado por la **API de Exel del Norte**
> y enriquecido con **Icecat**, adaptando el enfoque de los runners que ya
> corren en Compustar (WooCommerce). OkStation es código propio (PHP + MySQL),
> **no** usa WordPress, así que se replica el *enfoque*, no el código.

## Estado de las fases

| Fase | Qué es | Estado |
|---|---|---|
| 0 | Investigación (API Exel, campos, arquitectura del runner) | ✅ Hecho |
| 1 | Catálogo: tablas `products` + `product_images` | ✅ Hecho |
| 2 | Runner de Exel (catálogo → filtrar papelería → UPSERT masivo) | ⬜ Pendiente |
| 3 | Enriquecer con Icecat + carrito con validación en vivo | ⬜ Pendiente |
| 4 | Conectar la tienda (endpoints + frontend + checkout) | ⬜ Pendiente |
| 5 | Deploy (server, credenciales, agendar runner) | ⬜ Pendiente |

## Decisiones confirmadas (2026-07-15)

- **Proveedor:** Exel del Norte (`api01.exeldelnorte.com.mx`). Solo categorías de **papelería**.
- **Precio:** `price = costo × 1.30` (margen 30%, en `settings.shop_margin`), **sin IVA**.
  El IVA (8% BC / 16% nacional) se aplica por geolocalización en el checkout — no se guarda en el producto.
- **Imágenes:** descargar al servidor, **máximo 5** por producto.
- **Stock:** se vende **solo del almacén 4**. El stock del feed es referencia; el stock real
  se revalida en vivo al agregar al carrito.
- **Regla del 3%:** si el costo sube más de 3% respecto a la corrida anterior (`prev_cost`),
  se avisa al cliente y se actualiza el precio.

---

## Fase 1 — Catálogo `products` ✅ HECHO

- Migración: `backend/database/migrations/0030_shop_products.sql`
- Tablas: **`products`** (catálogo, mapeado a los campos de Exel) y **`product_images`** (máx 5, normalizada).
- Cierra el hueco de la `0027`: `shop_order_items.product_id` ya referenciaba un catálogo que no existía.
- Llave de actualización: `UNIQUE (supplier, supplier_ref)` — `supplier_ref` = la "referencia"/No. Parte de Exel.
- Verificada en local (Laragon). Diseño multi-proveedor (`exel`/`syscom`/`local`) para reusar el runner a futuro.

## Fase 2 — Runner de Exel ⬜ PENDIENTE (siguiente)

Script CLI (estilo `migrate.php`: PHP puro, PDO, sin dependencias). Qué hace, en orden:

1. **Descarga** el catálogo de Exel (`GET productos`), leyendo la API key desde `backend/.env` (`EXEL_API_KEY`).
2. **Filtra** solo las categorías/subcategorías de papelería (mapeo de categorías).
3. **UPSERT masivo** a `products` por `supplier_ref` — una sola sentencia
   `INSERT ... ON DUPLICATE KEY UPDATE` (miles de filas en segundos, no fila por fila).
4. Calcula `price = ROUND(cost × 1.30, 2)` y guarda `prev_cost` (para la regla del 3%).
5. **Oculta** (`is_active = 0`) los productos sin stock en el almacén 4.

- Archivo propuesto: `backend/tools/exel-sync.php`
- Depende de: `EXEL_API_KEY` en `.env`.

## Fase 3 — Icecat + carrito ⬜ PENDIENTE

**Runner de Icecat** (segunda pasada, sobre los productos nuevos):
- Busca el producto en Icecat; si está, baja **especificaciones** (`specs_json`) y **fotos** (máx 5 → `product_images`).
- Si Icecat no lo tiene → usa las imágenes de Exel (`GET imagenes`) como respaldo.
- Depende de: `ICECAT_API_KEY` en `.env`.

**Carrito con validación en vivo:**
- Al agregar al carrito, revalidar contra Exel: ¿sigue con stock en almacén 4? ¿mismo precio?
- Sin stock → avisar "Sorry, este se nos acabó" y sugerir alternativa.
- Costo subió > 3% → avisar el cambio y actualizar precio.

## Fase 4 — Conectar la tienda ⬜ PENDIENTE

- **Endpoints** de catálogo en `backend/api/shop/`: listar, detalle, buscador (leen de `products`).
- Ligar `tienda.html` a esos endpoints (hoy no lee de `products` todavía — revisar cómo está armada).
- **Checkout:** revalidar stock/precio al pagar (el IVA por geo ya existe en `shop/geo.php`).

## Fase 5 — Deploy ⬜ PENDIENTE

- Push a `desarrollo` → merge según flujo del equipo.
- Correr `php backend/database/migrate.php` en el server (aplica la `0030`).
- Cargar las API keys (Exel, Icecat) en el `.env` del server.
- Agendar el runner con **systemd timer** (referencia: Compustar corre a las 02:15 diario).

---

## Bloqueadores externos (dependen de terceros)

| Falta | Quién lo tiene | Bloquea |
|---|---|---|
| API key de Exel | Dirección / cuenta Exel | Probar Fase 2 con datos reales |
| API key de Icecat | Cuenta Icecat | Fase 3 (enriquecimiento) |
| Accesos SSH | Dirección (se entregan en papel) | Fase 5 (deploy) |
| Mapeo fino de categorías papelería | `woo_product_cats` en Compustar | Filtro exacto de Fase 2 |

## Referencias

- **API Exel:** `https://api01.exeldelnorte.com.mx` — auth por header `Authorization: <API_KEY>`.
  Endpoints clave: `GET productos`, `GET categorias/subcategorias`, `POST productos por almacenes` (stock), `GET imagenes`.
- **Runner de referencia (Compustar):** `compustar-project/scripts/` — pipeline de shell + SQL por
  etapas (`run_compustar_import.sh` → `stage10_*`), programado con systemd timers.
- **Campos de un producto Exel:** `sku`, `referencia`, `codigo_barras`, `codigo_sat` (SAT/CFDI),
  `nombre`, `descripcion_extendida`, `precio` (costo, 6 decimales), `moneda`, `stock`,
  `marca_nombre`, `categoria_nombre`, `subcategoria_nombre`.
