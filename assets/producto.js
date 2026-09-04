(function () {
  "use strict";
  var P = window.OK_PDP;
  if (!P) return;

  var $ = function (id) { return document.getElementById(id); };
  var CART_KEY = "okstation_cart", WISH_KEY = "okstation_wishlist";
  function readJSON(k, def) { try { var v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? def : v; } catch (e) { return def; } }
  function writeJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function mxn(n) { return "$" + (Number(n) || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  var toastT;
  function toast(html) {
    var t = $("pdpToast"); if (!t) return;
    t.innerHTML = html; t.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("show"); }, 4200);
  }

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
        if (panel) panel.style.backgroundImage = 'url("' + b.dataset.src + '")';
        ocultar();
      });
    });

    return;
    if (!stage || !lens || !panel ||
        !window.matchMedia || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    var Z = 2.5, Z_MIN = 1.5, Z_MAX = 6, activo = false;

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

      if (e.clientX < ir.left || e.clientX > ir.left + ir.width ||
          e.clientY < ir.top  || e.clientY > ir.top  + ir.height) { ocultar(); return; }

      if (!activo) {
        activo = true;
        lens.hidden = false; panel.hidden = false;
        stage.classList.add("is-zoom");
        if (!panel.style.backgroundImage) panel.style.backgroundImage = 'url("' + main.currentSrc + '")';
      }

      var pw = panel.clientWidth, ph = panel.clientHeight;
      if (!(pw > 0) || !(ph > 0)) { ocultar(); return; }
      var lw = Math.min(pw / Z, ir.width), lh = Math.min(ph / Z, ir.height);

      var lx = Math.max(0, Math.min(e.clientX - ir.left - lw / 2, ir.width  - lw));
      var ly = Math.max(0, Math.min(e.clientY - ir.top  - lh / 2, ir.height - lh));

      var sr = stage.getBoundingClientRect();
      lens.style.width = lw + "px"; lens.style.height = lh + "px";
      lens.style.left = (ir.left - sr.left + lx) + "px";
      lens.style.top  = (ir.top  - sr.top  + ly) + "px";

      var fx = pw / lw, fy = ph / lh;
      panel.style.backgroundSize = (ir.width * fx) + "px " + (ir.height * fy) + "px";
      panel.style.backgroundPosition = (-lx * fx) + "px " + (-ly * fy) + "px";
      if (hint) hint.textContent = (Math.round(Z * 10) / 10) + "×";
    }

    stage.addEventListener("mousemove", pintar);
    stage.addEventListener("mouseleave", ocultar);

    stage.addEventListener("wheel", function (e) {
      if (!activo) return;
      e.preventDefault();
      Z = Math.max(Z_MIN, Math.min(Z_MAX, Z + (e.deltaY < 0 ? 0.35 : -0.35)));
      pintar(e);
    }, { passive: false });

    window.addEventListener("scroll", function () { if (activo) ocultar(); }, { passive: true });
    window.addEventListener("resize", function () { if (activo) ocultar(); });
  })();

  var qtyEl = $("pdpQty");
  function qty() {
    if (!qtyEl) return 1;
    var n = parseInt(qtyEl.value, 10);
    if (!n || n < 1) n = 1;
    if (n > P.stock) n = P.stock;
    qtyEl.value = n;
    return n;
  }
  if (qtyEl) {
    $("pdpMinus").addEventListener("click", function () { qtyEl.value = Math.max(1, qty() - 1); });
    $("pdpPlus").addEventListener("click", function () { qtyEl.value = Math.min(P.stock, qty() + 1); });
    qtyEl.addEventListener("change", qty);
    qtyEl.addEventListener("blur", qty);
  }

  function addToCart(n) {
    var cart = readJSON(CART_KEY, {});
    var actual = parseInt(cart[P.id], 10) || 0;
    var total = Math.min(P.stock, actual + n);
    var puestos = total - actual;
    cart[P.id] = total;
    writeJSON(CART_KEY, cart);

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

  (function descMore() {
    var b = $("pdpDescMore"), box = $("pdpDesc");
    if (!box) return;
    box.classList.add("is-clamp");
    if (!b) return;
    b.addEventListener("click", function () {
      var recortada = box.classList.toggle("is-clamp");
      b.textContent = recortada ? "Leer más" : "Leer menos";
      b.setAttribute("aria-expanded", String(!recortada));
    });
  })();

  (function specsMore() {
    var b = $("pdpSpecsMore"), box = $("pdpSpecs");
    if (!b || !box) return;
    var total = box.querySelectorAll(".pdp__spec").length;
    b.addEventListener("click", function () {
      var abierta = box.classList.toggle("is-open");
      b.textContent = abierta ? "Ver menos" : "Ver ficha completa (" + total + ")";
      b.setAttribute("aria-expanded", String(abierta));
    });
  })();

  (function stickyBar() {
    var bar = $("pdpBar"), add = $("pdpAdd");
    if (!bar || !add || !window.IntersectionObserver) return;
    new IntersectionObserver(function (ents) {
      bar.classList.toggle("show", !ents[0].isIntersecting);
    }, { rootMargin: "-10px 0px 0px 0px" }).observe(add);
  })();

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

  document.querySelectorAll("[data-ir-cat]").forEach(function (a) {
    a.addEventListener("click", function () {
      try { sessionStorage.setItem("okstation_ir_cat", a.dataset.irCat); } catch (e) {}
    });
  });

  document.querySelectorAll("[data-ir-brand]").forEach(function (a) {
    a.addEventListener("click", function () {
      try {
        sessionStorage.setItem("okstation_ir_brand", a.dataset.irBrand);
        sessionStorage.removeItem("okstation_ir_cat");
      } catch (e) {}
    });
  });

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
