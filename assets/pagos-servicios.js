/* ============================================================
   OK.station — Apartado "Pago de servicios".
   Abre un modal (sobre la misma página, NO una pestaña nueva) con el catálogo
   de servicios que se pagan en mostrador, agrupados y con buscador.
   Autocontenido: inyecta su propio CSS y su markup. Solo necesita un disparador
   con el atributo [data-open-pagos] en la página (p. ej. el "Más información"
   de la tarjeta de Pago de servicios).
   ============================================================ */
(function () {
  "use strict";

  /* Catálogo agrupado. Editar aquí para agregar/quitar servicios. */
  var GROUPS = [
    { t: "Agua y drenaje", items: [
      "Agua CDMX (SACMEX)", "Agua Celaya (JUMAPA)", "Agua Colima (CIAPACOV)", "Agua Irapuato (JAPAMI)",
      "Agua Puebla", "Agua Querétaro (CEA)", "Agua Salamanca (CMAPAS)", "Agua Torreón (SIMAS)", "Aguakan",
      "Agua Durango (AMD)", "Agua y Drenaje Monterrey", "CAPAMA Acapulco", "Agua Ensenada (CESPE)",
      "Agua Tijuana (CESPT)", "Agua Yucatán (JAPAY)", "Agua Juárez (JMAS)", "Agua Mazatlán (JUMAPAM)",
      "SEAPAL Vallarta", "SIDEAPA", "SMAPAP"
    ] },
    { t: "Luz y gas", items: [
      "CFE", "Gas Natural Fenosa", "Cía. Mexicana de Gas", "Ecogas", "Z Gas"
    ] },
    { t: "Teléfono, internet y TV", items: [
      "AT&T", "Axtel", "Blue Telecom", "Dish", "HughesNet", "izzi / Wizz", "Megacable", "Movistar",
      "MVS Hub", "NetTV", "Sky", "Star Go", "StarTV", "Telmex", "Telnor", "Totalplay", "Televía"
    ] },
    { t: "Gobierno y tesorerías", items: [
      "Tesorería CDMX", "Tesorería Edo. de México", "Gobierno de Guanajuato", "Gobierno de Jalisco",
      "Gobierno de Tlaxcala", "Tesorería Hidalgo", "Tesorería Michoacán", "Tesorería Tabasco",
      "Tesorería Celaya", "Municipio de Naucalpan", "Gobierno de Coahuila", "Infonavit"
    ] },
    { t: "Casetas y movilidad", items: [
      "IAVE / PASE Urbano", "MueveCiudad"
    ] },
    { t: "Ventas por catálogo", items: [
      "Arabela", "Avon", "Belcorp", "Betterware", "Fuller", "Herbalife", "Ilusión", "Jafra", "L'Bel",
      "Natura", "Oriflame", "Stanhome", "SwissJust", "Tupperware", "Yanbal", "Yves Rocher", "Zermat"
    ] },
    { t: "Otros", items: [
      "Calzado Andrea", "Casas ARA", "PayCash"
    ] }
  ];

  var WA = "https://wa.me/526647194117?text=" +
    encodeURIComponent("Hola, quiero pagar un servicio en OK.station. ¿Pueden ayudarme?");

  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  /* Búsqueda sin acentos ni mayúsculas: "queretaro" encuentra "Querétaro". */
  function norm(s) { return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }

  var CSS =
    ".pagos-modal-open{overflow:hidden}" +
    ".pagos-modal{position:fixed;inset:0;z-index:1200;display:flex;align-items:center;justify-content:center;padding:16px}" +
    ".pagos-modal[hidden]{display:none}" +
    ".pagos-modal__overlay{position:absolute;inset:0;background:rgba(10,31,77,.55);-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px)}" +
    ".pagos-modal__box{position:relative;z-index:1;width:100%;max-width:640px;max-height:86vh;overflow-y:auto;background:#fff;border-radius:16px;padding:clamp(20px,4vw,30px);box-shadow:0 24px 60px rgba(10,31,77,.28);animation:pagosIn .22s ease-out}" +
    "@keyframes pagosIn{from{opacity:0;transform:translateY(12px) scale(.98)}to{opacity:1;transform:none}}" +
    ".pagos-modal__close{position:absolute;top:10px;right:14px;width:34px;height:34px;background:none;border:none;font-size:1.7rem;line-height:1;color:#94a3b8;cursor:pointer;border-radius:8px}" +
    ".pagos-modal__close:hover{background:#f1f5f9;color:#334155}" +
    ".pagos-modal__title{font-size:1.3rem;font-weight:800;margin:0 30px 4px 0;color:#0f172a;letter-spacing:-.02em}" +
    ".pagos-modal__sub{color:#64748b;font-size:.9rem;margin:0 0 14px}" +
    ".pagos-modal__search{width:100%;padding:11px 14px;border:1.5px solid #e2e8f0;border-radius:10px;font:inherit;font-size:.92rem;margin-bottom:16px;box-sizing:border-box}" +
    ".pagos-modal__search:focus{outline:none;border-color:#066CFF;box-shadow:0 0 0 3px rgba(6,108,255,.12)}" +
    ".pagos-group{margin-bottom:16px}" +
    ".pagos-group h4{font-size:.76rem;text-transform:uppercase;letter-spacing:.05em;color:#066CFF;margin:0 0 8px;font-weight:700}" +
    ".pagos-chips{display:flex;flex-wrap:wrap;gap:7px}" +
    ".pagos-chip{display:inline-block;padding:5px 11px;background:#F2F4F8;border:1px solid #e2e8f0;border-radius:999px;font-size:.82rem;color:#1e293b}" +
    ".pagos-empty{color:#64748b;font-size:.9rem;text-align:center;padding:24px 0}" +
    ".pagos-modal__cta{display:block;text-align:center;margin-top:6px;padding:12px;background:#066CFF;color:#fff;border-radius:10px;font-weight:600;text-decoration:none}" +
    ".pagos-modal__cta:hover{background:#0558d6}";

  var modal = null, bodyEl = null, searchEl = null;

  function injectStyle() {
    if (document.getElementById("pagos-modal-style")) return;
    var st = document.createElement("style");
    st.id = "pagos-modal-style";
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function build() {
    if (modal) return;
    var total = GROUPS.reduce(function (n, g) { return n + g.items.length; }, 0);
    modal = document.createElement("div");
    modal.className = "pagos-modal";
    modal.id = "pagos-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "pagos-modal-title");
    modal.hidden = true;
    modal.innerHTML =
      '<div class="pagos-modal__overlay" data-pagos-close></div>' +
      '<div class="pagos-modal__box" role="document">' +
        '<button type="button" class="pagos-modal__close" data-pagos-close aria-label="Cerrar">&times;</button>' +
        '<h3 class="pagos-modal__title" id="pagos-modal-title">Servicios que pagamos por ti</h3>' +
        '<p class="pagos-modal__sub">Más de ' + total + ' servicios, al instante y sin filas. Escribe para encontrar el tuyo:</p>' +
        '<input type="search" class="pagos-modal__search" id="pagos-search" placeholder="Busca tu servicio (CFE, Telmex, agua…)" aria-label="Buscar servicio" autocomplete="off">' +
        '<div class="pagos-modal__body" id="pagos-body"></div>' +
        '<a class="pagos-modal__cta" href="' + WA + '" target="_blank" rel="noopener">¿No ves tu servicio? Escríbenos por WhatsApp</a>' +
      '</div>';
    document.body.appendChild(modal);
    bodyEl = modal.querySelector("#pagos-body");
    searchEl = modal.querySelector("#pagos-search");
    searchEl.addEventListener("input", function () { render(searchEl.value); });
    Array.prototype.forEach.call(modal.querySelectorAll("[data-pagos-close]"), function (b) {
      b.addEventListener("click", close);
    });
    render("");
  }

  function render(filter) {
    var f = norm(filter || "");
    var html = "";
    GROUPS.forEach(function (g) {
      var items = g.items.filter(function (x) { return !f || norm(x).indexOf(f) >= 0; });
      if (!items.length) return;
      html += '<div class="pagos-group"><h4>' + esc(g.t) + '</h4><div class="pagos-chips">' +
        items.map(function (x) { return '<span class="pagos-chip">' + esc(x) + '</span>'; }).join("") +
        '</div></div>';
    });
    bodyEl.innerHTML = html || '<p class="pagos-empty">No encontramos ese servicio. Escríbenos y lo verificamos por ti.</p>';
  }

  function open(e) {
    if (e) e.preventDefault();
    injectStyle();
    build();
    modal.hidden = false;
    document.body.classList.add("pagos-modal-open");
    setTimeout(function () { try { searchEl.focus(); } catch (_) {} }, 40);
  }
  function close() {
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove("pagos-modal-open");
    if (searchEl) searchEl.value = "";
    render("");
  }

  /* Delegación: cualquier elemento con [data-open-pagos] abre el apartado. */
  document.addEventListener("click", function (e) {
    var t = e.target.closest ? e.target.closest("[data-open-pagos]") : null;
    if (t) open(e);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && modal && !modal.hidden) close();
  });
})();
