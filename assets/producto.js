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

    var lens = $("pdpLens"), panel = $("pdpZoom"), hint = $("pdpZoomHint");

    document.querySelectorAll(".pdp__thumb").forEach(function (b) {
      b.addEventListener("click", function () {
        main.src = b.dataset.src;
        document.querySelectorAll(".pdp__thumb").forEach(function (x) {
          var on = x === b;
          x.classList.toggle("on", on);
          x.setAttribute("aria-selected", on ? "true" : "false");
        });
        /* La imagen cambió: el panel tiene que apuntar a la nueva y recalcular
           medidas, si no seguiría ampliando la foto anterior. */
        if (panel) panel.style.backgroundImage = 'url("' + b.dataset.src + '")';
        ocultar();
      });
    });

    /* Zoom (lupa) DESACTIVADO a propósito: se prefiere la foto tal cual, sin ampliarla
       al pasar el cursor. El cambio de miniaturas de arriba se conserva. Los recuadros
       #pdpLens/#pdpZoom arrancan hidden y ya no se muestran nunca. */
    return;
    /* eslint-disable no-unreachable */
    if (!stage || !lens || !panel ||
        !window.matchMedia || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    var Z = 2.5, Z_MIN = 1.5, Z_MAX = 6, activo = false;

    /* Rectángulo REAL de la foto dentro del escenario. No sirve el getBoundingClientRect
       del <img> a secas: la imagen es object-fit:contain con padding, así que lo pintado
       casi nunca llena la caja y, sin este cálculo, la lupa apuntaría descuadrada. */
    function imgRect() {
      var r = main.getBoundingClientRect(), cs = getComputedStyle(main);
      var pl = parseFloat(cs.paddingLeft) || 0, pr = parseFloat(cs.paddingRight) || 0;
      var pt = parseFloat(cs.paddingTop) || 0, pb = parseFloat(cs.paddingBottom) || 0;
      var cw = r.width - pl - pr, ch = r.height - pt - pb;
      var nw = main.naturalWidth || 1, nh = main.naturalHeight || 1;
      var s = Math.min(cw / nw, ch / nh);
      var w = nw * s, h = nh * s;
      return { left: r.left + pl + (cw - w) / 2, top: r.top + pt + (ch - h) / 2, width: w, height: h };
    }

    function ocultar() {
      activo = false;
      lens.hidden = true; panel.hidden = true;
      stage.classList.remove("is-zoom");
    }

    function pintar(e) {
      var ir = imgRect();
      if (!(ir.width > 0) || !(ir.height > 0)) return;

      /* Fuera de la foto (dentro del marco pero en el margen): se apaga, si no la lupa
         quedaría pegada en la orilla mostrando algo que el cursor ya no señala. */
      if (e.clientX < ir.left || e.clientX > ir.left + ir.width ||
          e.clientY < ir.top  || e.clientY > ir.top  + ir.height) { ocultar(); return; }

      if (!activo) {
        activo = true;
        lens.hidden = false; panel.hidden = false;
        stage.classList.add("is-zoom");
        if (!panel.style.backgroundImage) panel.style.backgroundImage = 'url("' + main.currentSrc + '")';
      }

      /* En pantalla angosta el CSS apaga el panel (display:none) y mide 0: sin esto,
         los factores saldrían NaN y la lupa quedaría con medidas basura. */
      var pw = panel.clientWidth, ph = panel.clientHeight;
      if (!(pw > 0) || !(ph > 0)) { ocultar(); return; }
      /* La lupa mide justo la porción que cabe en el panel: lo que se enmarca es
         exactamente lo que se ve ampliado (si no, el recuadro mentiría). */
      var lw = Math.min(pw / Z, ir.width), lh = Math.min(ph / Z, ir.height);

      /* Centrada en el cursor y sujeta a la foto, para que nunca se salga del borde. */
      var lx = Math.max(0, Math.min(e.clientX - ir.left - lw / 2, ir.width  - lw));
      var ly = Math.max(0, Math.min(e.clientY - ir.top  - lh / 2, ir.height - lh));

      var sr = stage.getBoundingClientRect();
      lens.style.width = lw + "px"; lens.style.height = lh + "px";
      lens.style.left = (ir.left - sr.left + lx) + "px";
      lens.style.top  = (ir.top  - sr.top  + ly) + "px";

      /* Factores reales: si la lupa se topó con el borde de la foto, el aumento efectivo
         ya no es Z y usar Z aquí descuadraría el encuadre. */
      var fx = pw / lw, fy = ph / lh;
      panel.style.backgroundSize = (ir.width * fx) + "px " + (ir.height * fy) + "px";
      panel.style.backgroundPosition = (-lx * fx) + "px " + (-ly * fy) + "px";
      if (hint) hint.textContent = (Math.round(Z * 10) / 10) + "×";
    }

    stage.addEventListener("mousemove", pintar);
    stage.addEventListener("mouseleave", ocultar);

    /* Rueda = más o menos aumento. passive:false porque hay que frenar el scroll de la
       página: girar la rueda encima de la foto debe ampliar, no mover la página. */
    stage.addEventListener("wheel", function (e) {
      if (!activo) return;
      e.preventDefault();
      Z = Math.max(Z_MIN, Math.min(Z_MAX, Z + (e.deltaY < 0 ? 0.35 : -0.35)));
      pintar(e);
    }, { passive: false });

    /* Al hacer scroll o cambiar el tamaño, las medidas guardadas dejan de valer. */
    window.addEventListener("scroll", function () { if (activo) ocultar(); }, { passive: true });
    window.addEventListener("resize", function () { if (activo) ocultar(); });
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
      else { w.push(P.id); toast('<svg width="12" height="12" viewBox="0 0 24 24" fill="#e11d48" style="vertical-align:-1px" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg> Guardado en favoritos. <a href=\'/tienda#store\'>Ver la tienda</a>'); }
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

  /* Igual, pero con la MARCA: la tienda de siempre con el filtro ya aplicado
     (no es una pantalla aparte). Lo lee tienda.html al arrancar. */
  document.querySelectorAll("[data-ir-brand]").forEach(function (a) {
    a.addEventListener("click", function () {
      try {
        sessionStorage.setItem("okstation_ir_brand", a.dataset.irBrand);
        /* Una marca y una categoría a la vez se pisarían; gana la que se acaba de tocar. */
        sessionStorage.removeItem("okstation_ir_cat");
      } catch (e) {}
    });
  });

  /* ── "Avísame por correo cuando llegue" (producto agotado) ──
     El aviso lo manda el sync de Exel al recuperar existencia (stock_alerts).
     Aquí solo se elige el correo (el de la cuenta con un clic, u otro) y se
     registra vía stock-alert.php. Requiere sesión. */
  var alertBtn = $("pdpAlert");
  if (alertBtn) (function () {
    function lsUser(){ try { return JSON.parse(localStorage.getItem("okstation.user")||"null"); } catch(e){ return null; } }
    function lsTok(){ try { return localStorage.getItem("okstation.token")||""; } catch(e){ return ""; } }
    var box=$("pdpAlertBox"), mio=$("paMio"), otro=$("paOtro"), inp=$("paEmail"), go=$("paGo"), msg=$("paMsg");
    var usarOtro=false;
    function pinta(){
      var u=lsUser()||{};
      mio.textContent="✉ "+(u.email||"El de mi cuenta");
      mio.style.borderColor=usarOtro?"#e3e6ee":"#066CFF"; mio.style.background=usarOtro?"#fff":"#eef5ff"; mio.style.color=usarOtro?"inherit":"#066CFF";
      otro.style.borderColor=usarOtro?"#066CFF":"#e3e6ee"; otro.style.background=usarOtro?"#eef5ff":"#fff"; otro.style.color=usarOtro?"#066CFF":"inherit";
      inp.hidden=!usarOtro;
    }
    alertBtn.addEventListener("click", function () {
      if (!lsTok()) { location.href="/cuenta.html?next="+encodeURIComponent(location.pathname); return; }
      box.hidden=!box.hidden;
      if(!box.hidden){ pinta(); }
    });
    mio.addEventListener("click", function(){ usarOtro=false; pinta(); });
    otro.addEventListener("click", function(){ usarOtro=true; pinta(); inp.focus(); });
    go.addEventListener("click", function () {
      var email = usarOtro ? (inp.value||"").trim() : "";
      if (usarOtro && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { msg.hidden=false; msg.style.color="#8a1c1c"; msg.textContent="Escribe un correo válido."; return; }
      go.disabled=true; go.textContent="Guardando…";
      fetch("/backend/api/shop/stock-alert.php", { method:"POST",
        headers:{ "Content-Type":"application/json", "Authorization":"Bearer "+lsTok() },
        body: JSON.stringify({ product_id:+alertBtn.dataset.id, email:email }) })
        .then(function(r){ return r.json(); })
        .then(function(j){
          go.disabled=false; go.textContent="Avisarme";
          msg.hidden=false;
          if (j && j.ok) { msg.style.color="#0E9F6E"; msg.textContent=j.message||"Listo: te avisamos en cuanto llegue."; go.hidden=true; mio.disabled=otro.disabled=true; inp.disabled=true; }
          else { msg.style.color="#8a1c1c"; msg.textContent=(j&&j.error)||"No se pudo guardar tu aviso."; }
        })
        .catch(function(){ go.disabled=false; go.textContent="Avisarme"; msg.hidden=false; msg.style.color="#8a1c1c"; msg.textContent="Sin conexión, intenta de nuevo."; });
    });
  })();
})();
