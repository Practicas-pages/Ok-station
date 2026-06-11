/* ============================================================
   OK.station — Sesión en el header del sitio (index)
   Si hay sesión, reemplaza el botón "Cuenta" por un menú con
   avatar + nombre → Mi perfil / Mis pedidos / Panel (staff) / Salir.
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

  var login = document.getElementById("acct-login");
  if (login) login.hidden = true;

  var roles = u.roles || [];
  var isStaff = roles.indexOf("administrador") >= 0 || roles.indexOf("empleado") >= 0;
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
      (isStaff ? '<a role="menuitem" href="admin.html" class="acct__admin">Panel administrativo</a>' : '') +
      '<button role="menuitem" id="acct-logout" type="button">Cerrar sesión</button>' +
    '</div>';
  acct.appendChild(wrap);

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
  wrap.querySelector("#acct-logout").addEventListener("click", function () {
    try { localStorage.removeItem("okstation.token"); localStorage.removeItem("okstation.user"); } catch (e) {}
    window.location.reload();
  });
})();
