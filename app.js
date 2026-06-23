/* ============================================================
   OK.station — Aplicación Principal v2.0
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
      "6x4": 6,
      "10x15": 8,
      "13x18": 15,
      "20x30": 60,
      "30x40": 120,
      "Gran formato 24\"": 0
    }
  };

  /* Selector seguro */
  function qs(sel, ctx) {
    return (ctx || document).querySelector(sel);
  }

  function qsa(sel, ctx) {
    return Array.from((ctx || document).querySelectorAll(sel));
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
      nombre: "", tel: "", notas: ""
    };

    var TOTAL_STEPS = 5;           /* Servicio → Cantidad → Fecha → Datos → Confirmación */

    /* Referencias DOM */
    var stepsEl   = qsa(".step-item");
    var stepPanels = qsa(".cita-step");
    var dateInput = qs("#cita-fecha");
    var nameInput = qs("#cita-nombre");
    var telInput  = qs("#cita-tel");
    var notesInput = qs("#cita-notas");
    var summaryEl = qs("#cita-resumen");

    if (!stepPanels.length) return;

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
      });
    }

    /* Ir a paso N */
    function goToStep(n) {
      var next = Math.max(0, Math.min(TOTAL_STEPS - 1, n));

      /* Completar datos desde inputs */
      if (nameInput) state.nombre = nameInput.value.trim();
      if (telInput)  state.tel    = telInput.value.trim();
      if (notesInput) state.notas  = notesInput.value.trim();

      state.step = next;

      if (next === TOTAL_STEPS - 1) buildSummary();

      renderSteps();

      /* Mover foco al título del nuevo paso */
      var panel = stepPanels[next];
      if (panel) {
        var heading = qs("h4, h3", panel);
        if (heading) {
          heading.setAttribute("tabindex", "-1");
          heading.focus();
          setTimeout(function () { heading.removeAttribute("tabindex"); }, 500);
        }
      }

      /* Scroll al wizard */
      var y = section.getBoundingClientRect().top + window.scrollY - 90;
      window.scrollTo({ top: y, behavior: "smooth" });
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
      qsa(".tramite-btn, .extra-card").forEach(function (b) {
        var active = (b === el);
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

    qsa(".tramite-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.dataset.tramite;
        selectService(id, btn);
        if (id === "pasaporte") openSubtypeModal();   /* caso especial: subtipo obligatorio */
      });
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

    /* Nivel de disponibilidad "de base" (cosmético y DETERMINISTA por fecha) para que el
       calendario no se vea 100% libre y dé impresión de un negocio con demanda. La ocupación
       REAL del servidor (mid/none) siempre manda; esto solo varía los días que el backend
       reporta como totalmente libres. Mantiene la mayoría de días reservables (no aleatorio,
       estable entre recargas). */
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
      var diffDays = Math.round((date - today0) / 86400000);
      var h = dayHash(date);
      if (diffDays <= 3) return h < 35 ? "mid" : "full";  /* días próximos: nunca "sin disponibilidad" */
      if (h < 18) return "none";                          /* ~18% se ven sin disponibilidad */
      if (h < 50) return "mid";                           /* ~32% disponibilidad media */
      return "full";                                      /* ~50% disponibilidad total */
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
        /* La ocupación real del servidor manda; si reporta "full" (o nada), usamos el nivel de base. */
        var serverLvl = occByDate[iso];
        var lvl = (serverLvl && serverLvl !== "full") ? serverLvl : baseLevelFor(date);
        var closed = !dayIsOpen(date) || date < minDate || date > maxDate;   /* cerrado/fuera de ventana */
        var disabled = closed || lvl === "none";                            /* "sin disponibilidad" no es reservable */
        /* Texto/icono además del color para usuarios daltónicos (A1):
           el título describe la disponibilidad y se suma al aria-label. */
        var occText = { full: "disponibilidad total", mid: "disponibilidad media", none: "sin disponibilidad" };
        var availLabel = occText[lvl] || "";
        var dot = !closed
          ? '<i class="okcal-dot okcal-dot--' + lvl + '" title="' + availLabel + '" aria-hidden="true"></i>'
          : '<i class="okcal-dot" style="visibility:hidden" aria-hidden="true"></i>';
        var ariaLabel = d + " de " + MESES[m] + (closed ? "" : (availLabel ? ", " + availLabel : ""));
        cells += '<button type="button" class="okcal__day' + (selected ? " is-selected" : "") + '" ' +
          'data-date="' + isoOf(date) + '"' +
          (disabled ? ' disabled aria-disabled="true"' : "") +
          ' aria-label="' + ariaLabel + '"><span>' + d + "</span>" + dot + "</button>";
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
      var mailOk     = !mailVal || EMAIL_RE.test(mailVal);
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

    if (nameInput)  nameInput.addEventListener("input", validateStep2);
    if (telInput)   telInput.addEventListener("input", validateStep2);
    if (emailInput) emailInput.addEventListener("input", validateStep2);
    qsa("input[name='cita-contacto']", section).forEach(function (r) {
      r.addEventListener("change", validateStep2);
    });
    var aceptoEl = qs("#cita-acepto");
    if (aceptoEl) aceptoEl.addEventListener("change", validateStep2);

    /* Construir resumen */
    function buildSummary() {
      if (!summaryEl) return;

      var rows = [
        ["Servicio", sanitize(state.tramiteLabel)]
      ];
      if (state.tramite === "pasaporte" && state.subtype) {
        rows.push(["Tipo de pasaporte", sanitize(SUBTYPE_LABEL[state.subtype] || state.subtype)]);
      }
      rows.push(["Personas", sanitize(String(state.partySize) + (state.partySize === 1 ? " (solo yo)" : ""))]);
      rows.push(["Duración estimada", sanitize(fmtDuration(durationMins(state.partySize)))]);
      rows.push(["Nombre",   sanitize(state.nombre || "—")]);
      rows.push(["Teléfono", sanitize(state.tel || "—")]);
      rows.push(["Fecha",    sanitize(formatDate(state.fecha))]);
      rows.push(["Hora",     sanitize(state.hora) + " hrs"]);
      if (state.notas) rows.push(["Notas", sanitize(state.notas)]);

      summaryEl.innerHTML = rows.map(function (r) {
        return '<div class="cita-summary__row">' +
          '<span>' + r[0] + '</span>' +
          '<b>' + r[1] + '</b>' +
          '</div>';
      }).join("");

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
    function submitCita() {
      if (!confirmBtn || confirmBtn.disabled) return;
      var emailEl = qs("#cita-correo");
      var prefEl  = qs("input[name='cita-contacto']:checked", section);
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
        notes: state.notas || ""
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
              successEl.innerHTML =
                '<div class="cita-confirm__check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg></div>' +
                '<h4>¡Cita registrada!</h4>' +
                '<p>Tu folio es <b>' + sanitize(j.appointment.code) + '</b>. Te contactaremos para confirmar tu cita.</p>' +
                '<a class="btn btn--light btn--sm" id="cita-ticket-dl" style="margin-top:12px" download="cita-' + sanitize(j.appointment.code) + '.pdf" href="#">Descargar comprobante (PDF)</a>';
              /* Genera el comprobante PDF con el módulo compartido (si está disponible) */
              try {
                var citaUri = window.OKCitaTicket ? window.OKCitaTicket({
                  code: j.appointment.code, tramite: j.appointment.tramite,
                  passport_subtype: j.appointment.passport_subtype, party_size: j.appointment.party_size,
                  date: j.appointment.date, time: j.appointment.time, status: j.appointment.status,
                  name: state.nombre, phone: state.tel
                }) : null;
                var dlBtn = qs("#cita-ticket-dl", successEl);
                if (citaUri && dlBtn) dlBtn.href = citaUri;
                else if (dlBtn) dlBtn.style.display = "none";
              } catch (e) {
                var dlErr = qs("#cita-ticket-dl", successEl);
                if (dlErr) dlErr.style.display = "none";
              }
            }
            if (confirmIntro) confirmIntro.style.display = "none"; /* evita doble palomita */
            if (summaryEl) summaryEl.style.display = "none";
            confirmBtn.style.display = "none";
            showToast("¡Cita registrada! Folio " + j.appointment.code);
            try { sessionStorage.removeItem("okstation.cita.draft"); } catch (_) {}
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
        state = { step: 0, tramite: null, tramiteLabel: "", subtype: "", partySize: 1, partyLabel: "Solo yo", fecha: "", hora: "", nombre: "", tel: "", notas: "" };

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
          "¡Hola OK.station! 🖨️ Quiero imprimir mis archivos:\n\n" +
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
    qsa(".service-card__img, .store-gallery__item img").forEach(function (img) {
      if (img.complete && img.naturalWidth > 0) { img.classList.add("is-loaded"); return; }
      img.addEventListener("load", function () { img.classList.add("is-loaded"); });
      img.addEventListener("error", function () { img.classList.add("is-loaded"); });
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

      function update() {
        var overflow = track.scrollWidth - track.clientWidth > 4;
        prev.style.display = next.style.display = overflow ? "" : "none";
        if (!overflow) return;
        prev.disabled = track.scrollLeft <= 2;
        next.disabled = track.scrollLeft >= (track.scrollWidth - track.clientWidth - 2);
      }

      /* Desplazamiento suave con easing (más suave que el scroll nativo). */
      function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
      var animating = false;
      function glide(to) {
        to = Math.max(0, Math.min(to, track.scrollWidth - track.clientWidth));
        var start = track.scrollLeft, dist = to - start;
        if (Math.abs(dist) < 1) return;
        animating = true;
        track.style.scrollSnapType = "none";   /* evita que el snap pelee con la animación */
        var t0 = null, dur = 560;
        function frame(ts) {
          if (t0 === null) t0 = ts;
          var p = Math.min(1, (ts - t0) / dur);
          track.scrollLeft = start + dist * easeInOutCubic(p);
          if (p < 1) { requestAnimationFrame(frame); }
          else { track.style.scrollSnapType = ""; animating = false; update(); }
        }
        requestAnimationFrame(frame);
      }
      /* Avanza/retrocede a la tarjeta siguiente/anterior (alineada). */
      function go(dir) {
        var sl = track.scrollLeft, list = track.children, target = null, i;
        if (dir > 0) {
          for (i = 0; i < list.length; i++) { if (list[i].offsetLeft > sl + 2) { target = list[i].offsetLeft; break; } }
          if (target === null) target = track.scrollWidth;
        } else {
          for (i = list.length - 1; i >= 0; i--) { if (list[i].offsetLeft < sl - 2) { target = list[i].offsetLeft; break; } }
          if (target === null) target = 0;
        }
        glide(target);
      }
      prev.addEventListener("click", function () { go(-1); });
      next.addEventListener("click", function () { go(1); });
      track.addEventListener("scroll", update, { passive: true });
      window.addEventListener("resize", update);
      /* Recalcula cuando el carrusel pasa de oculto a visible (paso del wizard). */
      if (window.ResizeObserver) { new ResizeObserver(update).observe(track); }
      update();
    });
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
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();