/* ============================================================
   Ok.station — Modo oscuro (opcional; el claro es el default)
   ------------------------------------------------------------
   · La elección vive en localStorage ("okstation.theme") y se
     aplica poniendo html[data-theme="dark"]. TODO el CSS oscuro
     cuelga de ese atributo (styles.css y las hojas de cada página).
   · Este archivo va en el <head> SIN defer a propósito: debe fijar
     el tema ANTES del primer pintado o la página "parpadea" en
     claro medio segundo cada vez que un usuario oscuro navega.
     Pesa <2KB; no hay red extra que esperar.
   · El botón (sol/luna) se INYECTA aquí y no se pega a mano en
     cada HTML: hay ~30 páginas con 4 encabezados distintos; un
     solo lugar decide dónde va y así ninguna página se queda sin él.
   · API pública (para el perfil u otras superficies futuras):
       window.OKTheme.get() -> "light" | "dark"
       window.OKTheme.set(t) / toggle()
   ============================================================ */
(function () {
  "use strict";
  var KEY = "okstation.theme";

  function stored() {
    try { return localStorage.getItem(KEY) === "dark" ? "dark" : "light"; } catch (e) { return "light"; }
  }
  function apply(t) {
    if (t === "dark") document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme");
    /* Los controles nativos (inputs, scrollbars) se pintan acorde. */
    document.documentElement.style.colorScheme = (t === "dark") ? "dark" : "light";
    refreshButtons(t);
  }
  function set(t) {
    t = (t === "dark") ? "dark" : "light";
    try { localStorage.setItem(KEY, t); } catch (e) {}
    apply(t);
  }
  function toggle() { set(stored() === "dark" ? "light" : "dark"); }

  /* ── Botón sol/luna ──
     SVG con width/height PROPIOS (lección aprendida: sin tamaño intrínseco,
     un icono se pinta gigante mientras el CSS descarga en un celular). */
  var SUN  = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  var MOON = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

  function refreshButtons(t) {
    var list = document.querySelectorAll(".theme-toggle");
    for (var i = 0; i < list.length; i++) {
      list[i].innerHTML = (t === "dark") ? SUN : MOON;   // muestra a dónde CAMBIA
      list[i].setAttribute("aria-label", t === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro");
      list[i].setAttribute("title", t === "dark" ? "Modo claro" : "Modo oscuro");
    }
  }

  function makeButton() {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "theme-toggle";
    b.addEventListener("click", toggle);
    return b;
  }

  /* Un botón por página, en el PRIMER encabezado que exista. El orden importa:
     primero los headers propios de tienda/fichas y al final el del sitio. */
  var SLOTS = [
    ".oknav__actions",      // navbar unificado (el que reemplaza a los tres de abajo)
    ".shopbar__top",        // ficha de producto / páginas con barra de e-commerce
    "#site .tb-actions",    // catálogo de tienda.html
    ".td-top",              // compra rápida
    "nav.bar",              // páginas de categoría (categoria.php, barra propia)
    ".nav__actions",        // header del sitio (index, servicios, cuenta, perfil…)
  ];
  function inject() {
    /* En TODOS los encabezados presentes, no solo el primero: tienda.html tiene
       dos (navbar en la portada y topbar en el catálogo) y cada vista debe traer
       su botón. En las demás páginas solo existe uno y queda igual. */
    for (var i = 0; i < SLOTS.length; i++) {
      var slot = document.querySelector(SLOTS[i]);
      if (slot && !slot.querySelector(".theme-toggle")) slot.appendChild(makeButton());
    }
    refreshButtons(stored());
  }

  /* Cambio hecho en OTRA pestaña → esta se entera al momento. */
  window.addEventListener("storage", function (e) { if (e.key === KEY) apply(stored()); });

  apply(stored());   // ANTES del primer pintado (el script vive en el <head>)
  if (document.readyState !== "loading") inject();
  else document.addEventListener("DOMContentLoaded", inject);

  window.OKTheme = { get: stored, set: set, toggle: toggle };
})();
