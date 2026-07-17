/* ─────────────────────────────────────────────────────────────────────────
   Ok.station — Ficha de producto (producto.php)
   La página ya llega ARMADA del servidor (por SEO). Esto solo le da vida:
   galería, cantidad, carrito, favoritos y el puente con OKi.
   El carrito es el MISMO del navegador que usa la tienda (localStorage), así que
   lo que agregues aquí ya está ahí cuando entres a tienda.html.
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  "use strict";
  var P = window.OK_PDP;
  if (!P) return;

  var $ = function (id) { return document.getElementById(id); };
  var CART_KEY = "okstation_cart", WISH_KEY = "okstation_wishlist";
  function readJSON(k, def) { try { var v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? def : v; } catch (e) { return def; } }
  function writeJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function mxn(n) { return "$" + (Number(n) || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  /* ── Aviso ── */
  var toastT;
  function toast(html) {
    var t = $("pdpToast"); if (!t) return;
    t.innerHTML = html; t.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("show"); }, 4200);
  }

  /* ── Galería ── */
  (function gallery() {
    var main = $("pdpMain"), stage = $("pdpStage");
    if (!main) return;

    document.querySelectorAll(".pdp__thumb").forEach(function (b) {
      b.addEventListener("click", function () {
        main.src = b.dataset.src;
        document.querySelectorAll(".pdp__thumb").forEach(function (x) {
          var on = x === b;
          x.classList.toggle("on", on);
          x.setAttribute("aria-selected", on ? "true" : "false");
        });
      });
    });

    /* Zoom siguiendo el mouse. Solo con puntero fino: con el dedo estorbaría el scroll
       (el CSS ya lo limita, esto evita hasta registrar los listeners). */
    if (!stage || !window.matchMedia || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    stage.addEventListener("mouseenter", function () { stage.classList.add("is-zoom"); });
    stage.addEventListener("mouseleave", function () { stage.classList.remove("is-zoom"); main.style.transformOrigin = "center center"; });
    stage.addEventListener("mousemove", function (e) {
      var r = stage.getBoundingClientRect();
      var x = ((e.clientX - r.left) / r.width) * 100, y = ((e.clientY - r.top) / r.height) * 100;
      main.style.transformOrigin = x + "% " + y + "%";
    });
  })();

  /* ── Cantidad ── */
  var qtyEl = $("pdpQty");
  function qty() {
    if (!qtyEl) return 1;
    var n = parseInt(qtyEl.value, 10);
    if (!n || n < 1) n = 1;
    if (n > P.stock) n = P.stock;      // nunca más de lo que hay
    qtyEl.value = n;
    return n;
  }
  if (qtyEl) {
    $("pdpMinus").addEventListener("click", function () { qtyEl.value = Math.max(1, qty() - 1); });
    $("pdpPlus").addEventListener("click", function () { qtyEl.value = Math.min(P.stock, qty() + 1); });
    qtyEl.addEventListener("change", qty);
    qtyEl.addEventListener("blur", qty);
  }

  /* ── Carrito (el mismo localStorage de la tienda) ── */
  function addToCart(n) {
    var cart = readJSON(CART_KEY, {});
    var actual = parseInt(cart[P.id], 10) || 0;
    var total = Math.min(P.stock, actual + n);          // el tope lo manda la existencia
    var puestos = total - actual;
    cart[P.id] = total;
    writeJSON(CART_KEY, cart);

    /* Si estaba en favoritos, se "gradúa" al carrito y sale de ahí (igual que en la tienda). */
    var w = readJSON(WISH_KEY, []), i = w.indexOf(P.id);
    if (i >= 0) { w.splice(i, 1); writeJSON(WISH_KEY, w); paintWish(); }

    if (puestos <= 0) {
      toast("Ya llevas las " + total + " piezas que hay de este producto. <a href='/tienda#cart'>Ver carrito</a>");
      return;
    }
    var llevas = 0; for (var k in cart) llevas += parseInt(cart[k], 10) || 0;
    toast("✓ " + puestos + "× " + P.name + " — " + mxn(P.price * puestos) +
          "<a href='/tienda#cart'>Ver carrito (" + llevas + ")</a>");
    if (puestos < n) toast("Solo quedaban " + puestos + ". <a href='/tienda#cart'>Ver carrito</a>");

    /* OKi vive en todas las páginas y lee este carrito: que se entere al instante. */
    try { window.dispatchEvent(new CustomEvent("oktienda:carrito")); } catch (e) {}
  }
  ["pdpAdd", "pdpAddBar"].forEach(function (id) {
    var b = $(id); if (!b) return;
    b.addEventListener("click", function () {
      addToCart(qty());
      b.classList.add("is-done"); b.textContent = "¡Agregado! ✓";
      setTimeout(function () { b.classList.remove("is-done"); b.textContent = "Agregar al carrito"; }, 1500);
    });
  });

  /* ── Favoritos ── */
  var wishBtn = $("pdpWish");
  function paintWish() {
    if (!wishBtn) return;
    var on = readJSON(WISH_KEY, []).indexOf(P.id) >= 0;
    wishBtn.setAttribute("aria-pressed", on ? "true" : "false");
    wishBtn.setAttribute("aria-label", on ? "Quitar de favoritos" : "Guardar en favoritos");
  }
  if (wishBtn) {
    paintWish();
    wishBtn.addEventListener("click", function () {
      var w = readJSON(WISH_KEY, []), i = w.indexOf(P.id);
      if (i >= 0) { w.splice(i, 1); toast("Quitado de favoritos"); }
      else { w.push(P.id); toast("❤ Guardado en favoritos. <a href='/tienda#store'>Ver la tienda</a>"); }
      writeJSON(WISH_KEY, w); paintWish();
      try { window.dispatchEvent(new CustomEvent("oktienda:deseados")); } catch (e) {}
    });
  }

  /* ── Leer más ── (la descripción arranca recortada por líneas) */
  (function descMore() {
    var b = $("pdpDescMore"), box = $("pdpDesc");
    if (!box) return;
    box.classList.add("is-clamp");
    if (!b) return;                       // descripción corta: no hace falta el botón
    b.addEventListener("click", function () {
      var recortada = box.classList.toggle("is-clamp");
      b.textContent = recortada ? "Leer más" : "Leer menos";
      b.setAttribute("aria-expanded", String(!recortada));
    });
  })();

  /* ── Ficha completa ── (las filas extra se ocultan con .pdp__specs:not(.is-open)) */
  (function specsMore() {
    var b = $("pdpSpecsMore"), box = $("pdpSpecs");
    if (!b || !box) return;               // ficha corta: se ve entera, sin botón
    var total = box.querySelectorAll(".pdp__spec").length;
    b.addEventListener("click", function () {
      var abierta = box.classList.toggle("is-open");
      b.textContent = abierta ? "Ver menos" : "Ver ficha completa (" + total + ")";
      b.setAttribute("aria-expanded", String(abierta));
    });
  })();

  /* ── Barra de compra pegada abajo (móvil): sale cuando el botón de arriba se pierde ── */
  (function stickyBar() {
    var bar = $("pdpBar"), add = $("pdpAdd");
    if (!bar || !add || !window.IntersectionObserver) return;
    new IntersectionObserver(function (ents) {
      bar.classList.toggle("show", !ents[0].isIntersecting);
    }, { rootMargin: "-10px 0px 0px 0px" }).observe(add);
  })();

  /* ── Puente con OKi ──
     Al tocar el botón, OKi ASOMA y te invita a preguntar lo que quieras de ESTE producto
     (no le manda una pregunta inventada: la pregunta la pones tú). OKi ya está en la
     página; aquí solo se le dice de qué producto se trata.
     Si oki.js aún no terminó de cargar (va con defer), se reintenta un momento antes de
     mandar a WhatsApp: quedarse sin respuesta sería peor. */
  var okiBtn = $("pdpOki");
  if (okiBtn) okiBtn.addEventListener("click", function () {
    var invita = "¡Claro! Pregúntame lo que quieras sobre " + P.name + " 🚀\n" +
      "Por ejemplo: para qué sirve, con qué es compatible, cuánto rinde o cómo se usa. Te leo 😊";
    var intentos = 0;
    (function intenta() {
      if (window.OKi && typeof window.OKi.decir === "function") { window.OKi.decir(invita); return; }
      if (++intentos < 25) return setTimeout(intenta, 100);
      window.location.href = "https://wa.me/526647194117?text=" +
        encodeURIComponent("Hola, tengo una duda sobre " + P.name);
    })();
  });

  /* Ir a la tienda con la categoría de este producto ya puesta. */
  document.querySelectorAll("[data-ir-cat]").forEach(function (a) {
    a.addEventListener("click", function () {
      try { sessionStorage.setItem("okstation_ir_cat", a.dataset.irCat); } catch (e) {}
    });
  });
})();
