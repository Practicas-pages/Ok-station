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

  /* ── Alto real de la barra → --oknav-h ────────────────────────────────
     La tienda cuelga cosas de la navbar (el carrito y la columna de categorías
     son sticky bajo ella) y ese alto estaba escrito a mano en el CSS: al cambiar
     el espaciado de la barra, esos paneles se descuadraban. Aquí se MIDE y se
     publica, así no hay dos fuentes de verdad. El valor del CSS queda como
     respaldo para el primer pintado y para cuando no corre el JS.
     Si la barra está oculta (en la tienda, en móvil) el alto es 0 y no se toca:
     las reglas que la usan viven en @media(min-width:1001px). */
  function medirAlto() {
    var h = Math.round(nav.getBoundingClientRect().height);
    /* Oculta (la tienda esconde la barra en móvil) → se RETIRA la variable en línea en
       vez de dejar clavado el alto de escritorio: si no, un panel que colgara de ella
       en móvil se separaría 158px de la nada. Sin valor en línea vuelve a mandar el CSS. */
    if (h > 0) document.documentElement.style.setProperty("--oknav-h", h + "px");
    else document.documentElement.style.removeProperty("--oknav-h");
  }
  medirAlto();
  window.addEventListener("resize", medirAlto);
  if (window.ResizeObserver) new ResizeObserver(medirAlto).observe(nav);

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
    if (q) { q.setAttribute("aria-expanded", "false"); q.removeAttribute("aria-activedescendant"); }
  }
  function buscar(texto) {
    texto = (texto || "").trim();
    /* Enter gana a lo que estuviera a punto de dispararse: sin esto, el filtrado en
       vivo pendiente volvía a lanzar la misma búsqueda un cuarto de segundo después. */
    clearTimeout(acTimer);
    var S = store();
    /* Buscador VACÍO + Enter = "quiero ver todo otra vez". Sin esto había que borrar
       el texto y además ir a buscar el botón "Ver todos los productos". */
    if (!texto) {
      if (S && typeof S.limpiarBusqueda === "function") { S.limpiarBusqueda(); acCerrar(); }
      return;
    }
    /* Dentro de una tienda (la normal o la compra rápida) se busca SIN recargar: cada
       una publica su propio buscarEnTienda, así el mismo campo sirve para las dos y la
       búsqueda nunca salta de una tienda a la otra. Fuera, se deja el recado y la
       tienda normal lo levanta al arrancar (mismo mecanismo que ya existía). */
    if (S && typeof S.buscarEnTienda === "function") { S.buscarEnTienda(texto); acCerrar(); return; }
    ss("okstation_q", texto);
    location.href = TIENDA + "#store";
  }
  function acPinta(items) {
    if (!ac) return;
    /* OJO: innerHTML destruye las sugerencias anteriores. Si acItems se quedara
       apuntando a ellas, un Enter con una fila marcada haría click() sobre un enlace
       que ya no está en la página y navegaría a un producto que el usuario no ve.
       Por eso se reinician SIEMPRE, también cuando no hay resultados. */
    acItems = []; acSel = -1;
    if (!items.length) {
      ac.innerHTML = '<div class="oknav__acempty">Sin resultados. Prueba con otra palabra.</div>';
      ac.hidden = false;
      if (q) { q.setAttribute("aria-expanded", "true"); q.removeAttribute("aria-activedescendant"); }
      return;
    }
    ac.innerHTML = items.map(function (p, i) {
      var img = p.image
        ? '<span class="oknav__acth"><img src="' + encodeURI(p.image) + '" alt="" loading="lazy"></span>'
        : '<span class="oknav__acth"><img src="/assets/img/placeholder-producto.svg" alt="" loading="lazy" class="ph-logo"></span>';
      /* tabindex=-1: con role=option el recorrido es con las flechas desde el campo, no
         con Tab. Sin esto, tabular metía el foco una por una en las sugerencias. */
      return '<a class="oknav__acitem" role="option" tabindex="-1" id="oknav-ac-' + i + '" href="/producto.php?id=' + p.id + '">' + img +
        '<span class="oknav__actxt"><span class="oknav__acname">' + esc(p.name) + '</span>' +
        '<span class="oknav__acmeta">' + esc((p.brand ? p.brand + " · " : "") + (p.category || "")) + "</span></span>" +
        '<span class="oknav__acprice">' + mxn(p.price) + "</span></a>";
    }).join("");
    ac.hidden = false;
    acItems = [].slice.call(ac.querySelectorAll(".oknav__acitem"));
    if (q) { q.setAttribute("aria-expanded", "true"); q.removeAttribute("aria-activedescendant"); }
  }
  function acBuscar(texto) {
    var token = ++acToken;
    fetch("/backend/api/shop/products.php?per_page=6&page=1&q=" + encodeURIComponent(texto))
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (token !== acToken) return;              // llegó tarde
        acPinta((j && j.ok && j.items) ? j.items : []);
      }).catch(function () {
        /* Solo cierra si el que falló es el desplegable que se está viendo: si no, una
           petición vieja que caduca borraba los resultados buenos ya pintados. */
        if (token === acToken) acCerrar();
      });
  }
  if (q) {
    q.addEventListener("input", function () {
      var t = q.value.trim();
      clearTimeout(acTimer);
      /* Páginas que filtran SU PROPIA lista mientras escribes (la compra rápida) lo
         avisan publicando buscarEnVivo. Ahí el desplegable sobra: serían dos búsquedas
         a la vez y el menú taparía justo los resultados que la lista ya está filtrando
         —es la misma razón por la que la compra rápida apagó su desplegable propio. */
      var S = store();
      if (S && typeof S.buscarEnVivo === "function") {
        acCerrar();
        acTimer = setTimeout(function () { S.buscarEnVivo(t); }, 250);
        return;
      }
      if (t.length < 2) { acCerrar(); return; }
      acTimer = setTimeout(function () { acBuscar(t); }, 220);   // no una petición por tecla
    });
    q.addEventListener("keydown", function (e) {
      /* Escape va PRIMERO: antes lo cortaba el guard de "sin sugerencias" de abajo y
         el panel de "Sin resultados" se quedaba abierto tapando la fila de categorías. */
      if (e.key === "Escape") { acCerrar(); return; }
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
        /* Con role=combobox el foco NO se mueve del campo: hay que decirle al lector de
           pantalla cuál es la fila marcada, o no anuncia nada al bajar con las flechas. */
        q.setAttribute("aria-activedescendant", acItems[acSel].id || "");
      } else if (e.key === "Enter" && acSel >= 0) {
        e.preventDefault(); acItems[acSel].click();
      }
    });
  }
  document.addEventListener("click", function (e) {
    if (ac && !ac.hidden && !e.target.closest(".oknav__search")) acCerrar();
  });
  /* Salir del buscador con Tab también cierra: si no, el desplegable se quedaba abierto
     (y anunciándose) con el foco ya en otro botón de la barra. */
  document.addEventListener("focusin", function (e) {
    if (ac && !ac.hidden && !e.target.closest(".oknav__search")) acCerrar();
  });

  /* ── Buscador en móvil: abrir a lo ancho de forma fiable ────────────────
     En teléfono el buscador parte como una lupa y debe abrirse a todo el ancho.
     Antes eso dependía solo de :focus-within del CSS, pero al tocar un campo tan
     pequeño el foco no siempre prendía (o se perdía), y la barra no se abría:
     ese era el "error del buscador". Aquí se ancla con una clase .is-open que
     controla el JS: tocar la lupa abre y enfoca; tocar fuera o Escape cierra.
     En escritorio no estorba: las reglas que usan .is-open viven en el @media. */
  var searchBox = nav.querySelector(".oknav__search");
  var mqBusca = window.matchMedia("(max-width: 480px)");
  if (searchBox && q) {
    var abrirBusqueda = function () {
      searchBox.classList.add("is-open");
      /* Enfocar en el siguiente cuadro: el reflow del grid (la barra baja a su
         propio renglón) ya ocurrió y el teclado no salta de golpe. */
      requestAnimationFrame(function () {
        try { q.focus({ preventScroll: true }); } catch (e) { q.focus(); }
      });
    };
    var cerrarBusqueda = function () {
      if (!searchBox.classList.contains("is-open")) return;
      if (q.value.trim() !== "") return;   // con texto escrito no se colapsa sola
      searchBox.classList.remove("is-open");
      acCerrar();
    };
    /* pointerdown gana el foco nativo del campo, que en esta lupa diminuta no
       siempre prendía (era el "error del buscador" en el táctil). El click es el
       respaldo para punteros que no emiten eventos pointer (ratón, escritorio).
       Solo en móvil y solo al ABRIR: ya abierta, el campo se comporta normal
       (seleccionar texto, mover el cursor, etc.). */
    var tocarParaAbrir = function (e) {
      if (!mqBusca.matches) return;
      if (!searchBox.classList.contains("is-open")) {
        e.preventDefault();
        abrirBusqueda();
      }
    };
    searchBox.addEventListener("pointerdown", tocarParaAbrir);
    searchBox.addEventListener("click", tocarParaAbrir);
    /* Si el foco entra por otra vía (teclado, lector de pantalla), también abre. */
    q.addEventListener("focus", function () { searchBox.classList.add("is-open"); });
    q.addEventListener("blur", function () { setTimeout(cerrarBusqueda, 120); });
    q.addEventListener("keydown", function (e) { if (e.key === "Escape") cerrarBusqueda(); });
    document.addEventListener("click", function (e) {
      if (!e.target.closest(".oknav__search")) cerrarBusqueda();
    });
  }

  /* ── Páginas que filtran su propia lista (la compra rápida) ──────────────
     Ahí el desplegable no se abre nunca, así que el campo NO debe anunciarse como un
     combobox con lista de sugerencias: un lector de pantalla prometería algo que no
     existe. Se ajusta desde aquí y no en el HTML porque ese marcado está duplicado en
     29 páginas y solo esta se comporta distinto. */
  function ajustaRolBuscador() {
    if (!q) return;
    var S = store();
    if (!S || typeof S.buscarEnVivo !== "function") return;
    q.removeAttribute("role");
    q.removeAttribute("aria-autocomplete");
    q.removeAttribute("aria-controls");
    q.removeAttribute("aria-expanded");
    q.setAttribute("aria-label", "Buscar productos (la lista se filtra mientras escribes)");
  }
  /* El puente lo publica la página en su propio DOMContentLoaded, y el orden entre
     manejadores de ese evento no es de fiar (los de `document` corren antes que los de
     `window`, que es donde lo registran las tiendas). Se espera un turno más con
     setTimeout(0): para entonces han corrido todos, sin importar dónde se registraron. */
  function ajustaLuego() { setTimeout(ajustaRolBuscador, 0); }
  if (document.readyState === "complete") ajustaLuego();
  else document.addEventListener("DOMContentLoaded", ajustaLuego);

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

  /* ── Sticky inteligente ────────────────────────────────────────────────
     Pedido del usuario: al DESPLAZARSE hacia abajo la barra se esconde para dar
     más pantalla; al subir, reaparece. Solo cuando hace scroll la VENTANA
     (portada, ficha, checkout, carrito, categorías…). En la tienda el scroll
     vive en un contenedor propio con overflow:hidden en el body: ahí este
     listener no dispara y la barra no se esconde —si lo hiciera dejaría un hueco,
     porque en la tienda la barra no cuelga del flujo del scroll.
     Nunca se esconde cerca del tope, ni con el buscador / categorías / cajón
     abiertos (taparía justo lo que el usuario acaba de abrir). */
  (function stickyInteligente() {
    var ultimo = window.pageYOffset || document.documentElement.scrollTop || 0;
    var pendiente = false;
    var UMBRAL = 8;   // px de bajada seguida para esconder (ignora el temblor del dedo)

    function hayAlgoAbierto() {
      return (ac && !ac.hidden) ||
             (catsMenu && !catsMenu.hidden) ||
             (cajon && !cajon.hidden) ||
             !!nav.querySelector(".oknav__search.is-open");
    }
    function evaluar() {
      pendiente = false;
      var y = window.pageYOffset || document.documentElement.scrollTop || 0;
      var alto = nav.getBoundingClientRect().height || 0;
      if (y <= alto || hayAlgoAbierto()) {
        nav.classList.remove("oknav--oculta"); ultimo = y; return;
      }
      var d = y - ultimo;
      if (d > UMBRAL) { nav.classList.add("oknav--oculta"); ultimo = y; }     // bajando → esconder
      else if (d < 0) { nav.classList.remove("oknav--oculta"); ultimo = y; }  // subiendo → mostrar
      // movimientos menores al umbral: se acumulan (no se actualiza ultimo)
    }
    window.addEventListener("scroll", function () {
      if (!pendiente) { pendiente = true; requestAnimationFrame(evaluar); }
    }, { passive: true });
    /* Volver con "atrás" o cambiar de orientación: que aparezca, no que quede
       escondida por un estado viejo. */
    window.addEventListener("pageshow", function () { nav.classList.remove("oknav--oculta"); });
    window.addEventListener("orientationchange", function () { nav.classList.remove("oknav--oculta"); });
  })();

  /* Arranque */
  refresh(); paintAcct(); cargaLoc(); pintaTema();

  /* Para que el resto del sitio pueda refrescar la barra si cambia algo.
     setBusqueda: deja el campo mostrando el término que la página tiene aplicado (al
     llegar desde otra página, al restaurar el estado o al limpiar la búsqueda). No
     dispara eventos a propósito: solo refleja, no vuelve a buscar. */
  window.OKNav = {
    refrescar: refresh,
    cerrarTodo: function () { acCerrar(); catsCerrar(); cajonCerrar(); },
    setBusqueda: function (texto) { if (q) q.value = texto == null ? "" : String(texto); acCerrar(); },
    getBusqueda: function () { return q ? q.value : ""; }
  };
})();
