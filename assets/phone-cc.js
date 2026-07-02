/* ============================================================
   Ok.station — Selector de código de país para teléfonos (+52 / +1)
   Mejora progresiva: para CADA <input type="tel"> del sitio…
     · añade un selector de país (México +52 / EE. UU. +1),
     · fuerza que solo se escriban dígitos (máx. 10 = número local),
     · expone el número completo listo para guardar: "+52 6647194117".
   No depende de ningún framework. Si el script falla, los campos siguen
   funcionando como <input type="tel"> normales (no rompe el envío).

   API pública (window.OKPhone):
     full(input)  → "+52 6647194117" (código + 10 dígitos) o "" si vacío
     cc(input)    → "+52" | "+1" (código elegido)
     set(input,v) → coloca en el campo un valor guardado ("+52 664…")
     init(root)   → mejora los tel dentro de root (por defecto, document)
   ============================================================ */
(function () {
  "use strict";

  /* Ícono de WhatsApp (solo se usa en los campos de contacto que ya lo traían). */
  var OPTS = '<option value="+52">🇲🇽 +52</option>' +
             '<option value="+1">🇺🇸 +1</option>';

  function onlyDigits(s, max) {
    s = String(s == null ? "" : s).replace(/\D/g, "");
    return max ? s.slice(0, max) : s;
  }
  function selectOf(input) {
    var wrap = (input && input.closest) ? input.closest(".input-prefix") : null;
    return wrap ? wrap.querySelector(".input-prefix__cc") : null;
  }
  function cc(input) {
    var s = selectOf(input);
    return (s && s.value) ? s.value : "+52";
  }
  /* Número completo para guardar/enviar: código + hasta 10 dígitos. */
  function full(input) {
    if (!input) return "";
    var d = onlyDigits(input.value, 10);
    return d ? (cc(input) + " " + d) : "";
  }
  /* Coloca un valor guardado ("+52 6647194117") repartiéndolo en selector + campo. */
  function set(input, stored) {
    if (!input) return;
    var str = String(stored == null ? "" : stored).trim();
    var code = "+52", rest = str;
    var m = str.match(/^\+(\d{1,3})\s*(.*)$/);
    if (m) { code = "+" + m[1]; rest = m[2]; }
    var s = selectOf(input);
    if (s) s.value = (code === "+1") ? "+1" : "+52";
    input.value = onlyDigits(rest, 10);
  }
  /* Filtro en vivo: solo dígitos, máx. 10; conserva la posición del cursor. */
  function bindDigitFilter(input) {
    input.addEventListener("input", function () {
      var pos = input.selectionStart, before = input.value, clean = onlyDigits(before, 10);
      if (clean !== before) {
        input.value = clean;
        try {
          var removed = before.length - clean.length;
          input.setSelectionRange(Math.max(0, pos - removed), Math.max(0, pos - removed));
        } catch (e) { /* algunos navegadores no permiten selección en type=tel */ }
      }
    });
  }
  function makeSelect() {
    var sel = document.createElement("select");
    sel.className = "input-prefix__cc";
    sel.setAttribute("aria-label", "Código de país");
    sel.innerHTML = OPTS;
    return sel;
  }
  function enhance(input) {
    if (!input || input.dataset.ccReady) return;
    input.dataset.ccReady = "1";
    input.setAttribute("inputmode", "numeric");
    input.setAttribute("maxlength", "10");
    var wrap = input.closest ? input.closest(".input-prefix") : null;
    var tag = wrap ? wrap.querySelector(".input-prefix__tag") : null;
    if (tag) {
      /* Campo de contacto que ya trae el prefijo "+52": conservamos el ícono y
         cambiamos el texto "+52" por un <select>. */
      if (!tag.querySelector(".input-prefix__cc")) {
        for (var i = tag.childNodes.length - 1; i >= 0; i--) {
          if (tag.childNodes[i].nodeType === 3) tag.removeChild(tag.childNodes[i]);
        }
        tag.appendChild(makeSelect());
      }
    } else {
      /* Campo suelto (registro, perfil, cuestionario): lo envolvemos con un prefijo
         neutro (--plain) + selector, legible en cualquier fondo. */
      wrap = document.createElement("div");
      wrap.className = "input-prefix";
      var parent = input.parentNode;
      if (!parent) { bindDigitFilter(input); return; }
      parent.insertBefore(wrap, input);
      var t = document.createElement("span");
      t.className = "input-prefix__tag input-prefix__tag--plain";
      t.appendChild(makeSelect());
      wrap.appendChild(t);
      wrap.appendChild(input);
    }
    bindDigitFilter(input);
  }
  function init(root) {
    var r = root || document;
    if (!r.querySelectorAll) return;
    var list = r.querySelectorAll('input[type="tel"]');
    for (var i = 0; i < list.length; i++) enhance(list[i]);
  }

  window.OKPhone = { full: full, cc: cc, set: set, digits: onlyDigits, enhance: enhance, init: init };

  if (document.readyState !== "loading") init();
  else document.addEventListener("DOMContentLoaded", function () { init(); });
})();
