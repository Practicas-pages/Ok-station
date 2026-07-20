# Para Oscar — trabajo de SEO y 2 cosas que necesitan tu visto bueno

> **✅ ACTUALIZACIÓN 2026-07-20 — LOS DOS PENDIENTES QUEDARON RESUELTOS por Oscar:**
> 1. `/categoria/…` **activado en producción** vía Nginx (commit `2663124`) — con razón:
>    okstation.mx corre en Nginx y **no lee `.htaccess`**, así que las reglas Apache
>    propuestas abajo no aplicaban allá. Se dejó su espejo en `.htaccess` solo para
>    quien sirva con Apache en local (XAMPP).
> 2. El arreglo del slug quedó revisado e integrado (commit `d42dd8a`).
>
> El resto del documento se conserva como registro de la propuesta original.

Oscar: hice una auditoría de SEO del proyecto y subí varios arreglos a `desarrollo`.
**Dos de ellos tocan terreno tuyo**, así que los dejo explicados aquí antes de que
pasen a `main`. Si algo no te late, se revierte sin drama (ninguno rompe nada hoy).

> **Queda en tus manos, como tú prefieras:**
> - **Lo aplicas tú** — está todo listo para copiar y pegar (son 2 líneas, ~10 segundos).
> - **O nos dices y lo aplicamos** — igual de bien.
> - **O dices que no** y se revierte, sin problema.
>
> Lo importante es que no te bloquea nada: mientras no se toque el `.htaccess`, el
> sitio sigue exactamente igual que ahora.

---

## ⚠️ 1. Activar las páginas de categoría — faltan 2 líneas en `.htaccess`

**Estado:** `categoria.php` ya está subido y funcionando, pero **NO toqué el `.htaccess`**
a propósito, para que lo revisaras primero. Hoy se prueba así:

    /categoria.php?slug=consumibles

**Con estas 2 líneas queda en `/categoria/consumibles`.** Van junto a tu regla de
producto (son su espejo), listas para copiar y pegar:

```apache
# Categoria: /categoria/tinta-y-toner -> categoria.php?slug=tinta-y-toner
RewriteRule ^categoria/([a-z0-9-]+)/?$  categoria.php?slug=$1  [L,QSA]
# /categoria sin slug -> la tienda
RewriteRule ^categoria/?$               /tienda  [R=301,L]
```

### ¿Por qué existe esta página?
El catálogo de `/tienda` se pinta con JavaScript. Al rastrear el sitio, **Google no
encuentra ni un enlace a las fichas** — quedaban huérfanas (el sitemap las lista, pero
nada apunta a ellas). Esta página da un camino rastreable de verdad, y de paso son 8
páginas que compiten por búsquedas de compra ("tinta y tóner Tijuana").

### ¿En qué te afecta?
- **NO modifica** `producto.php` ni `ShopProduct.php` — solo uso tus métodos públicos
  (`slug`, `url`) **en lectura**. Sigo tu mismo patrón: sin autoloader, PDO directo.
- **NO toca** `tienda.html`, carrito, checkout ni OKi.
- **NO hay migración** — cero cambios en la base.
- **Ninguna URL actual cambia.**
- Lo único compartido que tocaría son esas 2 líneas del `.htaccess`.

**Riesgo que sí veo:** si Exel cambia el nombre de una categoría, cambia su URL y
podrían quedar 404. Hoy el slug se genera de la BD (automático), pero vale tenerlo
en mente.

---

## ⚠️ 2. Revisar el arreglo de `ShopProduct::slug()` (commit `07e275e`)

**Toca tu archivo y decide la URL de TODAS las fichas**, por eso te lo señalo.

### El problema
`slug()` usaba `iconv('ASCII//TRANSLIT')`, que **no se comporta igual en todos los
sistemas**. En Windows (Laragon) devuelve:

    "Tóner"  ->  T'oner        "Niño"  ->  Ni~no

…y el limpiador de abajo convierte ese apóstrofo/virgulilla en guion:

    t-oner        ni-no

En Linux suele salir limpio, así que **la misma ficha tendría una URL distinta según
dónde se calcule** (tu local vs el servidor). Eso ya afectaba al sitemap, que se
genera desde PHP.

### La solución
Un mapa explícito de acentos: mismo resultado en todas partes, sin depender de la
librería del sistema.

### ¿Por qué ahora y no después?
- Con el feed de muestra **casi no se nota**: 0 de 60 productos traen acento.
- Con el **catálogo real de Exel** sí: los nombres en español vienen llenos
  (bolígrafo, cartón, tóner, fotográfico) → serían cientos de URLs feas.
- **Hoy no hay fichas indexadas.** Más adelante, cambiar los slugs rompería enlaces
  ya publicados. Es la ventana buena.

### Verificado
- 8 de 8 casos con acento salen correctos.
- **Las 60 URLs actuales NO cambian** (ninguna traía acento).
- Ficha, categoría y sitemap siguen respondiendo 200.

---

## ✅ Lo demás que subí (no necesita tu aprobación, pero para que estés enterado)

| Commit | Qué arregla |
|---|---|
| `e7a73f5` | **Sitemap dinámico de productos**: las fichas no estaban en ningún sitemap. Se genera desde la BD, así no hay que mantenerlo cuando Exel meta cientos más. |
| `a01fa9a` | **Canonical, og:url y schema** apuntaban a `*.html`, que el `.htaccess` redirige 301 a la URL limpia. Google recibía una contradicción. 48 URLs corregidas. |
| `5ba78e8` | **Páginas 404/403/500**: el `.htaccess` las declaraba y **no existían**. Quien caía en una URL mala veía la pantalla cruda del servidor. |
| `a6d4f29` | **Las páginas locales no enlazaban a la tienda** (cero enlaces). Se enlazaron solo las 3 con relación real de producto — las de pasaporte/trámites se dejaron sin enlace a propósito (enlazar de "requisitos de pasaporte" a "compra tóner" es artificial). |

**Resultado:** páginas que Google puede descubrir pasaron de **17 a 85+**, y sube solo
conforme crezca el catálogo.

---

## 🐛 Un riesgo que encontré (no es SEO, pero te lo dejo apuntado)

`create.php` valida el stock **contra el último sync**, no en vivo (tu propio
comentario lo menciona como pendiente). Con el sync diario, si Exel vende sus últimas
piezas después de la sincronización, la tienda puede **vender algo que ya no existe**.
Vi que subiste `deploy/actualizar-catalogo.sh`, así que quizá ya lo tienes cubierto —
solo por si acaso.

Lo mismo con el **bloqueo del 3%** en el precio: no lo encontré implementado en
`create.php` y estaba anotado como pendiente. Sin él, si Exel sube un precio y el sync
está viejo, se cobra el anterior.

---

## 📌 En resumen: qué queda de tu lado

| Pendiente | Qué hacer | Si no haces nada |
|---|---|---|
| Páginas de categoría | Pegar 2 líneas en `.htaccess` (o decir que no) | El sitio sigue igual; la página queda dormida en `/categoria.php?slug=…` |
| Arreglo del slug (`07e275e`) | Solo revisarlo cuando fusiones a `main` | Ya está en `desarrollo`; ninguna URL actual cambió |

*Cualquier cosa que no te cuadre, se revierte. Nada de esto cambió URLs existentes ni
tocó la base de datos.*
