/* ============================================================
   Ok.station — Aplicación Principal v2.0
   Arquitecto: Equipo Técnico Senior

   MÓDULOS:
   01. Utilidades & Configuración
   02. Header: scroll, nav activa, menú móvil
   03. Reveal on Scroll (IntersectionObserver)
   04. FAQ Accordion
   05. Wizard de Citas
   06. Sistema de Fotos (Upload)
   07. Botón Scroll-to-Top
   08. Toast Notifications
   09. Inicialización
   ============================================================ */

(function () {
  "use strict";

  /* ============================================================
     01. UTILIDADES & CONFIGURACIÓN
     ============================================================ */
  var CONFIG = {
    whatsapp: "526647194117",
    maxFileSizeMB: 25,
    maxFiles: 30,
    /* Formatos permitidos (seguridad): solo estos. Se valida MIME + extensión. */
    allowedTypes: ["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"],
    allowedExts: ["jpg", "jpeg", "png", "webp", "pdf"],
    prices: {
      "6x4": 10,
      "10x15": 10,
      "13x18": 30,
      "20x30": 75,
      "30x40": 120
    }
  };

  /* Selector seguro */
  function qs(sel, ctx) {
    return (ctx || document).querySelector(sel);
  }

  function qsa(sel, ctx) {
    return Array.from((ctx || document).querySelectorAll(sel));
  }

  /* ── Filtros de captura ────────────────────────────────────────
     Nombres: solo letras (con acentos), espacios y ' . -
     Números: solo dígitos. Limpian el <input> conservando el cursor. */
  var NAME_ALLOW_RE  = /[^A-Za-zÀ-ÖØ-öø-ÿ\s'.\-]/g;
  var DIGITS_ONLY_RE = /\D/g;
  function cleanFieldValue(el, re, max) {
    if (!el) return;
    var before = el.value;
    var clean = before.replace(re, "");
    if (max != null) clean = clean.slice(0, max);
    if (clean === before) return;
    var pos = el.selectionStart, removed = before.length - clean.length;
    el.value = clean;
    try {
      var p = Math.max(0, (pos == null ? clean.length : pos) - removed);
      el.setSelectionRange(p, p);
    } catch (e) { /* type=date u otros no soportan selección: sin problema */ }
  }
  /* Instala un filtro de entrada sobre un <input> suelto (paso "Tus datos"). */
  function attachFieldFilter(el, re, max) {
    if (!el) return;
    el.addEventListener("input", function () { cleanFieldValue(el, re, max); });
  }

  /* Construir link de WhatsApp con mensaje codificado */
  function waLink(text) {
    return "https://wa.me/" + CONFIG.whatsapp + "?text=" + encodeURIComponent(text);
  }

  /* Sanitizar texto para prevenir XSS al insertar en DOM */
  function sanitize(str) {
    var el = document.createElement("div");
    el.textContent = String(str || "");
    return el.innerHTML;
  }

  /* Formatear fecha ISO a texto en español */
  function formatDate(iso) {
    if (!iso) return "—";
    var p = iso.split("-");
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    var dias = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
    var meses = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
    return dias[d.getDay()] + " " + d.getDate() + " de " + meses[d.getMonth()] + " de " + d.getFullYear();
  }

  /* Formatear precio en MXN */
  function formatMXN(amount) {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  }

  /* Debounce */
  function debounce(fn, delay) {
    var timer;
    return function () {
      clearTimeout(timer);
      var args = arguments;
      var ctx = this;
      timer = setTimeout(function () { fn.apply(ctx, args); }, delay);
    };
  }


  /* ============================================================
     02. HEADER: SCROLL, NAV ACTIVA, MENÚ MÓVIL
     ============================================================ */
  function initHeader() {
    var header = qs(".site-header");
    if (!header) return;

    /* ── Clase scrolled ── */
    function updateScrolled() {
      header.classList.toggle("is-scrolled", window.scrollY > 16);
    }
    window.addEventListener("scroll", updateScrolled, { passive: true });
    updateScrolled();

    /* ── Menú móvil ── */
    var toggle = qs(".nav__toggle");
    var navLinks = qs(".nav__links");
    var overlay;

    if (toggle && navLinks) {
      /* Crear overlay */
      overlay = document.createElement("div");
      overlay.className = "nav-overlay";
      overlay.setAttribute("aria-hidden", "true");
      overlay.style.cssText =
        "position:fixed;inset:0;z-index:98;background:rgba(0,0,0,0.45);" +
        "opacity:0;pointer-events:none;transition:opacity 0.22s ease;" +
        "backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);";
      document.body.insertBefore(overlay, document.body.firstChild);

      function openMenu() {
        navLinks.classList.add("is-open");
        toggle.setAttribute("aria-expanded", "true");
        overlay.style.opacity = "1";
        overlay.style.pointerEvents = "auto";
        document.body.style.overflow = "hidden";
        /* Foco al primer link */
        var firstLink = qs("a, button", navLinks);
        if (firstLink) firstLink.focus();
      }

      function closeMenu() {
        navLinks.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
        overlay.style.opacity = "0";
        overlay.style.pointerEvents = "none";
        document.body.style.overflow = "";
        toggle.focus();
      }

      toggle.addEventListener("click", function () {
        var isOpen = navLinks.classList.contains("is-open");
        if (isOpen) closeMenu();
        else openMenu();
      });

      /* Cerrar al hacer clic en overlay */
      overlay.addEventListener("click", closeMenu);

      /* Cerrar al presionar Escape */
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && navLinks.classList.contains("is-open")) {
          closeMenu();
        }
      });

      /* Cerrar al hacer clic en link */
      qsa(".nav__link", navLinks).forEach(function (link) {
        link.addEventListener("click", closeMenu);
      });

      /* Trampa de foco en el menú abierto */
      navLinks.addEventListener("keydown", function (e) {
        if (e.key !== "Tab" || !navLinks.classList.contains("is-open")) return;
        var focusable = qsa("a, button", navLinks).filter(function (el) {
          return !el.disabled && el.tabIndex !== -1;
        });
        if (!focusable.length) return;
        var first = focusable[0];
        var last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      });
    }

    /* ── Nav activa con IntersectionObserver ── */
    var sections = qsa("section[id], div[id]").filter(function (el) {
      return qs(".nav__link[href='#" + el.id + "']");
    });

    if (sections.length && "IntersectionObserver" in window) {
      var activeSection = null;

      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            activeSection = entry.target.id;
            qsa(".nav__link").forEach(function (link) {
              var href = link.getAttribute("href");
              link.classList.toggle("is-active", href === "#" + activeSection);
            });
          }
        });
      }, {
        rootMargin: "-20% 0px -70% 0px",
        threshold: 0
      });

      sections.forEach(function (sec) { io.observe(sec); });
    }
  }


  /* ============================================================
     03. REVEAL ON SCROLL (IntersectionObserver)
     ============================================================ */
  function initReveal() {
    var elements = qsa(".reveal");
    if (!elements.length) return;

    /* Fallback seguro: mostrar todo si no hay soporte */
    if (!("IntersectionObserver" in window)) {
      elements.forEach(function (el) { el.classList.add("is-visible"); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      });
    }, {
      rootMargin: "0px 0px -60px 0px",
      threshold: 0.08
    });

    elements.forEach(function (el) { io.observe(el); });

    /* Red de seguridad: todo visible después de 1.6s */
    setTimeout(function () {
      elements.forEach(function (el) { el.classList.add("is-visible"); });
    }, 1600);
  }


  /* ============================================================
     04. FAQ ACCORDION
     ============================================================ */
  function initFAQ() {
    var items = qsa(".faq-item");
    if (!items.length) return;

    items.forEach(function (item) {
      var btn = qs(".faq-question", item);
      var answer = qs(".faq-answer", item);
      if (!btn || !answer) return;

      /* Atributos ARIA iniciales */
      var answerId = "faq-ans-" + Math.random().toString(36).slice(2, 8);
      answer.id = answerId;
      btn.setAttribute("aria-controls", answerId);
      btn.setAttribute("aria-expanded", "false");

      btn.addEventListener("click", function () {
        var isOpen = item.classList.contains("is-open");

        /* Cerrar todos (comportamiento accordion) */
        items.forEach(function (other) {
          if (other !== item && other.classList.contains("is-open")) {
            other.classList.remove("is-open");
            var otherBtn = qs(".faq-question", other);
            if (otherBtn) otherBtn.setAttribute("aria-expanded", "false");
          }
        });

        /* Toggle del actual */
        item.classList.toggle("is-open", !isOpen);
        btn.setAttribute("aria-expanded", String(!isOpen));

        /* Scroll suave si se abre y está fuera de pantalla */
        if (!isOpen) {
          setTimeout(function () {
            var rect = item.getBoundingClientRect();
            var headerH = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--header-height")) || 76;
            if (rect.top < headerH + 20) {
              window.scrollBy({ top: rect.top - headerH - 20, behavior: "smooth" });
            }
          }, 50);
        }
      });
    });
  }


  /* ============================================================
     05. WIZARD DE CITAS
     ============================================================ */
  function initCitas() {
    var section = qs("#citas");
    if (!section) return;

    /**
     * Catálogo tipado de servicios (única fuente de verdad).
     * @typedef {Object} Service
     * @property {string} id            Slug estable (coincide con el backend).
     * @property {string} name          Nombre visible.
     * @property {"main"|"additional"} category  Principal (tarjeta) o adicional (panel).
     * @property {string} desc          Descripción corta.
     * @type {Service[]}
     */
    var SERVICES = [
      { id: "pasaporte", name: "Pasaporte",              category: "main",       desc: "SRE / pasaporte mexicano o americano" },
      { id: "visa",      name: "Visa Americana",         category: "main",       desc: "DS-160, CAS y consulado" },
      { id: "sentri",    name: "SENTRI / Global Entry",  category: "main",       desc: "Cruce rápido fronterizo" },
      { id: "i94",       name: "I-94 / Permiso de Viaje", category: "main",      desc: "CBP / permiso de internación" },
      { id: "curp",      name: "CURP / Acta",            category: "additional", desc: "Impresión y trámite de CURP o actas" },
      { id: "ine",       name: "INE / Credencial",       category: "additional", desc: "Apoyo con tu credencial para votar" },
      { id: "licencia",  name: "Licencia de Conducir",   category: "additional", desc: "Gestión de licencia estatal" },
      { id: "apostille", name: "Apostille / Traducción", category: "additional", desc: "Apostillado y traducción de documentos" },
      { id: "medica",    name: "Cita Médica / Examen",   category: "additional", desc: "Examen médico para tu trámite" }
    ];
    /** @param {string} id @returns {Service|null} */
    function serviceById(id) { for (var i = 0; i < SERVICES.length; i++) if (SERVICES[i].id === id) return SERVICES[i]; return null; }
    var SUBTYPE_LABEL = { mexicano: "Mexicano", americano: "Americano" };

    /* Estado global del wizard (persistente entre pasos) */
    var state = {
      step: 0,
      tramite: null, tramiteLabel: "",   /* servicio único elegido (cualquiera de los 9) */
      subtype: "",                 /* solo pasaporte: "mexicano" | "americano" */
      partySize: 1, partyLabel: "Solo yo",
      fecha: "", hora: "",
      nombre: "", tel: "", notas: "",
      guests: [], activeGuest: 0,   /* datos por persona (requisitos): [{name,dob,doctype}] */
      /* Contacto principal reutilizando una persona registrada:
         contactChoice "" (sin elegir) | "si" | "no"; contactGuest = índice en state.guests. */
      contactChoice: "", contactGuest: null
    };

    var TOTAL_STEPS = 6;           /* Servicio → Cantidad → Información de cada persona →
                                      Fecha → Datos de contacto → Confirmación.
                                      El cuestionario y los documentos de cada persona se piden
                                      en el paso "Información de cada persona" (índice 2). */

    /* Referencias DOM */
    var stepsEl   = qsa(".step-item");
    var stepPanels = qsa(".cita-step");
    var dateInput = qs("#cita-fecha");
    var nameInput = qs("#cita-nombre");
    var telInput  = qs("#cita-tel");
    var correoInput = qs("#cita-correo");
    var notesInput = qs("#cita-notas");
    var summaryEl = qs("#cita-resumen");

    if (!stepPanels.length) return;

    /* Precio visible en cada tarjeta de trámite (paso 1). El cliente pocas veces
       veía el precio antes de confirmar; ahora lo mostramos desde la selección.
       Se corre en un timeout porque OKCitaPrice se define en cita-ticket.js, que
       carga DESPUÉS de app.js (ambos defer → init corre antes de ese script). */
    function tramitePriceLabel(tramite) {
      var p = window.OKCitaPrice ? window.OKCitaPrice(tramite, null, 1) : null;
      if (!p || p.quote) return "Precio a cotizar";
      return (tramite === "pasaporte" ? "Desde " : "") + (window.OKMxn0 ? window.OKMxn0(p.unit) : ("$" + p.unit));
    }
    function initTramitePrices(tries) {
      /* Si cita-ticket.js (defer) aún no definió OKCitaPrice, reintenta enseguida
         para que el precio aparezca de inmediato y NO se quede en "Precio a cotizar"
         por lentitud de carga. Además se re-ejecuta cuando llegan los precios del
         servidor (window.OKRenderTramitePrices, llamado desde cita-ticket.js). */
      tries = tries || 0;
      if (!window.OKCitaPrice) { if (tries < 40) setTimeout(function () { initTramitePrices(tries + 1); }, 60); return; }
      qsa(".tramite-btn", section).forEach(function (btn) {
        var t = btn.getAttribute("data-tramite");
        if (!t) return;
        var el = btn.querySelector(".tramite-btn__price");
        if (!el) {
          el = document.createElement("span");
          el.className = "tramite-btn__price";
          var anchor = btn.querySelector(".tramite-btn__meta") || btn.querySelector(".tramite-btn__title");
          if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(el, anchor.nextSibling);
          else btn.appendChild(el);
        }
        var quote = !(window.OKCitaPrice && !window.OKCitaPrice(t, null, 1).quote);
        el.classList.toggle("tramite-btn__price--quote", quote);
        el.textContent = tramitePriceLabel(t);
      });
    }
    /* Hook para que cita-ticket.js re-pinte los precios en cuanto tenga su catálogo
       (defaults al cargar y, luego, los precios vigentes del servidor). */
    window.OKRenderTramitePrices = initTramitePrices;
    setTimeout(initTramitePrices, 0);

    /* Renderizar indicadores de pasos */
    function renderSteps() {
      stepsEl.forEach(function (el, i) {
        el.classList.toggle("is-active", i === state.step);
        el.classList.toggle("is-done", i < state.step);
      });

      stepPanels.forEach(function (panel, i) {
        var isActive = i === state.step;
        panel.classList.toggle("is-active", isActive);
        panel.setAttribute("aria-hidden", String(!isActive));
        /* Número de paso para la cabecera "PASO N DE 6" (el CSS lo lee de
           data-paso; el contador CSS fallaba con los pasos en display:none). */
        var stepTitle = panel.querySelector(".cita-step__title");
        if (stepTitle) stepTitle.setAttribute("data-paso", i + 1);
      });
    }

    /* Ir a paso N */
    function goToStep(n) {
      var next = Math.max(0, Math.min(TOTAL_STEPS - 1, n));

      /* Completar datos desde inputs */
      if (nameInput) state.nombre = nameInput.value.trim();
      if (telInput)  state.tel    = (window.OKPhone ? window.OKPhone.full(telInput) : telInput.value.trim());
      if (correoInput) state.correo = correoInput.value.trim();
      if (notesInput) state.notas  = notesInput.value.trim();

      state.step = next;

      if (next === TOTAL_STEPS - 1) buildSummary();
      /* Al entrar al paso "Información de cada persona" (índice 2) se generan los
         formularios y documentos por persona según la cantidad y el trámite. */
      if (next === 2) renderGuests();
      /* Al entrar al paso Fecha (índice 3) el calendario debe reflejar la cantidad
         de personas ya elegida. */
      if (next === 3 && calGrid) { renderCalendar(); updateCalNav(); }
      /* Al entrar al paso "Tus datos" (índice 4): si el contacto es una de las
         personas de la cita, se autollena (1) o se ofrece elegir (varias). */
      if (next === 4) renderQuienContacto();

      renderSteps();

      /* Mover foco al título del nuevo paso */
      var panel = stepPanels[next];
      if (panel) {
        var heading = qs("h4, h3", panel);
        if (heading) {
          heading.setAttribute("tabindex", "-1");
          heading.focus({ preventScroll: true });   /* sin salto por el foco */
          setTimeout(function () { heading.removeAttribute("tabindex"); }, 500);
        }
      }

      /* Llevar el wizard a la vista SOLO si quedó fuera de pantalla. Antes hacía
         scroll en CADA paso (la pantalla "saltaba" arriba/abajo); ahora, si el
         wizard ya está visible, no se mueve nada. */
      var rect = section.getBoundingClientRect();
      var headerH = 90;
      if (rect.top < headerH - 4 || rect.top > window.innerHeight * 0.6) {
        window.scrollTo({ top: rect.top + window.scrollY - headerH, behavior: "smooth" });
      }
    }

    /* ── Paso 1: selección de servicio (principal + adicionales) ── */
    function updateStep0Next() {
      var nextBtn = qs("#cita-next-0");
      if (!nextBtn) return;
      /* Continuar habilitado si hay principal y, si es pasaporte, además su subtipo. */
      var ok = !!state.tramite && (state.tramite !== "pasaporte" || !!state.subtype);
      nextBtn.disabled = !ok;
      nextBtn.setAttribute("aria-disabled", String(!ok));
    }

    /* Selección ÚNICA entre los 9 servicios (tarjetas principales + panel "Más servicios").
       Todos son independientes: elegir uno deselecciona cualquier otro. */
    function selectService(id, el) {
      /* Resalta por ID (no por elemento) para que TODAS las copias del carrusel
         infinito —original y clones— queden marcadas igual. */
      qsa(".tramite-btn, .extra-card").forEach(function (b) {
        var active = (b.dataset.tramite === id) || (b.dataset.service === id);
        b.classList.toggle("is-selected", active);
        b.setAttribute("aria-pressed", String(active));
      });
      state.tramite = id;
      var svc = serviceById(id);
      state.tramiteLabel = svc ? svc.name : id;
      if (id !== "pasaporte") state.subtype = "";  /* el subtipo solo aplica a pasaporte */
      renderSelectedExtra();
      updateStep0Next();
    }

    /* Tras elegir un trámite, guiar al usuario al siguiente paso: llevar el botón
       "Continuar" (y los requisitos) a la vista, con desplazamiento suave. */
    function scrollToStep0Next() {
      setTimeout(function () {
        var t = qs("#cita-next-0");
        if (t && t.scrollIntoView) t.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 130);
    }

    /* DELEGACIÓN de eventos: un solo listener en la sección capta el clic en
       cualquier .tramite-btn, INCLUIDAS las tarjetas clonadas del carrusel
       infinito (los clones no heredan listeners por-elemento). */
    section.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest(".tramite-btn") : null;
      if (!btn || !section.contains(btn)) return;
      var id = btn.dataset.tramite;
      if (!id) return;
      selectService(id, btn);
      if (id === "pasaporte") { openSubtypeModal(); return; }   /* caso especial: subtipo obligatorio */
      scrollToStep0Next();
    });

    /* ── Caso especial Pasaporte: modal de subtipo (mexicano/americano) ── */
    var subtypeModal = qs("#cita-subtype-modal");
    function subtypeEsc(e) { if (e.key === "Escape") closeSubtypeModal(); }
    function openSubtypeModal() {
      if (!subtypeModal) return;                 /* sin modal en el DOM no bloquea el flujo */
      subtypeModal.hidden = false;
      subtypeModal.classList.add("is-open");
      qsa("input[name='cita-subtype']", subtypeModal).forEach(function (r) { r.checked = (r.value === state.subtype); });
      var confirmB = qs("#cita-subtype-confirm", subtypeModal);
      if (confirmB) { confirmB.disabled = !state.subtype; confirmB.setAttribute("aria-disabled", String(!state.subtype)); }
      var firstRadio = qs("input[name='cita-subtype']", subtypeModal);
      if (firstRadio) firstRadio.focus();
      document.addEventListener("keydown", subtypeEsc);
    }
    function closeSubtypeModal() {
      if (!subtypeModal) return;
      subtypeModal.classList.remove("is-open");
      subtypeModal.hidden = true;
      document.removeEventListener("keydown", subtypeEsc);
    }
    if (subtypeModal) {
      var subtypeConfirm = qs("#cita-subtype-confirm", subtypeModal);
      qsa("input[name='cita-subtype']", subtypeModal).forEach(function (r) {
        r.addEventListener("change", function () {
          if (subtypeConfirm) { subtypeConfirm.disabled = false; subtypeConfirm.removeAttribute("aria-disabled"); }
        });
      });
      if (subtypeConfirm) subtypeConfirm.addEventListener("click", function () {
        var chosen = qs("input[name='cita-subtype']:checked", subtypeModal);
        if (!chosen) return;
        state.subtype = chosen.value;
        closeSubtypeModal();
        updateStep0Next();
        scrollToStep0Next();
      });
      qsa("[data-subtype-close]", subtypeModal).forEach(function (el) { el.addEventListener("click", closeSubtypeModal); });
    }

    /* ── Botón "Más servicios" → panel lateral (drawer) con servicios adicionales ── */
    var moreBtn = qs("#cita-more-btn");
    var drawer  = qs("#cita-drawer");
    /* Si el servicio elegido vino del panel "Más servicios", lo mostramos como chip
       en el paso 1 (porque ninguna tarjeta principal queda resaltada). */
    function renderSelectedExtra() {
      var host = qs("#cita-extra-selected");
      if (!host) return;
      var svc = state.tramite ? serviceById(state.tramite) : null;
      if (svc && svc.category === "additional") {
        host.hidden = false;
        host.innerHTML = '<span class="cita-extra__label">Seleccionado:</span> <span class="cita-extra__chip">' + sanitize(svc.name) + '</span>';
      } else {
        host.innerHTML = ""; host.hidden = true;
      }
    }
    function drawerEsc(e) { if (e.key === "Escape") closeDrawer(); }
    function openDrawer() {
      if (!drawer) return;
      drawer.hidden = false;
      drawer.classList.add("is-open");
      if (moreBtn) moreBtn.setAttribute("aria-expanded", "true");
      document.addEventListener("keydown", drawerEsc);
      var firstFocus = qs(".cita-drawer__close", drawer);
      if (firstFocus) firstFocus.focus();
    }
    function closeDrawer() {
      if (!drawer) return;
      drawer.classList.remove("is-open");
      drawer.hidden = true;
      if (moreBtn) { moreBtn.setAttribute("aria-expanded", "false"); moreBtn.focus(); }
      document.removeEventListener("keydown", drawerEsc);
    }
    if (moreBtn && drawer) {
      moreBtn.setAttribute("aria-expanded", "false");
      moreBtn.addEventListener("click", openDrawer);
      qsa(".cita-drawer__close, .cita-drawer__overlay, .cita-drawer__done", drawer).forEach(function (el) { el.addEventListener("click", closeDrawer); });
      qsa(".extra-card", drawer).forEach(function (card) {
        card.addEventListener("click", function () {
          selectService(card.dataset.service, card);  /* selección única */
          closeDrawer();
        });
      });
    }

    /* ── Paso Cantidad de personas ── */
    var partyValEl = qs("#party-val");
    var partyDurEl = qs("#party-duration");
    var MIN_PER_PERSON = 45;                       /* cada persona toma ~45 min */
    function partyPreset(n) {
      if (n <= 1) return "Solo yo";
      if (n === 2) return "Pareja";
      if (n >= 3 && n <= 5) return "Familia";
      return "Grupo";
    }
    function durationMins(n) { return n * MIN_PER_PERSON; }
    function fmtDuration(mins) {
      var h = Math.floor(mins / 60), m = mins % 60;
      if (h && m) return h + " h " + m + " min";
      if (h) return h + " h";
      return m + " min";
    }
    function setParty(n) {
      n = Math.max(1, Math.min(50, n | 0));
      state.partySize = n;
      state.partyLabel = partyPreset(n);
      if (partyValEl) partyValEl.textContent = String(n);
      if (partyDurEl) partyDurEl.innerHTML = "Duración estimada de tu cita: <b>" + sanitize(fmtDuration(durationMins(n))) + "</b> (≈ 45 min por persona).";
      qsa(".party-opt").forEach(function (b) {
        var on = String(b.dataset.party) === String(n) ||
                 (b.dataset.party === "grupo" && n > 5) ||
                 (b.dataset.party === "4" && n >= 3 && n <= 5);
        b.classList.toggle("is-selected", on);
        b.setAttribute("aria-pressed", String(on));
      });
      /* Cambiar la cantidad cambia la duración → re-evaluar qué días/horas caben.
         (calGrid/loadSlots/resetSlots se definen más abajo pero ya existen cuando el
         usuario interactúa con este paso.) */
      if (calGrid) {
        state.hora = "";
        renderCalendar();
        if (state.fecha) loadSlots(state.fecha); else resetSlots();
      }
    }
    qsa(".party-opt").forEach(function (b) {
      b.addEventListener("click", function () {
        var v = b.dataset.party;
        setParty(v === "grupo" ? 6 : parseInt(v, 10) || 1);
      });
    });
    var partyMinus = qs("#party-minus"), partyPlus = qs("#party-plus");
    if (partyMinus) partyMinus.addEventListener("click", function () { setParty(state.partySize - 1); });
    if (partyPlus)  partyPlus.addEventListener("click", function () { setParty(state.partySize + 1); });

    /* ──────────────────────────────────────────────────────────
       Paso fecha/hora — Calendario con disponibilidad REAL del servidor.
       El horario semanal, los días bloqueados y la ventana de anticipación
       vienen de /appointments/availability.php (sin ?date); los horarios
       libres de cada día se piden con ?date=YYYY-MM-DD. El servidor es la
       única fuente de verdad: no se puede reservar un día/hora cerrado.
       ────────────────────────────────────────────────────────── */
    var calGrid   = qs("#cita-cal-grid");
    var calTitle  = qs("#cita-cal-title");
    var calPrev   = qs("[data-cal-prev]");
    var calNext   = qs("[data-cal-next]");
    var slotsEl   = qs(".time-grid");
    var MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

    var today0  = new Date(); today0.setHours(0,0,0,0);
    var minDate = new Date(today0); minDate.setDate(minDate.getDate() + 1); /* desde mañana */
    var calView = new Date(minDate.getFullYear(), minDate.getMonth(), 1);

    /* Disponibilidad REAL del servidor. */
    var API = "/backend/api";
    function authToken() { try { return localStorage.getItem("okstation.token"); } catch (e) { return null; } }
    var availCfg = { weekly: {}, blackout: [], maxAdvance: 60 };
    var maxDate = new Date(today0); maxDate.setDate(maxDate.getDate() + availCfg.maxAdvance);
    var occByDate = {}; /* nivel de ocupación por fecha: "full" | "mid" | "none" */

    /* ¿La fecha es un día atendido (según horario semanal y días bloqueados)? */
    function dayIsOpen(date) {
      if (date.getDay() === 6) return false;                        /* sábados: sin citas (solo pedidos) */
      var hrs = availCfg.weekly[String(date.getDay())];
      if (!hrs || !hrs.length) return false;                        /* día sin horario */
      if (availCfg.blackout.indexOf(isoOf(date)) >= 0) return false; /* día bloqueado */
      return true;
    }

    function isoOf(date) {
      var m = String(date.getMonth() + 1).padStart(2, "0");
      var d = String(date.getDate()).padStart(2, "0");
      return date.getFullYear() + "-" + m + "-" + d;
    }

    /* ── Duración de la cita ↔ horas del día ──────────────────────────────
       Cada persona toma ~45 min y los slots del horario son de 60 min: una cita
       de N personas necesita slotsNeeded(N) horas CONSECUTIVAS (igual que el
       backend Availability::slotsNeeded). Esto deja contrastar las horas que pide
       la cantidad de personas contra las horas que abre cada día. */
    var SLOT_MIN = 60;
    function slotsNeeded(party) {
      return Math.max(1, Math.ceil((Math.max(1, party | 0) * MIN_PER_PERSON) / SLOT_MIN));
    }
    /* Nº de horas que abre una fecha según el horario semanal (0 si cerrada). */
    function openHoursCount(date) {
      if (date.getDay() === 6) return 0;   /* sábados: sin citas */
      var hrs = availCfg.weekly[String(date.getDay())];
      return (hrs && hrs.length) ? hrs.length : 0;
    }

    /* Nivel de disponibilidad "de base" (cosmético y DETERMINISTA por fecha) para que el
       calendario no se vea 100% libre y dé impresión de un negocio con demanda. La ocupación
       REAL del servidor (mid/none) siempre manda; esto solo varía los días que el backend
       reporta como totalmente libres. Mantiene la mayoría de días reservables (no aleatorio,
       estable entre recargas). Ahora también es consciente de la CANTIDAD de personas:
       a más personas, la cita ocupa más horas seguidas → más días se ven ocupados/sin cupo. */
    /* Hash entero con buena avalancha (lowbias32) sobre el día absoluto: días consecutivos
       caen en niveles distintos (un hash de la cadena ISO se agrupaba y dejaba 0 días "none"). */
    function dayHash(date) {
      var x = Math.floor(date.getTime() / 86400000) >>> 0;
      x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
      x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
      x = (x ^ (x >>> 16)) >>> 0;
      return x % 100;
    }
    function baseLevelFor(date) {
      var need = slotsNeeded(state.partySize);
      var open = openHoursCount(date);
      /* Si la cita no cabe ni en un día vacío (pide más horas seguidas de las que abre el día),
         ese día NO sirve para esta cantidad de personas. */
      if (open && need >= open) return "none";
      var diffDays = Math.round((date - today0) / 86400000);
      var h = dayHash(date);
      /* Sesgo por duración: cada hora extra que pide la cita sube la ocupación aparente
         (~14 puntos por slot, tope 42) sin volverse aleatorio entre recargas. */
      var bias = Math.min(42, (need - 1) * 14);
      if (diffDays <= 3) return h < (35 + bias) ? "mid" : "full";  /* días próximos: nunca "sin disponibilidad" */
      if (h < 18 + bias) return "none";                            /* ~18% (más con grupos) sin disponibilidad */
      if (h < 50 + bias) return "mid";                             /* disponibilidad media */
      return "full";                                               /* disponibilidad total */
    }

    function renderSlotsLoading() {
      if (slotsEl) slotsEl.innerHTML = '<p class="time-grid__empty">Cargando horarios…</p>';
    }

    /* Trae del servidor los horarios libres de una fecha y los pinta. */
    function loadSlots(isoDate) {
      if (!slotsEl) return;
      state.hora = "";
      validateStep1();
      renderSlotsLoading();
      fetch(API + "/appointments/availability.php?date=" + encodeURIComponent(isoDate) + "&party=" + encodeURIComponent(state.partySize))
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j || !j.ok) throw new Error("bad");
          if (!j.open || !j.slots.length) {
            slotsEl.innerHTML = '<p class="time-grid__empty">Sin disponibilidad ese día. Elige otra fecha.</p>';
            return;
          }
          slotsEl.innerHTML = j.slots.map(function (s) {
            return '<button type="button" class="time-slot' + (s.available ? "" : " is-disabled") + '" data-time="' + s.time + '"' +
              (s.available ? "" : ' disabled aria-disabled="true"') + ' aria-pressed="false">' + s.time +
              (s.available ? "" : ' <span class="time-slot__full">Lleno</span>') + "</button>";
          }).join("");
          qsa(".time-slot", slotsEl).forEach(function (btn) {
            if (btn.disabled) return;
            btn.addEventListener("click", function () {
              qsa(".time-slot", slotsEl).forEach(function (b) {
                b.classList.remove("is-selected");
                b.setAttribute("aria-pressed", "false");
              });
              btn.classList.add("is-selected");
              btn.setAttribute("aria-pressed", "true");
              state.hora = btn.dataset.time;
              validateStep1();
            });
          });
        })
        .catch(function () {
          slotsEl.innerHTML = '<p class="time-grid__empty">No se pudieron cargar los horarios. Intenta de nuevo.</p>';
        });
    }

    function renderCalendar() {
      if (!calGrid) return;
      var y = calView.getFullYear(), m = calView.getMonth();
      if (calTitle) calTitle.textContent = MESES[m].charAt(0).toUpperCase() + MESES[m].slice(1) + " " + y;

      var first = new Date(y, m, 1);
      var startOffset = (first.getDay() + 6) % 7; /* semana inicia en lunes */
      var daysInMonth = new Date(y, m + 1, 0).getDate();

      var cells = "";
      for (var i = 0; i < startOffset; i++) {
        cells += '<span class="okcal__day is-empty" aria-hidden="true"></span>';
      }
      for (var d = 1; d <= daysInMonth; d++) {
        var date = new Date(y, m, d);
        var iso = isoOf(date);
        var selected = state.fecha === iso;
        /* Nivel LÓGICO: sale de la ocupación REAL del servidor (no de un hash
           cosmético). Sin reservas ese día → "full" (alta disponibilidad); a
           medida que se ocupan horarios, el servidor lo baja a mid/none. Así el
           color del día concuerda con los horarios que se ven al elegirlo. */
        var serverLvl = occByDate[iso];
        var lvl = (serverLvl && serverLvl !== "full") ? serverLvl : "full";
        /* Contraste horas ↔ personas: si la cita (por su duración) no cabe en las horas que
           abre el día, ese día queda "sin disponibilidad" aunque el servidor lo reporte libre. */
        var open = openHoursCount(date);
        if (open && slotsNeeded(state.partySize) >= open) lvl = "none";
        var closed = !dayIsOpen(date) || date < minDate || date > maxDate;   /* cerrado/fuera de ventana */
        var disabled = closed || lvl === "none";                            /* "sin disponibilidad" no es reservable */
        /* Texto/icono además del color para usuarios daltónicos (A1):
           el título describe la disponibilidad y se suma al aria-label. */
        var occText = { full: "disponibilidad total", mid: "disponibilidad media", none: "sin disponibilidad" };
        var availLabel = occText[lvl] || "";
        /* Celda BLANCA con un PUNTO de color bajo el número, según disponibilidad
           (verde = alta, ámbar = poca, rojo = sin, morado = inhábil). */
        var dotLvl = closed ? "closed" : lvl;
        var ariaLabel = d + " de " + MESES[m] + (closed ? ", inhábil" : (availLabel ? ", " + availLabel : ""));
        cells += '<button type="button" class="okcal__day' + (selected ? " is-selected" : "") + '" ' +
          'data-date="' + isoOf(date) + '"' +
          (disabled ? ' disabled aria-disabled="true"' : "") +
          ' title="' + (closed ? "Inhábil" : availLabel) + '"' +
          ' aria-label="' + ariaLabel + '"><span>' + d + '</span>' +
          '<i class="okcal-dot okcal-dot--' + dotLvl + '" aria-hidden="true"></i></button>';
      }
      calGrid.innerHTML = cells;

      qsa(".okcal__day[data-date]", calGrid).forEach(function (btn) {
        if (btn.disabled) return;
        btn.addEventListener("click", function () {
          qsa(".okcal__day", calGrid).forEach(function (b) { b.classList.remove("is-selected"); });
          btn.classList.add("is-selected");
          state.fecha = btn.dataset.date;
          if (dateInput) dateInput.value = state.fecha;
          loadSlots(btn.dataset.date);
        });
      });
    }

    function updateCalNav() {
      if (calPrev) {
        calPrev.disabled = (calView.getFullYear() === minDate.getFullYear() && calView.getMonth() === minDate.getMonth());
      }
      if (calNext) {
        var lv = new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);
        calNext.disabled = (calView.getFullYear() === lv.getFullYear() && calView.getMonth() === lv.getMonth());
      }
    }

    if (calPrev) calPrev.addEventListener("click", function () { calView.setMonth(calView.getMonth() - 1); renderCalendar(); updateCalNav(); loadMonthOccupancy(); });
    if (calNext) calNext.addEventListener("click", function () { calView.setMonth(calView.getMonth() + 1); renderCalendar(); updateCalNav(); loadMonthOccupancy(); });

    function resetSlots() {
      if (slotsEl) slotsEl.innerHTML = '<p class="time-grid__empty">Elige una fecha para ver los horarios.</p>';
    }

    function monthKey(date) {
      return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0");
    }
    /* Colorea el calendario con la OCUPACIÓN REAL del mes visible (verde/naranja/rojo). */
    function loadMonthOccupancy() {
      fetch(API + "/appointments/month.php?month=" + monthKey(calView))
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (j && j.ok && j.days) {
            occByDate = Object.assign({}, occByDate, j.days);
            renderCalendar();
          }
        })
        .catch(function () {});
    }

    /* Carga la config de disponibilidad (horario semanal, días bloqueados, ventana) y dibuja el calendario. */
    function loadAvailabilityConfig() {
      fetch(API + "/appointments/availability.php")
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (j && j.ok) {
            availCfg.weekly = j.weekly || {};
            availCfg.blackout = j.blackout || [];
            availCfg.maxAdvance = j.max_advance_days || 60;
            maxDate = new Date(today0); maxDate.setDate(maxDate.getDate() + availCfg.maxAdvance);
          }
        })
        .catch(function () {})
        .then(function () { if (calGrid) { renderCalendar(); updateCalNav(); resetSlots(); loadMonthOccupancy(); } });
    }

    if (calGrid) { renderCalendar(); updateCalNav(); resetSlots(); loadAvailabilityConfig(); }

    function validateStep1() {
      var next = qs("#cita-next-1");
      if (!next) return;
      var ok = !!(state.fecha && state.hora);
      next.disabled = !ok;
      next.setAttribute("aria-disabled", String(!ok));
    }

    /* Paso 2: validación de datos
       El botón "Siguiente" permanece deshabilitado hasta que el usuario
       complete: nombre, teléfono, método de contacto y términos. */
    /* Validación inline (sin alerts del navegador): correo con formato válido
       y teléfono con al menos 10 dígitos. Los mensajes se pintan bajo el campo. */
    var emailInput = qs("#cita-correo");
    var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    function onlyDigits(s) { return String(s || "").replace(/\D/g, ""); }
    function setFieldError(input, errorId, msg) {
      var el = qs("#" + errorId);
      if (el) { el.textContent = msg || ""; el.hidden = !msg; }
      if (input) {
        if (msg) input.setAttribute("aria-invalid", "true");
        else input.removeAttribute("aria-invalid");
      }
    }

    function validateStep2() {
      var next = qs("#cita-next-2");
      if (!next) return;
      var nameVal = nameInput ? nameInput.value.trim() : "";
      var telVal  = telInput ? telInput.value.trim() : "";
      var mailVal = emailInput ? emailInput.value.trim() : "";
      var hasName    = !!nameVal;
      var telOk      = onlyDigits(telVal).length >= 10;
      var mailOk     = EMAIL_RE.test(mailVal);   /* correo OBLIGATORIO */
      var hasContact = !!qs("input[name='cita-contacto']:checked", section);
      var acceptEl   = qs("#cita-acepto");
      var hasTerms   = !!(acceptEl && acceptEl.checked);

      /* Solo mostramos el error cuando el campo tiene contenido inválido. */
      setFieldError(telInput, "cita-tel-error", (telVal && !telOk) ? "Ingresa un teléfono válido a 10 dígitos." : "");
      setFieldError(emailInput, "cita-correo-error", (mailVal && !mailOk) ? "Revisa tu correo, p. ej. nombre@correo.com." : "");

      var ok = hasName && telOk && mailOk && hasContact && hasTerms;
      next.disabled = !ok;
      next.setAttribute("aria-disabled", String(!ok));
    }

    /* El filtro se instala ANTES que la validación para que esta lea el valor ya limpio. */
    attachFieldFilter(nameInput, NAME_ALLOW_RE);
    /* El teléfono (solo dígitos, máx. 10) y su selector de país (+52/+1) los gestiona
       el módulo compartido window.OKPhone (assets/phone-cc.js). */
    if (nameInput)  nameInput.addEventListener("input", validateStep2);
    if (telInput)   telInput.addEventListener("input", validateStep2);
    if (emailInput) emailInput.addEventListener("input", validateStep2);
    qsa("input[name='cita-contacto']", section).forEach(function (r) {
      r.addEventListener("change", validateStep2);
    });
    var aceptoEl = qs("#cita-acepto");
    if (aceptoEl) aceptoEl.addEventListener("change", validateStep2);

    /* Contacto principal reutilizando una de las personas ya registradas en la cita.
       Flujo: primero se pregunta "¿El contacto es alguno de los usuarios registrados?"
       (Sí/No). Con "Sí" se elige a la persona y se autollena su nombre (el correo y el
       teléfono se piden aquí porque no se capturan por persona). Con "No", captura manual.
       La elección se guarda en state (contactChoice/contactGuest) y se reaplica al volver
       a este paso, reflejando cualquier edición hecha en el paso anterior. */
    function renderQuienContacto() {
      var host = qs("#cita-quien-host");
      if (!host) return;

      /* Personas que SÍ capturaron su nombre, con su índice REAL en state.guests. */
      var people = [];
      (state.guests || []).forEach(function (g, i) {
        if (g && g.name && g.name.trim()) people.push({ i: i, name: g.name.trim(), dob: g.dob, doctype: g.doctype });
      });

      /* Sin personas registradas → se oculta la opción y el formulario queda manual. */
      if (!people.length) { host.hidden = true; host.innerHTML = ""; return; }
      host.hidden = false;

      /* Si la persona elegida ya no existe (cambió el nº de personas o se borró su
         nombre), se reinicia la elección. */
      if (typeof state.contactGuest === "number" && !people.some(function (p) { return p.i === state.contactGuest; })) {
        state.contactGuest = null;
        if (state.contactChoice === "si") state.contactChoice = "";
      }
      /* "Sí" con una sola persona → queda elegida automáticamente. */
      if (state.contactChoice === "si" && state.contactGuest == null && people.length === 1) {
        state.contactGuest = people[0].i;
      }
      /* Reaplica el nombre de la persona elegida (refleja ediciones del paso anterior). */
      if (state.contactChoice === "si" && typeof state.contactGuest === "number" && nameInput) {
        var gsel = state.guests[state.contactGuest];
        if (gsel && gsel.name && gsel.name.trim()) nameInput.value = gsel.name.trim();
      }

      var isYes = state.contactChoice === "si";
      var isNo  = state.contactChoice === "no";

      var html =
        '<p class="cita-quien__label" id="cita-quien-q">¿El contacto principal es alguno de los usuarios registrados en esta cita?</p>' +
        '<div class="cita-quien__yn" role="radiogroup" aria-labelledby="cita-quien-q">' +
          '<button type="button" class="cita-quien__opt cita-quien__yn-btn' + (isYes ? " is-active" : "") + '" data-yn="si" role="radio" aria-checked="' + isYes + '"><b>Sí</b></button>' +
          '<button type="button" class="cita-quien__opt cita-quien__yn-btn' + (isNo ? " is-active" : "") + '" data-yn="no" role="radio" aria-checked="' + isNo + '"><b>No</b></button>' +
        '</div>';

      if (isYes && people.length > 1) {
        html += '<p class="cita-quien__label" style="margin-top:14px">Elige quién será el contacto principal:</p>' +
          '<div class="cita-quien__opts" role="group" aria-label="Usuarios registrados">' +
          people.map(function (p) {
            var meta = [];
            if (p.dob) meta.push("Nac. " + formatDate(p.dob));
            if (p.doctype) meta.push(DOCTYPE_LABEL[p.doctype] || p.doctype);
            var active = (p.i === state.contactGuest);
            return '<button type="button" class="cita-quien__opt' + (active ? " is-active" : "") +
              '" data-quien="' + p.i + '" aria-pressed="' + active + '"><b>' + sanitize(p.name) + '</b>' +
              (meta.length ? '<span>' + sanitize(meta.join(" · ")) + '</span>' : "") + '</button>';
          }).join("") + '</div>';
      } else if (isYes && people.length === 1) {
        html += '<p class="cita-quien__note" style="margin-top:10px">Usaremos el nombre de <b>' +
          sanitize(people[0].name) + '</b>. Solo agrega el correo y el teléfono abajo.</p>';
      }

      host.innerHTML = html;

      /* Sí / No. */
      qsa(".cita-quien__yn-btn", host).forEach(function (btn) {
        btn.addEventListener("click", function () {
          if (btn.getAttribute("data-yn") === "no") {
            state.contactChoice = "no"; state.contactGuest = null;
            if (nameInput) nameInput.value = "";
            renderQuienContacto();
            if (nameInput) nameInput.focus();
          } else {
            state.contactChoice = "si";
            if (people.length === 1) { state.contactGuest = people[0].i; if (nameInput) nameInput.value = people[0].name; }
            renderQuienContacto();
          }
          validateStep2();
        });
      });

      /* Selección de la persona (cuando hay varias). */
      qsa(".cita-quien__opt[data-quien]", host).forEach(function (btn) {
        btn.addEventListener("click", function () {
          var i = +btn.getAttribute("data-quien");
          state.contactChoice = "si"; state.contactGuest = i;
          if (nameInput) nameInput.value = (state.guests[i] && state.guests[i].name.trim()) || "";
          renderQuienContacto();
          validateStep2();
        });
      });
    }

    /* ──────────────────────────────────────────────────────────
       Paso Requisitos: datos de CADA persona que asistirá a la cita.
       Si la cita es para N personas se piden N formularios; se navega de una
       persona a la siguiente y al final se puede regresar a editar antes de
       confirmar. Para pasaporte/visa/sentri se pregunta el tipo de trámite
       (primera vez / renovación con o sin documentos). El anticipo del 100%
       se informa aquí (el cobro en línea se conectará después). */
    var personasHost    = qs("#cita-personas");
    var personaProgress = qs("#persona-progress");
    var personaPrevBtn  = qs("#persona-prev");
    var personaNextBtn  = qs("#persona-next");
    var DOCTYPE_OPTS = [
      { v: "primera",   t: "Primera vez" },
      { v: "renov_con", t: "Renovación con documentos" },
      { v: "renov_sin", t: "Renovación sin documentos" }
    ];
    var DOCTYPE_LABEL = { primera: "Primera vez", renov_con: "Renovación con documentos", renov_sin: "Renovación sin documentos" };
    /* La pregunta de renovación con/sin documentos aplica a pasaporte, visa y SENTRI. */
    function needsDoctype() { return state.tramite === "pasaporte" || state.tramite === "visa" || state.tramite === "sentri"; }

    /* Garantiza state.guests con exactamente partySize entradas (preserva lo escrito). */
    function ensureGuests() {
      var n = Math.max(1, state.partySize | 0);
      if (!Array.isArray(state.guests)) state.guests = [];
      while (state.guests.length < n) state.guests.push({ name: "", dob: "", doctype: "", answers: {}, files: {} });
      if (state.guests.length > n) state.guests.length = n;
      /* Prefill del nombre de la 1ª persona con el del contacto, si está vacío. */
      if (state.guests[0] && !state.guests[0].name && state.nombre) state.guests[0].name = state.nombre;
      if (typeof state.activeGuest !== "number" || state.activeGuest >= n || state.activeGuest < 0) state.activeGuest = 0;
    }

    /* Un control del cuestionario por trámite (texto/tel/área/select/checkbox) con su ayuda. */
    function answerCtrlHtml(i, f) {
      var id = "pg-" + i + "-a-" + f.k;
      var req = ""; /* el cuestionario por persona es opcional: sin marca de obligatorio */
      var help = f.help ? '<span class="persona-help">' + sanitize(f.help) + '</span>' : "";
      if (f.type === "check") {
        return '<label class="persona-check" for="' + id + '"><input type="checkbox" id="' + id + '" data-ans="' + f.k + '" data-idx="' + i + '"><span>' + sanitize(f.q) + '</span></label>' +
          (f.help ? '<span class="persona-help persona-help--check">' + sanitize(f.help) + '</span>' : "");
      }
      var ctl;
      if (f.type === "textarea") {
        ctl = '<textarea id="' + id + '" data-ans="' + f.k + '" data-idx="' + i + '" rows="2"></textarea>';
      } else if (f.type === "select") {
        ctl = '<select id="' + id + '" data-ans="' + f.k + '" data-idx="' + i + '"><option value="">Selecciona…</option>' +
          (f.opts || []).map(function (o) { return '<option value="' + sanitize(o) + '">' + sanitize(o) + '</option>'; }).join("") + '</select>';
      } else {
        ctl = '<input type="' + (f.type === "tel" ? "tel" : "text") + '" id="' + id + '" data-ans="' + f.k + '" data-idx="' + i + '" autocomplete="off">';
      }
      return '<div class="field"><label for="' + id + '">' + sanitize(f.q) + req + '</label>' + help + ctl + '</div>';
    }
    /* Documentos que se piden a ESTA persona, integrados en su cuestionario.
       Se obtienen del catálogo del trámite (window.OKCitaExpediente.docsFor).
       Son OPCIONALES: si el cliente prefiere, los lleva físicamente a la cita. */
    var DOC_ACCEPT = ".pdf,.jpg,.jpeg,.png";
    var DOC_MAX_MB = 10;
    function guestDocsList() {
      return (window.OKCitaExpediente && window.OKCitaExpediente.docsFor)
        ? window.OKCitaExpediente.docsFor(state.tramite, state.subtype) : [];
    }
    function fmtFileSize(b) {
      if (b < 1024) return b + " B";
      if (b < 1048576) return (b / 1024).toFixed(0) + " KB";
      return (b / 1048576).toFixed(1) + " MB";
    }
    function setGuestDocStatus(el, msg, ok) {
      if (!el) return;
      if (!msg) { el.innerHTML = ""; el.className = "doc-field__status"; return; }
      el.className = "doc-field__status " + (ok === false ? "is-error" : (ok ? "is-ok" : ""));
      var icon = (ok === false)
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
      el.innerHTML = icon + '<span>' + sanitize(msg) + '</span>';
    }
    function guestDocsHtml(i) {
      var docs = guestDocsList();
      if (!docs.length) return "";
      var rows = docs.map(function (d) {
        var inputId = "pg-" + i + "-doc-" + d.key;
        return '<div class="doc-field" data-doc="' + sanitize(d.key) + '">' +
          '<div class="doc-field__top">' +
            '<span class="doc-field__name">' + sanitize(d.label) + ' <span class="field__opt">(opcional)</span></span>' +
            '<label class="doc-field__btn" for="' + inputId + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>Elegir archivo</label>' +
          '</div>' +
          '<input type="file" id="' + inputId + '" class="doc-field__input" accept="' + DOC_ACCEPT + '" data-docfile="' + sanitize(d.key) + '" data-idx="' + i + '" hidden>' +
          '<div class="doc-field__status" data-docstatus="' + i + '-' + sanitize(d.key) + '"></div>' +
        '</div>';
      }).join("");
      return '<div class="persona-docs">' +
        '<p class="persona-docs__title"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> Documentos de esta persona</p>' +
        '<p class="persona-docs__sub">Sube tu CURP, identificación o los archivos del trámite (PDF, JPG o PNG · máx. ' + DOC_MAX_MB + ' MB c/u). Es opcional: también puedes llevarlos el día de tu cita. Deben verse completos y legibles.</p>' +
        '<div class="cita-docs__list">' + rows + '</div>' +
        '</div>';
    }

    function guestCardHtml(i) {
      var radios = "";
      if (needsDoctype()) {
        radios = '<div class="field"><label id="pg-' + i + '-dt-label">Tipo de trámite</label>' +
          '<div class="contact-pref persona-doctype" role="radiogroup" aria-labelledby="pg-' + i + '-dt-label">' +
          DOCTYPE_OPTS.map(function (o) {
            return '<label class="contact-chip"><input type="radio" name="pg-' + i + '-dt" data-pg="doctype" data-idx="' + i + '" value="' + o.v + '"> ' + o.t + '</label>';
          }).join("") + '</div></div>';
      }
      var g = state.guests[i] || {};
      var qfields = window.OKQ ? window.OKQ.fields(state.tramite, state.subtype, g.doctype) : [];
      var qhtml = "";
      if (qfields.length) {
        qhtml = '<div class="persona-q"><p class="persona-q__intro">Responde lo de tu trámite para tener todo listo en tu cita. Si algo no aplica, escribe “No aplica”.</p>' +
          qfields.map(function (f) { return answerCtrlHtml(i, f); }).join("") + '</div>';
      }
      return '<div class="persona-card" data-idx="' + i + '" hidden>' +
        '<div class="persona-card__head"><span class="persona-card__badge">' + (i + 1) + '</span> Persona ' + (i + 1) + ' de ' + state.guests.length + '</div>' +
        '<div class="field-group">' +
          '<div class="field"><label for="pg-' + i + '-name">Nombre completo</label>' +
          '<input type="text" id="pg-' + i + '-name" data-pg="name" data-idx="' + i + '" autocomplete="off" placeholder="Ej. María González"></div>' +
          '<div class="field"><label for="pg-' + i + '-dob">Fecha de nacimiento</label>' +
          '<input type="date" id="pg-' + i + '-dob" data-pg="dob" data-idx="' + i + '" min="1900-01-01" max="9999-12-31"></div>' +
        '</div>' + radios + qhtml + guestDocsHtml(i) +
        '</div>';
    }

    function renderGuests() {
      if (!personasHost) return;
      ensureGuests();
      var html = "";
      for (var i = 0; i < state.guests.length; i++) html += guestCardHtml(i);
      personasHost.innerHTML = html;
      /* Añade el selector de país (+52/+1) y el filtro de dígitos a los teléfonos del
         cuestionario ANTES de restaurar valores, para poder repartir "+52 664…". */
      if (window.OKPhone) window.OKPhone.init(personasHost);
      /* Set de valores por propiedad (evita problemas de escape en atributos). */
      for (var k = 0; k < state.guests.length; k++) {
        var g = state.guests[k]; if (!g.answers) g.answers = {};
        var nameEl = qs("#pg-" + k + "-name", personasHost);
        var dobEl  = qs("#pg-" + k + "-dob", personasHost);
        if (nameEl) nameEl.value = g.name || "";
        if (dobEl)  dobEl.value  = g.dob || "";
        if (g.doctype) {
          var r = qs('input[name="pg-' + k + '-dt"][value="' + g.doctype + '"]', personasHost);
          if (r) r.checked = true;
        }
        /* Valores capturados del cuestionario por trámite. */
        var fl = window.OKQ ? window.OKQ.fields(state.tramite, state.subtype, g.doctype) : [];
        for (var fi = 0; fi < fl.length; fi++) {
          var f = fl[fi], el = qs("#pg-" + k + "-a-" + f.k, personasHost), val = g.answers[f.k];
          if (!el) continue;
          if (f.type === "check") el.checked = (val === true);
          else if (f.type === "tel" && window.OKPhone) window.OKPhone.set(el, val);
          else if (val != null) el.value = val;
        }
        /* Restaurar el estado visual de los documentos ya elegidos por esta persona:
           el <input type=file> no conserva su valor tras re-render, pero el File sí
           vive en state.guests[k].files, así que repintamos su estado "✓ archivo.pdf". */
        if (g.files) {
          Object.keys(g.files).forEach(function (dk) {
            var d = g.files[dk]; if (!d || !d.file) return;
            setGuestDocStatus(qs('[data-docstatus="' + k + '-' + dk + '"]', personasHost), d.file.name + " · " + fmtFileSize(d.file.size), true);
          });
        }
      }
      /* Datos base (nombre/fecha/subtipo). Cambiar el subtipo re-renderiza porque el
         cuestionario depende de él (p. ej. la visa láser solo aparece en renovación). */
      qsa("[data-pg]", personasHost).forEach(function (el) {
        var ev = el.type === "radio" ? "change" : "input";
        el.addEventListener(ev, function () {
          if (el.dataset.pg === "name") cleanFieldValue(el, NAME_ALLOW_RE);
          var idx = parseInt(el.dataset.idx, 10) || 0;
          if (!state.guests[idx]) state.guests[idx] = { name: "", dob: "", doctype: "", answers: {} };
          state.guests[idx][el.dataset.pg] = el.value;
          if (el.dataset.pg === "doctype") { renderGuests(); return; }
          validateGuests();
        });
      });
      /* Respuestas del cuestionario por trámite. */
      qsa("[data-ans]", personasHost).forEach(function (el) {
        var ev = (el.type === "checkbox" || el.tagName === "SELECT") ? "change" : "input";
        el.addEventListener(ev, function () {
          var idx = parseInt(el.dataset.idx, 10) || 0;
          if (!state.guests[idx]) state.guests[idx] = { name: "", dob: "", doctype: "", answers: {} };
          if (!state.guests[idx].answers) state.guests[idx].answers = {};
          var val;
          if (el.type === "checkbox") val = el.checked;
          else if (el.type === "tel" && window.OKPhone) val = window.OKPhone.full(el);  /* "+52 664…" */
          else val = el.value;
          state.guests[idx].answers[el.dataset.ans] = val;
          validateGuests();
        });
      });
      /* Cambiar el código de país (+52/+1) de un teléfono del cuestionario también
         actualiza la respuesta guardada (reutiliza el manejador del input asociado). */
      qsa(".input-prefix__cc", personasHost).forEach(function (sel) {
        sel.addEventListener("change", function () {
          var inp = sel.closest(".input-prefix");
          inp = inp ? inp.querySelector("input[data-ans]") : null;
          if (inp) inp.dispatchEvent(new Event("input"));
        });
      });
      /* Documentos por persona (archivos opcionales, integrados en el cuestionario). */
      qsa("[data-docfile]", personasHost).forEach(function (inp) {
        inp.addEventListener("change", function () {
          var idx = parseInt(inp.dataset.idx, 10) || 0;
          var key = inp.dataset.docfile;
          if (!state.guests[idx]) state.guests[idx] = { name: "", dob: "", doctype: "", answers: {}, files: {} };
          if (!state.guests[idx].files) state.guests[idx].files = {};
          var statusEl = qs('[data-docstatus="' + idx + '-' + key + '"]', personasHost);
          var f = inp.files && inp.files[0];
          if (!f) { delete state.guests[idx].files[key]; setGuestDocStatus(statusEl, "", null); return; }
          var okType = /\.(pdf|jpe?g|png)$/i.test(f.name) || ["application/pdf", "image/jpeg", "image/png"].indexOf(f.type) !== -1;
          if (!okType) { inp.value = ""; delete state.guests[idx].files[key]; setGuestDocStatus(statusEl, "Formato no permitido. Usa PDF, JPG o PNG.", false); return; }
          if (f.size > DOC_MAX_MB * 1024 * 1024) { inp.value = ""; delete state.guests[idx].files[key]; setGuestDocStatus(statusEl, "El archivo supera " + DOC_MAX_MB + " MB.", false); return; }
          var docs = guestDocsList(), label = key;
          for (var di = 0; di < docs.length; di++) if (docs[di].key === key) { label = docs[di].label; break; }
          state.guests[idx].files[key] = { file: f, label: label };
          setGuestDocStatus(statusEl, f.name + " · " + fmtFileSize(f.size), true);
        });
      });
      showGuest(state.activeGuest);
      validateGuests();
    }

    function showGuest(i) {
      if (!personasHost) return;
      var cards = qsa(".persona-card", personasHost);
      if (!cards.length) return;
      i = Math.max(0, Math.min(cards.length - 1, i));
      state.activeGuest = i;
      cards.forEach(function (c, ci) { c.hidden = (ci !== i); });
      if (personaProgress) personaProgress.textContent = "Persona " + (i + 1) + " de " + cards.length;
      if (personaPrevBtn) personaPrevBtn.disabled = (i === 0);
      if (personaNextBtn) personaNextBtn.disabled = (i === cards.length - 1);
      if (personaPrevBtn && personaPrevBtn.parentNode) personaPrevBtn.parentNode.style.display = (cards.length > 1) ? "" : "none";
    }

    function guestValid(g) {
      if (!g || !g.name || !g.name.trim() || !g.dob) return false;
      if (needsDoctype() && !g.doctype) return false;
      /* Todos los campos NO opcionales del cuestionario del trámite deben estar llenos
         (los de tipo checkbox siempre tienen respuesta sí/no, así que no se exigen). */
      var fl = window.OKQ ? window.OKQ.fields(state.tramite, state.subtype, g.doctype) : [];
      var ans = g.answers || {};
      for (var i = 0; i < fl.length; i++) {
        var f = fl[i];
        if (f.optional || f.type === "check") continue;
        var v = ans[f.k];
        if (v == null || String(v).trim() === "") return false;
      }
      return true;
    }
    function validateGuests() {
      /* El botón "Continuar" del paso de personas se BLOQUEA hasta que TODAS las
         personas de la cita tengan su información completa (nombre, fecha de
         nacimiento, tipo de trámite si aplica, y los campos obligatorios del
         cuestionario del trámite). Se recalcula en cada cambio de campo. */
      var guests = state.guests || [];
      var allOk = guests.length > 0;
      for (var i = 0; i < guests.length; i++) {
        if (!guestValid(guests[i])) { allOk = false; break; }
      }
      var btn = qs("#cita-next-4");
      if (btn) {
        btn.disabled = !allOk;
        btn.setAttribute("aria-disabled", allOk ? "false" : "true");
        btn.title = allOk ? "" : "Completa la información de todas las personas para continuar.";
      }
      return allOk;
    }
    if (personaPrevBtn) personaPrevBtn.addEventListener("click", function () { showGuest(state.activeGuest - 1); });
    if (personaNextBtn) personaNextBtn.addEventListener("click", function () { showGuest(state.activeGuest + 1); });

    /* Construir resumen */
    function buildSummary() {
      if (!summaryEl) return;

      /* — Resumen agrupado en tarjetas (Datos de contacto · Detalle de la cita ·
           Estimado). Misma información de siempre, presentada compacta y por bloques
           para que no se vea tan dispersa y el precio quede visible. — */
      var SVG = {
        user:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
        clip:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 2h6a1 1 0 011 1v1a1 1 0 01-1 1H9a1 1 0 01-1-1V3a1 1 0 011-1z"/><path d="M8 4H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-2"/></svg>',
        money: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/></svg>'
      };
      function item(k, v, mutedVal) {
        return '<div class="cita-summary__item"><span class="cita-summary__k">' + k +
          '</span><b class="cita-summary__v' + (mutedVal ? ' cita-summary__v--muted' : '') + '">' + v + '</b></div>';
      }
      function group(icon, title, itemsHtml, mod) {
        return '<section class="cita-summary__group' + (mod ? ' ' + mod : '') + '">' +
          '<h5 class="cita-summary__group-head">' + icon + '<span>' + title + '</span></h5>' +
          itemsHtml + '</section>';
      }

      /* Datos de contacto */
      var contacto = item("Nombre", sanitize(state.nombre || "—")) +
        item("WhatsApp", sanitize(state.tel || "—")) +
        (state.correo
          ? item("Correo", sanitize(state.correo))
          : item("Correo", "No proporcionado", true));

      /* Detalle de la cita */
      var detalle = item("Servicio", sanitize(state.tramiteLabel));
      if (state.tramite === "pasaporte" && state.subtype) {
        detalle += item("Tipo de pasaporte", sanitize(SUBTYPE_LABEL[state.subtype] || state.subtype));
      }
      detalle += item("Personas", sanitize(String(state.partySize) + (state.partySize === 1 ? " (solo yo)" : ""))) +
        item("Fecha", sanitize(formatDate(state.fecha))) +
        item("Hora", sanitize(state.hora) + " hrs");
      if (state.notas) detalle += item("Notas", sanitize(state.notas));
      /* Datos de cada persona capturados en el paso de requisitos. */
      if (state.guests && state.guests.length) {
        state.guests.forEach(function (g, i) {
          var nm = (g.name || "").trim();
          if (!nm) { detalle += item("Persona " + (i + 1), "Datos pendientes", true); return; }
          var parts = [];
          if (g.dob) parts.push("Nac. " + formatDate(g.dob));
          if (g.doctype) parts.push(DOCTYPE_LABEL[g.doctype] || g.doctype);
          detalle += item("Persona " + (i + 1), sanitize(nm + (parts.length ? " · " + parts.join(" · ") : "")));
        });
      }

      /* Estimado: desglose (Subtotal + IVA) a un lado y el Total en caja destacada. */
      var priceRows = window.OKCitaPriceRows
        ? window.OKCitaPriceRows(state.tramite, state.subtype, state.partySize)
        : [["Precio", "Te confirmamos el precio"]];
      var totalVal = null, isQuote = false, estItems = "";
      priceRows.forEach(function (pr) {
        if (/^total/i.test(pr[0]) || pr[0] === "Precio") {
          totalVal = sanitize(pr[1]);
          if (pr[0] === "Precio") isQuote = true;
        } else {
          estItems += item(sanitize(pr[0]), sanitize(pr[1]));
        }
      });
      estItems += item("Duración estimada", sanitize(fmtDuration(durationMins(state.partySize))));
      var totalBox = '<div class="cita-summary__total' + (isQuote ? ' cita-summary__total--quote' : '') + '">' +
        '<span class="cita-summary__total-label">Total</span>' +
        '<b class="cita-summary__total-val">' + (totalVal || "—") + '</b>' +
        (isQuote ? '' : '<span class="cita-summary__total-cur">MXN</span>') + '</div>';
      var estimado = '<section class="cita-summary__group cita-summary__group--est">' +
        '<h5 class="cita-summary__group-head">' + SVG.money + '<span>Estimado</span></h5>' +
        '<div class="cita-summary__est">' +
        '<div class="cita-summary__est-rows">' + estItems + '</div>' + totalBox +
        '</div></section>';

      summaryEl.classList.add("cita-summary--grouped");
      summaryEl.innerHTML =
        '<div class="cita-summary__grid">' +
        group(SVG.user, "Datos de contacto", contacto) +
        group(SVG.clip, "Detalle de la cita", detalle) +
        '</div>' + estimado;

      /* Guardar en sessionStorage (no localStorage por privacidad) */
      try {
        sessionStorage.setItem("okstation.cita.draft", JSON.stringify({
          tramite: state.tramite,
          fecha: state.fecha,
          hora: state.hora,
          ts: Date.now()
        }));
      } catch (_) {}
    }

    /* Confirmación: la reserva ocurre en el servidor (no WhatsApp).
       El comprobante PDF se genera con el módulo compartido window.OKCitaTicket (assets/cita-ticket.js). */
    var confirmBtn   = qs("#cita-confirm-btn");
    var successEl    = qs("#cita-success");
    var confirmIntro = qs("#cita-confirm-intro");
    /* Sube los documentos de CADA persona a su cita (multipart), etiquetando cada
       archivo con la persona a la que pertenece (guest_index + guest_name) y el tipo
       de documento (doc_key/doc_label). Best-effort: los errores no afectan la cita ya
       creada; el cliente puede llevar los documentos físicamente. */
    function uploadCitaDocs(apptId, guests) {
      if (!apptId || !Array.isArray(guests)) return;
      var pending = 0, failed = 0;
      guests.forEach(function (g, idx) {
        if (!g || !g.files) return;
        Object.keys(g.files).forEach(function (key) {
          var d = g.files[key];
          if (!d || !d.file) return;
          var fd = new FormData();
          fd.append("appointment_id", apptId);
          fd.append("guest_index", idx);
          fd.append("guest_name", (g.name || "").trim());
          fd.append("doc_key", key);
          fd.append("doc_label", d.label || key);
          fd.append("file", d.file);
          pending++;
          fetch(API + "/appointments/upload.php", { method: "POST", body: fd })
            .then(function (r) {
              return r.json().then(
                function (j) { return { status: r.status, body: j }; },
                function () { return { status: r.status, body: null }; }
              );
            })
            .then(function (res) {
              if (!(res.status === 201 && res.body && res.body.ok)) {
                failed++;
                console.warn("[Ok.station] No se pudo subir el documento «" + (d.label || key) +
                  "» (persona " + (idx + 1) + ") → HTTP " + res.status + ": " +
                  ((res.body && res.body.error) || "respuesta inesperada del servidor"));
              }
            })
            .catch(function (e) {
              failed++;
              console.warn("[Ok.station] Error de red al subir «" + (d.label || key) + "»:", e && e.message);
            })
            .then(function () {
              pending--;
              if (pending === 0 && failed > 0) {
                showToast("Tu cita quedó registrada, pero no pudimos guardar " + failed +
                  " documento(s) en línea. Puedes llevarlos el día de tu cita.");
              }
            });
        });
      });
    }

    /* Inicia el pago del anticipo de una cita (requiere sesión; el servidor verifica
       propiedad y recalcula el monto). Redirige al checkout (pago.html / pasarela). */
    function startApptPayment(apptId, btn) {
      var tk = authToken();
      if (!tk) { showToast("Inicia sesión para pagar en línea."); return; }
      if (btn) { btn.disabled = true; btn.textContent = "Abriendo…"; }
      /* Página de cobro unificada (pago.html): decide el método y recalcula el monto. */
      location.href = "pago.html?appt=" + encodeURIComponent(apptId);
    }

    /* Bloque "Pagar anticipo" en el comprobante de éxito: si el trámite tiene precio
       fijo y hay sesión → botón de pago; si no hay sesión → invitación a iniciarla;
       si el trámite se cotiza (appt.payable=false) → no muestra nada. */
    function renderCitaPayCTA(container, appt) {
      if (!container || !appt || !appt.payable) return;
      var amount = window.OKMxn0 ? window.OKMxn0(appt.amount_total) : ("$" + appt.amount_total);
      var must = !!appt.requires_payment;   /* visa/pasaporte: pagar es obligatorio para confirmar */
      var box = document.createElement("div");
      box.className = "cita-pay" + (must ? " cita-pay--required" : "");
      box.style.cssText = "margin-top:16px;text-align:center";
      var head = '<p style="margin:0 0 8px;color:var(--text-muted)">' +
        (must ? "Pago para confirmar: " : "Pago del trámite: ") +
        '<b style="color:var(--brand-blue)">' + sanitize(amount) + '</b></p>';
      if (appt.logged_in) {
        box.innerHTML = head +
          '<button type="button" class="btn btn--primary btn--sm" id="cita-pay-btn">' + (must ? "Pagar para confirmar" : "Pagar ahora") + '</button>' +
          '<p style="margin:8px 0 0;font-size:.8rem;color:var(--text-muted)">' +
          (must ? "Tu cita se confirma al recibir el pago." : "También puedes pagarlo después desde “Mis citas”.") + '</p>';
      } else {
        box.innerHTML = head +
          '<a class="btn btn--primary btn--sm" href="cuenta.html">' + (must ? "Inicia sesión para pagar y confirmar" : "Inicia sesión para pagar en línea") + '</a>' +
          '<p style="margin:8px 0 0;font-size:.8rem;color:var(--text-muted)">' +
          (must ? "Sin el pago, tu cita queda sin confirmar." : "O realiza tu pago por WhatsApp / en sucursal.") + '</p>';
      }
      container.appendChild(box);
      var pb = box.querySelector("#cita-pay-btn");
      if (pb) pb.addEventListener("click", function () { startApptPayment(appt.id, this); });
    }

    function submitCita() {
      if (!confirmBtn || confirmBtn.disabled) return;
      var emailEl = qs("#cita-correo");
      var prefEl  = qs("input[name='cita-contacto']:checked", section);
      /* Expediente (documentos + servicios) capturado por assets/cita-expediente.js. */
      var exped = (window.OKCitaExpediente && window.OKCitaExpediente.getState) ? window.OKCitaExpediente.getState() : null;
      var payload = {
        tramite: state.tramite,
        passport_subtype: state.subtype || "",
        party_size: state.partySize,
        date: state.fecha,
        time: state.hora,
        name: state.nombre,
        phone: state.tel,
        email: emailEl ? emailEl.value.trim() : "",
        contact_pref: prefEl ? prefEl.value : "",
        notes: state.notas || "",
        guests: (state.guests || []).map(function (g) {
          return { name: (g.name || "").trim(), dob: g.dob || "", doctype: g.doctype || "", answers: g.answers || {} };
        }),
        services: (exped && exped.services) ? exped.services : []
      };
      var prevText = confirmBtn.textContent;
      confirmBtn.disabled = true;
      confirmBtn.textContent = "Enviando…";
      var headers = { "Content-Type": "application/json" };
      var tk = authToken();
      if (tk) headers.Authorization = "Bearer " + tk;
      fetch(API + "/appointments/create.php", { method: "POST", headers: headers, body: JSON.stringify(payload) })
        .then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j || {} }; }); })
        .then(function (res) {
          var j = res.body;
          if (res.status === 201 && j.ok) {
            if (successEl) {
              successEl.hidden = false;
              /* Visa/pasaporte (requires_payment) con precio: la cita queda RESERVADA
                 pero NO confirmada hasta pagar el anticipo del 100%. */
              var mustPay = !!(j.appointment.requires_payment && j.appointment.payable);
              var ttl = mustPay ? "Cita reservada — falta tu pago" : "¡Cita registrada!";
              var msg = mustPay
                ? 'Tu folio es <b>' + sanitize(j.appointment.code) + '</b>. Para <b>confirmar</b> tu cita es necesario completar el pago del 100%.'
                : 'Tu folio es <b>' + sanitize(j.appointment.code) + '</b>. Te contactaremos para confirmar tu cita.';
              successEl.innerHTML =
                '<div class="cita-confirm__check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg></div>' +
                '<h4>' + ttl + '</h4>' +
                '<p>' + msg + '</p>' +
                '<a class="btn btn--light btn--sm" id="cita-ticket-dl" style="margin-top:12px" rel="noopener" target="_blank" download="cita-' + sanitize(j.appointment.code) + '.pdf" href="#">Descargar comprobante (PDF)</a>';
              /* Genera el comprobante PDF con el módulo compartido (si está disponible).
                 Usamos Blob URL (no data-URI) para que la descarga abra también en celular. */
              try {
                /* Servicios adicionales que el cliente marcó (venta cruzada) para reflejarlos en el ticket. */
                var citaServices = (exped && exped.services) ? exped.services : [];
                var apptForTicket = {
                  code: j.appointment.code, tramite: j.appointment.tramite,
                  passport_subtype: j.appointment.passport_subtype, party_size: j.appointment.party_size,
                  date: j.appointment.date, time: j.appointment.time, status: j.appointment.status,
                  name: state.nombre, phone: state.tel, guests: state.guests,
                  services: citaServices
                };
                var citaUri = window.OKCitaTicketBlobUrl ? window.OKCitaTicketBlobUrl(apptForTicket) : null;
                var dlBtn = qs("#cita-ticket-dl", successEl);
                if (citaUri && dlBtn) dlBtn.href = citaUri;
                else if (dlBtn) dlBtn.style.display = "none";

                /* Envía el COMPROBANTE (PDF) por correo al cliente (best-effort, vía Brevo).
                   Solo si dio correo. El PDF se genera aquí en base64 (data-URI). */
                try {
                  var contactEmail = (qs("#cita-correo") && qs("#cita-correo").value.trim()) || "";
                  if (contactEmail && window.OKCitaTicket && j.appointment && j.appointment.id) {
                    var pdfUri = window.OKCitaTicket(apptForTicket);
                    if (pdfUri) {
                      fetch(API + "/appointments/send-receipt.php", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ appointment_id: j.appointment.id, code: j.appointment.code, pdf_base64: pdfUri })
                      }).catch(function () {});
                    }
                  }
                } catch (e2) {}
              } catch (e) {
                var dlErr = qs("#cita-ticket-dl", successEl);
                if (dlErr) dlErr.style.display = "none";
              }
              /* Anticipo: botón de pago según el trámite (precio fijo) y la sesión. */
              try { renderCitaPayCTA(successEl, j.appointment); } catch (e) {}
            }
            if (confirmIntro) confirmIntro.style.display = "none"; /* evita doble palomita */
            if (summaryEl) summaryEl.style.display = "none";
            confirmBtn.style.display = "none";
            /* Dejar la vista EXACTAMENTE en el banner del comprobante (no saltar al inicio). */
            if (successEl) requestAnimationFrame(function () {
              var top = successEl.getBoundingClientRect().top + window.scrollY - 90;
              window.scrollTo({ top: top, behavior: "smooth" });
            });
            showToast("¡Cita registrada! Folio " + j.appointment.code);
            try { sessionStorage.removeItem("okstation.cita.draft"); } catch (_) {}
            /* Sube los documentos de cada persona (best-effort: no bloquea la confirmación). */
            uploadCitaDocs(j.appointment && j.appointment.id, state.guests);
          } else {
            showToast((j && j.error) || "No se pudo registrar la cita. Intenta de nuevo.");
            confirmBtn.disabled = false;
            confirmBtn.textContent = prevText;
          }
        })
        .catch(function () {
          showToast("Sin conexión. Intenta de nuevo.");
          confirmBtn.disabled = false;
          confirmBtn.textContent = prevText;
        });
    }
    if (confirmBtn) confirmBtn.addEventListener("click", submitCita);

    /* Navegación del wizard */
    qsa("[data-cita-next]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        goToStep(state.step + 1);
      });
    });

    qsa("[data-cita-back]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        goToStep(state.step - 1);
      });
    });

    /* Reset completo */
    var resetBtn = qs("#cita-reset");
    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        state = { step: 0, tramite: null, tramiteLabel: "", subtype: "", partySize: 1, partyLabel: "Solo yo", fecha: "", hora: "", nombre: "", tel: "", notas: "", guests: [], activeGuest: 0, contactChoice: "", contactGuest: null };
        if (personasHost) personasHost.innerHTML = "";

        qsa(".tramite-btn").forEach(function (b) {
          b.classList.remove("is-selected");
          b.setAttribute("aria-pressed", "false");
        });

        /* Limpiar selección del panel "Más servicios" y cantidad de personas */
        qsa(".extra-card").forEach(function (b) {
          b.classList.remove("is-selected");
          b.setAttribute("aria-pressed", "false");
        });
        renderSelectedExtra();
        setParty(1);
        closeDrawer();
        closeSubtypeModal();

        qsa(".time-slot").forEach(function (b) {
          b.classList.remove("is-selected");
          b.setAttribute("aria-pressed", "false");
        });

        if (dateInput)  dateInput.value  = "";
        if (nameInput)  nameInput.value  = "";
        if (telInput)   telInput.value   = "";
        if (notesInput) notesInput.value = "";

        /* Reiniciar método de contacto y términos */
        qsa("input[name='cita-contacto']", section).forEach(function (r) { r.checked = false; });
        var aceptoReset = qs("#cita-acepto");
        if (aceptoReset) aceptoReset.checked = false;

        /* Reiniciar calendario y horarios al mes mínimo */
        calView = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
        renderCalendar();
        updateCalNav();
        resetSlots();
        loadMonthOccupancy();

        var btn0 = qs("#cita-next-0");
        var btn1 = qs("#cita-next-1");
        var btn2 = qs("#cita-next-2");
        if (btn0) { btn0.disabled = true; btn0.setAttribute("aria-disabled", "true"); }
        if (btn1) { btn1.disabled = true; btn1.setAttribute("aria-disabled", "true"); }
        if (btn2) { btn2.disabled = true; btn2.setAttribute("aria-disabled", "true"); }

        try { sessionStorage.removeItem("okstation.cita.draft"); } catch (_) {}

        if (confirmIntro) confirmIntro.style.display = "";
        if (summaryEl) summaryEl.style.display = "";
        if (confirmBtn) { confirmBtn.style.display = ""; confirmBtn.disabled = false; confirmBtn.textContent = "Confirmar cita"; }
        if (successEl) { successEl.hidden = true; successEl.innerHTML = ""; }

        goToStep(0);
        showToast("Formulario reiniciado. ¡Empieza de nuevo!");
      });
    }

    /* Inicializar */
    renderSteps();
    setParty(1);
    renderSelectedExtra();
    updateStep0Next();
    validateStep1();
    validateStep2();
  }


  /* ============================================================
     06. SISTEMA DE FOTOS (UPLOAD)
     ============================================================ */
  function initFotos() {
    var section = qs("#fotos");
    if (!section) return;

    /* Estado */
    var files = [];
    var config = {
      size: "10x15",
      finish: "Brillante",
      qty: 1
    };

    /* DOM */
    var dropzone = qs("#dropzone");
    var fileInput = qs("#foto-input");
    var thumbsContainer = qs("#thumbs");
    var qtyValEl = qs("#qty-val");
    var totalFotosEl = qs("#total-fotos");
    var totalCopiasEl = qs("#total-copias");
    var totalPrecioEl = qs("#total-precio");
    var totalNoteEl = qs("#total-note");
    var sendBtn = qs("#foto-send");

    if (!dropzone || !fileInput) return;

    /* ── Dropzone: accesibilidad ── */
    dropzone.setAttribute("role", "button");
    dropzone.setAttribute("tabindex", "0");
    dropzone.setAttribute("aria-label", "Zona de carga. Haz clic o arrastra imágenes o PDF aquí");

    dropzone.addEventListener("click", function () { fileInput.click(); });
    dropzone.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        fileInput.click();
      }
    });

    /* ── Drag & Drop ── */
    var dragCount = 0;

    dropzone.addEventListener("dragenter", function (e) {
      e.preventDefault();
      dragCount++;
      dropzone.classList.add("is-dragging");
    });

    dropzone.addEventListener("dragover", function (e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    });

    dropzone.addEventListener("dragleave", function () {
      dragCount--;
      if (dragCount <= 0) {
        dragCount = 0;
        dropzone.classList.remove("is-dragging");
      }
    });

    dropzone.addEventListener("drop", function (e) {
      e.preventDefault();
      dragCount = 0;
      dropzone.classList.remove("is-dragging");
      var dropped = e.dataTransfer && e.dataTransfer.files;
      if (dropped) processFiles(dropped);
    });

    /* ── Input de archivos ── */
    fileInput.addEventListener("change", function () {
      processFiles(fileInput.files);
      fileInput.value = "";
    });

    /* ── Validación de formato: extensión + MIME real del navegador ──
       (La validación definitiva por bytes se hace en el backend al subir.) */
    function fileExt(name) {
      var m = String(name).toLowerCase().match(/\.([a-z0-9]+)$/);
      return m ? m[1] : "";
    }
    function fileKind(f) {
      var ext  = fileExt(f.name);
      var mime = (f.type || "").toLowerCase();
      var extOk  = CONFIG.allowedExts.indexOf(ext) !== -1;
      /* Si el navegador entrega MIME, debe coincidir; si viene vacío, se valida por extensión */
      var mimeOk = mime ? CONFIG.allowedTypes.indexOf(mime) !== -1 : true;
      if (!extOk || !mimeOk) return null;
      return (ext === "pdf" || mime === "application/pdf") ? "pdf" : "image";
    }

    /* ── Procesar archivos (imágenes y PDF) ── */
    function processFiles(fileList) {
      var arr = Array.from(fileList);
      var valid = arr.filter(function (f) {
        if (!fileKind(f)) {
          showToast("⚠️ " + f.name + " no es un formato permitido (JPG, PNG, WEBP o PDF)");
          return false;
        }
        if (f.size > CONFIG.maxFileSizeMB * 1024 * 1024) {
          showToast("⚠️ " + f.name + " supera los " + CONFIG.maxFileSizeMB + "MB");
          return false;
        }
        return true;
      });

      /* Límite máximo */
      var available = CONFIG.maxFiles - files.length;
      if (valid.length > available) {
        showToast("Máximo " + CONFIG.maxFiles + " archivos. Solo se agregaron " + available + ".");
        valid = valid.slice(0, available);
      }

      valid.forEach(function (f) {
        var kind = fileKind(f);
        var entry = {
          id: Date.now() + "_" + Math.random().toString(36).slice(2, 8),
          url: "",
          name: f.name,
          size: f.size,
          kind: kind
        };
        if (kind === "image") {
          var reader = new FileReader();
          reader.onload = function (e) {
            entry.url = e.target.result;
            files.push(entry);
            renderThumbs();
            updateTotal();
          };
          reader.readAsDataURL(f);
        } else {
          /* PDF: no se previsualiza como imagen; se muestra ficha con icono */
          files.push(entry);
          renderThumbs();
          updateTotal();
        }
      });
    }

    /* ── Renderizar miniaturas ── */
    function renderThumbs() {
      if (!thumbsContainer) return;

      if (dropzone) dropzone.classList.toggle("has-files", files.length > 0);

      if (!files.length) {
        thumbsContainer.innerHTML = "";
        thumbsContainer.style.display = "none";
        return;
      }

      thumbsContainer.style.display = "grid";
      var removeSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">' +
        '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

      thumbsContainer.innerHTML = files.map(function (f) {
        if (f.kind === "pdf") {
          return '<div class="thumb-item thumb-item--pdf" role="figure" aria-label="PDF: ' + sanitize(f.name) + '">' +
            '<span class="thumb-item__pdf" aria-hidden="true">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' +
            '<b>PDF</b></span>' +
            '<span class="thumb-item__name">' + sanitize(f.name) + '</span>' +
            '<button class="thumb-item__remove" data-id="' + sanitize(f.id) + '" aria-label="Eliminar ' + sanitize(f.name) + '">' + removeSvg + '</button>' +
            '</div>';
        }
        return '<div class="thumb-item" role="figure" aria-label="Foto: ' + sanitize(f.name) + '">' +
          '<img src="' + f.url + '" alt="' + sanitize(f.name) + '" loading="lazy">' +
          '<span class="thumb-item__badge">' + sanitize(config.size) + '</span>' +
          '<button class="thumb-item__remove" data-id="' + sanitize(f.id) + '" ' +
          'aria-label="Eliminar foto ' + sanitize(f.name) + '">' + removeSvg + '</button>' +
          '</div>';
      }).join("");

      /* Botones de eliminar */
      qsa(".thumb-item__remove", thumbsContainer).forEach(function (btn) {
        btn.addEventListener("click", function (e) {
          e.stopPropagation();
          var id = btn.getAttribute("data-id");
          files = files.filter(function (f) { return f.id !== id; });
          renderThumbs();
          updateTotal();
          showToast("Foto eliminada");
        });
      });
    }

    /* ── Chips de tamaño ── */
    qsa("[data-size]").forEach(function (chip) {
      chip.addEventListener("click", function () {
        qsa("[data-size]").forEach(function (c) {
          c.classList.remove("is-selected");
          c.setAttribute("aria-pressed", "false");
        });
        chip.classList.add("is-selected");
        chip.setAttribute("aria-pressed", "true");
        config.size = chip.dataset.size;
        renderThumbs();
        updateTotal();
      });
    });

    /* ── Chips de acabado ── */
    qsa("[data-finish]").forEach(function (chip) {
      chip.addEventListener("click", function () {
        qsa("[data-finish]").forEach(function (c) {
          c.classList.remove("is-selected");
          c.setAttribute("aria-pressed", "false");
        });
        chip.classList.add("is-selected");
        chip.setAttribute("aria-pressed", "true");
        config.finish = chip.dataset.finish;
      });
    });

    /* ── Cantidad ── */
    var qtyMinus = qs("#qty-minus");
    var qtyPlus  = qs("#qty-plus");

    if (qtyMinus) {
      qtyMinus.addEventListener("click", function () {
        config.qty = Math.max(1, config.qty - 1);
        if (qtyValEl) {
          qtyValEl.textContent = config.qty;
          qtyValEl.setAttribute("aria-live", "polite");
        }
        updateTotal();
      });
    }

    if (qtyPlus) {
      qtyPlus.addEventListener("click", function () {
        config.qty = Math.min(100, config.qty + 1);
        if (qtyValEl) {
          qtyValEl.textContent = config.qty;
          qtyValEl.setAttribute("aria-live", "polite");
        }
        updateTotal();
      });
    }

    /* ── Actualizar totales ── */
    function updateTotal() {
      var images = files.filter(function (f) { return f.kind !== "pdf"; });
      var pdfs   = files.filter(function (f) { return f.kind === "pdf"; });
      var nFotos = images.length;
      var nCopias = nFotos * config.qty;
      var unitPrice = CONFIG.prices[config.size];

      if (totalFotosEl)  totalFotosEl.textContent = nFotos;
      if (totalCopiasEl) totalCopiasEl.textContent = nCopias;

      /* Línea de documentos PDF (solo visible si hay) */
      var pdfLine = qs("#total-pdf-line");
      var pdfVal  = qs("#total-pdf");
      if (pdfLine) pdfLine.style.display = pdfs.length ? "" : "none";
      if (pdfVal)  pdfVal.textContent = pdfs.length;

      if (totalPrecioEl) {
        if (nFotos > 0 && typeof unitPrice === "number" && unitPrice > 0) {
          totalPrecioEl.textContent = formatMXN(nCopias * unitPrice);
        } else {
          totalPrecioEl.textContent = "Cotizar";
        }
      }

      if (totalNoteEl) {
        if (nFotos > 0 && typeof unitPrice === "number" && unitPrice > 0) {
          totalNoteEl.textContent =
            "Precio unitario: " + formatMXN(unitPrice) + " MXN por copia " + config.size + "." +
            (pdfs.length ? " La impresión de PDF se cotiza aparte." : " El precio final puede variar según acabado y cantidad.");
        } else if (pdfs.length && nFotos === 0) {
          totalNoteEl.textContent = "Cotizamos la impresión de tus PDF al recibirlos por WhatsApp.";
        } else {
          totalNoteEl.textContent =
            "El gran formato se cotiza según medidas y material. ¡Escríbenos para un precio personalizado!";
        }
      }

      if (sendBtn) {
        sendBtn.disabled = files.length === 0;
        sendBtn.setAttribute("aria-disabled", files.length === 0 ? "true" : "false");
      }
    }

    /* ── Enviar pedido por WhatsApp ── */
    if (sendBtn) {
      sendBtn.addEventListener("click", function () {
        if (!files.length) return;

        var images = files.filter(function (f) { return f.kind !== "pdf"; });
        var pdfs   = files.filter(function (f) { return f.kind === "pdf"; });
        var nFotos = images.length;
        var nCopias = nFotos * config.qty;
        var unitPrice = CONFIG.prices[config.size];
        var totalStr = (nFotos > 0 && typeof unitPrice === "number" && unitPrice > 0)
          ? formatMXN(nCopias * unitPrice) + " MXN aprox."
          : "Por cotizar";

        var msg =
          "¡Hola Ok.station! 🖨️ Quiero imprimir mis archivos:\n\n" +
          (nFotos
            ? "🖼️ Fotos distintas: " + nFotos + "\n" +
              "📐 Tamaño: " + config.size + "\n" +
              "✨ Acabado: " + config.finish + "\n" +
              "🔢 Copias por foto: " + config.qty + "\n" +
              "📦 Total de copias: " + nCopias + "\n" +
              "💵 Total estimado: " + totalStr + "\n"
            : "") +
          (pdfs.length ? "📄 Documentos PDF: " + pdfs.length + "\n" : "") +
          "\nEn seguida les envío los archivos por este chat. 🙌\n" +
          "_Pedido generado desde okstation.mx_";

        window.open(waLink(msg), "_blank", "noopener,noreferrer");
        showToast("¡Abriendo WhatsApp! Adjunta tus fotos en el chat 📲");
      });
    }

    /* Inicializar */
    updateTotal();
  }


  /* ============================================================
     07. BOTÓN SCROLL-TO-TOP
     ============================================================ */
  function initScrollTop() {
    var btn = qs(".scroll-top");
    if (!btn) return;

    function toggleVisible() {
      btn.classList.toggle("is-visible", window.scrollY > 400);
    }

    window.addEventListener("scroll", toggleVisible, { passive: true });
    toggleVisible();

    btn.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }


  /* ============================================================
     08. TOAST NOTIFICATIONS
     ============================================================ */
  var toastEl;
  var toastTimer;

  function showToast(msg) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "toast";
      toastEl.setAttribute("role", "status");
      toastEl.setAttribute("aria-live", "polite");
      toastEl.setAttribute("aria-atomic", "true");
      toastEl.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<polyline points="20 6 9 17 4 12"></polyline></svg>' +
        '<span class="toast__msg"></span>';
      document.body.appendChild(toastEl);
    }

    var msgEl = qs(".toast__msg", toastEl);
    if (msgEl) msgEl.textContent = msg;

    toastEl.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove("is-visible");
    }, 3400);
  }

  /* Exponer globalmente para uso desde HTML si es necesario */
  window.OKStation = window.OKStation || {};
  window.OKStation.showToast = showToast;


  /* ============================================================
     09. INICIALIZACIÓN
     ============================================================ */
  /* Galería del local: si una foto aún no existe, se elimina el <img> y queda
     visible el placeholder con su etiqueta (sin icono de imagen rota). */
  /* Fundido suave de imágenes al cargar (evita el "pop" poco profesional).
     El modo fade solo se activa si este script corre; así, sin JS, las
     imágenes se ven normal y nunca se quedan invisibles. */
  function initImageFade() {
    document.documentElement.classList.add("img-fade");
    /* Fallback de marca: si la imagen de una tarjeta de servicio no carga,
       se sustituye por el placeholder en vez de mostrar el icono roto. La
       galería del local se maneja aparte (initGallery: quita el <img>). */
    var SERVICE_FALLBACK = "assets/img/placeholder-servicio.svg";
    qsa(".service-card__img, .store-gallery__item img").forEach(function (img) {
      function onError() {
        if (img.classList.contains("service-card__img") &&
            img.getAttribute("src") !== SERVICE_FALLBACK) {
          img.src = SERVICE_FALLBACK;
        }
        img.classList.add("is-loaded");
      }
      if (img.complete && img.naturalWidth > 0) { img.classList.add("is-loaded"); return; }
      if (img.complete && img.naturalWidth === 0) { onError(); return; }
      img.addEventListener("load", function () { img.classList.add("is-loaded"); });
      img.addEventListener("error", onError);
    });
  }

  function initGallery() {
    qsa(".store-gallery__item img").forEach(function (img) {
      function fail() { if (img.parentNode) img.remove(); }
      // Si ya falló antes de que corriera este script (defer), quítala ya.
      if (img.complete && img.naturalWidth === 0) { fail(); return; }
      img.addEventListener("error", fail);
      img.addEventListener("load", function () { if (img.naturalWidth === 0) fail(); });
    });
  }

  /* Carruseles (Servicios y Trámites): envuelve la fila y le agrega flechas ‹ ›.
     No toca el HTML fuente; las flechas se inyectan aquí. En móvil se ocultan
     (se desliza con el dedo). */
  function initCarousels() {
    qsa(".services-grid, .tramite-grid").forEach(function (track) {
      if (track.dataset.carousel) return;
      track.dataset.carousel = "1";

      var wrap = document.createElement("div");
      wrap.className = "carousel";
      track.parentNode.insertBefore(wrap, track);
      wrap.appendChild(track);

      function arrow(dir, label, pts) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "carousel__arrow carousel__arrow--" + dir;
        b.setAttribute("aria-label", label);
        b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="' + pts + '"/></svg>';
        return b;
      }
      var prev = arrow("prev", "Anterior", "15 18 9 12 15 6");
      var next = arrow("next", "Siguiente", "9 18 15 12 9 6");
      wrap.appendChild(prev);
      wrap.appendChild(next);

      /* ── Bucle infinito tipo "Netflix" ──────────────────────────────────────
         Solo en .services-grid (sus tarjetas son enlaces estáticos y se pueden clonar
         sin perder lógica; .tramite-grid tiene botones con listeners propios → no se
         clona). Técnica: clonamos el juego completo de tarjetas ANTES y DESPUÉS de las
         originales → [L][originales][R]. Navegamos siempre por la banda central y, al
         cruzar hacia un grupo clonado, "teletransportamos" el scroll un periodo completo
         (instantáneo y sin animación). Como el contenido es idéntico, el salto es
         invisible: el carrusel parece girar sin fin en ambos sentidos. */
      /* Bucle infinito tipo "Netflix" en AMBOS carruseles (Servicios y Trámites):
         las tarjetas dan vuelta sin tope. Para que las tarjetas CLONADAS de
         Trámites sigan respondiendo al clic, su selección usa DELEGACIÓN de
         eventos (ver initCitas), no un listener por tarjeta. */
      var canLoop = true;
      var originals = Array.prototype.slice.call(track.children);
      var looping = false;
      var period = 0;   /* ancho de un juego completo (distancia de teletransporte) */

      function overflowing() { return track.scrollWidth - track.clientWidth > 4; }

      function neutralizeClone(node) {
        node.setAttribute("aria-hidden", "true");
        node.classList.add("is-clone");
        node.removeAttribute("id");
        var ided = node.querySelectorAll("[id]");
        Array.prototype.forEach.call(ided, function (el) { el.removeAttribute("id"); });
        /* fuera del orden de tabulación (son contenido duplicado) */
        var foc = node.querySelectorAll("a, button, input, select, textarea, [tabindex]");
        Array.prototype.forEach.call(foc, function (el) { el.setAttribute("tabindex", "-1"); });
        /* muestra ya las imágenes del clon sin esperar el evento 'load' del original */
        var imgs = node.querySelectorAll(".service-card__img");
        Array.prototype.forEach.call(imgs, function (im) { im.classList.add("is-loaded"); });
      }

      function measurePeriod() {
        var n = originals.length;
        if (n === 0) { period = 0; return; }
        /* distancia entre la 1ª original (índice n, ya con el grupo L delante) y su clon
           en el grupo R (índice 2n) = un juego completo, con sus gaps incluidos. */
        period = posOf(track.children[2 * n]) - posOf(track.children[n]);
      }

      function buildLoop() {
        if (looping || !canLoop || originals.length === 0) return;
        var before = document.createDocumentFragment();
        var after = document.createDocumentFragment();
        originals.forEach(function (el) {
          var a = el.cloneNode(true); neutralizeClone(a); before.appendChild(a);
          var b = el.cloneNode(true); neutralizeClone(b); after.appendChild(b);
        });
        track.insertBefore(before, originals[0]);
        track.appendChild(after);
        looping = true;
        measurePeriod();
        jumpTo(period);   /* arranca en la banda central (originales) */
      }

      /* Salto instantáneo de scroll (sin animación); desactiva el snap durante el salto. */
      function jumpTo(x) {
        track.style.scrollSnapType = "none";
        track.scrollLeft = x;
        requestAnimationFrame(function () { if (!rafId) track.style.scrollSnapType = ""; });
      }

      /* Reposiciona el scroll dentro de la banda central de las originales usando
         aritmética modular: cualquier posición se mapea a su equivalente visual exacto. */
      function normalize() {
        if (!looping || period <= 0) return;
        var sl = track.scrollLeft;
        var norm = period + (((sl - period) % period) + period) % period;
        if (Math.abs(norm - sl) > 0.5) track.scrollLeft = norm;
      }

      function update() {
        /* En modo bucle siempre hay desbordamiento (3 juegos) → flechas visibles. */
        var overflow = looping || overflowing();
        prev.style.display = next.style.display = overflow ? "" : "none";
        prev.disabled = false;
        next.disabled = false;
      }

      /* Desplazamiento suave con easing. Mantiene un "objetivo" (targetScroll) para que
         varios clics seguidos se ACUMULEN en vez de pelearse: cada clic calcula el siguiente
         destino a partir de hacia dónde ya vamos, no de la posición a medio animar. La
         animación previa se cancela (cancelAnimationFrame) antes de lanzar la nueva, así no
         hay dos rAF escribiendo scrollLeft a la vez. Al asentarse, normalize() hace el
         teletransporte invisible que cierra el ciclo. */
      function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
      var rafId = null, targetScroll = null;
      function settle() {
        rafId = null; targetScroll = null;
        normalize();                       /* cierra el ciclo sin que se note */
        track.style.scrollSnapType = "";
        update();
      }
      function glide(to) {
        var max = track.scrollWidth - track.clientWidth;
        to = Math.max(0, Math.min(to, max));   /* el navegador recorta igual; lo hacemos explícito */
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        var start = track.scrollLeft, dist = to - start;
        targetScroll = to;
        if (Math.abs(dist) < 1) { settle(); return; }
        track.style.scrollSnapType = "none";   /* evita que el snap pelee con la animación */
        var t0 = null, dur = 320;
        function frame(ts) {
          if (t0 === null) t0 = ts;
          var p = Math.min(1, (ts - t0) / dur);
          track.scrollLeft = start + dist * easeOutCubic(p);
          if (p < 1) { rafId = requestAnimationFrame(frame); }
          else { settle(); }
        }
        rafId = requestAnimationFrame(frame);
      }
      /* Avanza/retrocede a la tarjeta siguiente/anterior (alineada).
         Usa getBoundingClientRect (posición real) en vez de offsetLeft: así NO depende
         de qué elemento sea el offsetParent ni del padding del carrusel (evita que el
         primer clic "se trabe"). En modo bucle SIEMPRE hay una tarjeta vecina (los clones
         de L/R), así que el avance nunca topa con un borde: el ciclo es continuo. */
      function posOf(el) { return el.getBoundingClientRect().left - track.getBoundingClientRect().left + track.scrollLeft; }
      function go(dir) {
        var max = track.scrollWidth - track.clientWidth, list = track.children, target = null, i, x;
        /* Punto de partida: si estamos animando, el destino en curso (para acumular clics
           rápidos); si no, la posición actual. */
        var sl = (targetScroll !== null) ? targetScroll : track.scrollLeft;
        if (dir > 0) {
          for (i = 0; i < list.length; i++) { x = posOf(list[i]); if (x > sl + 2) { target = x; break; } }
          if (target === null) { if (looping) return; if (sl >= max - 2) { glide(0); return; } target = max; }
        } else {
          for (i = list.length - 1; i >= 0; i--) { x = posOf(list[i]); if (x < sl - 2) { target = x; break; } }
          if (target === null) { if (looping) return; if (sl <= 2) { glide(max); return; } target = 0; }
        }
        glide(target);
      }
      prev.addEventListener("click", function () { go(-1); });
      next.addEventListener("click", function () { go(1); });
      /* Deslizamiento táctil: solo renormaliza cerca de los bordes físicos (a menos de una
         tarjeta de quedarnos sin clones) para no cortar la inercia del scroll en el centro. */
      track.addEventListener("scroll", function () {
        update();
        if (looping && !rafId && period > 0) {
          var sl = track.scrollLeft, max = track.scrollWidth - track.clientWidth;
          var pitch = period / originals.length;
          if (sl < pitch || sl > max - pitch) normalize();
        }
      }, { passive: true });
      function onResize() {
        update();
        if (looping && !rafId) { measurePeriod(); normalize(); }
      }
      window.addEventListener("resize", onResize);
      /* Recalcula cuando el carrusel pasa de oculto a visible (paso del wizard) y activa el
         bucle en cuanto haya desbordamiento (p. ej. tras cargar la tipografía/imágenes). */
      if (window.ResizeObserver) {
        new ResizeObserver(function () {
          if (canLoop && !looping && overflowing()) buildLoop();
          onResize();
        }).observe(track);
      }
      /* Activa el bucle de entrada si ya desborda; si no (p. ej. 3 tarjetas que caben y van
         centradas), se queda como fila estática y el ResizeObserver lo activará si hiciera
         falta. */
      if (canLoop && overflowing()) buildLoop();
      update();
    });
  }

  // Fondo reactivo: un resplandor de marca sigue el cursor (solo en
  // dispositivos con puntero fino y si el usuario no pidió menos movimiento).
  function initCursorGlow() {
    try {
      if (document.body.classList.contains("admin")) return;
      var fine = window.matchMedia && window.matchMedia("(pointer: fine)").matches;
      var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!fine || reduce) return;

      var glow = document.createElement("div");
      glow.id = "oks-cursor-glow";
      document.body.appendChild(glow);

      var x = 0, y = 0, ticking = false;
      function paint() {
        ticking = false;
        glow.style.transform = "translate(" + x + "px," + y + "px)";
      }
      window.addEventListener("pointermove", function (e) {
        if (e.pointerType === "touch") return;
        x = e.clientX;
        y = e.clientY;
        if (!glow.classList.contains("is-on")) glow.classList.add("is-on");
        if (!ticking) { ticking = true; requestAnimationFrame(paint); }
      }, { passive: true });
      window.addEventListener("blur", function () { glow.classList.remove("is-on"); });
    } catch (_) {}
  }

  function init() {
    initHeader();
    initReveal();
    initFAQ();
    initCitas();
    initFotos();
    initScrollTop();
    initImageFade();
    initGallery();
    initCarousels();
    initCursorGlow();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();