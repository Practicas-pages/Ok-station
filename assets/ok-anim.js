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
  /* Solo botones que de verdad AGREGAN. Se usa el atributo semántico, no la clase
     de presentación .maddbtn: tienda.html la reutiliza en "Pagar", "Continuar" e
     "Iniciar sesión", y ahí un punto volando al carrito diría justo lo contrario
     de lo que está pasando. #pdpAddBar es la barra pegajosa de la ficha en móvil. */
  var ADD_SEL  = "[data-add],[data-madd],.td-add,.tdpv-add,#pdpAdd,#pdpAddBar";
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

    /* Es OKi quien se lleva el producto al carrito, no un punto anónimo: el gesto
       queda en el mundo de OK.station y de paso refuerza a la mascota. Va como
       SVG en línea (no emoji, que cada sistema dibuja distinto) y sin pedir
       otra descarga en cada clic. */
    var dot = document.createElement("span");
    dot.className = "ok-fly";
    dot.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#066CFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>';
    dot.setAttribute("aria-hidden", "true");
    dot.style.left = (a.left + a.width / 2 - 16) + "px";
    dot.style.top  = (a.top + a.height / 2 - 16) + "px";
    document.body.appendChild(dot);

    var dx = (b.left + b.width / 2) - (a.left + a.width / 2);
    var dy = (b.top + b.height / 2) - (a.top + a.height / 2);

    /* Red de seguridad: si el navegador no soporta Web Animations o la
       animación nunca termina, el punto se retira igual (no deja basura). */
    var quitar = function () { if (dot.parentNode) dot.parentNode.removeChild(dot); };
    setTimeout(quitar, 1100);

    try {
      /* Despega inclinándose, sube en arco y aterriza encogiendo en el carrito:
         la rotación es lo que lo hace leer como un cohete y no como algo que cae. */
      var an = dot.animate([
        { transform: "translate(0,0) scale(.7) rotate(-18deg)", opacity: 0 },
        { transform: "translate(" + (dx * 0.18) + "px," + (dy * 0.18 - 26) + "px) scale(1.15) rotate(-8deg)", opacity: 1, offset: 0.22 },
        { transform: "translate(" + (dx * 0.55) + "px," + (dy * 0.55 - 58) + "px) scale(1) rotate(6deg)", opacity: 1, offset: 0.6 },
        { transform: "translate(" + dx + "px," + dy + "px) scale(.3) rotate(22deg)", opacity: 0 }
      ], { duration: 760, easing: "cubic-bezier(.35,0,.25,1)" });
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
