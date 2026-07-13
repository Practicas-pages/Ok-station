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
    "❤ Mis deseados",
    "🚚 ¿Hacen envíos?",
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
  function okiMxn(n) { return "$" + (Math.round(n * 100) / 100).toFixed(2); }

  /* El estado EN VIVO del carrito/deseados solo lo conoce la tienda (no el servidor),
     así que estas preguntas se responden aquí mismo. Devuelve texto o null. */
  function storeLocalReply(text) {
    if (!storeReady()) return null;
    var t = okiNorm(text), S = window.OKtienda;

    // Carrito: qué llevo / cuánto voy / mi total…
    if (/\bcarrito\b|\bcarro\b|que llevo|que tengo|mi compra|cuanto llevo|cuanto va|cuanto voy|mi total|que voy a pagar/.test(t)) {
      var c = [];
      try { c = S.carrito() || []; } catch (e) {}
      if (!c.length) return "Tu carrito está vacío 🛒 Agrega productos y te digo el total al instante. ¿Quieres que te lleve al catálogo?";
      var total = 0, lines = c.map(function (it) { total += it.price * it.qty; return "• " + it.qty + "× " + it.name + " — " + okiMxn(it.price * it.qty); });
      return "Esto llevas en tu carrito 🛒\n" + lines.join("\n") + "\nTotal: " + okiMxn(total) + "\nToca el carrito 🛒 arriba para finalizar. Se recoge en la tienda OK.station y pagas en línea con Mercado Pago.";
    }

    // Deseados / favoritos
    if (/deseado|favorito|lista de deseos|wishlist/.test(t)) {
      var w = [];
      try { w = S.deseados() || []; } catch (e) {}
      try { S.abrirDeseados(); } catch (e) {}
      if (!w.length) return "Aún no tienes deseados ❤ Toca el corazón en cualquier producto para guardarlo y comprarlo cuando quieras.";
      var wl = w.map(function (p) { return "• " + p.name + " — " + okiMxn(p.price); });
      return "Tus deseados ❤\n" + wl.join("\n") + "\nTe abrí tu lista. ¿Agrego alguno al carrito?";
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
    panel.setAttribute("data-view", "list"); renderList();
    setTimeout(function () { var i = document.getElementById("oki-list-input"); if (i) i.focus(); }, 150);
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
      '</button></div>'
    );
    document.body.appendChild(dock);

    // En la tienda: saludo contextual + apartarse cuando se abre el carrito.
    if (storeReady()) {
      var bb0 = document.getElementById("oki-bubble");
      if (bb0) bb0.innerHTML = '¿Buscas algo en la <b>tienda</b>? 🛒<br>Te ayudo con tu carrito o a encontrarlo.';
      window.addEventListener("oktienda:carrito-abierto", function () {
        dock.classList.add("oki-cart-open");
        if (panel && panel.classList.contains("on")) close();
      });
      window.addEventListener("oktienda:carrito-cerrado", function () {
        dock.classList.remove("oki-cart-open");
      });
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
      // Vista MI LISTA (arma tu pedido; se conectará al e-commerce cuando exista)
      '<div class="oki-view oki-view--list">' +
      '<div class="oki-list-head">📝 Mi lista <small>Guarda lo que necesitas para tu pedido</small></div>' +
      '<form class="oki-list-add" id="oki-list-form" autocomplete="off">' +
      '<input id="oki-list-input" placeholder="Ej. 2 resmas de papel carta" aria-label="Agregar a la lista">' +
      '<button type="submit" aria-label="Agregar">＋</button></form>' +
      '<ul class="oki-list-items" id="oki-list-items"></ul>' +
      '<div class="oki-list-actions">' +
      '<button type="button" id="oki-list-clear" class="oki-list-clear">Vaciar</button>' +
      '<span class="oki-list-soon">🛒 Pronto podrás pedir en línea</span>' +
      '</div></div>' +
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

    document.getElementById("oki-btn").addEventListener("click", toggle);
    panel.querySelector(".cls").addEventListener("click", close);
    panel.querySelector("#oki-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var v = input.value.trim();
      if (v) send(v);
    });

    // ── Mi lista ──
    document.getElementById("oki-tab").addEventListener("click", function () {
      panel.getAttribute("data-view") === "list" ? showChat() : showList();
    });
    document.getElementById("oki-list-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var li = document.getElementById("oki-list-input");
      addItem(li.value); li.value = ""; li.focus();
    });
    document.getElementById("oki-list-clear").addEventListener("click", function () {
      if (listItems.length) { listItems = []; saveList(); renderList(); }
    });
    loadList();

    // Cerrar al hacer clic fuera del panel.
    document.addEventListener("click", function (e) {
      if (!panel.classList.contains("on")) return;
      if (e.target.closest("#oki-panel") || e.target.closest("#oki-dock")) return;
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
    panel.classList.add("on");
    panel.setAttribute("aria-hidden", "false");
    if (!greeted) {
      greeted = true;
      addMsg(storeReady()
        ? "¡Hola! Soy OKi 🚀 Estás en la tienda: puedo decirte qué llevas en el carrito, mostrarte tus deseados o resolver dudas de pago y entrega. ¿Qué necesitas?"
        : "¡Hola! Soy OKi 🚀 Te ayudo con impresiones, citas, precios y trámites. ¿Qué necesitas?", "bot");
    }
    setTimeout(function () { input.focus(); }, 250);
  }
  function close() { panel.classList.remove("on"); panel.setAttribute("aria-hidden", "true"); }
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
