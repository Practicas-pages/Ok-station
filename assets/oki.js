/* ══════════════════════════════════════════════════════════════════
   OKi — astronauta asistente de Ok.station.
   Inyecta la mascota + panel de chat y lo conecta al cerebro:
   POST /backend/api/oki/chat.php  (Claude, en el servidor).
   Carga diferida (defer) para no afectar el LCP/TBT. Arranca CERRADO.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  var API = "/backend/api/oki/chat.php";
  var WA  = "https://wa.me/526647194117";

  // Historial de la conversación que se manda al backend.
  var history = [];
  var busy = false, greeted = false, thrustT = null, bubbleT = null;

  var SVG_ASTRO =
    '<svg class="oki__astro" viewBox="0 0 80 96" aria-hidden="true">' +
    '<line x1="40" y1="13" x2="40" y2="6" stroke="#9fb3d6" stroke-width="2.4"/><circle cx="40" cy="5" r="3.2" fill="#00C6FF" class="oki__led"/>' +
    '<rect x="25" y="40" width="30" height="30" rx="12" fill="#c3d0ec"/>' +
    '<rect x="27" y="67" width="9" height="9" rx="3.5" fill="#9fb0d6"/><rect x="44" y="67" width="9" height="9" rx="3.5" fill="#9fb0d6"/>' +
    '<g class="oki__thrust">' +
    '<path class="fl fl1" d="M31.5 75 C 27.5 83, 29 90, 31.5 94 C 34 90, 35.5 83, 31.5 75 Z" fill="url(#okiFlame)"/>' +
    '<path class="fl fl2" d="M48.5 75 C 44.5 83, 46 90, 48.5 94 C 51 90, 52.5 83, 48.5 75 Z" fill="url(#okiFlame)"/>' +
    '<path class="fl core" d="M40 77 C 37.5 82, 38.5 87, 40 90 C 41.5 87, 42.5 82, 40 77 Z" fill="#ffffff" opacity=".85"/>' +
    '</g>' +
    '<g class="oki-leg oki-legL"><rect x="31" y="70" width="9.5" height="17" rx="4.7" fill="#fff" stroke="#e2e8f6" stroke-width="1.6"/><rect x="29" y="84" width="13" height="8" rx="4" fill="#dbe3f4"/></g>' +
    '<g class="oki-leg oki-legR"><rect x="41.5" y="70" width="9.5" height="17" rx="4.7" fill="#fff" stroke="#e2e8f6" stroke-width="1.6"/><rect x="40" y="84" width="13" height="8" rx="4" fill="#dbe3f4"/></g>' +
    '<rect x="26" y="42" width="28" height="30" rx="13" fill="#fff" stroke="#e2e8f6" stroke-width="1.8"/>' +
    '<rect x="33" y="53" width="14" height="10" rx="3" fill="#0b1330"/>' +
    '<circle cx="37.5" cy="58" r="1.7" fill="#00C6FF" class="oki__led"/><circle cx="42.5" cy="58" r="1.7" fill="#7fe0ff" class="oki__led2"/>' +
    '<g class="oki-arm oki-armL"><path d="M29 51 q-8 5 -8 13" fill="none" stroke="#fff" stroke-width="7.5" stroke-linecap="round"/><circle cx="21.5" cy="65" r="5.4" fill="#fff" stroke="#e2e8f6" stroke-width="1.4"/></g>' +
    '<g class="oki-arm oki-armR"><path d="M51 51 q8 5 8 13" fill="none" stroke="#fff" stroke-width="7.5" stroke-linecap="round"/><circle cx="58.5" cy="65" r="5.4" fill="#fff" stroke="#e2e8f6" stroke-width="1.4"/></g>' +
    '<circle cx="40" cy="30" r="22" fill="#fff" stroke="#e2e8f6" stroke-width="2"/>' +
    '<ellipse cx="40" cy="31" rx="15.5" ry="14.5" fill="url(#okiVisor)"/>' +
    '<path d="M27 25 Q40 18 53 25" stroke="rgba(255,255,255,.22)" stroke-width="3" fill="none" stroke-linecap="round"/>' +
    '<g clip-path="url(#okiVisorClip)"><rect class="oki__shine" x="30" y="14" width="7" height="36" fill="#ffffff" opacity=".55"/></g>' +
    '<g class="oki__glare"><ellipse cx="33" cy="25" rx="4.2" ry="5.4" fill="#fff" opacity=".6" transform="rotate(-18 33 25)"/><circle cx="47" cy="35" r="2.3" fill="#bfefff" opacity=".85"/></g>' +
    '</svg>';

  var SVG_DEFS =
    '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>' +
    '<linearGradient id="okiVisor" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0A1024"/><stop offset=".55" stop-color="#0552C8"/><stop offset="1" stop-color="#00C6FF"/></linearGradient>' +
    '<linearGradient id="okiFlame" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eafaff"/><stop offset=".35" stop-color="#00C6FF"/><stop offset=".72" stop-color="#066CFF"/><stop offset="1" stop-color="#066CFF" stop-opacity="0"/></linearGradient>' +
    '<clipPath id="okiVisorClip"><ellipse cx="40" cy="31" rx="15.5" ry="14.5"/></clipPath>' +
    '</defs></svg>';

  var QUICKS = [
    "📸 Foto para pasaporte",
    "🗓️ Agendar una cita",
    "🖨️ Imprimir un archivo",
    "📍 Horario y ubicación"
  ];

  // En la tienda (e-commerce) OKi ofrece atajos propios del carrito/deseados.
  var QUICKS_STORE = [
    "🛒 ¿Qué llevo en el carrito?",
    "✨ ¿Qué me recomiendas?",
    "❤ Mis deseados",
    "💳 ¿Cómo pago?"
  ];

  // ── Modo tienda: OKi lee/actúa sobre window.OKtienda si existe (contrato de la tienda) ──
  function storeReady() { return !!(window.OKtienda && typeof window.OKtienda.carrito === "function"); }
  function okiNorm(s) {
    return String(s || "").toLowerCase()
      .replace(/[áàä]/g, "a").replace(/[éèë]/g, "e").replace(/[íìï]/g, "i")
      .replace(/[óòö]/g, "o").replace(/[úùü]/g, "u").replace(/ñ/g, "n")
      .replace(/\s+/g, " ").trim();
  }
  function okiMxn(n) { return "$" + (Number(n) || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  // Estado que OKi vigila del carrito (para mostrar lo que se agrega y recomendar).
  var okiSnap = {};       // {id: qty} del carrito, para detectar lo recién agregado
  var okiLastRec = null;  // último producto recomendado (para "sí, agrégalo")
  var okiSelfAdd = false; // OKi mismo agregó (para no duplicar el aviso)
  var okiReopenAfterPreview = false; // volver a la lista al cerrar una vista previa abierta desde ella

  function okiProducts() { try { return window.OKtienda.productos() || []; } catch (e) { return []; } }
  function okiCart()     { try { return window.OKtienda.carrito() || []; } catch (e) { return []; } }
  function okiCartMap()  { var m = {}; okiCart().forEach(function (it) { m[it.id] = it.qty; }); return m; }
  function okiCartCount(){ var n = 0; okiCart().forEach(function (it) { n += it.qty; }); return n; }
  function okiTotal()    { try { return window.OKtienda.total() || 0; } catch (e) { return 0; } }
  function okiFindProd(id) { var a = okiProducts().filter(function (p) { return p.id == id; }); return a[0] || null; }

  // Lista de recomendados que NO estén en el carrito (prioriza ofertas y la categoría que ya lleva).
  function okiRecommendList(n) {
    var prods = okiProducts(), cart = okiCartMap();
    if (!prods.length) return [];
    var cats = {};
    Object.keys(cart).forEach(function (id) { var p = okiFindProd(id); if (p) cats[p.cat] = 1; });
    var cand = prods.filter(function (p) { return !cart[p.id] && (p.stock == null || p.stock > 0); });
    cand.sort(function (a, b) {
      var sa = (a.old ? 2 : 0) + (cats[a.cat] ? 1 : 0), sb = (b.old ? 2 : 0) + (cats[b.cat] ? 1 : 0);
      return sb - sa;
    });
    return cand.slice(0, n || 3);
  }
  function okiRecommend() { var r = okiRecommendList(1)[0] || null; okiLastRec = r; return r; }
  function okiInWish(id) { var w = []; try { w = window.OKtienda.deseados() || []; } catch (e) {} return w.some(function (d) { return d.id == id; }); }

  // ── Vista LISTA en la tienda: carrito (con cantidades) + recomendaciones + deseados ──
  function okiOlvThumb(p) { var f = okiFindProd(p.id) || p; return '<span class="olv-th" data-oki-open="' + p.id + '" title="Ver producto" style="background:' + (f.grad || 'var(--blue)') + ';cursor:pointer">' + (f.emoji || '📦') + '</span>'; }
  function okiOlvItem(it) {
    return '<div class="olv-it">' + okiOlvThumb(it) +
      '<div class="olv-nm" data-oki-open="' + it.id + '" style="cursor:pointer"><b>' + esc(it.name) + '</b><small>' + okiMxn(it.price) + ' c/u</small></div>' +
      '<span class="olv-q"><button data-oki-dec="' + it.id + '" aria-label="Quitar uno">−</button><span>' + it.qty + '</span><button data-oki-inc="' + it.id + '" aria-label="Agregar uno">+</button></span>' +
      '<button class="olv-x" data-oki-rm="' + it.id + '" aria-label="Quitar del carrito">✕</button></div>';
  }
  function okiOlvRec(p) {
    var f = okiFindProd(p.id) || p, onW = okiInWish(p.id);
    return '<div class="olv-rec">' + okiOlvThumb(p) +
      '<div class="olv-nm" data-oki-open="' + p.id + '" style="cursor:pointer"><b>' + esc(p.name) + '</b><small>' + okiMxn(p.price) + (f.old ? ' · <span class="o">oferta</span>' : '') + '</small></div>' +
      '<button class="olv-wsh' + (onW ? ' on' : '') + '" data-oki-wish="' + p.id + '" aria-label="Guardar en deseados">♥</button>' +
      '<button class="olv-add" data-oki-add="' + p.id + '" aria-label="Agregar al carrito">＋</button></div>';
  }
  function renderStoreList() {
    var cartBox = document.getElementById("oki-olv-cart"), foot = document.getElementById("oki-olv-foot");
    if (!cartBox) return;
    var c = okiCart();
    if (c.length) {
      cartBox.innerHTML = c.map(okiOlvItem).join("");
      foot.innerHTML = '<div class="olv-tot"><span>Total</span><b>' + okiMxn(okiTotal()) + '</b></div>' +
        '<button class="olv-pay" data-oki-pay="1">Ir a pagar →</button>';
    } else {
      cartBox.innerHTML = '<div class="olv-empty">Aún no eliges productos 🛒<br>Toca <b>＋</b> en el catálogo y aquí te los muestro.</div>';
      foot.innerHTML = "";
    }
    var recs = okiRecommendList(3);
    var recSec = document.getElementById("oki-olv-rec-sec"), recBox = document.getElementById("oki-olv-recs");
    if (recs.length) { recSec.hidden = false; recBox.innerHTML = recs.map(okiOlvRec).join(""); } else { recSec.hidden = true; recBox.innerHTML = ""; }
    var wish = []; try { wish = window.OKtienda.deseados() || []; } catch (e) {}
    var wSec = document.getElementById("oki-olv-wish-sec"), wBox = document.getElementById("oki-olv-wish");
    wSec.hidden = false; // la sección de deseos siempre se muestra (con estado vacío)
    wBox.innerHTML = wish.length ? wish.map(okiOlvRec).join("")
      : '<div class="olv-empty" style="padding:8px 0 4px">Toca el ❤ en un producto para guardarlo aquí.</div>';
  }
  // Abrir la lista de OKi enfocando la sección de DESEADOS (lo usa el botón ❤ de la tienda).
  function okiShowDeseados() {
    if (!storeReady() || !panel) return;
    panel.setAttribute("data-view", "list");
    renderStoreList();
    if (!panel.classList.contains("on")) open();
    setTimeout(function () {
      var sec = document.getElementById("oki-olv-wish-sec"), box = document.getElementById("oki-olv-wish");
      if (sec) sec.scrollIntoView({ block: "start", behavior: "smooth" });
      if (box) { box.classList.add("olv-flash"); setTimeout(function () { box.classList.remove("olv-flash"); }, 1300); }
    }, 160);
  }
  function okiListActive() { return panel && panel.getAttribute("data-view") === "list" && storeReady(); }

  // Busca un producto por nombre (para "agrega el mouse").
  function okiMatchProd(q) {
    q = okiNorm(q); if (!q) return null;
    var prods = okiProducts();
    var m = prods.filter(function (p) { var n = okiNorm(p.name); return n.indexOf(q) >= 0 || q.indexOf(n) >= 0; })[0];
    if (m) return m;
    var w = q.split(" ").filter(function (x) { return x.length >= 3; });
    return prods.filter(function (p) { var n = okiNorm(p.name); return w.some(function (x) { return n.indexOf(x) >= 0; }); })[0] || null;
  }

  function okiUpdateBadge() {
    var b = document.getElementById("oki-cart-badge");
    if (!b) return;
    var n = okiCartCount();
    b.textContent = n; b.style.display = n ? "" : "none";
  }

  // ── Posición del astronauta: apartarse del carrito, "peek" (asomar) o normal ──
  // Peek = tras 30s sin usar OKi (panel cerrado), se esconde y solo asoma; al tocarlo o
  // pasar el mouse, regresa. Así no estorba banners/botones y sigue a la mano.
  var okiPeeked = false, okiPeekTimer = null, OKI_PEEK_MS = 12000;
  function okiCartOpen() { var a = document.getElementById("app"); return !!(a && a.classList.contains("cart-open")); }
  function okiUpdatePosition() {
    if (!dock) return;
    var mobile = window.innerWidth <= 640;
    if (okiCartOpen()) {                         // carrito abierto → apartarse
      dock.classList.remove("oki-peek");
      dock.style.transform = mobile ? "translate3d(0,140px,0)" : "translate3d(-430px,0,0)";
      dock.style.opacity = mobile ? "0" : ""; dock.style.pointerEvents = mobile ? "none" : "";
    } else {                                     // normal o peek (según inactividad)
      var peek = okiPeeked && !(panel && panel.classList.contains("on"));
      dock.classList.toggle("oki-peek", peek);   // (oculta el globo antes de medir)
      if (peek) {
        // Se recuesta en la PARED IZQUIERDA pero SIN esconderse tanto: asoma casi todo el astronauta.
        var tx = -window.innerWidth + 92;
        dock.style.transform = "translate3d(" + tx + "px,0,0)";
        dock.style.opacity = "1";
        dock.style.pointerEvents = "";
      } else {
        dock.style.transform = ""; dock.style.opacity = ""; dock.style.pointerEvents = "";
      }
    }
  }
  function okiResetPeekTimer() {
    clearTimeout(okiPeekTimer);
    okiPeekTimer = setTimeout(function () { okiPeeked = true; okiUpdatePosition(); }, OKI_PEEK_MS);
  }
  function okiWake() {
    var was = okiPeeked;
    okiPeeked = false; okiUpdatePosition(); okiResetPeekTimer();
    if (was && dock) { dock.classList.add("oki-waking"); setTimeout(function () { dock.classList.remove("oki-waking"); }, 720); }
  }

  // Globo del astronauta con lo recién agregado + una recomendación.
  function okiBubbleAdd(prod) {
    var bb = document.getElementById("oki-bubble");
    if (!bb) return;
    var rec = okiRecommend();
    var html = "🛒 Agregaste <b>" + esc(prod.name) + "</b><br>Llevas " + okiCartCount() + " · " + okiMxn(okiTotal());
    if (rec) html += "<br>💡 También: <b>" + esc(rec.name) + "</b> " + okiMxn(rec.price);
    bb.innerHTML = html;
    bb.classList.add("on");
    clearTimeout(bubbleT);
    bubbleT = setTimeout(function () { bb.classList.remove("on"); }, 6500);
  }

  // Cada cambio del carrito: actualiza el badge y, si algo se agregó, lo muestra.
  function okiOnCartChange() {
    var now = okiCartMap(), addedId = null, nowN = 0, oldN = 0;
    for (var id in now) { nowN += now[id]; if (now[id] > (okiSnap[id] || 0)) addedId = +id; }
    for (var id2 in okiSnap) oldN += okiSnap[id2];
    var grew = nowN > oldN;   // el carrito creció (aunque sea re-agregar un ítem ya presente)
    okiSnap = now;
    okiUpdateBadge();
    if (okiListActive()) renderStoreList();            // la lista de OKi se actualiza sola
    if (!grew) return;                                  // no aumentó → no es "agregado"
    if (okiSelfAdd) { okiSelfAdd = false; return; }     // OKi ya lo confirmó él mismo
    var p = okiFindProd(addedId) || okiFindProd(Object.keys(now)[Object.keys(now).length - 1]);
    if (!p) return;
    var abierto = panel && panel.classList.contains("on");
    if (!abierto) {
      // Al AGREGAR, la lista se abre sola y se queda abierta (hasta cerrar/vista previa/salir).
      panel.setAttribute("data-view", "list");
      renderStoreList();
      open();
    } else if (panel.getAttribute("data-view") === "chat") {
      var rec = okiRecommend();
      var msg = "🛒 Agregué " + p.name + " a tu carrito. Llevas " + okiCartCount() + " (" + okiMxn(okiTotal()) + ").";
      if (rec) msg += "\n💡 Te recomiendo: " + rec.name + " (" + okiMxn(rec.price) + "). Dime \"agrégalo\" y lo pongo.";
      addMsg(msg, "bot");
    }
    // panel abierto en vista lista: ya se ve el cambio en la lista.
  }

  /* El estado EN VIVO del carrito/deseados solo lo conoce la tienda (no el servidor),
     así que estas preguntas y acciones se resuelven aquí mismo. Devuelve texto o null. */
  function storeLocalReply(text) {
    if (!storeReady()) return null;
    var t = okiNorm(text), S = window.OKtienda;

    // Carrito: qué llevo / cuánto voy / mi total…
    if (/\bcarrito\b|\bcarro\b|que llevo|que tengo|mi compra|cuanto llevo|cuanto va|cuanto voy|mi total|que voy a pagar/.test(t)) {
      var c = okiCart();
      if (!c.length) return "Tu carrito está vacío 🛒 Agrega productos y te digo el total al instante. ¿Quieres que te lleve al catálogo?";
      var total = 0, lines = c.map(function (it) { total += it.price * it.qty; return "• " + it.qty + "× " + it.name + " — " + okiMxn(it.price * it.qty); });
      var rec = okiRecommend();
      var extra = rec ? "\n💡 Se te podría antojar: " + rec.name + " (" + okiMxn(rec.price) + "). Dime \"agrégalo\"." : "";
      return "Esto llevas en tu carrito 🛒\n" + lines.join("\n") + "\nTotal: " + okiMxn(total) + extra + "\nToca el carrito 🛒 arriba para finalizar. Recoge en OK.station o pide envío a domicilio; pagas en línea.";
    }

    // Deseados / favoritos
    if (/deseado|favorito|lista de deseos|wishlist/.test(t)) {
      var w = [];
      try { w = S.deseados() || []; } catch (e) {}
      setTimeout(okiShowDeseados, 300); // los muestra en la lista, enfocando la sección
      if (!w.length) return "Aún no tienes deseados ❤ Toca el corazón en cualquier producto para guardarlo y comprarlo cuando quieras.";
      var wl = w.map(function (p) { return "• " + p.name + " — " + okiMxn(p.price); });
      return "Tus deseados ❤\n" + wl.join("\n") + "\nTe los muestro en tu lista 👇";
    }

    // Recomendación / consejo
    if (/recomienda|recomiendas|recomendacion|sugiere|sugerencia|que compro|que me llevo|que mas llevo|aconseja|un consejo/.test(t)) {
      var r = okiRecommend();
      if (!r) return "Ya llevas de todo 😄 ¿Te muestro el carrito o quieres ver otra categoría?";
      return "Te recomiendo " + (r.emoji ? r.emoji + " " : "") + r.name + " — " + okiMxn(r.price) + (r.old ? " (¡en oferta! 🔥)" : "") + "\nDime \"agrégalo\" y lo pongo en tu carrito. 🛒";
    }

    // Agregar por nombre ("agrega el mouse") o confirmar la recomendación ("sí, agrégalo")
    var mAdd = t.match(/(?:agrega|agregar|anade|anadir|pon(?:me|lo)?|quiero|llevo|dame|sumale|mete)\s+(.+)/);
    var confirma = okiLastRec && /^(si|sip|simon|dale|va|vale|agregalo|ponlo|ese|esa|obvio|claro|ok|okey|de una)\b/.test(t);
    if (mAdd || confirma) {
      var target = mAdd && mAdd[1] ? okiMatchProd(mAdd[1]) : null;
      if (!target && confirma) target = okiLastRec;
      if (!target) return "¿Cuál producto agrego? Dime el nombre (por ejemplo \"agrega el mouse\") y lo busco 🙂";
      if (target.stock != null && target.stock <= 0) return target.name + " está agotado por ahora 😕. ¿Te recomiendo otra cosa?";
      okiSelfAdd = true;
      try { S.agregar(target.id); } catch (e) { okiSelfAdd = false; }
      var rec2 = okiRecommend();
      var tip = rec2 ? "\n💡 ¿Le sumas " + rec2.name + " (" + okiMxn(rec2.price) + ")? Dime \"agrégalo\"." : "";
      return "¡Listo! Agregué " + target.name + " (" + okiMxn(target.price) + ") a tu carrito 🛒\nLlevas " + okiCartCount() + " · " + okiMxn(okiTotal()) + tip;
    }

    // Quitar del carrito ("quita el mouse")
    var mDel = t.match(/(?:quita|quitar|elimina|borra|saca|remueve)\s+(.+)/);
    if (mDel && mDel[1]) {
      var del = okiMatchProd(mDel[1]);
      if (del && okiCartMap()[del.id]) { try { S.quitar(del.id); } catch (e) {} return "Quité " + del.name + " del carrito. Llevas " + okiCartCount() + " · " + okiMxn(okiTotal()) + "."; }
      return "No encontré ese producto en tu carrito 🤔. Dime \"¿qué llevo?\" y te muestro la lista.";
    }

    return null; // el resto lo contesta el cerebro del servidor (precios, envíos, cómo pago…)
  }

  function el(html) { var d = document.createElement("div"); d.innerHTML = html; return d.firstElementChild; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function linkify(s) {
    return esc(s).replace(/(https?:\/\/[^\s)]+)/g, function (u) { return '<a href="' + u + '" target="_blank" rel="noopener">' + u + "</a>"; });
  }

  var dock, panel, chat, input;
  var listItems = [];

  // ── Lógica de "Mi lista" (localStorage → WhatsApp) ──
  function saveList() { try { localStorage.setItem("oki_list", JSON.stringify(listItems)); } catch (e) {} }
  function loadList() {
    try { var s = localStorage.getItem("oki_list"); listItems = s ? JSON.parse(s) : []; if (!Array.isArray(listItems)) listItems = []; }
    catch (e) { listItems = []; }
    renderList();
  }
  function addItem(text) {
    text = (text || "").trim();
    if (!text) return;
    if (text.length > 120) text = text.slice(0, 120);
    listItems.push(text); saveList(); renderList();
  }
  function renderList() {
    var ul = document.getElementById("oki-list-items");
    if (!ul) return;
    ul.innerHTML = "";
    if (!listItems.length) {
      var empty = document.createElement("li");
      empty.className = "oki-list-empty";
      empty.textContent = "Tu lista está vacía. Agrega lo que necesites 🙂";
      ul.appendChild(empty);
    } else {
      listItems.forEach(function (it, i) {
        var li = document.createElement("li");
        li.className = "oki-list-it";
        var s = document.createElement("span"); s.textContent = it;
        var x = document.createElement("button"); x.type = "button";
        x.setAttribute("aria-label", "Quitar"); x.textContent = "×";
        x.addEventListener("click", function () { listItems.splice(i, 1); saveList(); renderList(); });
        li.appendChild(s); li.appendChild(x); ul.appendChild(li);
      });
    }
  }
  function showList() {
    panel.setAttribute("data-view", "list");
    if (storeReady()) { renderStoreList(); }
    else { renderList(); setTimeout(function () { var i = document.getElementById("oki-list-input"); if (i) i.focus(); }, 150); }
  }
  function showChat() { panel.setAttribute("data-view", "chat"); }

  function build() {
    if (document.getElementById("oki-dock")) return;

    // CSS (por si el <link> no está en el <head>).
    if (!document.querySelector('link[href*="oki.css"]')) {
      var l = document.createElement("link");
      l.rel = "stylesheet"; l.href = "assets/oki.css";
      document.head.appendChild(l);
    }
    document.body.appendChild(el(SVG_DEFS));

    dock = el(
      '<div class="oki-dock" id="oki-dock">' +
      '<div class="oki-bubble" id="oki-bubble">¡Hola! Soy <b>OKi</b> 🚀<br>Pregúntame lo que sea del sitio.</div>' +
      '<button class="oki" id="oki-btn" type="button" aria-label="Abrir asistente OKi">' +
      '<span class="oki__aura"></span>' +
      '<span class="oki__craft">' + SVG_ASTRO + '</span>' +
      '<span class="oki-cart-badge" id="oki-cart-badge" aria-hidden="true" style="display:none">0</span>' +
      '</button></div>'
    );
    document.body.appendChild(dock);

    // En la tienda: saludo contextual, seguimiento del carrito y apartarse al abrirlo.
    if (storeReady()) {
      var bb0 = document.getElementById("oki-bubble");
      if (bb0) bb0.innerHTML = '¿Buscas algo en la <b>tienda</b>? 🛒<br>Yo te llevo el carrito y te doy recomendaciones.';
      okiSnap = okiCartMap();          // punto de partida para detectar lo que se agrega
      okiUpdateBadge();
      window.addEventListener("oktienda:carrito", okiOnCartChange);
      window.addEventListener("oktienda:deseados", function () { okiUpdateBadge(); if (okiListActive()) renderStoreList(); });
      // OKi se aparta a la izquierda cuando el carrito está abierto y REGRESA al
      // cerrarse. Se observa la clase real .cart-open de #app (no solo eventos), para
      // que NUNCA se quede colgado aunque el carrito se cierre por checkout/Escape/scrim.
      var okiAppEl = document.getElementById("app");
      function okiApplyDodge() {
        if (okiAppEl && okiAppEl.classList.contains("cart-open") && panel && panel.classList.contains("on")) close();
        okiUpdatePosition();
      }
      if (okiAppEl && window.MutationObserver) {
        new MutationObserver(okiApplyDodge).observe(okiAppEl, { attributes: true, attributeFilter: ["class"] });
      }
      window.addEventListener("oktienda:carrito-abierto", okiApplyDodge);
      window.addEventListener("oktienda:carrito-cerrado", okiApplyDodge);
      // Al ENTRAR al catálogo: OKi prepara la lista. Si ya tienes productos guardados,
      // te la abre; si está vacía, solo ofrece ayuda con un globo (sin abrirse sola).
      window.addEventListener("oktienda:en-tienda", function () {
        if (!panel) return;
        panel.setAttribute("data-view", "list");
        renderStoreList();
        if (okiCartCount() > 0) {
          open();
        } else if (!panel.classList.contains("on")) {
          var bb = document.getElementById("oki-bubble");
          if (bb) {
            bb.innerHTML = '🛒 Te armo tu <b>lista de compras</b> aquí.<br>Tócame cuando quieras.';
            bb.classList.add("on");
            clearTimeout(bubbleT);
            bubbleT = setTimeout(function () { bb.classList.remove("on"); }, 6000);
          }
        }
      });
      // La lista se cierra al SALIR del e-commerce o al abrir la VISTA PREVIA de un producto.
      window.addEventListener("oktienda:en-landing", function () { close(); });
      window.addEventListener("oktienda:vista-previa", function () { close(); });
      // Si la vista previa se abrió DESDE la lista de OKi, al cerrarla se vuelve a la lista.
      // Se difiere para que el mismo clic (que burbujea al document) no la vuelva a cerrar.
      window.addEventListener("oktienda:vista-previa-cerrada", function () {
        if (!okiReopenAfterPreview) return;
        okiReopenAfterPreview = false;
        setTimeout(function () {
          if (storeReady() && panel) { panel.setAttribute("data-view", "list"); renderStoreList(); open(); }
        }, 60);
      });
      // El botón ❤ de la tienda abre la lista de OKi enfocando los deseados.
      window.addEventListener("oktienda:ver-deseados", okiShowDeseados);
    }

    panel = el(
      '<div class="oki-panel" id="oki-panel" data-view="chat" role="dialog" aria-label="Asistente OKi" aria-hidden="true">' +
      '<div class="oki-panel__h">' +
      '<span class="mini" aria-hidden="true">🚀</span>' +
      '<div class="oki-panel__t"><b>OKi · Tu asistente</b><small>Te ayudo con todo el sitio</small></div>' +
      '<button class="oki-tab" id="oki-tab" type="button" aria-label="Mi lista" title="Mi lista">📝</button>' +
      '<button class="cls" type="button" aria-label="Cerrar">×</button>' +
      '</div>' +
      // Vista CHAT
      '<div class="oki-view oki-view--chat">' +
      '<div class="oki-chat" id="oki-chat"></div>' +
      '<div class="oki-quick" id="oki-quick"></div>' +
      '<form class="oki-input" id="oki-form" autocomplete="off">' +
      '<input id="oki-text" placeholder="Escríbele a OKi…" aria-label="Mensaje para OKi">' +
      '<button type="submit" aria-label="Enviar">➤</button>' +
      '</form></div>' +
      // Vista LISTA: en la tienda = carrito + recomendaciones + deseados; fuera = "Mi lista" de texto
      (storeReady()
        ? '<div class="oki-view oki-view--list oki-view--store">' +
          '<div class="olv-sec">🛒 Tu lista de compras</div>' +
          '<div class="olv-cart" id="oki-olv-cart"></div>' +
          '<div class="olv-foot" id="oki-olv-foot"></div>' +
          '<div class="olv-sec" id="oki-olv-rec-sec" hidden>💡 Te puede interesar</div>' +
          '<div class="olv-recs" id="oki-olv-recs"></div>' +
          '<div class="olv-sec" id="oki-olv-wish-sec" hidden>❤ Lista de deseos</div>' +
          '<div class="olv-wish" id="oki-olv-wish"></div>' +
          '<button class="olv-chat" id="oki-olv-chat" type="button">💬 Chatear con OKi</button>' +
          '</div>'
        : '<div class="oki-view oki-view--list">' +
          '<div class="oki-list-head">📝 Mi lista <small>Guarda lo que necesitas para tu pedido</small></div>' +
          '<form class="oki-list-add" id="oki-list-form" autocomplete="off">' +
          '<input id="oki-list-input" placeholder="Ej. 2 resmas de papel carta" aria-label="Agregar a la lista">' +
          '<button type="submit" aria-label="Agregar">＋</button></form>' +
          '<ul class="oki-list-items" id="oki-list-items"></ul>' +
          '<div class="oki-list-actions">' +
          '<button type="button" id="oki-list-clear" class="oki-list-clear">Vaciar</button>' +
          '<span class="oki-list-soon">🛒 Pronto podrás pedir en línea</span>' +
          '</div></div>') +
      '</div>'
    );
    document.body.appendChild(panel);

    chat = panel.querySelector("#oki-chat");
    input = panel.querySelector("#oki-text");

    var quick = panel.querySelector("#oki-quick");
    (storeReady() ? QUICKS_STORE : QUICKS).forEach(function (q) {
      var b = document.createElement("button");
      b.type = "button"; b.textContent = q;
      b.addEventListener("click", function () { send(q.replace(/^[^\s]+\s/, "")); });
      quick.appendChild(b);
    });
    var listChip = document.createElement("button");
    listChip.type = "button"; listChip.textContent = "📝 Mi lista";
    listChip.addEventListener("click", showList);
    quick.appendChild(listChip);

    // Clic en el astronauta: si está escondido (peek) primero APARECE; si no, abre/cierra.
    document.getElementById("oki-btn").addEventListener("click", function () {
      if (okiPeeked) { okiWake(); return; }
      toggle();
    });
    // Al pasar el mouse por encima, regresa (por si estorbaba) y reinicia el conteo.
    dock.addEventListener("mouseenter", function () { if (okiPeeked) okiWake(); else okiResetPeekTimer(); });
    window.addEventListener("resize", function () { if (okiPeeked || okiCartOpen()) okiUpdatePosition(); }, { passive: true });
    okiResetPeekTimer(); // arranca el conteo de inactividad (12s → se esconde en la pared izquierda)
    panel.querySelector(".cls").addEventListener("click", close);
    panel.querySelector("#oki-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var v = input.value.trim();
      if (v) send(v);
    });

    // Botón 📝 del encabezado: alterna lista ⇄ chat.
    document.getElementById("oki-tab").addEventListener("click", function () {
      panel.getAttribute("data-view") === "list" ? showChat() : showList();
    });

    if (storeReady()) {
      // ── Lista de la tienda: acciones sobre el carrito/deseados vía el contrato ──
      panel.querySelector(".oki-view--store").addEventListener("click", function (e) {
        // El clic está DENTRO del panel: no debe llegar al "clic-fuera" del document
        // (al re-renderizar la lista el botón se desconecta y closest() fallaría → cerraría).
        e.stopPropagation();
        var S = window.OKtienda, x;
        if ((x = e.target.closest("[data-oki-inc]"))) { okiSelfAdd = true; try { S.cambiar(+x.dataset.okiInc, 1); } catch (er) { okiSelfAdd = false; } }
        else if ((x = e.target.closest("[data-oki-dec]"))) { try { S.cambiar(+x.dataset.okiDec, -1); } catch (er) {} }
        else if ((x = e.target.closest("[data-oki-rm]")))  { try { S.quitar(+x.dataset.okiRm); } catch (er) {} }
        else if ((x = e.target.closest("[data-oki-add]"))) { okiSelfAdd = true; try { S.agregar(+x.dataset.okiAdd); } catch (er) { okiSelfAdd = false; } }
        else if ((x = e.target.closest("[data-oki-wish]"))){ try { S.toggleDeseado(+x.dataset.okiWish); } catch (er) {} renderStoreList(); }
        else if ((x = e.target.closest("[data-oki-open]"))) { okiReopenAfterPreview = true; try { S.verProducto(+x.dataset.okiOpen); } catch (er) { okiReopenAfterPreview = false; } }
        else if (e.target.closest("[data-oki-pay]")) { try { S.abrirCarrito(); } catch (er) {} }
        else if (e.target.closest("#oki-olv-chat")) { showChat(); }
      });
      panel.setAttribute("data-view", "list"); // en la tienda, la LISTA es la vista principal
      renderStoreList();
    } else {
      // ── "Mi lista" de texto (fuera de la tienda) ──
      document.getElementById("oki-list-form").addEventListener("submit", function (e) {
        e.preventDefault();
        var li = document.getElementById("oki-list-input");
        addItem(li.value); li.value = ""; li.focus();
      });
      document.getElementById("oki-list-clear").addEventListener("click", function () {
        if (listItems.length) { listItems = []; saveList(); renderList(); }
      });
      loadList();
    }

    // Cerrar al hacer clic fuera del panel. En la tienda TAMBIÉN cierra la lista,
    // EXCEPTO al agregar/marcar deseado (para que la lista refleje el cambio) o al
    // tocar el botón ❤ (que justamente la abre en los deseados).
    document.addEventListener("click", function (e) {
      if (!panel.classList.contains("on")) return;
      if (e.target.closest("#oki-panel") || e.target.closest("#oki-dock")) return;
      if (storeReady() && e.target.closest("[data-add],[data-wish],[data-madd],#wishBtn")) return;
      close();
    });

    // Vuela un poquito al hacer scroll (efecto de propulsión).
    window.addEventListener("scroll", function () {
      var b = document.getElementById("oki-btn");
      if (!b) return;
      b.classList.add("thrust");
      clearTimeout(thrustT);
      thrustT = setTimeout(function () { b.classList.remove("thrust"); }, 900);
    }, { passive: true });

    // Globo de saludo: aparece a los 3.5s, se esconde a los ~11s.
    bubbleT = setTimeout(function () {
      var bb = document.getElementById("oki-bubble");
      if (bb && !panel.classList.contains("on")) {
        bb.classList.add("on");
        setTimeout(function () { bb.classList.remove("on"); }, 7500);
      }
    }, 3500);
  }

  function open() {
    document.getElementById("oki-bubble").classList.remove("on");
    clearTimeout(bubbleT);
    okiPeeked = false; okiUpdatePosition(); okiResetPeekTimer(); // usar OKi = despertar
    panel.classList.add("on");
    panel.setAttribute("aria-hidden", "false");
    if (!greeted) {
      greeted = true;
      addMsg(storeReady()
        ? "¡Hola! Soy OKi 🚀 Soy tu asistente en la tienda: te llevo el carrito, te doy recomendaciones y consejos, y respondo dudas de pago o entrega. ¿Qué buscas?"
        : "¡Hola! Soy OKi 🚀 Te ayudo con impresiones, citas, precios y trámites. ¿Qué necesitas?", "bot");
      // Si ya llevas productos, OKi te muestra tu lista al abrir.
      if (storeReady() && okiCartCount() > 0) {
        var reply = storeLocalReply("que llevo en el carrito");
        if (reply) addMsg(reply, "bot");
      }
    }
    setTimeout(function () { input.focus(); }, 250);
  }
  function close() { panel.classList.remove("on"); panel.setAttribute("aria-hidden", "true"); okiResetPeekTimer(); }
  function toggle() { panel.classList.contains("on") ? close() : open(); }

  function addMsg(text, who) {
    var m = document.createElement("div");
    m.className = "oki-msg " + (who === "me" ? "me" : "bot");
    m.innerHTML = who === "me" ? esc(text) : linkify(text);
    chat.appendChild(m);
    chat.scrollTop = chat.scrollHeight;
    return m;
  }
  function typing(on) {
    var t = document.getElementById("oki-typing");
    if (on && !t) {
      t = document.createElement("div");
      t.id = "oki-typing"; t.className = "oki-msg bot";
      t.innerHTML = '<span class="oki-typing"><i></i><i></i><i></i></span>';
      chat.appendChild(t); chat.scrollTop = chat.scrollHeight;
    } else if (!on && t) { t.remove(); }
  }

  function send(text) {
    if (busy) return;
    if (!panel.classList.contains("on")) open();
    input.value = "";
    addMsg(text, "me");
    history.push({ role: "user", content: text });

    // Modo tienda: el estado en vivo del carrito/deseados se responde aquí
    // (el cerebro del servidor no conoce lo que TÚ llevas).
    var local = storeLocalReply(text);
    if (local) {
      addMsg(local, "bot");
      history.push({ role: "assistant", content: local });
      setTimeout(function () { input.focus(); }, 60);
      return;
    }

    busy = true;
    typing(true);

    fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history })
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        typing(false);
        var reply = (data && data.reply) ? data.reply :
          "Uy, no pude procesar eso. Escríbenos por WhatsApp: 664 719 4117 (" + WA + ").";
        addMsg(reply, "bot");
        history.push({ role: "assistant", content: reply });
        // Navegación directa: OKi lleva al usuario a la sección pedida.
        if (data && data.go) {
          setTimeout(function () { window.location.href = data.go; }, 950);
        }
      })
      .catch(function () {
        typing(false);
        addMsg("No me pude conectar 😕. Escríbenos por WhatsApp: 664 719 4117 (" + WA + ").", "bot");
      })
      .then(function () { busy = false; input.focus(); });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }
})();
