/* ─────────────────────────────────────────────────────────────────────────
   Ok.station — Libreta de direcciones REUTILIZABLE (chip .tb-loc + drawer)
   -----------------------------------------------------------------------------
   Deja EDITAR la ubicación de entrega desde CUALQUIER página que traiga un chip
   .tb-loc (hoy la ficha de producto), sin tener que ir a la tienda. Al cargar,
   pinta el chip con la dirección predeterminada del usuario (misma libreta que la
   tienda y la compra rápida: tabla user_addresses vía /backend/api/shop/…).

   Autocontenido: inyecta su propio CSS y construye su drawer, así es "drop-in".
   Usa rutas ABSOLUTAS (la ficha vive en /producto/<id>-<slug>, donde las
   relativas se romperían). Si ya existe otra libreta en la página (la tienda o la
   compra rápida definen la suya), este módulo NO se activa para no duplicar.
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  "use strict";
  // La tienda y la compra rápida traen su propia libreta (usan #tdLocBtn / #locBtn).
  // Este módulo es solo para páginas que NO la tienen (la ficha usa .tb-loc sin esos ids).
  if (document.getElementById("tdLocBtn") || document.getElementById("locBtn")) return;

  var API = "/backend/api/shop/";
  var DEF_STATES = ["Baja California", "Baja California Sur", "Sonora", "Sinaloa", "Jalisco", "Ciudad de México", "Nuevo León", "Chihuahua", "Coahuila", "Estado de México"];

  function token() { try { return localStorage.getItem("okstation.token") || ""; } catch (e) { return ""; } }
  function user() { try { return JSON.parse(localStorage.getItem("okstation.user") || "null"); } catch (e) { return null; } }
  function esc(s) { var d = document.createElement("div"); d.textContent = (s == null ? "" : String(s)); return d.innerHTML; }
  function authFetch(path, opts) {
    opts = opts || {};
    var h = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
    var t = token(); if (t) h["Authorization"] = "Bearer " + t;
    opts.headers = h;
    return fetch(API + path, opts).then(function (r) { return r.json(); });
  }

  var chips = [], scrim, drawer, titleEl, bodyEl, built = false;
  var addrs = [], STATES = DEF_STATES.slice();

  function defaultAddr() { return addrs.filter(function (a) { return a.is_default; })[0] || addrs[0] || null; }

  /* Pinta TODOS los chips .tb-loc con la dirección predeterminada (o el genérico). */
  function paintChips() {
    var d = token() ? defaultAddr() : null;
    chips.forEach(function (chip) {
      var b = chip.querySelector(".tb-loc__txt b"), t = chip.querySelector(".tb-loc__txt small");
      if (!b) return;
      if (d) { if (t) { t.hidden = false; t.textContent = "Entrega en"; } b.textContent = (d.city || "") + (d.postal_code ? " " + d.postal_code : ""); }
      else { if (t) t.hidden = true; b.textContent = "Elige tu ubicación"; }
    });
  }

  /* Lista INLINE (p. ej. en el perfil): muestra las direcciones guardadas + botón para
     gestionarlas. Se activa si la página tiene un contenedor [data-ab-list]. */
  function renderInline() {
    var box = document.querySelector("[data-ab-list]");
    if (!box) return;
    if (!token()) { box.innerHTML = '<p class="ab-note">Inicia sesión para guardar tus direcciones de entrega.</p>'; return; }
    var cards = addrs.map(function (a) {
      return '<div class="ab-addr' + (a.is_default ? " on" : "") + '">' +
        '<b>' + esc(a.recipient) + (a.is_default ? ' <span class="ab-tag">Predeterminada</span>' : '') + '</b>' +
        '<span>' + esc([a.street, a.ext_num, a.neighborhood, a.city, a.state, a.postal_code].filter(Boolean).join(", ")) + '</span>' +
        (a.notes ? '<span>' + esc(a.notes) + '</span>' : '') + '</div>';
    }).join("");
    box.innerHTML =
      '<div class="ab-addrs">' + (addrs.length ? cards : '<p class="ab-note">Aún no tienes direcciones guardadas.</p>') +
      '<button type="button" class="ab-addr ab-new" data-ab-open><span class="ab-plus">+</span><b>' + (addrs.length ? "Gestionar direcciones" : "Agregar dirección") + '</b></button>' +
      '</div>';
  }

  function refreshAll() { paintChips(); renderInline(); }

  function injectCSS() {
    if (document.getElementById("ab-css")) return;
    var css = document.createElement("style"); css.id = "ab-css";
    css.textContent =
      ".ab-scrim{position:fixed;inset:0;background:rgba(10,14,30,.5);z-index:80;opacity:0;pointer-events:none;transition:opacity .25s}" +
      ".ab-scrim.show{opacity:1;pointer-events:auto}" +
      /* Arranca BAJO la navbar pegajosa (--oknav-h la publica oknav.js): a pantalla
         completa, la cabecera con la ✕ quedaba escondida tras las cejillas. */
      ".ab-drawer{position:fixed;top:var(--oknav-h,0px);right:0;height:auto;bottom:0;width:min(420px,94vw);background:#fff;z-index:81;display:flex;flex-direction:column;transform:translateX(100%);transition:transform .3s cubic-bezier(.4,0,.2,1);box-shadow:-12px 0 44px rgba(10,14,30,.24)}" +
      ".ab-drawer.show{transform:translateX(0)}" +
      ".ab-dh{display:flex;align-items:center;gap:10px;padding:16px 18px;border-bottom:1px solid #eef1f6}" +
      ".ab-dh b{font-size:1.02rem;color:#0f1b2e;flex:1}" +
      ".ab-dx{width:34px;height:34px;border-radius:50%;border:1px solid #e3e8f0;background:#fff;font-size:1.2rem;line-height:1;cursor:pointer;color:#33404f}" +
      ".ab-dx:hover{background:#f1f4fb;color:#e11d48}" +
      ".ab-body{padding:16px 18px;overflow-y:auto;flex:1}" +
      ".ab-loading,.ab-note{color:#6b7280;font-size:.9rem;text-align:left;margin:0 0 12px}" +
      ".ab-err{background:#fee;color:#b91c1c;border:1px solid #f4bcbc;border-radius:10px;padding:8px 12px;font-size:.85rem;margin-bottom:10px}" +
      ".ab-addrs{display:flex;flex-direction:column;gap:10px}" +
      ".ab-addr{text-align:left;border:1.5px solid #e3e8f0;border-radius:14px;padding:12px 14px;background:#fff;cursor:pointer;display:flex;flex-direction:column;gap:2px;transition:border-color .15s,box-shadow .15s}" +
      ".ab-addr:hover{border-color:#066CFF;box-shadow:0 6px 18px rgba(6,108,255,.14)}" +
      ".ab-addr.on{border-color:#066CFF;background:#f5f9ff}" +
      ".ab-addr b{font-size:.94rem;color:#0f1b2e}" +
      ".ab-addr span{font-size:.85rem;color:#6b7280}" +
      ".ab-tag{display:inline-block;background:#066CFF;color:#fff;font-size:.66rem;font-weight:700;padding:1px 7px;border-radius:99px;margin-left:6px;vertical-align:middle}" +
      ".ab-new{align-items:center;flex-direction:row;gap:8px;justify-content:center;color:#066CFF;font-weight:700;border-style:dashed}" +
      ".ab-plus{font-size:1.2rem;line-height:1}" +
      ".ab-field{display:flex;flex-direction:column;gap:4px;margin-bottom:11px}" +
      ".ab-field label{font-size:.78rem;font-weight:600;color:#33404f}" +
      ".ab-field .opt{color:#9aa4b2;font-weight:400}" +
      ".ab-field input,.ab-field select{border:1.5px solid #e3e8f0;border-radius:10px;padding:9px 11px;font:inherit;font-size:.9rem;color:#0f1b2e;background:#fff}" +
      ".ab-field input:focus,.ab-field select:focus{outline:none;border-color:#066CFF}" +
      ".ab-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}" +
      ".ab-chk{display:flex;align-items:center;gap:8px;font-size:.85rem;color:#33404f;margin:2px 0 14px}" +
      ".ab-save{width:100%;border:0;border-radius:12px;background:linear-gradient(135deg,#9C1DFF,#066CFF);color:#fff;font-weight:700;font-size:.95rem;padding:12px;cursor:pointer}" +
      ".ab-save:disabled{opacity:.6;cursor:default}" +
      ".ab-back{width:100%;background:none;border:0;color:#066CFF;font-weight:600;font-size:.88rem;padding:12px;cursor:pointer;margin-top:6px}";
    document.head.appendChild(css);
  }

  function ensureUI() {
    if (built) return; built = true;
    injectCSS();
    scrim = document.createElement("div"); scrim.className = "ab-scrim";
    drawer = document.createElement("aside"); drawer.className = "ab-drawer"; drawer.setAttribute("aria-label", "Ubicación de entrega");
    drawer.innerHTML = '<div class="ab-dh"><b id="ab-title">¿A dónde te lo enviamos?</b><button type="button" class="ab-dx" aria-label="Cerrar">×</button></div><div class="ab-body" id="ab-body"></div>';
    document.body.appendChild(scrim); document.body.appendChild(drawer);
    titleEl = drawer.querySelector("#ab-title"); bodyEl = drawer.querySelector("#ab-body");
    scrim.addEventListener("click", close);
    drawer.querySelector(".ab-dx").addEventListener("click", close);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && drawer.classList.contains("show")) close(); });
    bodyEl.addEventListener("click", onBodyClick);
  }

  function show() { ensureUI(); scrim.classList.add("show"); drawer.classList.add("show"); }
  function close() { if (drawer) { drawer.classList.remove("show"); scrim.classList.remove("show"); } }

  function open() {
    // Sin sesión no hay dónde guardar → a iniciar sesión y volver a ESTA página.
    if (!token()) { location.href = "/cuenta?next=" + encodeURIComponent(location.pathname + location.search + location.hash); return; }
    ensureUI();
    titleEl.textContent = "¿A dónde te lo enviamos?";
    bodyEl.innerHTML = '<div class="ab-loading">Cargando tus direcciones…</div>';
    show();
    authFetch("addresses.php").then(function (j) {
      if (!j || !j.ok) return renderList([]);
      addrs = j.addresses || []; if (j.states && j.states.length) STATES = j.states;
      refreshAll();
      addrs.length ? renderList(addrs) : renderForm();
    }).catch(function () { renderList([]); });
  }

  function renderList(list) {
    titleEl.textContent = "¿A dónde te lo enviamos?";
    var items = list.map(function (a) {
      return '<button type="button" class="ab-addr' + (a.is_default ? " on" : "") + '" data-addr="' + a.id + '">' +
        '<b>' + esc(a.recipient) + (a.is_default ? ' <span class="ab-tag">Predeterminada</span>' : '') + '</b>' +
        '<span>' + esc(a.label || ((a.city || "") + " " + (a.postal_code || ""))) + '</span>' +
        (a.notes ? '<span>' + esc(a.notes) + '</span>' : '') + '</button>';
    }).join("");
    bodyEl.innerHTML =
      '<div class="ab-err" id="ab-err" role="alert" hidden></div>' +
      (list.length ? '<p class="ab-note">Elige a dónde enviamos tu pedido.</p>' : '') +
      '<div class="ab-addrs">' + items +
      '<button type="button" class="ab-addr ab-new" id="ab-newbtn"><span class="ab-plus">+</span><b>Agregar dirección</b></button>' +
      '</div>';
  }

  function renderForm() {
    titleEl.textContent = "Agregar una dirección";
    var u = user() || {};
    var opts = STATES.map(function (s) { return '<option' + (s === "Baja California" ? " selected" : "") + '>' + esc(s) + '</option>'; }).join("");
    var hayPrevias = addrs.length > 0;
    bodyEl.innerHTML =
      '<div class="ab-err" id="ab-err" role="alert" hidden></div>' +
      '<div class="ab-field"><label for="ab-rec">¿Quién recibe?</label><input id="ab-rec" type="text" maxlength="160" autocomplete="name" placeholder="Nombre y apellido" value="' + esc(u.full_name || "") + '"></div>' +
      '<div class="ab-field"><label for="ab-phone">Teléfono</label><input id="ab-phone" type="tel" maxlength="40" inputmode="tel" autocomplete="tel" placeholder="664 719 4117" value="' + esc(u.phone || "") + '"></div>' +
      '<div class="ab-field"><label for="ab-street">Calle</label><input id="ab-street" type="text" maxlength="200" autocomplete="address-line1" placeholder="Blvd. Insurgentes"></div>' +
      '<div class="ab-row"><div class="ab-field"><label for="ab-ext">Núm. exterior</label><input id="ab-ext" type="text" maxlength="30" placeholder="123"></div>' +
      '<div class="ab-field"><label for="ab-int">Interior <span class="opt">(opcional)</span></label><input id="ab-int" type="text" maxlength="30" placeholder="4B"></div></div>' +
      '<div class="ab-field"><label for="ab-col">Colonia</label><input id="ab-col" type="text" maxlength="160" autocomplete="address-line2" placeholder="Otay Constituyentes"></div>' +
      '<div class="ab-row"><div class="ab-field"><label for="ab-city">Ciudad</label><input id="ab-city" type="text" maxlength="120" autocomplete="address-level2" placeholder="Tijuana" value="Tijuana"></div>' +
      '<div class="ab-field"><label for="ab-cp">Código postal</label><input id="ab-cp" type="text" inputmode="numeric" maxlength="5" autocomplete="postal-code" placeholder="22204"></div></div>' +
      '<div class="ab-field"><label for="ab-state">Estado</label><select id="ab-state" autocomplete="address-level1">' + opts + '</select></div>' +
      '<div class="ab-field"><label for="ab-notes">Referencias <span class="opt">(opcional)</span></label><input id="ab-notes" type="text" maxlength="255" placeholder="Casa azul, portón negro, entre X y Y"></div>' +
      '<label class="ab-chk"><input type="checkbox" id="ab-def"' + (hayPrevias ? '' : ' checked disabled') + '> Usar como mi dirección predeterminada' + (hayPrevias ? '' : ' <span class="opt">(es tu primera dirección)</span>') + '</label>' +
      '<button type="button" class="ab-save" id="ab-savebtn">Agregar dirección</button>' +
      (hayPrevias ? '<button type="button" class="ab-back" id="ab-backbtn">← Volver a mis direcciones</button>' : '');
    setTimeout(function () { var f = document.getElementById("ab-rec"); if (f) f.focus(); }, 50);
  }

  function saveAddr() {
    var err = document.getElementById("ab-err");
    function bad(m) { if (err) { err.textContent = m; err.hidden = false; err.scrollIntoView({ block: "nearest" }); } }
    var v = function (id) { var el = document.getElementById(id); return el ? (el.value || "").trim() : ""; };
    var body = {
      recipient: v("ab-rec"), phone: v("ab-phone"), street: v("ab-street"), ext_num: v("ab-ext"),
      int_num: v("ab-int"), neighborhood: v("ab-col"), city: v("ab-city"), state: v("ab-state"),
      postal_code: v("ab-cp"), notes: v("ab-notes"), is_default: document.getElementById("ab-def").checked
    };
    if (body.recipient.length < 3) return bad("Escribe el nombre de quien recibe.");
    if ((body.phone.match(/\d/g) || []).length < 10) return bad("El teléfono debe tener al menos 10 dígitos.");
    if (!body.street) return bad("Escribe la calle.");
    if (!body.ext_num) return bad("Escribe el número exterior.");
    if (!body.neighborhood) return bad("Escribe la colonia.");
    if (!body.city) return bad("Escribe la ciudad.");
    if (!/^\d{5}$/.test(body.postal_code)) return bad("El código postal debe tener 5 dígitos.");
    var btn = document.getElementById("ab-savebtn"); btn.disabled = true; btn.textContent = "Guardando…";
    authFetch("address-save.php", { method: "POST", body: JSON.stringify(body) }).then(function (j) {
      if (!j || !j.ok) { btn.disabled = false; btn.textContent = "Agregar dirección"; return bad((j && j.error) || "No se pudo guardar."); }
      addrs = j.addresses || []; refreshAll(); renderList(addrs);
    }).catch(function () { btn.disabled = false; btn.textContent = "Agregar dirección"; bad("Sin conexión con el servidor."); });
  }

  function pickAddr(id) {
    authFetch("address-default.php", { method: "POST", body: JSON.stringify({ id: id }) }).then(function (j) {
      if (!j || !j.ok) return;
      addrs = j.addresses || []; refreshAll(); close();
    }).catch(function () { });
  }

  function onBodyClick(e) {
    if (e.target.closest("#ab-newbtn")) { renderForm(); return; }
    if (e.target.closest("#ab-savebtn")) { saveAddr(); return; }
    if (e.target.closest("#ab-backbtn")) { renderList(addrs); return; }
    var a = e.target.closest("[data-addr]"); if (a) { pickAddr(+a.dataset.addr); return; }
  }

  /* ── Arranque ── */
  function init() {
    chips = [].slice.call(document.querySelectorAll(".tb-loc"));
    var inline = document.querySelector("[data-ab-list]");
    if (!chips.length && !inline) return;    // nada que enganchar en esta página
    injectCSS();
    chips.forEach(function (chip) {
      chip.addEventListener("click", function (e) { e.preventDefault(); open(); });
    });
    // Botón "Gestionar/Agregar" de la lista inline (perfil).
    document.addEventListener("click", function (e) { if (e.target.closest("[data-ab-open]")) { e.preventDefault(); open(); } });
    refreshAll();  // genérico primero
    // Si hay sesión, trae la predeterminada para pintar el chip / lista en TODAS las páginas.
    if (token()) {
      authFetch("addresses.php").then(function (j) {
        if (j && j.ok) { addrs = j.addresses || []; if (j.states && j.states.length) STATES = j.states; refreshAll(); }
      }).catch(function () { });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
