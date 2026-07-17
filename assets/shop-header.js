/* ─────────────────────────────────────────────────────────────────────────
   Ok.station — Barra del e-commerce (comportamiento)
   -----------------------------------------------------------------------------
   Da vida a la barra .shopbar en páginas que NO son la tienda (hoy: la ficha de
   producto). La tienda tiene su propia implementación completa; esto es la versión
   de NAVEGACIÓN: el carrito y los favoritos se leen del mismo localStorage, el
   buscador sugiere y enlaza a fichas, y las categorías llevan a la tienda con ese
   filtro ya puesto. No pisa nada de tienda.html (solo se carga fuera de ella).
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  "use strict";
  var bar = document.querySelector(".shopbar");
  if (!bar) return;

  var $ = function (s, r) { return (r || bar).querySelector(s); };
  var mxn = function (n) { return "$" + (Number(n) || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  function readJSON(k, def) { try { var v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? def : v; } catch (e) { return def; } }
  function esc(s) { var d = document.createElement("div"); d.textContent = s == null ? "" : s; return d.innerHTML; }

  /* ── Carrito y favoritos en vivo (mismo localStorage que la tienda) ── */
  var cartCountEl = $("#sbCartCount"), cartTotalEl = $("#sbCartTotal"), wishCountEl = $("#sbWishCount");
  function cartMap() { return readJSON("okstation_cart", {}); }
  function cartQty() { var c = cartMap(), n = 0; for (var k in c) n += parseInt(c[k], 10) || 0; return n; }
  function paintCounts() {
    var n = cartQty();
    if (cartCountEl) cartCountEl.textContent = n;
    var w = readJSON("okstation_wishlist", []).length;
    if (wishCountEl) { wishCountEl.textContent = w; wishCountEl.style.display = w ? "" : "none"; }
  }
  /* El TOTAL de la barra.
     Con el puente (window.OKtienda de shop-cart.js) se calcula SÍNCRONO desde el carrito
     ya resuelto: sin red y sin carrera (antes, dos cambios rápidos lanzaban dos fetch y
     el que llegaba último —no el último pedido— pintaba el total, quedando desfasado).
     Sin puente (páginas que no lo cargan) se pide al API con guarda de orden (token). */
  var totalToken = 0;
  function paintTotal() {
    if (!cartTotalEl) return;
    var S = window.OKtienda;
    if (S && typeof S.total === "function") { cartTotalEl.textContent = mxn(S.total()); return; }
    var token = ++totalToken;                          // invalida cualquier respuesta en vuelo
    var c = cartMap(), ids = Object.keys(c).filter(function (id) { return (parseInt(c[id], 10) || 0) > 0; });
    if (!ids.length) { cartTotalEl.textContent = "$0.00"; return; }
    fetch("/backend/api/shop/products.php?per_page=100&page=1&ids=" + ids.join(","))
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (token !== totalToken) return;               // llegó tarde: ya hay una petición más nueva
        if (!j || !j.ok || !j.items) return;
        var total = 0;
        j.items.forEach(function (p) { total += (Number(p.price) || 0) * (parseInt(c[p.id], 10) || 0); });
        cartTotalEl.textContent = mxn(total);
      }).catch(function () {});
  }
  function refresh() { paintCounts(); paintTotal(); }
  refresh();
  // Al agregar desde la ficha (o en otra pestaña) el carrito cambia: mantenerse al día.
  window.addEventListener("oktienda:carrito", refresh);
  window.addEventListener("oktienda:deseados", paintCounts);
  window.addEventListener("storage", function (e) { if (e.key === "okstation_cart" || e.key === "okstation_wishlist") refresh(); });
  window.addEventListener("pageshow", refresh);   // volver con "atrás" del navegador

  /* ── Categorías: se piden al API y llevan a la tienda con ese filtro puesto ── */
  var rail = $("#sbRail"), cats = $(".shopbar__cats");
  function goCat(id) {
    // La tienda lee esto al cargar y abre esa categoría (ver tienda.html).
    try { sessionStorage.setItem("okstation_ir_cat", id); } catch (e) {}
    window.location.href = "/tienda#store";
  }
  function pill(html, id, cls) {
    var a = document.createElement("a");
    a.className = "pop" + (cls ? " " + cls : "");
    a.href = "/tienda#store";
    a.innerHTML = html;
    a.addEventListener("click", function (e) { e.preventDefault(); goCat(id); });
    return a;
  }
  var CATCOLORS = ["#066CFF", "#9C1DFF", "#0596b8", "#0E9F6E", "#FF8A00", "#6A2BF5"];
  var BOLT = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"/></svg>';
  if (rail) {
    rail.appendChild(pill(BOLT + "Ofertas del día", "ofertas", "hot"));
    rail.appendChild(pill('<span class="dot" style="background:#66748a"></span>Todos', "all"));
    fetch("/backend/api/shop/categories.php").then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.ok || !j.categories) return;
      j.categories.forEach(function (c, i) {
        rail.appendChild(pill('<span class="dot" style="background:' + CATCOLORS[i % CATCOLORS.length] + '"></span>' + esc(c.name), c.name));
      });
      railSync();
    }).catch(function () {});
  }

  /* Carril: flechas + difuminado, igual que en la tienda. */
  function railSync() {
    if (!rail || !cats) return;
    var max = rail.scrollWidth - rail.clientWidth;
    var canPrev = rail.scrollLeft > 4, canNext = max > 4 && rail.scrollLeft < max - 4;
    cats.classList.toggle("can-scroll", max > 4);
    cats.classList.toggle("can-prev", canPrev);
    cats.classList.toggle("can-next", canNext);
    var p = $("#sbRailPrev"), n = $("#sbRailNext");
    if (p) p.disabled = !canPrev;
    if (n) n.disabled = !canNext;
  }
  if (rail) {
    var nudge = function (d) { rail.scrollBy({ left: d * Math.max(180, Math.round(rail.clientWidth * .7)), behavior: "smooth" }); };
    var pv = $("#sbRailPrev"), nx = $("#sbRailNext");
    if (pv) pv.addEventListener("click", function () { nudge(-1); });
    if (nx) nx.addEventListener("click", function () { nudge(1); });
    rail.addEventListener("scroll", railSync, { passive: true });
    window.addEventListener("resize", railSync);
    if (window.ResizeObserver) new ResizeObserver(railSync).observe(rail);
  }

  /* Hamburguesa (móvil): lleva a la tienda, donde está el cajón de categorías. */
  var hamb = $("#sbHamb");
  if (hamb) hamb.addEventListener("click", function () { window.location.href = "/tienda#store"; });

  /* ── Buscador: autocompletado que enlaza a FICHAS de producto ── */
  var input = $("#sbSearch"), acBox = $("#sbAc"), acItems = [], acSel = -1, acToken = 0, t;
  function norm(s) { return String(s == null ? "" : s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  function slug(s) { return norm(s).replace(/[^a-z0-9ñ ]/g, " ").replace(/\s+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "producto"; }
  function acHi(name, q) {
    var terms = norm(q).split(" ").filter(function (x) { return x.length >= 2; });
    if (!terms.length) return esc(name);
    for (var i = 0; i < terms.length; i++) {
      try { var re = new RegExp(terms[i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), m = name.match(re);
        if (m) return esc(name.slice(0, m.index)) + "<mark>" + esc(m[0]) + "</mark>" + esc(name.slice(m.index + m[0].length)); } catch (e) {}
    }
    return esc(name);
  }
  function acClose() { if (acBox) { acBox.classList.remove("show"); acBox.innerHTML = ""; } acItems = []; acSel = -1; if (input) input.setAttribute("aria-expanded", "false"); }
  function acRow(p, q) {
    var img = p.image ? '<span class="shopbar__ac-img"><img src="' + encodeURI(p.image) + '" alt="" loading="lazy"></span>'
                      : '<span class="shopbar__ac-img">📦</span>';
    return '<a class="shopbar__ac-item" role="option" href="/producto/' + p.id + '-' + slug(p.name) + '">' +
      img + '<span class="shopbar__ac-txt"><span class="shopbar__ac-name">' + acHi(p.name, q) + '</span>' +
      '<span class="shopbar__ac-meta">' + esc((p.brand ? p.brand + " · " : "") + (p.category || "")) + '</span></span>' +
      '<span class="shopbar__ac-price">' + mxn(p.price) + '</span></a>';
  }
  function acRender(v) {
    var q = (v || "").trim();
    if (q.length < 2) { acClose(); return; }
    var token = ++acToken;
    fetch("/backend/api/shop/products.php?per_page=7&page=1&q=" + encodeURIComponent(q))
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (token !== acToken || !acBox) return;
        var items = (j && j.ok && j.items) ? j.items : [];
        if (items.length) {
          acBox.innerHTML = '<div class="shopbar__ac-head">Sugerencias</div>' + items.map(function (p) { return acRow(p, q); }).join("");
          acItems = [].slice.call(acBox.querySelectorAll(".shopbar__ac-item")); acSel = -1;
          acBox.classList.add("show"); input.setAttribute("aria-expanded", "true");
        } else {
          acBox.innerHTML = '<div class="shopbar__ac-empty">No encontramos «' + esc(q) + '».<br>Prueba con otra palabra (marca o tipo de producto).</div>';
          acItems = []; acSel = -1; acBox.classList.add("show");
        }
      }).catch(function () {});
  }
  function goSearch(q) {
    // Enter sin elegir sugerencia: a la tienda, con la búsqueda ya puesta.
    try { sessionStorage.setItem("okstation_q", q); } catch (e) {}
    window.location.href = "/tienda#store";
  }
  if (input) {
    input.addEventListener("input", function (e) { var v = e.target.value; clearTimeout(t); t = setTimeout(function () { acRender(v); }, 180); });
    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (!acItems.length) return; e.preventDefault();
        acSel = (acSel + (e.key === "ArrowDown" ? 1 : -1) + acItems.length) % acItems.length;
        acItems.forEach(function (el, i) { el.classList.toggle("sel", i === acSel); if (i === acSel) el.scrollIntoView({ block: "nearest" }); });
      } else if (e.key === "Enter") {
        if (acSel >= 0 && acItems[acSel]) { window.location.href = acItems[acSel].getAttribute("href"); }
        else { var q = input.value.trim(); if (q) goSearch(q); }
      } else if (e.key === "Escape") { acClose(); }
    });
    document.addEventListener("click", function (e) { if (!e.target.closest(".shopbar__search")) acClose(); });
  }

  /* ── Paneles de carrito y favoritos EN LA PROPIA página ──
     Antes los botones del carrito/favoritos redirigían a la tienda; ahora abren un
     panel aquí mismo, con los datos REALES (window.OKtienda, que lo define
     shop-cart.js). El checkout sí lleva a la tienda, para no duplicarlo. */
  function OK() { return window.OKtienda || null; }
  var scrim, cartPanel, cartBody, cartFoot, wishPanel, wishBody, openName = null;

  function buildPanels() {
    scrim = document.createElement("div"); scrim.className = "sb-scrim"; scrim.id = "sbScrim";
    cartPanel = document.createElement("aside"); cartPanel.className = "sb-panel"; cartPanel.id = "sbCartPanel";
    cartPanel.setAttribute("aria-label", "Tu carrito"); cartPanel.setAttribute("aria-hidden", "true");
    cartPanel.innerHTML =
      '<div class="sb-panel__head">Tu carrito <button type="button" class="sb-panel__close" aria-label="Cerrar">×</button></div>' +
      '<div class="sb-panel__body" id="sbCartBody"></div>' +
      '<div class="sb-panel__foot" id="sbCartFoot" hidden></div>';
    wishPanel = document.createElement("aside"); wishPanel.className = "sb-panel"; wishPanel.id = "sbWishPanel";
    wishPanel.setAttribute("aria-label", "Tus favoritos"); wishPanel.setAttribute("aria-hidden", "true");
    wishPanel.innerHTML =
      '<div class="sb-panel__head">Tus favoritos <button type="button" class="sb-panel__close" aria-label="Cerrar">×</button></div>' +
      '<div class="sb-panel__body" id="sbWishBody"></div>';
    document.body.appendChild(scrim); document.body.appendChild(cartPanel); document.body.appendChild(wishPanel);
    cartBody = $("#sbCartBody", cartPanel); cartFoot = $("#sbCartFoot", cartPanel); wishBody = $("#sbWishBody", wishPanel);

    scrim.addEventListener("click", closePanels);
    document.querySelectorAll(".sb-panel__close").forEach(function (b) { b.addEventListener("click", closePanels); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && openName) closePanels(); });

    // Delegación: qty / quitar / agregar / heart
    cartPanel.addEventListener("click", function (e) {
      var S = OK(); if (!S) return;
      var inc = e.target.closest("[data-inc]"), dec = e.target.closest("[data-dec]"), rm = e.target.closest("[data-rm]");
      if (inc) S.cambiar(+inc.dataset.inc, 1);
      else if (dec) S.cambiar(+dec.dataset.dec, -1);
      else if (rm) S.quitar(+rm.dataset.rm);
    });
    wishPanel.addEventListener("click", function (e) {
      var S = OK(); if (!S) return;
      var add = e.target.closest("[data-add]"), rm = e.target.closest("[data-wrm]");
      if (add) { S.agregar(+add.dataset.add, 1); }        // se gradúa al carrito y sale de favoritos
      else if (rm) { S.toggleDeseado(+rm.dataset.wrm); }
    });
  }

  function thumb(p) {
    if (p.image) return '<span class="sb-ci__t"><img src="' + encodeURI(p.image) + '" alt="" loading="lazy"></span>';
    return '<span class="sb-ci__t" style="background:' + (p.grad || "var(--grad-blue)") + '"><span class="sb-emoji">' + (p.emoji || "📦") + '</span></span>';
  }
  function renderCart() {
    var S = OK(); if (!cartBody) return;
    var items = S ? S.carrito() : [];
    if (!items.length) {
      cartBody.innerHTML = '<div class="sb-panel__empty">Tu carrito está vacío 🛒<br>Agrega productos y aparecerán aquí.</div>';
      cartFoot.hidden = true; return;
    }
    cartBody.innerHTML = items.map(function (it) {
      return '<div class="sb-ci">' + thumb(it) +
        '<div><div class="sb-ci__nm">' + esc(it.name) + '</div><div class="sb-ci__pu">' + mxn(it.price) + ' c/u</div>' +
        '<div class="sb-qty"><button data-dec="' + it.id + '" aria-label="Quitar uno">−</button><span>' + it.qty + '</span><button data-inc="' + it.id + '" aria-label="Agregar uno">+</button></div></div>' +
        '<div class="sb-ci__right"><div class="sb-ci__lt">' + mxn(it.price * it.qty) + '</div><button class="sb-ci__rm" data-rm="' + it.id + '">Quitar</button></div></div>';
    }).join("");
    cartFoot.hidden = false;
    cartFoot.innerHTML =
      '<div class="sb-sline total"><span>Total</span><span>' + mxn(S.total()) + '</span></div>' +
      // El hash #cart hace que la tienda abra el carrito al llegar. Va en la URL (no en
      // sessionStorage) para que también funcione en pestaña nueva (ctrl+clic).
      '<a class="sb-checkout" href="/tienda#cart" id="sbCheckout">Finalizar compra</a>' +
      '<p class="sb-panel__note">Recoge gratis en OK.station o pide envío · Pago seguro con Mercado Pago 🔒</p>';
  }
  var HEART = '<svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.6l-1-1a5.5 5.5 0 00-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 000-7.8z"/></svg>';
  function renderWish() {
    var S = OK(); if (!wishBody) return;
    var items = S ? S.deseados() : [];
    if (!items.length) {
      wishBody.innerHTML = '<div class="sb-panel__empty">Aún no tienes favoritos ❤<br>Toca el corazón en cualquier producto para guardarlo.</div>';
      return;
    }
    wishBody.innerHTML = items.map(function (p) {
      return '<div class="sb-wi">' + thumb(p) +
        '<div><div class="sb-wi__nm">' + esc(p.name) + '</div><div class="sb-wi__pu">' + mxn(p.price) + '</div></div>' +
        '<button class="sb-wi__add" data-add="' + p.id + '">Agregar</button>' +
        '<button class="sb-wi__heart" data-wrm="' + p.id + '" aria-label="Quitar de favoritos" title="Quitar de favoritos">' + HEART + '</button></div>';
    }).join("");
  }

  function openPanel(which) {
    if (!scrim) buildPanels();
    var panel = which === "wish" ? wishPanel : cartPanel;
    var other = which === "wish" ? cartPanel : wishPanel;
    other.classList.remove("show"); other.setAttribute("aria-hidden", "true");
    which === "wish" ? renderWish() : renderCart();
    scrim.classList.add("show"); panel.classList.add("show"); panel.setAttribute("aria-hidden", "false");
    document.documentElement.classList.add("sb-lock");
    openName = which;
  }
  function closePanels() {
    if (cartPanel) { cartPanel.classList.remove("show"); cartPanel.setAttribute("aria-hidden", "true"); }
    if (wishPanel) { wishPanel.classList.remove("show"); wishPanel.setAttribute("aria-hidden", "true"); }
    if (scrim) scrim.classList.remove("show");
    document.documentElement.classList.remove("sb-lock");
    openName = null;
  }

  // Los botones de la barra abren el panel EN LA PÁGINA (el href a /tienda queda de
  // respaldo si el JS no cargó).
  var cartBtn = $(".tb-cart"), favBtn = $(".tb-fav");
  if (cartBtn) cartBtn.addEventListener("click", function (e) { e.preventDefault(); openPanel("cart"); });
  if (favBtn) favBtn.addEventListener("click", function (e) { e.preventDefault(); openPanel("wish"); });
  // Si el carrito/deseados cambian (desde el propio panel, la ficha u OKi), repintar el
  // panel abierto además de los contadores.
  window.addEventListener("oktienda:carrito", function () { if (openName === "cart") renderCart(); });
  window.addEventListener("oktienda:deseados", function () { if (openName === "wish") renderWish(); if (openName === "cart") renderCart(); });
})();
