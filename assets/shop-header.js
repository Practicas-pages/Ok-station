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
  /* El TOTAL necesita los precios: el carrito solo guarda {id: cantidad}. Se piden al
     API por ids (una sola llamada). Si falla, se queda el conteo, que no necesita red. */
  function paintTotal() {
    if (!cartTotalEl) return;
    var c = cartMap(), ids = Object.keys(c).filter(function (id) { return (parseInt(c[id], 10) || 0) > 0; });
    if (!ids.length) { cartTotalEl.textContent = "$0.00"; return; }
    fetch("/backend/api/shop/products.php?per_page=100&page=1&ids=" + ids.join(","))
      .then(function (r) { return r.json(); })
      .then(function (j) {
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
})();
