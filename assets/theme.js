(function () {
  "use strict";
  var KEY = "okstation.theme";

  function stored() {
    try { return localStorage.getItem(KEY) === "dark" ? "dark" : "light"; } catch (e) { return "light"; }
  }
  function apply(t) {
    if (t === "dark") document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme");
    document.documentElement.style.colorScheme = (t === "dark") ? "dark" : "light";
    refreshButtons(t);
  }
  function set(t) {
    t = (t === "dark") ? "dark" : "light";
    try { localStorage.setItem(KEY, t); } catch (e) {}
    apply(t);
  }
  function toggle() { set(stored() === "dark" ? "light" : "dark"); }

  var SUN  = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  var MOON = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

  function refreshButtons(t) {
    var list = document.querySelectorAll(".theme-toggle");
    for (var i = 0; i < list.length; i++) {
      list[i].innerHTML = (t === "dark") ? SUN : MOON;
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

  var SLOTS = [
    [".oknav__actions"],
    [".shopbar__top", ".td-top"],
    ["#site .tb-actions"],
    ["nav.bar"],
    [".nav__actions"],
  ];
  function inject() {
    for (var i = 0; i < SLOTS.length; i++) {
      for (var j = 0; j < SLOTS[i].length; j++) {
        var slot = document.querySelector(SLOTS[i][j]);
        if (!slot) continue;
        if (!slot.querySelector(".theme-toggle")) slot.appendChild(makeButton());
        break;
      }
    }
    refreshButtons(stored());
  }

  window.addEventListener("storage", function (e) { if (e.key === KEY) apply(stored()); });

  apply(stored());
  if (document.readyState !== "loading") inject();
  else document.addEventListener("DOMContentLoaded", inject);

  window.OKTheme = { get: stored, set: set, toggle: toggle };
})();
