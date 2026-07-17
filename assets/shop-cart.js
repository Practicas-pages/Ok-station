/* ─────────────────────────────────────────────────────────────────────────
   Ok.station — Puente del carrito para páginas del e-commerce que NO son la tienda
   -----------------------------------------------------------------------------
   Define window.OKtienda (el MISMO "contrato" que usa la tienda) respaldado por el
   localStorage compartido + datos REALES del catálogo. Así OKi (y cualquiera que lea
   el carrito) muestra EXACTAMENTE lo mismo que en la tienda, en vez de resolver los
   ids contra el catálogo de respaldo de catalogo.js (18 productos con otros ids), que
   era justo lo que hacía que "el carrito del astronauta se viera diferente".

   La tienda define su propio OKtienda completo (con panel, grid, etc.); si ya existe,
   este puente no se mete.
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  "use strict";
  if (window.OKtienda) return;   // en la tienda manda su propia implementación

  var CART = "okstation_cart", WISH = "okstation_wishlist";
  function rd(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; } catch (e) { return d; } }
  function wr(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function emit(t) { try { window.dispatchEvent(new CustomEvent("oktienda:" + t)); } catch (e) {} }

  /* Caché de productos REALES por id. Se siembra con el producto de esta ficha y sus
     relacionados (ya vienen en el HTML); lo que falte —items del carrito o deseados que
     vengan de otra página— se pide al API por ids en una sola llamada. */
  var CACHE = {};
  function seed(p) {
    if (!p || p.id == null) return;
    CACHE[+p.id] = {
      id: +p.id, name: p.name, price: +p.price, old: p.old || null,
      stock: (p.stock == null ? 99 : +p.stock), image: p.image || null,
      brand: p.brand || "", cat: p.cat || p.category || "", emoji: "📦",
      grad: "var(--grad-blue)", url: p.url || ("/producto/" + p.id)
    };
  }
  if (window.OK_PDP) seed(window.OK_PDP);
  (window.OK_PDP_RELATED || []).forEach(seed);

  function missingIds() {
    var ids = {}, c = rd(CART, {});
    for (var k in c) if ((+c[k]) > 0) ids[+k] = 1;
    rd(WISH, []).forEach(function (i) { ids[+i] = 1; });
    return Object.keys(ids).map(Number).filter(function (id) { return !CACHE[id]; });
  }
  function hydrate(done) {
    var need = missingIds();
    if (!need.length) { if (done) done(false); return; }
    fetch("/backend/api/shop/products.php?per_page=100&page=1&ids=" + need.join(","))
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j && j.ok && j.items) j.items.forEach(function (p) {
          seed({ id: p.id, name: p.name, price: p.price, old: p.old, stock: p.stock, image: p.image, brand: p.brand, cat: p.category, url: "/producto/" + p.id });
        });
        if (done) done(true);
      }).catch(function () { if (done) done(false); });
  }

  function prod(id) { return CACHE[+id] || null; }
  function cartArr() {
    var c = rd(CART, {}), out = [];
    for (var id in c) { var p = prod(id), q = +c[id] || 0; if (p && q > 0) out.push({ id: p.id, name: p.name, price: p.price, qty: q, emoji: p.emoji, old: p.old, cat: p.cat, image: p.image, grad: p.grad }); }
    return out;
  }
  function refresh() { hydrate(function () { emit("carrito"); }); }

  window.OKtienda = {
    productos: function () { return Object.keys(CACHE).map(function (k) { return CACHE[k]; }); },
    carrito: cartArr,
    deseados: function () { return rd(WISH, []).map(prod).filter(Boolean).map(function (p) { return { id: p.id, name: p.name, price: p.price, emoji: p.emoji, image: p.image, grad: p.grad }; }); },
    total: function () { var t = 0; cartArr().forEach(function (it) { t += it.price * it.qty; }); return t; },
    /* Busca en TODO el catálogo (deja los resultados en caché para resolverlos luego). */
    buscar: function (q, limit) {
      return fetch("/backend/api/shop/products.php?per_page=" + (limit || 8) + "&page=1&q=" + encodeURIComponent(q))
        .then(function (r) { return r.json(); })
        .then(function (j) {
          var items = (j && j.ok && j.items) ? j.items : [];
          items.forEach(function (p) { seed({ id: p.id, name: p.name, price: p.price, old: p.old, stock: p.stock, image: p.image, brand: p.brand, cat: p.category, url: "/producto/" + p.id }); });
          return items.map(function (p) { return prod(p.id); }).filter(Boolean);
        }).catch(function () { return []; });
    },
    agregar: function (id, qty) {
      id = +id; var n = Math.max(1, parseInt(qty, 10) || 1), c = rd(CART, {}), p = prod(id), cap = p ? p.stock : 99;
      c[id] = Math.min(cap, (+c[id] || 0) + n); wr(CART, c);
      var w = rd(WISH, []), wi = w.indexOf(id); if (wi >= 0) { w.splice(wi, 1); wr(WISH, w); }   // se gradúa a carrito
      refresh();
    },
    cambiar: function (id, d) {
      id = +id; var c = rd(CART, {}); c[id] = (+c[id] || 0) + (+d || 0);
      if (c[id] <= 0) delete c[id]; else { var p = prod(id); if (p) c[id] = Math.min(p.stock, c[id]); }
      wr(CART, c); refresh();
    },
    quitar: function (id) { id = +id; var c = rd(CART, {}); delete c[id]; wr(CART, c); refresh(); },
    toggleDeseado: function (id) { id = +id; var w = rd(WISH, []), i = w.indexOf(id); if (i >= 0) w.splice(i, 1); else w.push(id); wr(WISH, w); refresh(); emit("deseados"); },
    /* Fuera de la tienda no hay vista previa ni panel: se navega a la página real. */
    verProducto: function (id) { var p = prod(id); window.location.href = p && p.url ? p.url : ("/producto/" + id); },
    abrirCarrito: function () { window.location.href = "/tienda#store"; },
    abrirDeseados: function () { window.location.href = "/tienda#store"; },
    entrarTienda: function () { window.location.href = "/tienda#store"; },
    entrega: "recoger_en_tienda"
  };

  /* Primer llenado: resuelve los ids que ya traía el carrito/deseados de otras páginas y
     avisa a OKi para que pinte su lista con los datos reales. */
  refresh();
  // Si el carrito cambia en otra pestaña, mantenerse al día.
  window.addEventListener("storage", function (e) { if (e.key === CART || e.key === WISH) refresh(); });
})();
