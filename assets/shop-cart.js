(function () {
  "use strict";
  if (window.OKtienda) return;

  var CART = "okstation_cart", WISH = "okstation_wishlist";
  function rd(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; } catch (e) { return d; } }
  function wr(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function emit(t) { try { window.dispatchEvent(new CustomEvent("oktienda:" + t)); } catch (e) {} }

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
  var MAX_POR_TANDA = 60;

  function hydrate(done) {
    var need = missingIds();
    if (!need.length) { if (done) done(false); return; }

    var tandas = [];
    for (var i = 0; i < need.length; i += MAX_POR_TANDA) tandas.push(need.slice(i, i + MAX_POR_TANDA));

    var got = {}, todoOk = true, pendientes = tandas.length;

    tandas.forEach(function (tanda) {
      fetch("/backend/api/shop/products.php?per_page=" + MAX_POR_TANDA + "&page=1&ids=" + tanda.join(","))
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (j && j.ok && Array.isArray(j.items)) {
            j.items.forEach(function (p) {
              got[+p.id] = 1;
              seed({ id: p.id, name: p.name, price: p.price, old: p.old, stock: p.stock, image: p.image, brand: p.brand, cat: p.category, url: "/producto/" + p.id });
            });
          } else { todoOk = false; }
        })
        .catch(function () { todoOk = false; })
        .then(function () {
          if (--pendientes > 0) return;
          if (todoOk) {
            var c = rd(CART, {}), w = rd(WISH, []), changed = false;
            need.forEach(function (id) {
              if (got[id]) return;
              if (c[id] != null) { delete c[id]; changed = true; }
              var wi = w.indexOf(id); if (wi >= 0) { w.splice(wi, 1); changed = true; }
            });
            if (changed) { wr(CART, c); wr(WISH, w); }
          }
          if (done) done(todoOk);
        });
    });
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
    deseados: function () { return rd(WISH, []).map(prod).filter(Boolean).map(function (p) { return { id: p.id, name: p.name, price: p.price, stock: p.stock, emoji: p.emoji, image: p.image, grad: p.grad }; }); },
    total: function () { var t = 0; cartArr().forEach(function (it) { t += it.price * it.qty; }); return t; },
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
      var w = rd(WISH, []), wi = w.indexOf(id), graduo = wi >= 0;
      if (graduo) { w.splice(wi, 1); wr(WISH, w); }
      refresh();
      if (graduo) emit("deseados");
    },
    cambiar: function (id, d) {
      id = +id; var c = rd(CART, {}); c[id] = (+c[id] || 0) + (+d || 0);
      if (c[id] <= 0) delete c[id]; else { var p = prod(id); if (p) c[id] = Math.min(p.stock, c[id]); }
      wr(CART, c); refresh();
    },
    quitar: function (id) { id = +id; var c = rd(CART, {}); delete c[id]; wr(CART, c); refresh(); },
    toggleDeseado: function (id) { id = +id; var w = rd(WISH, []), i = w.indexOf(id); if (i >= 0) w.splice(i, 1); else w.push(id); wr(WISH, w); refresh(); emit("deseados"); },
    verProducto: function (id) { var p = prod(id); window.location.href = p && p.url ? p.url : ("/producto/" + id); },
    abrirCarrito: function () { window.location.href = "/tienda#cart"; },
    abrirDeseados: function () { window.location.href = "/tienda#store"; },
    entrarTienda: function () { window.location.href = "/tienda#store"; },
    entrega: "recoger_en_tienda"
  };

  refresh();
  window.addEventListener("storage", function (e) { if (e.key === CART || e.key === WISH) refresh(); });
})();
