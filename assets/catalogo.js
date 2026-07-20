/* ─────────────────────────────────────────────────────────────────────────
   Catálogo compartido de la tienda OK.station — SOLO PAPELERÍA.

   Antes este archivo traía 18 productos con el precio ESCRITO A MANO. OKi los
   leía para responder en las 27 páginas del sitio, así que en cuanto el catálogo
   real (Exel del Norte) tuviera otros precios, OKi le habría cotizado al cliente
   cantidades que no existen. En una tienda con ventas reales eso no se vale.

   Ahora se llena del catálogo REAL: la tabla `products`, vía
   /backend/api/shop/products.php. Un solo origen de verdad para todo el sitio.

   Lo usan:
     • assets/oki.js → "Tu lista de compras" y recomendaciones en CUALQUIER página.
     • tienda.html   → respaldo si el API no responde.

   Si el API falla, `window.OK_PRODUCTS` se queda VACÍO A PROPÓSITO: OKi
   simplemente no ofrece lista de compras. Es preferible a inventar precios.

   Rutas ABSOLUTAS (/backend/…) porque este archivo también se carga desde
   /producto/<id>-<slug>, donde una relativa resolvería mal.
   ───────────────────────────────────────────────────────────────────────── */
window.OK_PRODUCTS = [];

(function () {
  "use strict";

  var API      = "/backend/api/shop/products.php";
  var POR_PAGE = 60;                 // tope del endpoint (shop/products.php)
  var CART     = "okstation_cart";
  var WISH     = "okstation_wishlist";

  /* Del formato del API al que espera OKi (id, name, price, old, stock, cat…). */
  function mapear(p) {
    return {
      id:    +p.id,
      name:  p.name || "",
      price: +p.price || 0,
      old:   (p.old != null && +p.old > +p.price) ? +p.old : null,
      stock: (p.stock == null ? null : +p.stock),
      cat:   p.category || "",
      sub:   p.subcategory || "",
      brand: p.brand || "",
      sku:   p.sku || "",
      image: p.image || null
    };
  }

  function pedir(url, cb) {
    try {
      fetch(url)
        .then(function (r) { return r.json(); })
        .then(function (j) { cb(j && j.ok && Array.isArray(j.items) ? j.items : []); })
        .catch(function () { cb([]); });
    } catch (e) { cb([]); }
  }

  function leerLs(clave, porDefecto) {
    try {
      var v = JSON.parse(localStorage.getItem(clave) || porDefecto);
      return v || JSON.parse(porDefecto);
    } catch (e) { return JSON.parse(porDefecto); }
  }

  /* Ids que el cliente ya tiene guardados: pueden NO estar entre los primeros 60,
     y OKi necesita su nombre y precio para mostrar "tu lista de compras". */
  function idsGuardados() {
    var ids = {}, c = leerLs(CART, "{}");
    for (var k in c) { if ((+c[k]) > 0) ids[+k] = 1; }
    leerLs(WISH, "[]").forEach(function (i) { ids[+i] = 1; });
    return Object.keys(ids).map(Number).filter(function (n) { return n > 0; });
  }

  function fusionar(lista) {
    var vistos = {}, out = [];
    lista.forEach(function (p) {
      if (!p || !p.id || vistos[p.id]) return;
      vistos[p.id] = 1;
      out.push(p);
    });
    return out;
  }

  /* 1) Muestra del catálogo (para recomendar).  2) Lo que el cliente ya guardó. */
  pedir(API + "?per_page=" + POR_PAGE + "&page=1", function (items) {
    var acum = items.map(mapear);
    window.OK_PRODUCTS = acum;

    var faltan = idsGuardados().filter(function (id) {
      return !acum.some(function (p) { return p.id === id; });
    });
    if (!faltan.length) return;

    /* Por tandas de 60: el endpoint topa ahí y pedir más no trae más. */
    var tandas = [];
    for (var i = 0; i < faltan.length; i += POR_PAGE) tandas.push(faltan.slice(i, i + POR_PAGE));
    var pendientes = tandas.length;

    tandas.forEach(function (tanda) {
      pedir(API + "?per_page=" + POR_PAGE + "&page=1&ids=" + tanda.join(","), function (extra) {
        acum = fusionar(acum.concat(extra.map(mapear)));
        window.OK_PRODUCTS = acum;
        if (--pendientes === 0) {
          /* Aviso por si algo ya pintó una lista con el catálogo a medias. */
          try { window.dispatchEvent(new Event("ok-catalogo-listo")); } catch (e) {}
        }
      });
    });
  });
})();
