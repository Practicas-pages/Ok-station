/* ─────────────────────────────────────────────────────────────────────────
   Ok.station — NAVBAR UNIFICADO (oknav)
   ---------------------------------------------------------------------
   Da vida al encabezado único. Funciona en DOS MODOS, y esa es la idea
   central del archivo:

     · MODO TIENDA  — existe window.OKtienda (el puente de tienda.html).
       Los botones actúan EN LA PÁGINA: abren el carrito, los deseados,
       la libreta de direcciones… sin recargar.

     · MODO ENLACE  — cualquier otra página (portada, landings, ficha).
       Los mismos botones NAVEGAN a la tienda dejando el recado en
       sessionStorage, que es como ya funcionaban los accesos directos
       (okstation_q, okstation_ir_cat, okstation_ir_brand).

   Así hay UN solo encabezado y no tres, sin que ninguna página pierda lo
   que ya hacía.

   Estado compartido (mismas llaves de siempre, no se inventan nuevas):
     okstation_cart      {id: cantidad}
     okstation_wishlist  [id, id, …]
     okstation.user / okstation.token
   ───────────────────────────────────────────────────────────────────── */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var nav = $("oknav");
  if (!nav) return;                       // la página no trae el navbar nuevo

  var TIENDA = "/tienda.html";            // ruta del catálogo
  var LOGIN  = "/cuenta.html";

  function readJSON(k, def) {
    try { var v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? def : v; }
    catch (e) { return def; }
  }
  function ls(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } }
  function ss(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }
  function mxn(n) {
    return "$" + (Number(n) || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  /* El puente solo existe DENTRO de la tienda. Se consulta cada vez (no se
     guarda) porque tienda.html lo publica cuando termina de arrancar. */
  function store() { return window.OKtienda || null; }

  /* ── Carrito y deseados en vivo ────────────────────────────────────────
     Se leen del MISMO localStorage que usa la tienda, así el contador ya está
     bien pintado en la primera pasada, sin esperar a la red. */
  var cartCt = $("oknavCartCt"), cartTot = $("oknavCartTotal"), wishCt = $("oknavWishCt");

  function cartQty() {
    var c = readJSON("okstation_cart", {}), n = 0;
    for (var k in c) n += parseInt(c[k], 10) || 0;
    return n;
  }
  function paintCounts() {
    var n = cartQty();
    if (cartCt) { cartCt.textContent = n; cartCt.hidden = n === 0; }
    var w = readJSON("okstation_wishlist", []).length;
    if (wishCt) { wishCt.textContent = w; wishCt.hidden = w === 0; }
  }

  /* El TOTAL: con el puente sale síncrono del carrito ya resuelto. Sin puente se
     le pregunta al API. El token evita que una respuesta lenta pise a una más
     nueva (dos cambios rápidos lanzan dos peticiones y no siempre llegan en
     orden). Es el mismo cuidado que ya tenía shop-header.js. */
  var totalToken = 0;
  function paintTotal() {
    if (!cartTot) return;
    var S = store();
    if (S && typeof S.total === "function") { cartTot.textContent = mxn(S.total()); return; }
    var token = ++totalToken;
    var c = readJSON("okstation_cart", {});
    var ids = Object.keys(c).filter(function (id) { return (parseInt(c[id], 10) || 0) > 0; });
    if (!ids.length) { cartTot.textContent = "$0.00"; return; }
    fetch("/backend/api/shop/products.php?per_page=100&page=1&ids=" + ids.join(","))
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (token !== totalToken || !j || !j.ok || !j.items) return;
        var t = 0;
        j.items.forEach(function (p) { t += (Number(p.price) || 0) * (parseInt(c[p.id], 10) || 0); });
        cartTot.textContent = mxn(t);
      }).catch(function () {});
  }
  function refresh() { paintCounts(); paintTotal(); }

  window.addEventListener("oktienda:carrito", refresh);
  window.addEventListener("oktienda:deseados", paintCounts);
  window.addEventListener("storage", function (e) {
    if (e.key === "okstation_cart" || e.key === "okstation_wishlist") refresh();
    if (e.key === "okstation.user" || e.key === "okstation.token") paintAcct();
  });
  window.addEventListener("pageshow", refresh);    // volver con "atrás"

  /* ── Cuenta ───────────────────────────────────────────────────────────── */
  var acct = $("oknavAcct");
  function paintAcct() {
    if (!acct) return;
    var u = readJSON("okstation.user", null);
    var box = acct.querySelector(".oknav__acctbox");
    if (!box) return;
    if (u && ls("okstation.token")) {
      var nombre = (u.full_name || u.name || u.email || "Mi cuenta").trim();
      var inicial = nombre.charAt(0).toUpperCase() || "?";
      box.innerHTML = '<span class="oknav__avatar" aria-hidden="true">' + esc(inicial) + "</span>" +
                      '<span class="oknav__lbl">' + esc(nombre.split(" ")[0]) + "</span>";
      acct.setAttribute("href", "/perfil.html");
      acct.setAttribute("aria-label", "Mi cuenta: " + nombre);
    } else {
      acct.setAttribute("href", LOGIN + "?next=" + encodeURIComponent(location.pathname + location.hash));
      acct.setAttribute("aria-label", "Iniciar sesión");
    }
  }

  /* ── Ubicación de entrega ─────────────────────────────────────────────
     Vive en la libreta de direcciones (necesita sesión) y la tienda solo la
     tenía en memoria, así que fuera de la tienda no se sabía. Se cachea en
     localStorage la primera vez y a partir de ahí sale al instante en TODAS
     las páginas. */
  var locMain = $("oknavLocMain"), locTop = $("oknavLocTop");
  function pintaLoc(txt) {
    if (!locMain) return;
    if (txt) { locMain.textContent = txt; if (locTop) locTop.hidden = false; }
    else { locMain.textContent = "Elige tu ubicación"; if (locTop) locTop.hidden = true; }
  }
  function cargaLoc() {
    if (!locMain) return;
    if (!ls("okstation.token")) { pintaLoc(""); return; }
    var cache = ls("okstation.addr");
    if (cache) { pintaLoc(cache); return; }
    fetch("/backend/api/shop/addresses.php", { headers: { Authorization: "Bearer " + ls("okstation.token") } })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || !j.ok || !j.addresses) return;
        var d = j.addresses.filter(function (a) { return a.is_default; })[0] || j.addresses[0];
        if (!d) return;
        var txt = (d.city || "") + " " + (d.postal_code || "");
        try { localStorage.setItem("okstation.addr", txt.trim()); } catch (e) {}
        pintaLoc(txt.trim());
      }).catch(function () {});
  }

  /* ── Buscador ─────────────────────────────────────────────────────────── */
  var q = $("oknavQ"), ac = $("oknavAc");
  var acItems = [], acSel = -1, acTimer = null, acToken = 0;

  function acCerrar() {
    if (!ac) return;
    ac.hidden = true; ac.innerHTML = ""; acItems = []; acSel = -1;
    if (q) q.setAttribute("aria-expanded", "false");
  }
  function buscar(texto) {
    texto = (texto || "").trim();
    if (!texto) return;
    var S = store();
    /* Dentro de la tienda se busca SIN recargar. Fuera, se deja el recado y la
       tienda lo levanta al arrancar (mismo mecanismo que ya existía). */
    if (S && typeof S.buscarEnTienda === "function") { S.buscarEnTienda(texto); acCerrar(); return; }
    ss("okstation_q", texto);
    location.href = TIENDA + "#store";
  }
  function acPinta(items) {
    if (!ac) return;
    if (!items.length) {
      ac.innerHTML = '<div class="oknav__acempty">Sin resultados. Prueba con otra palabra.</div>';
      ac.hidden = false; return;
    }
    ac.innerHTML = items.map(function (p) {
      var img = p.image
        ? '<span class="oknav__acth"><img src="' + encodeURI(p.image) + '" alt="" loading="lazy"></span>'
        : '<span class="oknav__acth"><img src="/assets/img/placeholder-producto.svg" alt="" loading="lazy" class="ph-logo"></span>';
      return '<a class="oknav__acitem" role="option" href="/producto.php?id=' + p.id + '">' + img +
        '<span class="oknav__actxt"><span class="oknav__acname">' + esc(p.name) + '</span>' +
        '<span class="oknav__acmeta">' + esc((p.brand ? p.brand + " · " : "") + (p.category || "")) + "</span></span>" +
        '<span class="oknav__acprice">' + mxn(p.price) + "</span></a>";
    }).join("");
    ac.hidden = false;
    acItems = [].slice.call(ac.querySelectorAll(".oknav__acitem"));
    acSel = -1;
    if (q) q.setAttribute("aria-expanded", "true");
  }
  function acBuscar(texto) {
    var token = ++acToken;
    fetch("/backend/api/shop/products.php?per_page=6&page=1&q=" + encodeURIComponent(texto))
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (token !== acToken) return;              // llegó tarde
        acPinta((j && j.ok && j.items) ? j.items : []);
      }).catch(acCerrar);
  }
  if (q) {
    q.addEventListener("input", function () {
      var t = q.value.trim();
      clearTimeout(acTimer);
      if (t.length < 2) { acCerrar(); return; }
      acTimer = setTimeout(function () { acBuscar(t); }, 220);   // no una petición por tecla
    });
    q.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && acSel < 0) { e.preventDefault(); buscar(q.value); return; }
      if (!acItems.length) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        acItems.forEach(function (x) { x.classList.remove("is-on"); });
        acSel = e.key === "ArrowDown"
          ? (acSel + 1) % acItems.length
          : (acSel <= 0 ? acItems.length - 1 : acSel - 1);
        acItems[acSel].classList.add("is-on");
        acItems[acSel].scrollIntoView({ block: "nearest" });
      } else if (e.key === "Enter" && acSel >= 0) {
        e.preventDefault(); acItems[acSel].click();
      } else if (e.key === "Escape") { acCerrar(); }
    });
  }
  document.addEventListener("click", function (e) {
    if (ac && !ac.hidden && !e.target.closest(".oknav__search")) acCerrar();
  });

  /* ── Categorías ───────────────────────────────────────────────────────── */
  var catsBtn = $("oknavCats"), catsMenu = $("oknavCatsMenu"), catsCargadas = false;

  function irACategoria(nombre) {
    var S = store();
    if (S && typeof S.verCategoria === "function") { S.verCategoria(nombre); catsCerrar(); return; }
    ss("okstation_ir_cat", nombre);
    location.href = TIENDA + "#store";
  }
  function catsPinta(cats) {
    if (!catsMenu) return;
    catsMenu.innerHTML = '<div class="oknav__catsgrid">' + cats.map(function (c) {
      return '<button type="button" class="oknav__catlink" data-cat="' + esc(c.name) + '">' +
        "<span>" + esc(c.name) + "</span>" +
        (c.count ? '<span class="oknav__catn">' + c.count + "</span>" : "") + "</button>";
    }).join("") + "</div>";
  }
  function catsCargar() {
    if (catsCargadas || !catsMenu) return;
    catsCargadas = true;
    catsMenu.innerHTML = '<div class="oknav__acempty">Cargando categorías…</div>';
    fetch("/backend/api/shop/categories.php")
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j && j.ok && j.categories && j.categories.length) catsPinta(j.categories);
        else catsMenu.innerHTML = '<div class="oknav__acempty">El catálogo está en preparación.</div>';
      })
      .catch(function () {
        catsCargadas = false;                        // que se pueda reintentar
        catsMenu.innerHTML = '<div class="oknav__acempty">No se pudieron cargar las categorías.</div>';
      });
  }
  function catsAbrir() {
    if (!catsMenu || !catsBtn) return;
    catsMenu.hidden = false; catsBtn.setAttribute("aria-expanded", "true"); catsCargar();
  }
  function catsCerrar() {
    if (!catsMenu || !catsBtn) return;
    catsMenu.hidden = true; catsBtn.setAttribute("aria-expanded", "false");
  }
  if (catsBtn) {
    catsBtn.addEventListener("click", function () {
      var S = store();
      // En la tienda, "Categorías" abre/cierra el sidebar de categorías + filtros.
      if (S && typeof S.toggleCategorias === "function") { S.toggleCategorias(); return; }
      // Fuera de la tienda: llevar a la tienda, donde vive ese sidebar sticky.
      location.href = TIENDA + "#store";
    });
  }
  if (catsMenu) {
    catsMenu.addEventListener("click", function (e) {
      var b = e.target.closest("[data-cat]");
      if (b) irACategoria(b.dataset.cat);
    });
  }
  document.addEventListener("click", function (e) {
    if (catsMenu && !catsMenu.hidden && !e.target.closest("#oknavCatsMenu") && !e.target.closest("#oknavCats")) catsCerrar();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    catsCerrar(); acCerrar(); cajonCerrar();
  });

  /* ── Ofertas, deseados, carrito y ubicación: mismo botón, dos modos ───── */
  function accion(id, enTienda, fuera) {
    var el = $(id); if (!el) return;
    el.addEventListener("click", function (e) {
      var S = store();
      if (S && enTienda(S) !== false) { e.preventDefault(); return; }
      fuera();
    });
  }
  accion("oknavCart",
    function (S) { if (typeof S.abrirCarrito === "function") { S.abrirCarrito(); return true; } return false; },
    function () { location.href = TIENDA + "#cart"; });
  accion("oknavWish",
    function (S) { if (typeof S.abrirDeseados === "function") { S.abrirDeseados(); return true; } return false; },
    function () { location.href = TIENDA + "#deseados"; });
  accion("oknavLoc",
    function (S) { if (typeof S.abrirUbicacion === "function") { S.abrirUbicacion(); return true; } return false; },
    function () { location.href = TIENDA + "#ubicacion"; });
  accion("oknavOfertas",
    function (S) { if (typeof S.verOfertas === "function") { S.verOfertas(); return true; } return false; },
    function () { ss("okstation_ir_cat", "ofertas"); location.href = TIENDA + "#store"; });

  /* ── Cajón (☰) ────────────────────────────────────────────────────────── */
  var burger = $("oknavBurger"), cajon = $("oknavDrawer"), scrim = $("oknavScrim");
  var focoPrevio = null;

  function cajonAbrir() {
    if (!cajon || !scrim) return;
    focoPrevio = document.activeElement;
    cajon.hidden = false; scrim.hidden = false;
    requestAnimationFrame(function () { cajon.classList.add("is-open"); scrim.classList.add("is-open"); });
    if (burger) burger.setAttribute("aria-expanded", "true");
    document.documentElement.style.overflow = "hidden";
    var f = cajon.querySelector("a, button"); if (f) f.focus();
  }
  function cajonCerrar() {
    if (!cajon || !scrim || cajon.hidden) return;
    cajon.classList.remove("is-open"); scrim.classList.remove("is-open");
    if (burger) burger.setAttribute("aria-expanded", "false");
    document.documentElement.style.overflow = "";
    setTimeout(function () { cajon.hidden = true; scrim.hidden = true; }, 220);
    if (focoPrevio && focoPrevio.focus) focoPrevio.focus();
  }
  if (burger) burger.addEventListener("click", function () { cajon && cajon.hidden ? cajonAbrir() : cajonCerrar(); });
  if (scrim) scrim.addEventListener("click", cajonCerrar);
  var dclose = $("oknavDClose"); if (dclose) dclose.addEventListener("click", cajonCerrar);
  if (cajon) {
    cajon.addEventListener("click", function (e) {
      var b = e.target.closest("[data-cat]");
      if (b) { cajonCerrar(); irACategoria(b.dataset.cat); return; }
      if (e.target.closest("a")) cajonCerrar();      // navegar cierra
    });
  }

  /* ── Tema desde el cajón ───────────────────────────────────────────────
     En celular el botón de theme.js no cabe en la barra, así que aquí va el
     mismo interruptor. Se apoya en window.OKTheme (la API pública de theme.js)
     en vez de tocar localStorage a mano: si mañana cambia cómo se guarda, esto
     sigue funcionando. */
  var temaBtn = $("oknavTema"), temaEstado = $("oknavTemaEstado");
  function pintaTema() {
    if (!temaEstado || !window.OKTheme) return;
    temaEstado.textContent = window.OKTheme.get() === "dark" ? "· activado" : "· desactivado";
  }
  if (temaBtn) {
    temaBtn.addEventListener("click", function () {
      if (window.OKTheme) { window.OKTheme.toggle(); pintaTema(); }
    });
  }

  /* Arranque */
  refresh(); paintAcct(); cargaLoc(); pintaTema();

  /* Para que el resto del sitio pueda refrescar la barra si cambia algo. */
  window.OKNav = { refrescar: refresh, cerrarTodo: function () { acCerrar(); catsCerrar(); cajonCerrar(); } };
})();
