window.OK_PRODUCTS = [];

(function () {
  "use strict";

  var API      = "/backend/api/shop/products.php";
  var POR_PAGE = 60;
  var CART     = "okstation_cart";
  var WISH     = "okstation_wishlist";

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

  pedir(API + "?per_page=" + POR_PAGE + "&page=1", function (items) {
    var acum = items.map(mapear);
    window.OK_PRODUCTS = acum;

    var faltan = idsGuardados().filter(function (id) {
      return !acum.some(function (p) { return p.id === id; });
    });
    if (!faltan.length) return;

    var tandas = [];
    for (var i = 0; i < faltan.length; i += POR_PAGE) tandas.push(faltan.slice(i, i + POR_PAGE));
    var pendientes = tandas.length;

    tandas.forEach(function (tanda) {
      pedir(API + "?per_page=" + POR_PAGE + "&page=1&ids=" + tanda.join(","), function (extra) {
        acum = fusionar(acum.concat(extra.map(mapear)));
        window.OK_PRODUCTS = acum;
        if (--pendientes === 0) {
          try { window.dispatchEvent(new Event("ok-catalogo-listo")); } catch (e) {}
        }
      });
    });
  });
})();
