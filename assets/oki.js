/* ══════════════════════════════════════════════════════════════════
   OKi — astronauta asistente de Ok.station.
   Inyecta la mascota + panel de chat y lo conecta al cerebro:
   POST /backend/api/oki/chat.php  (Claude, en el servidor).
   Carga diferida (defer) para no afectar el LCP/TBT. Arranca CERRADO.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  var API = "/backend/api/oki/chat.php";
  var WA  = "https://wa.me/526647194117";

  // Historial de la conversación que se manda al backend.
  var history = [];
  var busy = false, greeted = false, thrustT = null, bubbleT = null;

  var SVG_ASTRO =
    '<svg class="oki__astro" viewBox="0 0 80 96" aria-hidden="true">' +
    '<line x1="40" y1="13" x2="40" y2="6" stroke="#9fb3d6" stroke-width="2.4"/><circle cx="40" cy="5" r="3.2" fill="#00C6FF" class="oki__led"/>' +
    '<rect x="25" y="40" width="30" height="30" rx="12" fill="#c3d0ec"/>' +
    '<rect x="27" y="67" width="9" height="9" rx="3.5" fill="#9fb0d6"/><rect x="44" y="67" width="9" height="9" rx="3.5" fill="#9fb0d6"/>' +
    '<g class="oki__thrust">' +
    '<path class="fl fl1" d="M31.5 75 C 27.5 83, 29 90, 31.5 94 C 34 90, 35.5 83, 31.5 75 Z" fill="url(#okiFlame)"/>' +
    '<path class="fl fl2" d="M48.5 75 C 44.5 83, 46 90, 48.5 94 C 51 90, 52.5 83, 48.5 75 Z" fill="url(#okiFlame)"/>' +
    '<path class="fl core" d="M40 77 C 37.5 82, 38.5 87, 40 90 C 41.5 87, 42.5 82, 40 77 Z" fill="#ffffff" opacity=".85"/>' +
    '</g>' +
    '<g class="oki-leg oki-legL"><rect x="31" y="70" width="9.5" height="17" rx="4.7" fill="#fff" stroke="#e2e8f6" stroke-width="1.6"/><rect x="29" y="84" width="13" height="8" rx="4" fill="#dbe3f4"/></g>' +
    '<g class="oki-leg oki-legR"><rect x="41.5" y="70" width="9.5" height="17" rx="4.7" fill="#fff" stroke="#e2e8f6" stroke-width="1.6"/><rect x="40" y="84" width="13" height="8" rx="4" fill="#dbe3f4"/></g>' +
    '<rect x="26" y="42" width="28" height="30" rx="13" fill="#fff" stroke="#e2e8f6" stroke-width="1.8"/>' +
    '<rect x="33" y="53" width="14" height="10" rx="3" fill="#0b1330"/>' +
    '<circle cx="37.5" cy="58" r="1.7" fill="#00C6FF" class="oki__led"/><circle cx="42.5" cy="58" r="1.7" fill="#7fe0ff" class="oki__led2"/>' +
    '<g class="oki-arm oki-armL"><path d="M29 51 q-8 5 -8 13" fill="none" stroke="#fff" stroke-width="7.5" stroke-linecap="round"/><circle cx="21.5" cy="65" r="5.4" fill="#fff" stroke="#e2e8f6" stroke-width="1.4"/></g>' +
    '<g class="oki-arm oki-armR"><path d="M51 51 q8 5 8 13" fill="none" stroke="#fff" stroke-width="7.5" stroke-linecap="round"/><circle cx="58.5" cy="65" r="5.4" fill="#fff" stroke="#e2e8f6" stroke-width="1.4"/></g>' +
    '<circle cx="40" cy="30" r="22" fill="#fff" stroke="#e2e8f6" stroke-width="2"/>' +
    '<ellipse cx="40" cy="31" rx="15.5" ry="14.5" fill="url(#okiVisor)"/>' +
    '<path d="M27 25 Q40 18 53 25" stroke="rgba(255,255,255,.22)" stroke-width="3" fill="none" stroke-linecap="round"/>' +
    '<g clip-path="url(#okiVisorClip)"><rect class="oki__shine" x="30" y="14" width="7" height="36" fill="#ffffff" opacity=".55"/></g>' +
    '<g class="oki__glare"><ellipse cx="33" cy="25" rx="4.2" ry="5.4" fill="#fff" opacity=".6" transform="rotate(-18 33 25)"/><circle cx="47" cy="35" r="2.3" fill="#bfefff" opacity=".85"/></g>' +
    '</svg>';

  var SVG_DEFS =
    '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>' +
    '<linearGradient id="okiVisor" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0A1024"/><stop offset=".55" stop-color="#0552C8"/><stop offset="1" stop-color="#00C6FF"/></linearGradient>' +
    '<linearGradient id="okiFlame" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eafaff"/><stop offset=".35" stop-color="#00C6FF"/><stop offset=".72" stop-color="#066CFF"/><stop offset="1" stop-color="#066CFF" stop-opacity="0"/></linearGradient>' +
    '<clipPath id="okiVisorClip"><ellipse cx="40" cy="31" rx="15.5" ry="14.5"/></clipPath>' +
    '</defs></svg>';

  /* Iconos SVG del CROMO del panel (cabecera, secciones, botones): sustituyen a los
     emojis para que se vean igual en cualquier equipo. Los emojis dentro de las
     FRASES de OKi (y de los chips de sugerencia, que son mensajes) son su voz y
     se quedan como texto. */
  var OKI_ROCKET='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>';
  var OKI_CART='<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px" aria-hidden="true"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>';
  var OKI_HEART='<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:-2px" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
  var OKI_BULB='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px" aria-hidden="true"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.4 1 2.3h6c0-.9.4-1.8 1-2.3A7 7 0 0 0 12 2z"/></svg>';
  var OKI_CHAT='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  var OKI_SEND='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';

  var QUICKS = [
    "No sé qué necesito",
    "¿Cómo organizo mi oficina?",
    "Ayúdame a elegir tinta o tóner",
    "¿Qué hay en oferta?"
  ];

  // En la tienda (e-commerce) OKi ofrece atajos propios del carrito/deseados.
  var QUICKS_STORE = [
    "🛒 ¿Qué llevo en el carrito?",
    "✨ No sé qué necesito",
    "❤ Mis deseados",
    "💳 ¿Cómo pago?"
  ];

  // ── Modo tienda: OKi lee/actúa sobre window.OKtienda si existe (contrato de la tienda) ──
  function storeReady() { return !!(window.OKtienda && typeof window.OKtienda.carrito === "function"); }
  function okiNorm(s) {
    return String(s || "").toLowerCase()
      .replace(/[áàä]/g, "a").replace(/[éèë]/g, "e").replace(/[íìï]/g, "i")
      .replace(/[óòö]/g, "o").replace(/[úùü]/g, "u").replace(/ñ/g, "n")
      .replace(/\s+/g, " ").trim();
  }
  function okiMxn(n) { return "$" + (Number(n) || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  // ── Catálogo compartido + "lista de compras" en CUALQUIER página ──
  // Dentro de la tienda OKi usa window.OKtienda (carrito EN VIVO). Fuera de la tienda
  // usa un adaptador respaldado por assets/catalogo.js (window.OK_PRODUCTS) + el carrito
  // guardado en localStorage. Así OKi muestra tu lista de compras en todo el sitio.
  function okiCatalog() { return (window.OK_PRODUCTS && window.OK_PRODUCTS.length) ? window.OK_PRODUCTS : []; }
  function okiHasStore() { return storeReady() || okiCatalog().length > 0 || okiHasSaved(); } // ¿hay lista de compras que mostrar?
  function okiCatById(id) { id = +id; var a = okiCatalog().filter(function (p) { return p.id === id; }); return a[0] || null; }
  function okiRememberProducts(items) {
    var cur = (window.OK_PRODUCTS || []).slice(), byId = {};
    cur.forEach(function (p) { byId[+p.id] = p; });
    (items || []).map(okiMapDb).forEach(function (p) {
      if (!p.id) return;
      if (byId[p.id]) Object.assign(byId[p.id], p);
      else { cur.push(p); byId[p.id] = p; }
    });
    window.OK_PRODUCTS = cur;
    return (items || []).map(function (p) { return byId[+p.id]; }).filter(Boolean);
  }
  function okiSearchCatalog(q, limit) {
    return fetch("/backend/api/shop/products.php?per_page=" + (limit || 12) + "&page=1&q=" + encodeURIComponent(q))
      .then(function (r) { return r.json(); })
      .then(function (j) { return okiRememberProducts((j && j.ok && j.items) ? j.items : []); })
      .catch(function () { return []; });
  }
  function okiLsCart() { try { return JSON.parse(localStorage.getItem("okstation_cart") || "{}") || {}; } catch (e) { return {}; } }
  function okiLsCartSave(o) { try { localStorage.setItem("okstation_cart", JSON.stringify(o)); } catch (e) {} }
  function okiLsWish() { try { var w = JSON.parse(localStorage.getItem("okstation_wishlist") || "[]"); return Array.isArray(w) ? w : []; } catch (e) { return []; } }
  function okiLsWishSave(a) { try { localStorage.setItem("okstation_wishlist", JSON.stringify(a)); } catch (e) {} }
  function okiGoTienda() { location.href = "tienda.html"; }

  /* ¿El cliente ya tiene algo guardado (carrito o deseados) en ESTE navegador?
     Permite mostrar su lista aunque el catálogo aún no haya cargado: fuera de la
     tienda, window.OK_PRODUCTS lo llena catalogo.js de forma ASÍNCRONA. */
  function okiHasSaved() { var c = okiLsCart(); for (var k in c) { if ((+c[k]) > 0) return true; } return okiLsWish().length > 0; }

  /* Del formato del API (shop/products.php) al de OKi. Igual que catalogo.js::mapear. */
  function okiMapDb(p) {
    return { id: +p.id, name: p.name || "", price: +p.price || 0,
      old: (p.old != null && +p.old > +p.price) ? +p.old : null,
      stock: (p.stock == null ? null : +p.stock), cat: p.category || "",
      sub: p.subcategory || "", brand: p.brand || "", sku: p.sku || "", image: p.image || null };
  }

  /* Resuelve el carrito/deseados guardados contra el catálogo REAL (BD) por si
     catalogo.js aún no llegó (o no está en esta página). Fusiona en window.OK_PRODUCTS
     —la misma fuente que lee okiCatById— sin pisar lo que ya haya. */
  var okiHydrating = false;
  function okiHydrateSaved(done) {
    var have = {}; okiCatalog().forEach(function (p) { have[+p.id] = 1; });
    var ids = [], c = okiLsCart();
    for (var k in c) { if ((+c[k]) > 0 && !have[+k]) ids.push(+k); }
    okiLsWish().forEach(function (i) { if (!have[+i] && ids.indexOf(+i) < 0) ids.push(+i); });
    if (!ids.length) { if (done) done(false); return; }
    okiHydrating = true;
    fetch("/backend/api/shop/products.php?per_page=60&page=1&ids=" + ids.slice(0, 60).join(","))
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j && j.ok && Array.isArray(j.items)) {
          var cur = (window.OK_PRODUCTS || []).slice(), seen = {};
          cur.forEach(function (p) { seen[+p.id] = 1; });
          j.items.map(okiMapDb).forEach(function (p) { if (p.id && !seen[p.id]) { cur.push(p); seen[p.id] = 1; } });
          window.OK_PRODUCTS = cur;
        }
        okiHydrating = false; if (done) done(true);
      })
      .catch(function () { okiHydrating = false; if (done) done(false); });
  }

  // Adaptador de localStorage (fuera de la tienda): mismo "contrato" que window.OKtienda.
  var okiShim = null;
  function okiMakeShim() {
    function cartArr() {
      var s = okiLsCart(), out = [];
      for (var id in s) { var p = okiCatById(id); if (p && s[id] > 0) out.push({ id: p.id, name: p.name, price: p.price, qty: Math.min(p.stock || 99, s[id]), emoji: p.emoji, old: p.old, cat: p.cat }); }
      return out;
    }
    function changed() { okiSelfAdd = false; okiUpdateBadge(); if (okiListActive()) renderStoreList(); }
    return {
      _offstore: true,
      productos: function () { return okiCatalog(); },
      carrito: cartArr,
      deseados: function () { return okiLsWish().map(okiCatById).filter(Boolean); },
      total: function () { var t = 0; cartArr().forEach(function (it) { t += it.price * it.qty; }); return t; },
      buscar: okiSearchCatalog,
      agregar: function (id, qty) {
        id = +id;
        var n = Math.max(1, parseInt(qty, 10) || 1), p = okiCatById(id), s = okiLsCart();
        var cap = p && p.stock != null ? Math.max(0, +p.stock) : 99;
        s[id] = Math.min(cap, (s[id] || 0) + n);
        if (s[id] > 0) okiLsCartSave(s);
        var w = okiLsWish(), wi = w.indexOf(id);
        if (wi >= 0) { w.splice(wi, 1); okiLsWishSave(w); }
        changed();
      },
      cambiar: function (id, d) { var s = okiLsCart(); s[id] = (s[id] || 0) + d; if (s[id] <= 0) delete s[id]; okiLsCartSave(s); changed(); },
      quitar: function (id) { var s = okiLsCart(); delete s[id]; okiLsCartSave(s); changed(); },
      toggleDeseado: function (id) { id = +id; var w = okiLsWish(), i = w.indexOf(id); if (i >= 0) w.splice(i, 1); else w.push(id); okiLsWishSave(w); changed(); },
      verProducto: function () { okiGoTienda(); },   // fuera de la tienda no hay vista previa → lleva a la tienda
      abrirCarrito: function () { okiGoTienda(); },
      abrirDeseados: function () { okiGoTienda(); },
      entrarTienda: function () { okiGoTienda(); }
    };
  }
  // Devuelve el "contrato": la tienda en vivo si existe; si no, el adaptador de localStorage.
  function okiStore() {
    if (storeReady()) return window.OKtienda;
    if (!okiShim) okiShim = okiMakeShim();
    return okiShim;
  }

  // Estado que OKi vigila del carrito (para mostrar lo que se agrega y recomendar).
  var okiSnap = {};       // {id: qty} del carrito, para detectar lo recién agregado
  var okiLastRec = null;  // último producto recomendado (para "sí, agrégalo")
  var okiSelfAdd = false; // OKi mismo agregó (para no duplicar el aviso)
  var okiReopenAfterPreview = false; // volver a la lista al cerrar una vista previa abierta desde ella

  function okiProducts() { var S = okiStore(); try { return S ? (S.productos() || []) : []; } catch (e) { return []; } }
  function okiCart()     { var S = okiStore(); try { return S ? (S.carrito() || []) : []; } catch (e) { return []; } }
  function okiCartMap()  { var m = {}; okiCart().forEach(function (it) { m[it.id] = it.qty; }); return m; }
  function okiCartCount(){ var n = 0; okiCart().forEach(function (it) { n += it.qty; }); return n; }
  function okiTotal()    { var S = okiStore(); try { return S ? (S.total() || 0) : 0; } catch (e) { return 0; } }
  function okiFindProd(id) { var a = okiProducts().filter(function (p) { return p.id == id; }); return a[0] || null; }

  // Lista de recomendados que NO estén en el carrito (prioriza ofertas y la categoría que ya lleva).
  function okiRecommendList(n) {
    var prods = okiProducts(), cart = okiCartMap();
    if (!prods.length) return [];
    var cats = {};
    Object.keys(cart).forEach(function (id) { var p = okiFindProd(id); if (p) cats[p.cat] = 1; });
    var cand = prods.filter(function (p) { return !cart[p.id] && (p.stock == null || p.stock > 0); });
    cand.sort(function (a, b) {
      var sa = (a.old ? 2 : 0) + (cats[a.cat] ? 1 : 0), sb = (b.old ? 2 : 0) + (cats[b.cat] ? 1 : 0);
      return sb - sa;
    });
    return cand.slice(0, n || 3);
  }
  function okiRecommend() { var r = okiRecommendList(1)[0] || null; okiLastRec = r; return r; }
  function okiInWish(id) { var S = okiStore(), w = []; try { w = S ? (S.deseados() || []) : []; } catch (e) {} return w.some(function (d) { return d.id == id; }); }

  // ── Vista LISTA en la tienda: carrito (con cantidades) + recomendaciones + deseados ──
  /* Miniatura: la foto REAL del producto (viene en el contrato de la tienda). Si no
     hay foto, su emoji sobre el gradiente de la categoría. */
  function okiOlvThumb(p) {
    var f = okiFindProd(p.id) || {}, img = p.image || f.image;
    if (img) return '<span class="olv-th olv-th--img" data-oki-open="' + p.id + '" title="Ver producto"><img src="' + encodeURI(img) + '" alt="" loading="lazy"></span>';
    return '<span class="olv-th" data-oki-open="' + p.id + '" title="Ver producto" style="background:' + (f.grad || p.grad || 'var(--blue)') + ';cursor:pointer">' + (f.emoji || p.emoji || '📦') + '</span>';
  }
  function okiOlvItem(it) {
    /* AGOTADO en la lista. Las recomendaciones ya filtran lo que no hay, pero un
       producto que se guardó en el carrito y DESPUÉS se acabó seguía viéndose igual
       que cualquier otro: el cliente se enteraba hasta el checkout, que es el peor
       momento para descubrirlo. El stock sale del catálogo hidratado o del propio
       renglón, el que exista. OJO: stock == null significa "no lo sabemos" (catálogo
       de demostración), y eso NO es agotado — en la duda no se marca nada. */
    var f  = okiFindProd(it.id) || {};
    var st = (it.stock != null) ? +it.stock : (f.stock != null ? +f.stock : null);
    var agotado = (st != null && st <= 0);
    return '<div class="olv-it' + (agotado ? ' olv-it--out' : '') + '">' + okiOlvThumb(it) +
      '<div class="olv-nm" data-oki-open="' + it.id + '" style="cursor:pointer"><b>' + esc(it.name) + '</b><small>' +
        okiMxn(it.price) + ' c/u' + (agotado ? ' · <b class="olv-out">agotado</b>' : '') + '</small></div>' +
      /* Sumar más de algo que no hay no tiene sentido; restar y quitar sí, que es
         justo lo que la persona va a querer hacer. */
      '<span class="olv-q"><button data-oki-dec="' + it.id + '" aria-label="Quitar uno">−</button><span>' + it.qty + '</span>' +
        '<button data-oki-inc="' + it.id + '"' + (agotado ? ' disabled aria-disabled="true" title="Agotado"' : '') + ' aria-label="Agregar uno">+</button></span>' +
      '<button class="olv-x" data-oki-rm="' + it.id + '" aria-label="Quitar del carrito">✕</button></div>';
  }
  function okiOlvRec(p) {
    var f = okiFindProd(p.id) || p, onW = okiInWish(p.id);
    return '<div class="olv-rec">' + okiOlvThumb(p) +
      '<div class="olv-nm" data-oki-open="' + p.id + '" style="cursor:pointer"><b>' + esc(p.name) + '</b><small>' + okiMxn(p.price) + (f.old ? ' · <span class="o">oferta</span>' : '') + '</small></div>' +
      '<button class="olv-wsh' + (onW ? ' on' : '') + '" data-oki-wish="' + p.id + '" aria-label="Guardar en deseados">♥</button>' +
      '<button class="olv-add" data-oki-add="' + p.id + '" aria-label="Agregar al carrito">＋</button></div>';
  }
  function renderStoreList() {
    var cartBox = document.getElementById("oki-olv-cart"), foot = document.getElementById("oki-olv-foot");
    if (!cartBox) return;
    var c = okiCart(), off = !storeReady();
    if (c.length) {
      cartBox.innerHTML = c.map(okiOlvItem).join("");
      foot.innerHTML = '<div class="olv-tot"><span>Total</span><b>' + okiMxn(okiTotal()) + '</b></div>' +
        '<button class="olv-pay" data-oki-pay="1">' + (off ? 'Ir a la tienda a pagar →' : 'Ir a pagar →') + '</button>';
    } else {
      /* Fuera de la tienda con carrito/deseados guardados pero aún sin resolver:
         distinguir "cargando" (el catálogo viene en camino) de "no se pudo" (ya llegó
         y aun así no están: descatalogados o API caída). */
      var savedPend = off && okiHasSaved();
      cartBox.innerHTML = !off
        ? '<div class="olv-empty">Aún no eliges productos ' + OKI_CART + '<br>Toca <b>＋</b> en el catálogo y aquí te los muestro.</div>'
        : savedPend
          ? ((okiHydrating || !okiCatalog().length)
              ? '<div class="olv-empty">Cargando tu lista…</div>'
              : '<div class="olv-empty">No pude cargar tu lista 😕<br>Escríbenos por WhatsApp: 664 719 4117.</div>')
          : '<div class="olv-empty">Aún no tienes productos ' + OKI_CART + '<br>Entra a la tienda y arma tu pedido; aquí te lo guardo.</div>';
      foot.innerHTML = "";
    }
    var recs = okiRecommendList(3);
    var recSec = document.getElementById("oki-olv-rec-sec"), recBox = document.getElementById("oki-olv-recs");
    if (recs.length) { recSec.hidden = false; recBox.innerHTML = recs.map(okiOlvRec).join(""); } else { recSec.hidden = true; recBox.innerHTML = ""; }
    var wish = []; try { var Sw = okiStore(); wish = Sw ? (Sw.deseados() || []) : []; } catch (e) {}
    var wSec = document.getElementById("oki-olv-wish-sec"), wBox = document.getElementById("oki-olv-wish");
    wSec.hidden = false; // la sección de deseos siempre se muestra (con estado vacío)
    wBox.innerHTML = wish.length ? wish.map(okiOlvRec).join("")
      : '<div class="olv-empty" style="padding:8px 0 4px">Toca el <span style="color:#e11d48">' + OKI_HEART + '</span> en un producto para guardarlo aquí.</div>';
  }
  // Abrir la lista de OKi enfocando la sección de DESEADOS (lo usa el botón ❤ de la tienda).
  function okiShowDeseados() {
    if (!okiHasStore() || !panel) return;
    panel.setAttribute("data-view", "list");
    renderStoreList();
    if (!panel.classList.contains("on")) open();
    setTimeout(function () {
      var sec = document.getElementById("oki-olv-wish-sec"), box = document.getElementById("oki-olv-wish");
      if (sec) sec.scrollIntoView({ block: "start", behavior: "smooth" });
      if (box) { box.classList.add("olv-flash"); setTimeout(function () { box.classList.remove("olv-flash"); }, 1300); }
    }, 160);
  }
  function okiListActive() { return panel && panel.getAttribute("data-view") === "list" && okiHasStore(); }

  // Busca un producto por nombre (para "agrega el mouse").
  /* Quita el plural ("folders" -> "folder", "cajas" -> "caja"). Como después se
     busca por substring, con recortar la terminación basta. */
  function okiStem(w) { return w.replace(/(es|s)$/, ""); }
  /* Busca el producto que el cliente nombró. Gana el que empate MÁS palabras, y se
     busca también en marca/categoría/subcategoría ("toner", "3M", "papel bond"),
     no solo en el nombre. */
  function okiMatchProd(q) {
    q = okiNorm(q); if (!q) return null;
    var prods = okiProducts(); if (!prods.length) return null;
    var m = prods.filter(function (p) { var n = okiNorm(p.name); return n.indexOf(q) >= 0 || q.indexOf(n) >= 0; })[0];
    if (m) return m;
    var w = q.split(" ").map(okiStem).filter(function (x) { return x.length >= 3; });
    if (!w.length) return null;
    var best = null, bestScore = 0;
    prods.forEach(function (p) {
      var hay = okiNorm([p.name, p.brand || "", p.cat || "", p.sub || ""].join(" ")), s = 0;
      w.forEach(function (x) { if (hay.indexOf(x) >= 0) s++; });
      if (s > bestScore) { best = p; bestScore = s; }
    });
    return bestScore ? best : null;
  }

  /* Categorías REALES de la tienda (las de la BD, vía el contrato). Fuera de la tienda
     no hay, y esas preguntas las contesta el cerebro del servidor. */
  function okiCats() { var S = okiStore(); try { return (S && S.categorias) ? (S.categorias() || []) : []; } catch (e) { return []; } }
  /* ¿A qué categoría se refiere el mensaje? Gana la coincidencia MÁS LARGA, para que
     "papel fotográfico" no se quede en "Papel". Busca también en subcategorías. */
  function okiMatchCat(text, cats) {
    var n = okiNorm(text), best = null, bestLen = 0;
    if (/\btodo\b|\btodos\b|\btodas\b|\bcatalogo\b/.test(n)) return { id: "all", name: "Todos" };
    cats.forEach(function (c) {
      var cn = okiNorm(c.name);
      if (cn && n.indexOf(cn) >= 0 && cn.length > bestLen) { best = { id: c.id, name: c.name, count: c.count }; bestLen = cn.length; }
      (c.subs || []).forEach(function (s) {
        var sn = okiNorm(s);
        if (sn && n.indexOf(sn) >= 0 && sn.length > bestLen) { best = { id: c.id, name: s, sub: s }; bestLen = sn.length; }
      });
    });
    if (best) return best;
    if (/\boferta/.test(n)) { var of = cats.filter(function (c) { return c.ofertas; })[0]; if (of) return { id: of.id, name: of.name, count: of.count }; }
    // Por palabra suelta y sin plural: "calculadoras" → "Calculadoras".
    var words = n.split(" ").map(okiStem).filter(function (x) { return x.length >= 4; });
    cats.forEach(function (c) {
      var cn = okiNorm(c.name);
      words.forEach(function (w) { if (cn.indexOf(w) >= 0 && w.length > bestLen) { best = { id: c.id, name: c.name, count: c.count }; bestLen = w.length; } });
    });
    return best;
  }

  // Cantidades en palabra ("dos cajas") además de dígitos ("2 cajas").
  var OKI_NUM = { un: 1, una: 1, uno: 1, par: 2, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6,
                  siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, docena: 12 };
  var OKI_FILLER = /^(?:de |del |la |el |los |las |unos |unas |cajas? de |paquetes? de |piezas? de |unidades? de |rollos? de )+/;
  /* "6 folders" -> {p, qty:6}. Devuelve null si no reconoce ningún producto. */
  function okiParseOne(s) {
    s = String(s || "").replace(OKI_FILLER, "").trim();
    if (!s) return null;
    var qty = 1, m = s.match(/^(\d{1,3})\s+(.+)$/);
    if (m) { qty = +m[1]; s = m[2]; }
    else { var w = s.match(/^([a-zñ]+)\s+(.+)$/); if (w && OKI_NUM[w[1]]) { qty = OKI_NUM[w[1]]; s = w[2]; } }
    s = s.replace(OKI_FILLER, "").trim();
    var p = okiMatchProd(s);
    return p ? { p: p, qty: Math.max(1, Math.min(99, qty)) } : null;
  }
  /* Elige una coincidencia disponible del catálogo completo. En una petición genérica
     ("un cuaderno", "un tóner") prioriza relevancia, oferta y producto con foto; el
     precio más bajo desempata. Nunca escoge un agotado si hay una opción disponible. */
  function okiPickProduct(list, raw, qty) {
    var q = okiNorm(raw), words = q.split(" ").map(okiStem).filter(function (w) { return w.length >= 2; });
    var ranked = (list || []).filter(function (p) { return p && (p.stock == null || +p.stock > 0); }).map(function (p) {
      var name = okiNorm(p.name), hay = okiNorm([p.name, p.brand || "", p.cat || "", p.sub || "", p.sku || ""].join(" "));
      var score = 0;
      if (name === q || okiNorm(p.sku || "") === q) score += 1000;
      else if (name.indexOf(q) === 0) score += 300;
      else if (name.indexOf(q) >= 0) score += 180;
      words.forEach(function (w) {
        if (name.split(" ").some(function (nw) { return okiStem(nw) === w; })) score += 55;
        else if (hay.indexOf(w) >= 0) score += 20;
      });
      if (p.old && +p.old > +p.price) score += 12;
      if (p.image) score += 4;
      return { p: p, score: score };
    });
    ranked.sort(function (a, b) {
      return b.score - a.score || (+a.p.price || 0) - (+b.p.price || 0) ||
        String(a.p.name).localeCompare(String(b.p.name), "es");
    });
    if (!ranked.length) return null;
    var chosen = ranked[0].p;
    var exact = okiNorm(chosen.name) === q || okiNorm(chosen.sku || "") === q;
    return { p: chosen, qty: qty, generic: !exact && ranked.length > 1 };
  }
  /* Traduce necesidades cotidianas a términos que sí existen en el catálogo. La persona
     no tiene por qué saber que "algo para que no se pierdan los recibos" se busca como
     carpeta o archivador. Solo se usa para BUSCAR; OKi siempre dice qué producto eligió. */
  function okiEverydaySearch(raw) {
    var t = okiNorm(raw);
    if (/(guardar|ordenar|organizar|archivar|no se (?:me )?pierdan).*(papel|document|recibo|factura)/.test(t)) return "carpeta";
    if (/(papel|nota).*(pega|adhesiv)|post ?it/.test(t)) return "notas adhesivas";
    if (/(pegar|pegamento|goma).*(papel|cartulina|escolar)/.test(t)) return "pegamento";
    if (/(pluma|boligrafo).*(no manche|seque rapido|zurdo)|escribir.*sin manchar/.test(t)) return "boligrafo";
    if (/(dibujar|colorear|hacer dibujos)/.test(t)) return "colores";
    if (/(medir|trazar lineas|linea recta)/.test(t)) return "regla";
    if (/(cortar|recortar).*(papel|cartulina)/.test(t)) return "tijera";
    return raw;
  }

  /* Busca SIEMPRE en el catálogo completo cuando el contrato lo permite. Así una
     palabra genérica no se resuelve contra los primeros productos que casualmente
     estaban cargados en pantalla. Devuelve {p,qty,generic} o null. */
  function okiResolveOne(s) {
    var S = okiStore();
    var localHit = okiParseOne(s);
    if (!S || typeof S.buscar !== "function") return Promise.resolve(localHit);
    // Reaprovecha el troceo de cantidad: separa el número del nombre.
    var raw = String(s || "").replace(OKI_FILLER, "").trim(), qty = 1, m = raw.match(/^(\d{1,3})\s+(.+)$/);
    if (m) { qty = +m[1]; raw = m[2]; }
    else { var w = raw.match(/^([a-zñ]+)\s+(.+)$/); if (w && OKI_NUM[w[1]]) { qty = OKI_NUM[w[1]]; raw = w[2]; } }
    raw = raw.replace(OKI_FILLER, "").trim();
    if (!raw) return Promise.resolve(null);
    var q = Math.max(1, Math.min(99, qty));
    var busqueda = /^(?:un |una )?(?:producto|articulo|algo|cualquier cosa)(?: de papeleria)?$/.test(okiNorm(raw))
      ? "" : okiEverydaySearch(raw);
    var hecho = function (list) { return okiPickProduct(list, raw, q); };
    return Promise.resolve(S.buscar(busqueda, 12)).then(function (list) {
      if (list && list.length) return hecho(list);
      /* El catálogo del servidor busca por texto TAL CUAL: "calculadoras" no encuentra
         "Calculadora Canon" (el nombre va en singular). Se reintenta sin plural. */
      var sing = okiNorm(busqueda).split(" ").map(okiStem).join(" ").trim();
      if (!sing || sing === okiNorm(raw)) return localHit;
      return Promise.resolve(S.buscar(sing, 12)).then(function (retry) {
        return hecho(retry) || localHit;
      });
    }).catch(function () { return localHit; });
  }
  /* Pedido completo: "agrégame 6 folders y 2 tóner" -> [{p,qty:6},{p,qty:2}].
     Ojo: hay nombres que TRAEN "y" ("Papel HP hogar y oficina"), así que si al
     partir por "y"/"," no sale más de un producto, se toma la frase completa. */
  function okiParseAdd(rest) {
    rest = String(rest || "").trim();
    var chunks = rest.split(/\s*(?:,|\+|\by\b|\be\b|\btambien\b|\bademas\b)\s*/).filter(Boolean);
    var multi = chunks.length > 1;
    return Promise.all((multi ? chunks : [rest]).map(okiResolveOne)).then(function (parts) {
      parts = parts.filter(Boolean);
      // Si al partir por "y"/"," no salieron 2+ productos, el texto era UN solo nombre.
      if (multi && parts.length < 2) return okiResolveOne(rest).then(function (w) { return w ? [w] : []; });
      var out = [], seen = {};
      parts.forEach(function (it) {                     // "2 folders y 3 folders" = 5
        if (seen[it.p.id]) { seen[it.p.id].qty = Math.min(99, seen[it.p.id].qty + it.qty); return; }
        seen[it.p.id] = it; out.push(it);
      });
      return out;
    });
  }

  function okiUpdateBadge() {
    var b = document.getElementById("oki-cart-badge");
    if (!b) return;
    var n = okiCartCount();
    b.textContent = n; b.style.display = n ? "" : "none";
  }

  // ── Posición del astronauta: apartarse del carrito, "peek" (asomar) o normal ──
  // Peek = tras un rato sin usar OKi (panel cerrado), se esconde AHÍ MISMO recostándose
  // en la pared derecha y solo asoma su cabecita; al tocarlo o pasar el mouse, regresa.
  // Así no estorba banners/botones y sigue a la mano en su esquina.
  var okiPeeked = false, okiPeekTimer = null, OKI_PEEK_MS = 12000;
  /* ¿Hay algún panel/cajón abierto que OKi taparía (o que taparía a OKi)? Se aparta cuando:
     - Tienda: carrito (#app.cart-open) o filtros (#app.filt-open).
     - Ficha: carrito (.sb-panel.show de shop-header.js).
     - Compra rápida: SOLO el carrito lateral derecho (#tdCartDrawer), que sí tapa a OKi.
     Antes se apartaba también por el panel de FILTROS (#tdFilts) —que va en el flujo, arriba,
     y nunca tapa a OKi— y por FAVORITOS/UBICACIÓN (#tdWishDrawer/#tdLocDrawer), que comparten
     la clase base .td-drawer pero son MODALES CENTRADOS con velo: OKi se deslizaba 430px a la
     izquierda flotando sobre el velo. Por eso "se movía y se buggeaba". */
  function okiShouldDodge() {
    var a = document.getElementById("app");
    if (a && (a.classList.contains("cart-open") || a.classList.contains("filt-open"))) return true;
    if (document.querySelector(".sb-panel.show")) return true;   // carrito de la ficha
    var cart = document.getElementById("tdCartDrawer");          // SOLO el carrito lateral de compra rápida
    if (cart && cart.classList.contains("open")) return true;
    return false;
  }
  function okiUpdatePosition() {
    if (!dock) return;
    var mobile = window.innerWidth <= 640;
    if (okiShouldDodge()) {                       // carrito/filtro abierto → apartarse
      dock.classList.remove("oki-peek");
      dock.style.transform = mobile ? "translate3d(0,140px,0)" : "translate3d(-430px,0,0)";
      dock.style.opacity = mobile ? "0" : ""; dock.style.pointerEvents = mobile ? "none" : "";
    } else {                                     // normal o peek (según inactividad)
      var peek = okiPeeked && !(panel && panel.classList.contains("on"));
      dock.classList.toggle("oki-peek", peek);   // (oculta el globo antes de medir)
      if (peek) {
        // Se esconde AHÍ MISMO, recostándose en la PARED DERECHA (donde ya está);
        // solo asoma su cabecita. No viaja a la izquierda.
        var w = mobile ? 62 : 76;               // ancho del astronauta (.oki)
        var gap = mobile ? 16 : 26;             // .oki-dock { right }
        var visible = mobile ? 48 : 50;         // cuánto asoma (casi todo; solo se recuesta un poco)
        var tx = gap + (w - visible);           // empuja a la derecha, fuera de la pantalla
        dock.style.transform = "translate3d(" + tx + "px,0,0)";
        dock.style.opacity = "1";
        dock.style.pointerEvents = "";
      } else {
        dock.style.transform = ""; dock.style.opacity = ""; dock.style.pointerEvents = "";
      }
    }
  }
  function okiResetPeekTimer() {
    clearTimeout(okiPeekTimer);
    okiPeekTimer = setTimeout(function () { okiPeeked = true; okiUpdatePosition(); }, OKI_PEEK_MS);
  }
  function okiWake() {
    var was = okiPeeked;
    okiPeeked = false; okiUpdatePosition(); okiResetPeekTimer();
    if (was && dock) { dock.classList.add("oki-waking"); setTimeout(function () { dock.classList.remove("oki-waking"); }, 720); }
  }

  // Globo del astronauta con lo recién agregado + una recomendación.
  function okiBubbleAdd(prod) {
    var bb = document.getElementById("oki-bubble");
    if (!bb) return;
    var rec = okiRecommend();
    var html = OKI_CART + " Agregaste <b>" + esc(prod.name) + "</b><br>Llevas " + okiCartCount() + " · " + okiMxn(okiTotal());
    if (rec) html += "<br>💡 También: <b>" + esc(rec.name) + "</b> " + okiMxn(rec.price);
    bb.innerHTML = html;
    bb.classList.add("on");
    clearTimeout(bubbleT);
    bubbleT = setTimeout(function () { bb.classList.remove("on"); }, 6500);
  }

  // Cada cambio del carrito: actualiza el badge y, si algo se agregó, lo muestra.
  /* No abrir la lista sola cuando el usuario llegó a la tienda para PAGAR o para poner su
     UBICACIÓN: taparía el pago (coOv) o la libreta (locOv). Se detecta por el hash (fiable
     desde la carga) o por el overlay ya visible. La lista igual se prepara en silencio. */
  function okiSuppressAutoOpen() {
    var h = (location.hash || "");
    if (h === "#checkout" || h === "#ubicacion") return true;
    var co = document.getElementById("coOv"), lo = document.getElementById("locOv");
    if (co && co.classList.contains("show")) return true;
    if (lo && lo.classList.contains("show")) return true;
    return false;
  }
  function okiOnCartChange() {
    var now = okiCartMap(), addedId = null, nowN = 0, oldN = 0;
    for (var id in now) { nowN += now[id]; if (now[id] > (okiSnap[id] || 0)) addedId = +id; }
    for (var id2 in okiSnap) oldN += okiSnap[id2];
    var grew = nowN > oldN;   // el carrito creció (aunque sea re-agregar un ítem ya presente)
    okiSnap = now;
    okiUpdateBadge();
    if (okiListActive()) renderStoreList();            // la lista de OKi se actualiza sola
    if (!grew) return;                                  // no aumentó → no es "agregado"
    if (okiSelfAdd) { okiSelfAdd = false; return; }     // OKi ya lo confirmó él mismo
    var p = okiFindProd(addedId) || okiFindProd(Object.keys(now)[Object.keys(now).length - 1]);
    if (!p) return;
    var abierto = panel && panel.classList.contains("on");
    if (!abierto) {
      // Al AGREGAR, la lista se abre sola y se queda abierta (hasta cerrar/vista previa/salir).
      // Salvo que se esté pagando o eligiendo ubicación (no taparlos).
      panel.setAttribute("data-view", "list");
      renderStoreList();
      if (!okiSuppressAutoOpen()) open();
    } else if (panel.getAttribute("data-view") === "chat") {
      var rec = okiRecommend();
      var msg = "🛒 Agregué " + p.name + " a tu carrito. Llevas " + okiCartCount() + " (" + okiMxn(okiTotal()) + ").";
      if (rec) msg += "\n💡 Te recomiendo: " + rec.name + " (" + okiMxn(rec.price) + "). Dime \"agrégalo\" y lo pongo.";
      addMsg(msg, "bot");
    }
    // panel abierto en vista lista: ya se ve el cambio en la lista.
  }

  /* Si OKi propuso explícitamente un paquete y preguntó si debía agregarlo, una respuesta
     "sí" convierte los artículos cotidianos mencionados en búsquedas reales. Así el chat
     no afirma que armó un kit sin haber modificado de verdad el carrito. */
  function okiSuggestedBundle() {
    var prev = "";
    for (var i = history.length - 1; i >= 0; i--) {
      if (history[i] && history[i].role === "assistant") { prev = okiNorm(history[i].content); break; }
    }
    if (!prev || !/(paquete|kit).*(agreg|carrito)|(?:agreg|carrito).*(paquete|kit)/.test(prev)) return [];
    var terms = [
      ["cuaderno", /\bcuadernos?\b/], ["lapiz grafito", /\blapices?\b/],
      ["lapices de colores", /\bcolores?\b/], ["tijera", /\btijeras?\b/],
      ["regla", /\breglas?\b/], ["borrador", /\b(?:borradores?|gomas?)\b/],
      ["sacapuntas", /\bsacapuntas\b/], ["pegamento", /\b(?:pegamentos?|adhesivos?)\b/],
      ["folder", /\b(?:folders?|carpetas?)\b/], ["pluma", /\b(?:plumas?|boligrafos?)\b/]
    ];
    return terms.filter(function (x) { return x[1].test(prev); }).map(function (x) { return x[0]; }).slice(0, 6);
  }

  /* El estado EN VIVO del carrito/deseados solo lo conoce la tienda (no el servidor),
     así que estas preguntas y acciones se resuelven aquí mismo. Devuelve texto o null. */
  function storeLocalReply(text) {
    var S = okiStore();
    if (!S) return null;   // sin catálogo (no debería pasar: catalogo.js carga en todo el sitio)
    var t = okiNorm(text);

    // Carrito: qué llevo / cuánto voy / mi total…
    if (/\bcarrito\b|\bcarro\b|que llevo|que tengo|mi compra|cuanto llevo|cuanto va|cuanto voy|mi total|que voy a pagar/.test(t)) {
      var c = okiCart();
      if (!c.length) return "Tu carrito está vacío 🛒 Agrega productos y te digo el total al instante. ¿Quieres que te lleve al catálogo?";
      var total = 0, lines = c.map(function (it) { total += it.price * it.qty; return "• " + it.qty + "× " + it.name + " — " + okiMxn(it.price * it.qty); });
      var rec = okiRecommend();
      var extra = rec ? "\n💡 Se te podría antojar: " + rec.name + " (" + okiMxn(rec.price) + "). Dime \"agrégalo\"." : "";
      var fin = storeReady() ? "\nToca el carrito 🛒 arriba para finalizar." : "\nDime \"entrar a la tienda\" y te llevo a finalizar tu compra.";
      return "Esto llevas en tu carrito 🛒\n" + lines.join("\n") + "\nTotal: " + okiMxn(total) + extra + fin + " Recoge en OK.station o pide envío a domicilio; pagas en línea.";
    }

    // Deseados / favoritos
    if (/deseado|favorito|lista de deseos|wishlist/.test(t)) {
      var w = [];
      try { w = S.deseados() || []; } catch (e) {}
      setTimeout(okiShowDeseados, 300); // los muestra en la lista, enfocando la sección
      if (!w.length) return "Aún no tienes deseados ❤ Toca el corazón en cualquier producto para guardarlo y comprarlo cuando quieras.";
      var wl = w.map(function (p) { return "• " + p.name + " — " + okiMxn(p.price); });
      return "Tus deseados ❤\n" + wl.join("\n") + "\nTe los muestro en tu lista 👇";
    }

    // Recomendación / consejo
    if (/recomienda|recomiendas|recomendacion|sugiere|sugerencia|que compro|que me llevo|que mas llevo|aconseja|un consejo/.test(t)) {
      /* Si piden algo ESPECÍFICO ("recomiéndame un tóner", "sugiéreme algo para mi
         impresora"), eso lo contesta mejor la IA del servidor (sabe compatibilidades
         y qué es cada cosa); la regla local solo atiende el "¿qué me recomiendas?"
         GENÉRICO del carrito. Se recorta el verbo y las muletillas: si sobra un
         sustantivo que NO empata con el catálogo local, se deja pasar al servidor. */
      var resto = t
        .replace(/\b(me|que|puedes|podrias|oki)\b/g, " ")
        .replace(/recomienda(s|me|rias)?|recomendacion(es)?|sugiere(me)?|sugerencia(s)?|aconseja(me|s)?|un consejo|que compro|que me llevo|que mas llevo/g, " ")
        .replace(/\b(algo|para|comprar|llevar|llevarme|de|del|la|el|los|las|un|una|unos|unas|mi|mis|tu|hoy|ahora|porfa|por favor|mejor|bueno|buena)\b/g, " ")
        .replace(/\s+/g, " ").trim();
      if (resto.length >= 3 && !okiMatchProd(resto)) return null;   // → servidor (Gemini)
      var r = okiRecommend();
      if (!okiCart().length) {
        return "Claro, yo te guío desde cero 😊 ¿Lo necesitas para escuela, organizar documentos, escribir o dibujar, o para una impresora?";
      }
      if (!r) return "Ya llevas de todo 😄 ¿Te muestro el carrito o quieres ver otra categoría?";
      return "Te recomiendo " + (r.emoji ? r.emoji + " " : "") + r.name + " — " + okiMxn(r.price) + (r.old ? " (¡en oferta! 🔥)" : "") + "\nDime \"agrégalo\" y lo pongo en tu carrito. 🛒";
    }

    /* ── Categorías de la tienda ── (VA ANTES DE AGREGAR, a propósito)
       "pon la categoría de calculadoras" NO es "ponme una calculadora": como el verbo
       "pon" también dispara el agregar, antes esa frase te METÍA el producto al
       carrito en vez de abrir la categoría. */
    var pideCat  = /\bcategoria|\bcategorias\b|\bseccion\b|\bfiltro\b/.test(t);
    var esAgregar = /\b(?:agrega|anade|pon(?:me|le|nos|lo|la)?|mete|suma|dame|quiero|llevo|necesito)\b/.test(t);
    var pideOfertas = /\boferta/.test(t) && !esAgregar;
    if (pideCat || pideOfertas) {
      var cats = okiCats();
      if (!cats.length) return null;              // fuera de la tienda lo cuenta el cerebro
      // "¿qué categorías hay?" → listarlas
      if (/\b(que|cuales|cuantas|dime|hay|tienen|tienes|muestrame las|ver las)\b[^]*\b(categoria|seccion)/.test(t) || /^categorias\b/.test(t)) {
        return "Estas son las categorías de la tienda 🛒\n" +
          cats.map(function (c) { return "• " + c.name + (c.count ? " (" + c.count + ")" : ""); }).join("\n") +
          "\nDime \"pon la categoría de " + (cats[1] || cats[0]).name + "\" y te la abro.";
      }
      var destino = okiMatchCat(t, cats);
      if (destino) {
        try { S.verCategoria(destino.id, destino.sub || ""); } catch (e) { return null; }
        var cuantos = destino.count ? " (" + destino.count + " productos)" : "";
        return "¡Va! Te puse la categoría " + destino.name + cuantos + " 🛒\n" +
               "Dime \"agrégame 2 de <producto>\" y te los pongo en el carrito.";
      }
      if (pideCat) return "¿Cuál categoría te abro? Tengo: " + cats.map(function (c) { return c.name; }).join(", ") + ".";
    }

    /* Agregar al carrito: uno o VARIOS productos, con cantidad.
       "agrégame 2 notas adhesivas", "quiero 6 folders y 3 tóner", "sí, agrégalo". */
    var mAdd = t.match(/\b(?:agrega(?:me|le|nos|lo|la|los|las)?|agregar|anade(?:me|le)?|anadir|pon(?:me|le|nos|lo|la)?|poner|mete(?:me|le)?|meter|suma(?:me|le)?|dame|regalame|quiero|llevo|llevame|necesito|echame|vendeme|comprar?)\s+(.+)/);
    var confirmaTexto = /^(si|sip|simon|dale|va|vale|agregalo|ponlo|ese|esa|obvio|claro|ok|okey|de una)\b/.test(t);
    var paqueteSugerido = confirmaTexto && !okiLastRec ? okiSuggestedBundle() : [];
    var confirma = confirmaTexto && (!!okiLastRec || paqueteSugerido.length > 0);
    if (mAdd || confirma) {
      // Promesa: puede tener que buscar el producto en el catálogo del servidor.
      var resolver = mAdd && mAdd[1] ? okiParseAdd(mAdd[1])
        : (paqueteSugerido.length
            ? Promise.all(paqueteSugerido.map(okiResolveOne)).then(function(xs){ return xs.filter(Boolean); })
            : Promise.resolve([]));
      return resolver.then(function (items) {
        if (!items.length && confirma && okiLastRec) items = [{ p: okiLastRec, qty: 1 }];
        if (!items.length) {
          // "quiero saber el precio" no es un pedido: que lo conteste el cerebro.
          if (!/^(?:agrega|anade|pon|mete|suma|dame)/.test(t)) return null;
          return "¿Cuál producto agrego? Dime el nombre y la cantidad (por ejemplo \"agrega 3 folders\") y lo busco 🙂";
        }
        var added = [], agotados = [];
        items.forEach(function (it) {
          var st = it.p.stock;
          if (st != null && st <= 0) { agotados.push(it.p.name); return; }
          var q = (st != null) ? Math.min(it.qty, st) : it.qty;   // nunca más de lo que hay
          okiSelfAdd = true;
          try {
            S.agregar(it.p.id, q);
            added.push({ name: it.p.name, price: it.p.price, qty: q, corto: q < it.qty, generic: !!it.generic });
          }
          catch (e) { okiSelfAdd = false; }
        });
        if (!added.length) return (agotados.join(", ") || "Eso") + " está agotado por ahora 😕. ¿Te recomiendo otra cosa?";
        var msg = "¡Listo! Agregué a tu carrito 🛒\n" + added.map(function (a) {
          return "• " + a.qty + "× " + a.name + " — " + okiMxn(a.price * a.qty);
        }).join("\n");
        var elegidos = added.filter(function (a) { return a.generic; });
        if (elegidos.length) {
          msg += "\nElegí " + elegidos.map(function (a) { return a.name; }).join(", ") +
            " porque no indicaste marca o modelo. Si prefieres otro, dime cuál quieres; puedo agregarlo y quitar éste.";
        }
        var cortos = added.filter(function (a) { return a.corto; });
        if (cortos.length) msg += "\n⚠ De " + cortos.map(function (a) { return a.name; }).join(", ") + " solo quedaba lo que puse.";
        if (agotados.length) msg += "\n😕 Agotado por ahora: " + agotados.join(", ") + ".";
        msg += "\nLlevas " + okiCartCount() + " · " + okiMxn(okiTotal());
        var rec2 = okiRecommend();
        if (rec2) msg += "\n💡 ¿Le sumas " + rec2.name + " (" + okiMxn(rec2.price) + ")? Dime \"agrégalo\".";
        return msg;
      });
    }

    // Quitar del carrito ("quita el mouse")
    var mDel = t.match(/(?:quita|quitar|elimina|borra|saca|remueve)\s+(.+)/);
    if (mDel && mDel[1]) {
      var del = okiMatchProd(mDel[1]);
      if (del && okiCartMap()[del.id]) { try { S.quitar(del.id); } catch (e) {} return "Quité " + del.name + " del carrito. Llevas " + okiCartCount() + " · " + okiMxn(okiTotal()) + "."; }
      return "No encontré ese producto en tu carrito 🤔. Dime \"¿qué llevo?\" y te muestro la lista.";
    }

    return null; // el resto lo contesta el cerebro del servidor (precios, envíos, cómo pago…)
  }

  function el(html) { var d = document.createElement("div"); d.innerHTML = html; return d.firstElementChild; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function linkify(s) {
    var html = esc(s);
    // Enlaces Markdown [texto](url) → <a> real (evita que el auto-enlazador los rompa).
    html = html.replace(/\[([^\]]+)\]\(((?:https?:\/\/|\/)[^\s)]+)\)/g, function (_m, txt, url) {
      return '<a href="' + url + '" target="_blank" rel="noopener">' + txt + '</a>';
    });
    // Negritas **texto** y *texto* → <strong> (Gemini a veces las usa).
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|\s)\*([^*\s][^*]*?)\*(?=\s|$|[.,;:!?])/g, '$1<em>$2</em>');
    // URLs sueltas restantes → <a> (excluye ] ) para NO tragarse Markdown).
    html = html.replace(/(^|[\s(])(https?:\/\/[^\s)\]<]+)/g, function (_m, pre, url) {
      return pre + '<a href="' + url + '" target="_blank" rel="noopener">' + url + '</a>';
    });
    return html;
  }

  var dock, panel, chat, input;

  /* El botón del encabezado alterna lista ⇄ chat, así que debe mostrar el ICONO
     DEL DESTINO, no el de donde ya estás: en el chat ofrece el carrito (tu lista)
     y estando en la lista ofrece el globo (chatear). Antes siempre decía 🛒, así
     que desde la lista parecía llevar otra vez a la lista. */
  function okiSyncTab() {
    var b = document.getElementById("oki-tab");
    if (!b || !panel) return;
    var enLista = panel.getAttribute("data-view") === "list";
    b.innerHTML = enLista ? OKI_CHAT : OKI_CART;
    var t = enLista ? "Chatear con OKi" : "Tu lista de compras";
    b.setAttribute("aria-label", t);
    b.setAttribute("title", t);
  }
  function showList() {
    panel.setAttribute("data-view", "list");
    renderStoreList();   // la estructura siempre existe; renderStoreList maneja vacío/cargando
    okiSyncTab();
  }
  function showChat() { panel.setAttribute("data-view", "chat"); okiSyncTab(); }

  function build() {
    if (document.getElementById("oki-dock")) return;

    // CSS (por si el <link> no está en el <head>).
    if (!document.querySelector('link[href*="oki.css"]')) {
      var l = document.createElement("link");
      l.rel = "stylesheet"; l.href = "assets/oki.css?v=20260728a";
      document.head.appendChild(l);
    }
    document.body.appendChild(el(SVG_DEFS));

    dock = el(
      '<div class="oki-dock" id="oki-dock">' +
      '<div class="oki-bubble" id="oki-bubble">¡Hola! Soy <b>OKi</b> 🚀<br>Pregúntame lo que sea del sitio.</div>' +
      '<button class="oki" id="oki-btn" type="button" aria-label="Abrir asistente OKi">' +
      '<span class="oki__aura"></span>' +
      '<span class="oki__craft">' + SVG_ASTRO + '</span>' +
      '<span class="oki-cart-badge" id="oki-cart-badge" aria-hidden="true" style="display:none">0</span>' +
      '</button></div>'
    );
    document.body.appendChild(dock);

    // En la tienda: saludo contextual, seguimiento del carrito y apartarse al abrirlo.
    if (storeReady()) {
      var bb0 = document.getElementById("oki-bubble");
      if (bb0) bb0.innerHTML = '¿Buscas algo en la <b>tienda</b>? 🛒<br>Yo te llevo el carrito y te doy recomendaciones.';
      okiSnap = okiCartMap();          // punto de partida para detectar lo que se agrega
      okiUpdateBadge();
      window.addEventListener("oktienda:carrito", okiOnCartChange);
      window.addEventListener("oktienda:deseados", function () { okiUpdateBadge(); if (okiListActive()) renderStoreList(); });
      // OKi se aparta a la izquierda cuando el carrito está abierto y REGRESA al
      // cerrarse. Se observa la clase real .cart-open de #app (no solo eventos), para
      // que NUNCA se quede colgado aunque el carrito se cierre por checkout/Escape/scrim.
      var okiAppEl = document.getElementById("app");
      function okiApplyDodge() {
        if (okiShouldDodge() && panel && panel.classList.contains("on")) close();
        okiUpdatePosition();
      }
      /* Se observa la clase REAL de los paneles (no solo eventos), para que OKi nunca se
         quede colgado aunque el panel se cierre por checkout/Escape/scrim. En la ficha el
         carrito (.sb-panel) se crea al vuelo, así que shop-header.js emite carrito-abierto/
         cerrado; en la compra rápida se observan sus cajones y filtro. */
      if (window.MutationObserver) {
        var obs = new MutationObserver(okiApplyDodge), OPT = { attributes: true, attributeFilter: ["class"] };
        if (okiAppEl) obs.observe(okiAppEl, OPT);                                   // tienda (#app: cart-open/filt-open)
        ["tdFilts", "tdCartDrawer", "tdWishDrawer", "tdLocDrawer"].forEach(function (id) {
          var el = document.getElementById(id); if (el) obs.observe(el, OPT);       // compra rápida
        });
      }
      window.addEventListener("oktienda:carrito-abierto", okiApplyDodge);
      window.addEventListener("oktienda:carrito-cerrado", okiApplyDodge);
      // Al ENTRAR al catálogo: OKi prepara la lista. Si ya tienes productos guardados,
      // te la abre; si está vacía, solo ofrece ayuda con un globo (sin abrirse sola).
      window.addEventListener("oktienda:en-tienda", function () {
        if (!panel) return;
        panel.setAttribute("data-view", "list");
        renderStoreList();
        // Si llegamos para PAGAR o poner UBICACIÓN, no abrir la lista sola (taparía el pago/libreta).
        if (okiSuppressAutoOpen()) return;
        if (okiCartCount() > 0) {
          open();
        } else if (!panel.classList.contains("on")) {
          var bb = document.getElementById("oki-bubble");
          if (bb) {
            bb.innerHTML = '🛒 Te armo tu <b>lista de compras</b> aquí.<br>Tócame cuando quieras.';
            bb.classList.add("on");
            clearTimeout(bubbleT);
            bubbleT = setTimeout(function () { bb.classList.remove("on"); }, 6000);
          }
        }
      });
      // La lista se cierra al SALIR del e-commerce o al abrir la VISTA PREVIA de un producto.
      window.addEventListener("oktienda:en-landing", function () { close(); });
      window.addEventListener("oktienda:vista-previa", function () { close(); });
      // Si la vista previa se abrió DESDE la lista de OKi, al cerrarla se vuelve a la lista.
      // Se difiere para que el mismo clic (que burbujea al document) no la vuelva a cerrar.
      window.addEventListener("oktienda:vista-previa-cerrada", function () {
        if (!okiReopenAfterPreview) return;
        okiReopenAfterPreview = false;
        setTimeout(function () {
          if (storeReady() && panel) { panel.setAttribute("data-view", "list"); renderStoreList(); open(); }
        }, 60);
      });
      // El botón ❤ de la tienda abre la lista de OKi enfocando los deseados.
      window.addEventListener("oktienda:ver-deseados", okiShowDeseados);
      // Al agregar al carrito desde el banner de deseados: OKi muestra tu lista.
      window.addEventListener("oktienda:ver-lista", function () {
        if (!panel) return;
        panel.setAttribute("data-view", "list");
        renderStoreList();
        if (!panel.classList.contains("on")) open();
      });
    }

    panel = el(
      '<div class="oki-panel" id="oki-panel" data-view="chat" role="dialog" aria-label="Asistente OKi" aria-hidden="true">' +
      '<div class="oki-panel__h">' +
      '<span class="mini" aria-hidden="true">' + OKI_ROCKET + '</span>' +
      '<div class="oki-panel__t"><b>OKi · Tu asistente</b><small>Te ayudo con todo el sitio</small></div>' +
      '<button class="oki-tab" id="oki-tab" type="button" aria-label="Tu lista de compras" title="Tu lista de compras">' + OKI_CART + '</button>' +
      '<button class="cls" type="button" aria-label="Cerrar">×</button>' +
      '</div>' +
      // Vista CHAT
      '<div class="oki-view oki-view--chat">' +
      '<div class="oki-chat" id="oki-chat"></div>' +
      '<div class="oki-quick" id="oki-quick"></div>' +
      '<form class="oki-input" id="oki-form" autocomplete="off">' +
      '<input id="oki-text" placeholder="Escríbele a OKi…" aria-label="Mensaje para OKi">' +
      '<button type="submit" aria-label="Enviar">' + OKI_SEND + '</button>' +
      '</form></div>' +
      // Vista LISTA = tu lista de compras (carrito + recomendaciones + deseados).
      // Es la MISMA lista funcional en todo el sitio (dentro y fuera de la tienda).
      /* Se arma SIEMPRE la estructura de la lista, aunque el catálogo aún no haya llegado:
         fuera de la tienda, catalogo.js llena window.OK_PRODUCTS async y dispara
         'ok-catalogo-listo'. Si aquí se armara el fallback "No pude cargar", el panel se
         quedaría clavado en él sin re-renderizar cuando el catálogo sí llega. Los estados
         vacío / cargando / error los resuelve renderStoreList(). */
      ('<div class="oki-view oki-view--list oki-view--store">' +
          '<div class="olv-sec">' + OKI_CART + ' Tu lista de compras</div>' +
          '<div class="olv-cart" id="oki-olv-cart"></div>' +
          '<div class="olv-foot" id="oki-olv-foot"></div>' +
          '<div class="olv-sec" id="oki-olv-rec-sec" hidden>' + OKI_BULB + ' Te puede interesar</div>' +
          '<div class="olv-recs" id="oki-olv-recs"></div>' +
          '<div class="olv-sec" id="oki-olv-wish-sec" hidden>' + OKI_HEART + ' Lista de deseos</div>' +
          '<div class="olv-wish" id="oki-olv-wish"></div>' +
          (storeReady() ? '' : '<button class="olv-store" id="oki-olv-store" type="button">' + OKI_CART + ' Entrar a la tienda</button>') +
          '<button class="olv-chat" id="oki-olv-chat" type="button">' + OKI_CHAT + ' Chatear con OKi</button>' +
          '</div>') +
      '</div>'
    );
    document.body.appendChild(panel);

    chat = panel.querySelector("#oki-chat");
    input = panel.querySelector("#oki-text");

    var quick = panel.querySelector("#oki-quick");
    (storeReady() ? QUICKS_STORE : QUICKS).forEach(function (q) {
      var b = document.createElement("button");
      b.type = "button"; b.textContent = q;
      b.addEventListener("click", function () {
        /* Se recorta SOLO el prefijo decorativo (el emoji de los atajos de la
           tienda). Los atajos sin emoji van completos: este recorte a ciegas
           convertía "No sé qué necesito" en "sé qué necesito" en las 23 páginas
           que no son la tienda, y el cliente veía su mensaje mutilado. */
        var esEmoji = !/^[0-9A-Za-zÁÉÍÓÚÜÑáéíóúüñ¿¡]/.test(q.charAt(0));
        send(esEmoji ? q.replace(/^[^\s]+\s/, "") : q);
      });
      quick.appendChild(b);
    });
    var listChip = document.createElement("button");
    listChip.type = "button"; listChip.innerHTML = OKI_CART + " Tu lista";
    listChip.addEventListener("click", showList);
    quick.appendChild(listChip);

    /* El astronauta representa el CHAT, no un toggle ciego del panel:
       · si estaba replegado (peek), despierta y abre en el MISMO clic;
       · si la lista está visible, cambia a chat sin cerrar el panel;
       · solo cierra cuando el chat ya estaba abierto.
       Antes el primer clic podía limitarse a despertar a OKi o cerrar la lista, y
       obligaba a pulsarlo una segunda vez para ver el chat. */
    document.getElementById("oki-btn").addEventListener("click", function () {
      if (okiPeeked) okiWake();
      if (panel.classList.contains("on") && panel.getAttribute("data-view") === "chat") {
        close();
        return;
      }
      showChat();
      if (!panel.classList.contains("on")) open();
    });
    // Al pasar el mouse por encima, regresa (por si estorbaba) y reinicia el conteo.
    dock.addEventListener("mouseenter", function () { if (okiPeeked) okiWake(); else okiResetPeekTimer(); });
    window.addEventListener("resize", function () { if (okiPeeked || okiShouldDodge()) okiUpdatePosition(); }, { passive: true });
    okiResetPeekTimer(); // arranca el conteo de inactividad (12s → se esconde en su esquina derecha)
    panel.querySelector(".cls").addEventListener("click", close);
    panel.querySelector("#oki-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var v = input.value.trim();
      if (v) send(v);
    });

    // Botón 📝 del encabezado: alterna lista ⇄ chat.
    document.getElementById("oki-tab").addEventListener("click", function () {
      panel.getAttribute("data-view") === "list" ? showChat() : showList();
    });

    // ── Tu lista de compras: acciones sobre el carrito/deseados vía el contrato ──
    // Dentro de la tienda actúa sobre el carrito EN VIVO; fuera, sobre el guardado
    // (localStorage) para que al entrar a la tienda ya lo tengas armado.
    // La estructura .oki-view--store SIEMPRE existe, así que el manejador se engancha
    // aunque el catálogo aún no haya cargado (fuera de la tienda llega async).
    {
      panel.querySelector(".oki-view--store").addEventListener("click", function (e) {
        // El clic está DENTRO del panel: no debe llegar al "clic-fuera" del document
        // (al re-renderizar la lista el botón se desconecta y closest() fallaría → cerraría).
        e.stopPropagation();
        var S = okiStore(), x;
        if (!S) return;
        if ((x = e.target.closest("[data-oki-inc]"))) { okiSelfAdd = true; try { S.cambiar(+x.dataset.okiInc, 1); } catch (er) { okiSelfAdd = false; } }
        else if ((x = e.target.closest("[data-oki-dec]"))) { try { S.cambiar(+x.dataset.okiDec, -1); } catch (er) {} }
        else if ((x = e.target.closest("[data-oki-rm]")))  { try { S.quitar(+x.dataset.okiRm); } catch (er) {} }
        else if ((x = e.target.closest("[data-oki-add]"))) { okiSelfAdd = true; try { S.agregar(+x.dataset.okiAdd); } catch (er) { okiSelfAdd = false; } }
        else if ((x = e.target.closest("[data-oki-wish]"))){ try { S.toggleDeseado(+x.dataset.okiWish); } catch (er) {} renderStoreList(); }
        else if ((x = e.target.closest("[data-oki-open]"))) { okiReopenAfterPreview = true; try { S.verProducto(+x.dataset.okiOpen); } catch (er) { okiReopenAfterPreview = false; } }
        else if (e.target.closest("[data-oki-pay]")) { try { S.abrirCarrito(); } catch (er) {} }
        else if (e.target.closest("#oki-olv-store")) { try { S.entrarTienda(); } catch (er) { okiGoTienda(); } }
        else if (e.target.closest("#oki-olv-chat")) { showChat(); }
      });
      if (storeReady()) panel.setAttribute("data-view", "list"); // en la tienda la LISTA predomina; fuera predomina el CHAT
      okiSyncTab();   // el icono del encabezado debe nacer acorde a la vista inicial
      renderStoreList();
      okiUpdateBadge();  // el globito del carrito refleja lo guardado en cualquier página
    }

    // Fuera de la tienda, window.OK_PRODUCTS lo llena catalogo.js de forma ASÍNCRONA y
    // avisa con 'ok-catalogo-listo'. OKi también resuelve por su cuenta el carrito/deseados
    // guardados (por si catalogo.js no está en esta página). Al llegar los datos se refresca
    // el globito del carrito y la lista si está abierta.
    function okiOnCatalogReady() {
      okiUpdateBadge();
      if (panel && panel.getAttribute("data-view") === "list") renderStoreList();
    }
    window.addEventListener("ok-catalogo-listo", okiOnCatalogReady);
    if (!storeReady()) okiHydrateSaved(function () { okiOnCatalogReady(); });

    // Cerrar al hacer clic fuera del panel. En la tienda TAMBIÉN cierra la lista,
    // EXCEPTO al agregar/marcar deseado (para que la lista refleje el cambio) o al
    // tocar el botón ❤ (que justamente la abre en los deseados).
    document.addEventListener("click", function (e) {
      if (!panel.classList.contains("on")) return;
      if (e.target.closest("#oki-panel") || e.target.closest("#oki-dock")) return;
      /* #tdGo (Enviar al carrito, compra rápida): su emit puede abrir esta lista DURANTE
         el mismo clic (hidratación síncrona); sin la excepción, este handler la cerraba
         al instante y el CTA parecía muerto. */
      if (storeReady() && e.target.closest("[data-add],[data-wish],[data-madd],#wishBtn,#tdGo")) return;
      close();
    });

    // Vuela un poquito al hacer scroll (efecto de propulsión).
    window.addEventListener("scroll", function () {
      var b = document.getElementById("oki-btn");
      if (!b) return;
      b.classList.add("thrust");
      clearTimeout(thrustT);
      thrustT = setTimeout(function () { b.classList.remove("thrust"); }, 900);
    }, { passive: true });

    // Globo de saludo: aparece a los 3.5s, se esconde a los ~11s.
    bubbleT = setTimeout(function () {
      var bb = document.getElementById("oki-bubble");
      if (bb && !panel.classList.contains("on")) {
        bb.classList.add("on");
        setTimeout(function () { bb.classList.remove("on"); }, 7500);
      }
    }, 3500);
  }

  function open() {
    document.getElementById("oki-bubble").classList.remove("on");
    clearTimeout(bubbleT);
    okiPeeked = false; okiUpdatePosition(); okiResetPeekTimer(); // usar OKi = despertar
    panel.classList.add("on");
    panel.setAttribute("aria-hidden", "false");
    if (!greeted) {
      greeted = true;
      addMsg(storeReady()
        ? "¡Hola! Soy OKi 🚀 Respondo tus preguntas y también soy especialista en papelería, oficina y escolares. Puedo recomendarte productos y ayudarte con tu carrito, pago o entrega. ¿Qué necesitas?"
        : "¡Hola! Soy OKi 🚀 Puedo responder tus preguntas y ayudarte con todo el sitio. ¿Qué quieres saber?", "bot");
      // Si ya llevas productos, OKi te muestra tu lista al abrir.
      if (storeReady() && okiCartCount() > 0) {
        var reply = storeLocalReply("que llevo en el carrito");
        if (reply) addMsg(reply, "bot");
      }
    }
    setTimeout(function () { input.focus(); }, 250);
  }
  function close() { panel.classList.remove("on"); panel.setAttribute("aria-hidden", "true"); okiResetPeekTimer(); }
  function toggle() { panel.classList.contains("on") ? close() : open(); }

  function addMsg(text, who) {
    var m = document.createElement("div");
    m.className = "oki-msg " + (who === "me" ? "me" : "bot");
    m.innerHTML = who === "me" ? esc(text) : linkify(text);
    chat.appendChild(m);
    chat.scrollTop = chat.scrollHeight;
    return m;
  }
  function typing(on) {
    var t = document.getElementById("oki-typing");
    if (on && !t) {
      t = document.createElement("div");
      t.id = "oki-typing"; t.className = "oki-msg bot";
      t.innerHTML = '<span class="oki-typing"><i></i><i></i><i></i></span>';
      chat.appendChild(t); chat.scrollTop = chat.scrollHeight;
    } else if (!on && t) { t.remove(); }
  }

  function send(text) {
    if (busy) return;
    if (!panel.classList.contains("on")) open();
    input.value = "";
    addMsg(text, "me");
    history.push({ role: "user", content: text });

    // Modo tienda: el estado en vivo del carrito/deseados se responde aquí
    // (el cerebro del servidor no conoce lo que TÚ llevas).
    var local = storeLocalReply(text);
    // Agregar al carrito puede tardar un instante (busca el producto en el catálogo
    // del servidor si no está en pantalla) → viene como promesa.
    if (local && typeof local.then === "function") {
      busy = true; typing(true);
      local.then(function (msg) {
        typing(false); busy = false;
        if (msg) { okiSay(msg); } else { askBrain(text); }
      }).catch(function () { typing(false); busy = false; askBrain(text); });
      return;
    }
    if (local) { okiSay(local); return; }

    askBrain(text);
  }

  function okiSay(msg) {
    addMsg(msg, "bot");
    history.push({ role: "assistant", content: msg });
    setTimeout(function () { input.focus(); }, 60);
  }

  // El cerebro del servidor: asistente general con especialidad en la tienda.
  function askBrain(text) {
    busy = true;
    typing(true);

    /* Tiempo límite: sin esto, un servidor colgado dejaba a OKi "escribiendo…"
       para siempre y el chat quedaba mudo hasta recargar la página. 25 s cubre
       la respuesta más lenta de la IA con margen. */
    var ctrl = ("AbortController" in window) ? new AbortController() : null;
    var timer = ctrl && setTimeout(function () { ctrl.abort(); }, 25000);

    fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history }),
      signal: ctrl ? ctrl.signal : undefined
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        typing(false);
        var reply = (data && data.reply) ? data.reply :
          "No pude procesarlo en este momento. Intenta formular tu pregunta de otra manera.";
        addMsg(reply, "bot");
        history.push({ role: "assistant", content: reply });
        // Navegación directa: OKi lleva al usuario a la sección pedida.
        if (data && data.go) {
          setTimeout(function () { window.location.href = data.go; }, 950);
        }
      })
      .catch(function () {
        typing(false);
        addMsg("No me pude conectar 😕. Intenta de nuevo en un momento.", "bot");
      })
      .then(function () { if (timer) clearTimeout(timer); busy = false; input.focus(); });
  }

  /* ── API pública mínima: window.OKi ──
     Para que otras páginas puedan invocar a OKi sin conocer sus tripas. Hoy la usa la
     ficha de producto (assets/producto.js) para preguntarle sobre el producto que estás
     viendo. Se expone SOLO lo necesario; el resto sigue encerrado en este módulo. */
  /* Abrir en el SIGUIENTE tick, no ya mismo. Casi siempre esto se llama desde un clic
     (un botón de la página), y ese clic sigue burbujeando hasta el `document`, donde
     OKi cierra "al hacer clic fuera": el panel se cerraba solo en el mismo clic que lo
     abría. Al diferir, el clic termina primero y el panel se queda abierto. */
  function okiAbrirDiferido(luego) {
    setTimeout(function () {
      open();
      // Un respiro para que el panel termine de abrir antes de escribir en él.
      if (luego) setTimeout(luego, 260);
    }, 0);
  }
  window.OKi = {
    abrir: function () { okiAbrirDiferido(); },
    cerrar: function () { close(); },
    /** Abre el panel y manda la pregunta como si la hubieras escrito tú. */
    preguntar: function (texto) {
      texto = String(texto == null ? "" : texto).trim();
      okiAbrirDiferido(texto ? function () { send(texto); } : null);
    },
    /** Abre el panel y OKi DICE algo, sin preguntarle nada al cerebro. Sirve para
     *  invitar a preguntar (lo usa el botón de la ficha de producto): la pregunta la
     *  pone la persona, no nosotros. */
    decir: function (texto) {
      texto = String(texto == null ? "" : texto).trim();
      okiAbrirDiferido(texto ? function () { okiSay(texto); } : null);
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }
})();
