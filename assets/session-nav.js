/* ============================================================
   Ok.station — Sesión en el header del sitio (index)
   Si hay sesión, reemplaza el botón "Cuenta" por un menú con
   avatar + nombre → Mi perfil / Mis pedidos / Mis citas / Panel (staff) / Salir.
   ============================================================ */
(function () {
  "use strict";
  function esc(s) { var d = document.createElement("div"); d.textContent = String(s == null ? "" : s); return d.innerHTML; }
  function user() { try { return JSON.parse(localStorage.getItem("okstation.user") || "null"); } catch (e) { return null; } }
  function token() { try { return localStorage.getItem("okstation.token"); } catch (e) { return null; } }

  var acct = document.getElementById("acct");
  if (!acct) return;

  var u = user();
  if (!token() || !u) return; // sin sesión → se queda el botón "Cuenta"

  // [hidden] no basta porque .btn fija display:flex → ocultamos también por estilo.
  var login = document.getElementById("acct-login");
  if (login) { login.hidden = true; login.style.display = "none"; }

  var roles = u.roles || [];
  var isStaff = roles.indexOf("administrador") >= 0 || roles.indexOf("empleado") >= 0 || roles.indexOf("directivo") >= 0;
  /* El empleado puro ve "Panel de empleado"; admin/directivo ven "Panel administrativo". */
  var isEmpOnly = roles.indexOf("empleado") >= 0 && roles.indexOf("administrador") < 0 && roles.indexOf("directivo") < 0;
  var panelLabel = isEmpOnly ? "Panel de empleado" : "Panel administrativo";
  var first = (u.full_name || "Mi cuenta").trim().split(/\s+/)[0];
  var initial = (u.full_name || "U").trim().charAt(0).toUpperCase();

  var wrap = document.createElement("div");
  wrap.className = "acct__wrap";
  wrap.innerHTML =
    '<button class="acct__btn" id="acct-btn" aria-haspopup="true" aria-expanded="false">' +
      '<span class="acct__avatar">' + esc(initial) + '</span>' +
      '<span class="acct__name">' + esc(first) + '</span>' +
      '<svg class="acct__caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>' +
    '</button>' +
    '<div class="acct__menu" id="acct-menu" role="menu" hidden>' +
      '<div class="acct__head"><b>' + esc(u.full_name || "") + '</b><span>' + esc(u.email || "") + '</span></div>' +
      '<a role="menuitem" href="perfil.html">Mi perfil</a>' +
      '<a role="menuitem" href="perfil.html#pedidos">Mis pedidos</a>' +
      '<a role="menuitem" href="perfil.html#citas">Mis citas</a>' +
      (isStaff ? '<a role="menuitem" href="admin.html" class="acct__admin">' + panelLabel + '</a>' : '') +
      '<button role="menuitem" id="acct-logout" type="button">Cerrar sesión</button>' +
    '</div>';
  acct.appendChild(wrap);

  /* Topbar de la TIENDA (tienda.html): el botón .tb-cuenta no vive dentro de #acct.
     Le damos el MISMO menú desplegable que el home (todo el sitio conectado), anclado
     al chip. (En otras páginas no existe .tb-cuenta y esto es un no-op.) */
  var tb = document.querySelector(".tb-cuenta");
  if (tb && tb.parentNode && !tb.parentNode.querySelector(".tb-acctmenu")) {
    tb.setAttribute("href", "perfil.html");           // respaldo si el JS fallara
    var tbLbl = tb.querySelector("span"); if (tbLbl) tbLbl.textContent = first;

    var host = tb.parentNode;                          // .tb-actions
    host.style.position = "relative";
    var tbMenu = document.createElement("div");
    tbMenu.className = "tb-acctmenu"; tbMenu.hidden = true; tbMenu.setAttribute("role", "menu");
    tbMenu.innerHTML =
      '<div class="tb-accthead"><b>' + esc(u.full_name || "") + '</b><span>' + esc(u.email || "") + '</span></div>' +
      '<a role="menuitem" href="perfil.html">Mi perfil</a>' +
      '<a role="menuitem" href="perfil.html#pedidos">Mis pedidos</a>' +
      '<a role="menuitem" href="perfil.html#citas">Mis citas</a>' +
      (isStaff ? '<a role="menuitem" href="admin.html" class="tb-acctadmin">' + panelLabel + '</a>' : '') +
      '<button role="menuitem" type="button" class="tb-acctlogout">Cerrar sesión</button>';
    host.appendChild(tbMenu);

    tb.setAttribute("aria-haspopup", "true"); tb.setAttribute("aria-expanded", "false");
    function tbClose() { tbMenu.hidden = true; tb.setAttribute("aria-expanded", "false"); }
    tb.addEventListener("click", function (e) {
      e.preventDefault();
      var willOpen = tbMenu.hidden; tbMenu.hidden = !willOpen; tb.setAttribute("aria-expanded", String(willOpen));
    });
    document.addEventListener("click", function (e) {
      if (!tbMenu.hidden && !tbMenu.contains(e.target) && !tb.contains(e.target)) tbClose();
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") tbClose(); });
    tbMenu.querySelector(".tb-acctlogout").addEventListener("click", function () {
      try { localStorage.removeItem("okstation.token"); localStorage.removeItem("okstation.user"); } catch (e) {}
      window.location.reload();
    });
  }

  var btn = wrap.querySelector("#acct-btn");
  var menu = wrap.querySelector("#acct-menu");
  function close() { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); }
  btn.addEventListener("click", function (e) {
    e.stopPropagation();
    var willOpen = menu.hidden;
    menu.hidden = !willOpen;
    btn.setAttribute("aria-expanded", String(willOpen));
  });
  document.addEventListener("click", function (e) { if (!wrap.contains(e.target)) close(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
  /* Cerrar al hacer scroll: el header se oculta al bajar y el menú, anclado a él,
     quedaba "volando" sobre la página. Cerrarlo es el comportamiento esperado de
     un menú de encabezado (y evita que se despegue del botón). */
  window.addEventListener("scroll", function () { if (!menu.hidden) close(); }, { passive: true });
  wrap.querySelector("#acct-logout").addEventListener("click", function () {
    try { localStorage.removeItem("okstation.token"); localStorage.removeItem("okstation.user"); } catch (e) {}
    window.location.reload();
  });
})();

/* ============================================================
   Navbar inteligente: al bajar se oculta, al subir reaparece.
   Bloque autocontenido (no depende del menú de cuenta de arriba).
   ============================================================ */
(function () {
  var header = document.querySelector(".site-header");
  if (!header) return;
  var lastY = window.pageYOffset || 0;
  var ticking = false;
  var DELTA = 6;        // umbral para no parpadear con micro-scrolls
  var SHOW_NEAR_TOP = 90; // siempre visible cerca del inicio

  function update() {
    var y = window.pageYOffset || 0;
    if (y < SHOW_NEAR_TOP) {
      header.classList.remove("site-header--hidden");
    } else {
      var diff = y - lastY;
      if (diff > DELTA) header.classList.add("site-header--hidden");        // bajando → ocultar
      else if (diff < -DELTA) header.classList.remove("site-header--hidden"); // subiendo → mostrar
    }
    lastY = y;
    ticking = false;
  }
  window.addEventListener("scroll", function () {
    if (!ticking) { window.requestAnimationFrame(update); ticking = true; }
  }, { passive: true });
})();
