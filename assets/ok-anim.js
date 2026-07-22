/* ─────────────────────────────────────────────────────────────────────────
   OK.station — Capa de ANIMACIONES compartida
   =========================================================================
   Las seis animaciones aprobadas (jul 2026), en un solo lugar para todo el
   sitio: levantar al pasar, volar al carrito, precio actualizado, esqueleto
   de carga, cajón lateral y aviso breve.

   REGLA DE ORO: esto es DECORATIVO. Se engancha por DELEGACIÓN y nunca toca
   la lógica del carrito ni del catálogo. Si algo aquí falla, la tienda sigue
   vendiendo exactamente igual — por eso todo va con guardas y try/catch.

   Respeta prefers-reduced-motion: quien lo tenga activado ve la misma tienda,
   sin movimiento (hay gente a la que le provoca mareo).

   API pública (window.OKanim):
     .fly(desdeElemento)   vuela un punto al carrito
     .pulse(elemento)      pulso verde de "precio actualizado"
     .toast(mensaje)       aviso breve abajo al centro
     .skeleton(n)          HTML de n tarjetas fantasma para el estado de carga
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  "use strict";

  var reduce = false;
  try { reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) {}

  /* Botones que significan "agregar" en las 3 superficies (tienda, compra
     rápida y ficha). Se listan por selector para NO tener que modificar el
     código de cada página. */
  var ADD_SEL  = "[data-add],[data-madd],.td-add,.tdpv-add,.maddbtn,#pdpAdd";
  /* Destinos posibles del vuelo: el carrito de cada barra. */
  var CART_SEL = "#cartBtn,#tdCartNavBtn,.tb-cart,.sb-cart";

  function visible(el) {
    if (!el) return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
  }
  function cartTarget() {
    var els = document.querySelectorAll(CART_SEL);
    for (var i = 0; i < els.length; i++) if (visible(els[i])) return els[i];
    return null;
  }

  /* ── Vuela al carrito ──
     Un punto sale del botón y cae en el carrito describiendo un arco. Conecta
     el producto con el carrito para que nadie se pregunte si se agregó. */
  function fly(from) {
    if (reduce || !from || !from.getBoundingClientRect) return;
    /* Sin Web Animations (navegador viejo) no hay vuelo: mejor nada que un punto
       clavado en pantalla. */
    if (!document.body || typeof document.body.animate !== "function") return;
    var to = cartTarget(); if (!to) return;
    var a = from.getBoundingClientRect(), b = to.getBoundingClientRect();

    var dot = document.createElement("span");
    dot.className = "ok-fly";
    dot.style.left = (a.left + a.width / 2 - 11) + "px";
    dot.style.top  = (a.top + a.height / 2 - 11) + "px";
    document.body.appendChild(dot);

    var dx = (b.left + b.width / 2) - (a.left + a.width / 2);
    var dy = (b.top + b.height / 2) - (a.top + a.height / 2);

    /* Red de seguridad: si el navegador no soporta Web Animations o la
       animación nunca termina, el punto se retira igual (no deja basura). */
    var quitar = function () { if (dot.parentNode) dot.parentNode.removeChild(dot); };
    setTimeout(quitar, 1100);

    try {
      var an = dot.animate([
        { transform: "translate(0,0) scale(1)", opacity: 1 },
        { transform: "translate(" + (dx * 0.5) + "px," + (dy * 0.5 - 52) + "px) scale(.82)", opacity: 1, offset: 0.55 },
        { transform: "translate(" + dx + "px," + dy + "px) scale(.24)", opacity: 0 }
      ], { duration: 640, easing: "cubic-bezier(.4,0,.2,1)" });
      an.onfinish = function () { quitar(); bump(to); };
    } catch (e) { quitar(); }
  }

  /* Rebote del carrito al recibir: cierra el gesto. */
  function bump(el) {
    if (reduce || !el || !el.animate) return;
    try {
      el.animate([{ transform: "scale(1)" }, { transform: "scale(1.16)" }, { transform: "scale(1)" }],
                 { duration: 320, easing: "ease-out" });
    } catch (e) {}
  }

  /* ── Precio actualizado ──
     Pulso verde cuando el refresco automático cambia un precio: honesto, sin
     asustar. Se quita la clase antes de re-agregarla para poder repetirla. */
  function pulse(el) {
    if (reduce || !el || !el.classList) return;
    el.classList.remove("ok-pulse");
    void el.offsetWidth;                 // fuerza reflow → reinicia la animación
    el.classList.add("ok-pulse");
    setTimeout(function () { el.classList.remove("ok-pulse"); }, 760);
  }

  /* ── Aviso breve ──
     Sube, se queda ~1.6s y se va. Nunca bloquea. Se crea una sola vez. */
  var toastEl = null, toastT = null;
  function toast(msg) {
    if (!msg) return;
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "ok-toast";
      toastEl.setAttribute("role", "status");
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = String(msg);
    toastEl.classList.remove("on");
    void toastEl.offsetWidth;
    toastEl.classList.add("on");
    clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.classList.remove("on"); }, 2600);
  }

  /* ── Esqueleto de carga ──
     Anticipa la FORMA del contenido, en vez de un spinner que no dice nada. */
  function skeleton(n) {
    var out = "";
    for (var i = 0; i < (n || 8); i++) {
      out += '<div class="ok-skel-card" aria-hidden="true">' +
               '<div class="ok-skel ok-skel--ph"></div>' +
               '<div class="ok-skel" style="width:52%"></div>' +
               '<div class="ok-skel" style="width:86%"></div>' +
               '<div class="ok-skel" style="width:38%;height:16px;margin-top:10px"></div>' +
             '</div>';
    }
    return out;
  }

  /* ── Enganche automático ──
     Un solo listener en document: cualquier botón de "agregar" de cualquier
     página dispara el vuelo, sin que esa página tenga que saber de esto. */
  document.addEventListener("click", function (e) {
    try {
      /* e.target puede ser un nodo SVG o de texto (los botones llevan íconos):
         esos no siempre tienen closest, así que se sube al elemento más cercano. */
      var n = e.target;
      if (n && n.nodeType === 3) n = n.parentNode;                    // nodo de texto
      if (!n || typeof n.closest !== "function") {
        n = (n && n.parentElement) || null;                            // p. ej. SVGElement viejo
        if (!n || typeof n.closest !== "function") return;
      }
      var b = n.closest(ADD_SEL);
      if (!b || b.disabled) return;
      fly(b);
    } catch (err) { /* decorativo: nunca debe estorbar al clic real */ }
  }, true);   // captura: corre aunque el handler de la página detenga la propagación

  window.OKanim = { fly: fly, pulse: pulse, toast: toast, skeleton: skeleton, bump: bump, reduced: reduce };
})();
