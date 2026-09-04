
(function () {
  "use strict";

  var CONFIG = {
    whatsapp: "526647194117",
    maxFileSizeMB: 25,
    maxFiles: 30,
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

  function qs(sel, ctx) {
    return (ctx || document).querySelector(sel);
  }

  function qsa(sel, ctx) {
    return Array.from((ctx || document).querySelectorAll(sel));
  }

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
    } catch (e) {   }
  }
  function attachFieldFilter(el, re, max) {
    if (!el) return;
    el.addEventListener("input", function () { cleanFieldValue(el, re, max); });
  }

  function waLink(text) {
    return "https://wa.me/" + CONFIG.whatsapp + "?text=" + encodeURIComponent(text);
  }

  function sanitize(str) {
    var el = document.createElement("div");
    el.textContent = String(str || "");
    return el.innerHTML;
  }

  function formatDate(iso) {
    if (!iso) return "—";
    var p = iso.split("-");
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    var dias = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
    var meses = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
    return dias[d.getDay()] + " " + d.getDate() + " de " + meses[d.getMonth()] + " de " + d.getFullYear();
  }

  function formatMXN(amount) {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  }

  function debounce(fn, delay) {
    var timer;
    return function () {
      clearTimeout(timer);
      var args = arguments;
      var ctx = this;
      timer = setTimeout(function () { fn.apply(ctx, args); }, delay);
    };
  }


  function initHeader() {
    var header = qs(".site-header");
    if (!header) return;

    function updateScrolled() {
      header.classList.toggle("is-scrolled", window.scrollY > 16);
    }
    window.addEventListener("scroll", updateScrolled, { passive: true });
    updateScrolled();

    var toggle = qs(".nav__toggle");
    var navLinks = qs(".nav__links");
    var overlay;

    if (toggle && navLinks) {
      overlay = document.createElement("div");
      overlay.className = "nav-overlay";
      overlay.setAttribute("aria-hidden", "true");
      overlay.style.cssText =
        "position:fixed;inset:0;z-index:98;background:rgba(0,0,0,0.45);" +
        "opacity:0;pointer-events:none;transition:opacity 0.22s ease;" +
        "backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);";
      document.body.insertBefore(overlay, document.body.firstChild);

      function preventBgScroll(e) {
        if (navLinks && navLinks.contains(e.target)) return;
        e.preventDefault();
      }
      function lockScroll() {
        document.documentElement.style.overflow = "hidden";
        document.body.style.overflow = "hidden";
        document.addEventListener("touchmove", preventBgScroll, { passive: false });
      }
      function unlockScroll() {
        document.documentElement.style.overflow = "";
        document.body.style.overflow = "";
        document.removeEventListener("touchmove", preventBgScroll, { passive: false });
      }

      function openMenu() {
        navLinks.classList.add("is-open");
        toggle.setAttribute("aria-expanded", "true");
        overlay.style.opacity = "1";
        overlay.style.pointerEvents = "auto";
        lockScroll();
        var firstLink = qs("a, button", navLinks);
        if (firstLink) firstLink.focus();
      }

      function closeMenu() {
        navLinks.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
        overlay.style.opacity = "0";
        overlay.style.pointerEvents = "none";
        unlockScroll();
        toggle.focus();
      }

      toggle.addEventListener("click", function () {
        var isOpen = navLinks.classList.contains("is-open");
        if (isOpen) closeMenu();
        else openMenu();
      });

      overlay.addEventListener("click", closeMenu);

      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && navLinks.classList.contains("is-open")) {
          closeMenu();
        }
      });

      qsa(".nav__link", navLinks).forEach(function (link) {
        link.addEventListener("click", closeMenu);
      });

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


  function initReveal() {
    var elements = qsa(".reveal");
    if (!elements.length) return;

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

    setTimeout(function () {
      elements.forEach(function (el) { el.classList.add("is-visible"); });
    }, 1600);
  }


  function initFAQ() {
    var items = qsa(".faq-item");
    if (!items.length) return;

    items.forEach(function (item) {
      var btn = qs(".faq-question", item);
      var answer = qs(".faq-answer", item);
      if (!btn || !answer) return;

      var answerId = "faq-ans-" + Math.random().toString(36).slice(2, 8);
      answer.id = answerId;
      btn.setAttribute("aria-controls", answerId);
      btn.setAttribute("aria-expanded", "false");

      btn.addEventListener("click", function () {
        var isOpen = item.classList.contains("is-open");

        items.forEach(function (other) {
          if (other !== item && other.classList.contains("is-open")) {
            other.classList.remove("is-open");
            var otherBtn = qs(".faq-question", other);
            if (otherBtn) otherBtn.setAttribute("aria-expanded", "false");
          }
        });

        item.classList.toggle("is-open", !isOpen);
        btn.setAttribute("aria-expanded", String(!isOpen));

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


  function initCitas() {
    var section = qs("#citas");
    if (!section) return;

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
    function serviceById(id) { for (var i = 0; i < SERVICES.length; i++) if (SERVICES[i].id === id) return SERVICES[i]; return null; }
    var SUBTYPE_LABEL = { mexicano: "Mexicano", americano: "Americano" };

    var state = {
      step: 0,
      tramite: null, tramiteLabel: "",
      subtype: "",
      pptTramite: "", pptEdad: "",
      actaState: "", actaStateLabel: "",
      partySize: 1, partyLabel: "Solo yo",
      fecha: "", hora: "",
      nombre: "", tel: "", notas: "",
      guests: [], activeGuest: 0,
      contactChoice: "", contactGuest: null
    };

    var TOTAL_STEPS = 6;

    var stepsEl   = qsa(".step-item");
    var stepPanels = qsa(".cita-step");
    var dateInput = qs("#cita-fecha");
    var nameInput = qs("#cita-nombre");
    var telInput  = qs("#cita-tel");
    var correoInput = qs("#cita-correo");
    var notesInput = qs("#cita-notas");
    var summaryEl = qs("#cita-resumen");

    if (!stepPanels.length) return;

    function tramitePriceLabel(tramite) {
      if (tramite === "acta") {
        var r = window.OKActaPriceRange ? window.OKActaPriceRange() : null;
        if (r) {
          var fm = window.OKMxn0 || function (n) { return "$" + n; };
          return (r.min === r.max) ? fm(r.min) : (fm(r.min) + " – " + fm(r.max));
        }
        return "Precio por estado";
      }
      var p = window.OKCitaPrice ? window.OKCitaPrice(tramite, null, 1) : null;
      if (!p || p.quote) return "Precio a cotizar";
      return (tramite === "pasaporte" ? "Desde " : "") + (window.OKMxn0 ? window.OKMxn0(p.unit) : ("$" + p.unit));
    }
    function initTramitePrices(tries) {
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
        var quote = (t === "acta") ? false : !(window.OKCitaPrice && !window.OKCitaPrice(t, null, 1).quote);
        el.classList.toggle("tramite-btn__price--quote", quote);
        el.textContent = tramitePriceLabel(t);
      });
    }
    window.OKRenderTramitePrices = initTramitePrices;
    setTimeout(initTramitePrices, 0);

    function renderSteps() {
      stepsEl.forEach(function (el, i) {
        el.classList.toggle("is-active", i === state.step);
        el.classList.toggle("is-done", i < state.step);
      });

      stepPanels.forEach(function (panel, i) {
        var isActive = i === state.step;
        panel.classList.toggle("is-active", isActive);
        panel.setAttribute("aria-hidden", String(!isActive));
        var stepTitle = panel.querySelector(".cita-step__title");
        if (stepTitle) {
          var isLic = state.tramite === "licencia";
          stepTitle.setAttribute("data-paso", isLic ? (i === 0 ? 1 : i) : (i + 1));
          stepTitle.setAttribute("data-pasos", isLic ? 5 : 6);
        }
      });
    }

    function goToStep(n) {
      var next = Math.max(0, Math.min(TOTAL_STEPS - 1, n));

      if (nameInput) state.nombre = nameInput.value.trim();
      if (telInput)  state.tel    = (window.OKPhone ? window.OKPhone.full(telInput) : telInput.value.trim());
      if (correoInput) state.correo = correoInput.value.trim();
      if (notesInput) state.notas  = notesInput.value.trim();

      state.step = next;

      if (next === TOTAL_STEPS - 1) buildSummary();
      if (next === 1) configurePartyStep();
      if (next === 2) renderGuests();
      if (next === 3 && calGrid) { renderCalendar(); updateCalNav(); }
      if (next === 4) renderQuienContacto();

      renderSteps();

      var panel = stepPanels[next];
      if (panel) {
        var heading = qs("h4, h3", panel);
        if (heading) {
          heading.setAttribute("tabindex", "-1");
          heading.focus({ preventScroll: true });
          setTimeout(function () { heading.removeAttribute("tabindex"); }, 500);
        }
      }

      var rect = section.getBoundingClientRect();
      var headerH = 90;
      if (rect.top < headerH - 4 || rect.top > window.innerHeight * 0.6) {
        window.scrollTo({ top: rect.top + window.scrollY - headerH, behavior: "smooth" });
      }
    }

    function updateStep0Next() {
      var nextBtn = qs("#cita-next-0");
      if (!nextBtn) return;
      var ok = !!state.tramite
        && (state.tramite !== "pasaporte" ||
            (!!state.subtype && (state.subtype !== "mexicano" || (!!state.pptTramite && !!state.pptEdad))))
        && (state.tramite !== "acta" || !!state.actaState);
      var logged = citaSessionOk();
      var note = qs("#cita-login-note");
      if (note) note.hidden = !(state.tramite && !logged);
      nextBtn.disabled = !ok || !logged;
      nextBtn.setAttribute("aria-disabled", String(!ok || !logged));
    }

    function selectService(id, el) {
      qsa(".tramite-btn, .extra-card").forEach(function (b) {
        var active = (b.dataset.tramite === id) || (b.dataset.service === id);
        b.classList.toggle("is-selected", active);
        b.setAttribute("aria-pressed", String(active));
      });
      state.tramite = id;
      var svc = serviceById(id);
      state.tramiteLabel = svc ? svc.name : id;
      if (id !== "pasaporte") state.subtype = "";
      if (id !== "acta") { state.actaState = ""; state.actaStateLabel = ""; }
      if (id === "licencia") { state.partySize = 1; state.partyLabel = "Solo yo"; }
      renderSelectedExtra();
      updateStep0Next();
      renderSteps();
      return true;
    }

    function citaSessionOk() {
      var signedIn = false;
      try { signedIn = !!localStorage.getItem("okstation.token"); } catch (e) {}
      return signedIn;
    }
    var loginNoteLink = qs("#cita-login-link");
    if (loginNoteLink) loginNoteLink.addEventListener("click", function () {
      try { sessionStorage.setItem("oks_intended", location.pathname + location.search + "#citas"); } catch (e) {}
    });

    section.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest(".tramite-btn") : null;
      if (!btn || !section.contains(btn)) return;
      var id = btn.dataset.tramite;
      if (!id) return;
      selectService(id, btn);
      if (id === "pasaporte") { openSubtypeModal(); return; }
      if (id === "acta") { openActaModal(); return; }
    });

    var subtypeModal = qs("#cita-subtype-modal");
    var subtypeExtra = subtypeModal ? qs("#cita-subtype-extra", subtypeModal) : null;
    function subtypeEsc(e) { if (e.key === "Escape") closeSubtypeModal(); }
    function subtypeSel(name) { return subtypeModal ? qs("input[name='" + name + "']:checked", subtypeModal) : null; }
    function updateSubtypeExtra() {
      var sub = subtypeSel("cita-subtype");
      var isMex = !!sub && sub.value === "mexicano";
      if (subtypeExtra) subtypeExtra.hidden = !isMex;
      var ok = false;
      if (sub) ok = (sub.value === "americano") || (isMex && !!subtypeSel("cita-ppt-tramite") && !!subtypeSel("cita-ppt-edad"));
      var confirmB = qs("#cita-subtype-confirm", subtypeModal);
      if (confirmB) { confirmB.disabled = !ok; confirmB.setAttribute("aria-disabled", String(!ok)); }
    }
    function openSubtypeModal() {
      if (!subtypeModal) return;
      subtypeModal.hidden = false;
      subtypeModal.classList.add("is-open");
      qsa("input[name='cita-subtype']", subtypeModal).forEach(function (r) { r.checked = (r.value === state.subtype); });
      qsa("input[name='cita-ppt-tramite']", subtypeModal).forEach(function (r) { r.checked = (r.value === state.pptTramite); });
      qsa("input[name='cita-ppt-edad']", subtypeModal).forEach(function (r) { r.checked = (r.value === state.pptEdad); });
      updateSubtypeExtra();
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
      qsa("input[name='cita-subtype'], input[name='cita-ppt-tramite'], input[name='cita-ppt-edad']", subtypeModal).forEach(function (r) {
        r.addEventListener("change", updateSubtypeExtra);
      });
      if (subtypeConfirm) subtypeConfirm.addEventListener("click", function () {
        var chosen = subtypeSel("cita-subtype");
        if (!chosen) return;
        if (chosen.value === "mexicano" && (!subtypeSel("cita-ppt-tramite") || !subtypeSel("cita-ppt-edad"))) return;
        state.subtype = chosen.value;
        if (chosen.value === "mexicano") {
          state.pptTramite = subtypeSel("cita-ppt-tramite").value;
          state.pptEdad    = subtypeSel("cita-ppt-edad").value;
        } else { state.pptTramite = ""; state.pptEdad = ""; }
        closeSubtypeModal();
        updateStep0Next();
      });
      qsa("[data-subtype-close]", subtypeModal).forEach(function (el) { el.addEventListener("click", closeSubtypeModal); });
    }

    var ACTA_STATES = [
      ["aguascalientes", "Aguascalientes"], ["baja_california", "Baja California"],
      ["baja_california_sur", "Baja California Sur"], ["campeche", "Campeche"], ["chiapas", "Chiapas"],
      ["chihuahua", "Chihuahua"], ["ciudad_de_mexico", "Ciudad de México"], ["coahuila", "Coahuila"],
      ["colima", "Colima"], ["durango", "Durango"], ["guanajuato", "Guanajuato"], ["guerrero", "Guerrero"],
      ["hidalgo", "Hidalgo"], ["jalisco", "Jalisco"], ["mexico", "Estado de México"], ["michoacan", "Michoacán"],
      ["morelos", "Morelos"], ["nayarit", "Nayarit"], ["nuevo_leon", "Nuevo León"], ["oaxaca", "Oaxaca"],
      ["puebla", "Puebla"], ["queretaro", "Querétaro"], ["quintana_roo", "Quintana Roo"],
      ["san_luis_potosi", "San Luis Potosí"], ["sinaloa", "Sinaloa"], ["sonora", "Sonora"], ["tabasco", "Tabasco"],
      ["tamaulipas", "Tamaulipas"], ["tlaxcala", "Tlaxcala"], ["veracruz", "Veracruz"], ["yucatan", "Yucatán"],
      ["zacatecas", "Zacatecas"]
    ];
    var actaModal   = qs("#cita-acta-modal");
    var actaHost    = actaModal ? qs("#cita-acta-states", actaModal) : null;
    var actaConfirm = actaModal ? qs("#cita-acta-confirm", actaModal) : null;
    function actaEsc(e) { if (e.key === "Escape") closeActaModal(); }
    function actaPreventScroll(e) {
      var box = actaModal ? qs(".cita-modal__box", actaModal) : null;
      if (box && box.contains(e.target)) return;
      e.preventDefault();
    }
    function actaLockScroll(lock) {
      document.documentElement.style.overflow = lock ? "hidden" : "";
      document.body.style.overflow = lock ? "hidden" : "";
      if (lock) document.addEventListener("touchmove", actaPreventScroll, { passive: false });
      else document.removeEventListener("touchmove", actaPreventScroll, { passive: false });
    }
    function renderActaStates() {
      if (!actaHost) return;
      var f = window.OKMxn0 || function (n) { return "$" + n; };
      actaHost.innerHTML = ACTA_STATES.map(function (s) {
        var slug = s[0], label = s[1];
        var p = window.OKCitaPrice ? window.OKCitaPrice("acta", slug, 1) : null;
        var price = (p && !p.quote) ? f(p.unit) : "—";
        var checked = (state.actaState === slug) ? " checked" : "";
        return '<label class="acta-opt">' +
                 '<input type="radio" name="cita-acta-state" value="' + slug + '"' + checked + '>' +
                 '<span class="acta-opt__name">' + label + '</span>' +
                 '<span class="acta-opt__price">' + price + '</span>' +
               '</label>';
      }).join("");
    }
    function actaSelectedSlug() {
      var r = actaModal ? qs("input[name='cita-acta-state']:checked", actaModal) : null;
      return r ? r.value : "";
    }
    function updateActaConfirm() {
      var ok = !!actaSelectedSlug();
      if (actaConfirm) { actaConfirm.disabled = !ok; actaConfirm.setAttribute("aria-disabled", String(!ok)); }
    }
    function openActaModal() {
      if (!actaModal) return;
      renderActaStates();
      actaModal.hidden = false;
      actaModal.classList.add("is-open");
      updateActaConfirm();
      actaLockScroll(true);
      var checked = actaModal ? qs("input[name='cita-acta-state']:checked", actaModal) : null;
      var first = checked || (actaHost ? qs("input[name='cita-acta-state']", actaHost) : null);
      if (first) first.focus();
      document.addEventListener("keydown", actaEsc);
    }
    function closeActaModal() {
      if (!actaModal) return;
      actaModal.classList.remove("is-open");
      actaModal.hidden = true;
      actaLockScroll(false);
      document.removeEventListener("keydown", actaEsc);
    }
    if (actaModal) {
      if (actaHost) actaHost.addEventListener("change", function (e) {
        if (e.target && e.target.name === "cita-acta-state") updateActaConfirm();
      });
      if (actaConfirm) actaConfirm.addEventListener("click", function () {
        var slug = actaSelectedSlug();
        if (!slug) return;
        var found = null;
        for (var i = 0; i < ACTA_STATES.length; i++) { if (ACTA_STATES[i][0] === slug) { found = ACTA_STATES[i]; break; } }
        state.actaState = slug;
        state.actaStateLabel = found ? found[1] : slug;
        state.tramiteLabel = "Acta de Nacimiento — " + state.actaStateLabel;
        closeActaModal();
        updateStep0Next();
      });
      qsa("[data-acta-close]", actaModal).forEach(function (el) { el.addEventListener("click", closeActaModal); });
    }

    var moreBtn = qs("#cita-more-btn");
    var drawer  = qs("#cita-drawer");
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
          selectService(card.dataset.service, card);
          closeDrawer();
        });
      });
    }

    var partyValEl = qs("#party-val");
    var partyDurEl = qs("#party-duration");
    var MIN_PER_PERSON = 45;
    function isLicenciaTramite() { return state.tramite === "licencia"; }
    function partyPreset(n) {
      if (n <= 1) return "Solo yo";
      if (isLicenciaTramite()) return "Grupo";
      if (n === 2) return "Pareja";
      if (n >= 3 && n <= 5) return "Familia";
      return "Grupo";
    }
    function configurePartyStep() {
      var lic = isLicenciaTramite();
      qsa(".party-opt").forEach(function (b) {
        var v = b.dataset.party;
        if (v === "2" || v === "4") b.hidden = lic;
        if (v === "grupo") {
          var sub = b.querySelector("span");
          if (sub) sub.textContent = lic ? "2 o más" : "6 o más";
        }
      });
      setParty(state.partySize);
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
        var v = b.dataset.party, on;
        if (isLicenciaTramite()) {
          on = (v === "1" && n === 1) || (v === "grupo" && n >= 2);
        } else {
          on = String(v) === String(n) ||
               (v === "grupo" && n > 5) ||
               (v === "4" && n >= 3 && n <= 5);
        }
        b.classList.toggle("is-selected", on);
        b.setAttribute("aria-pressed", String(on));
      });
      if (calGrid) {
        state.hora = "";
        renderCalendar();
        if (state.fecha) loadSlots(state.fecha); else resetSlots();
      }
    }
    qsa(".party-opt").forEach(function (b) {
      b.addEventListener("click", function () {
        var v = b.dataset.party;
        var grupoStart = isLicenciaTramite() ? 2 : 6;
        setParty(v === "grupo" ? grupoStart : parseInt(v, 10) || 1);
      });
    });
    var partyMinus = qs("#party-minus"), partyPlus = qs("#party-plus");
    if (partyMinus) partyMinus.addEventListener("click", function () { setParty(state.partySize - 1); });
    if (partyPlus)  partyPlus.addEventListener("click", function () { setParty(state.partySize + 1); });

    var calGrid   = qs("#cita-cal-grid");
    var calTitle  = qs("#cita-cal-title");
    var calPrev   = qs("[data-cal-prev]");
    var calNext   = qs("[data-cal-next]");
    var slotsEl   = qs(".time-grid");
    var MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

    var today0  = new Date(); today0.setHours(0,0,0,0);
    var minDate = new Date(today0); minDate.setDate(minDate.getDate() + 1);
    var calView = new Date(minDate.getFullYear(), minDate.getMonth(), 1);

    var API = "/backend/api";
    function authToken() { try { return localStorage.getItem("okstation.token"); } catch (e) { return null; } }
    var availCfg = { weekly: {}, blackout: [], maxAdvance: 60 };
    var maxDate = new Date(today0); maxDate.setDate(maxDate.getDate() + availCfg.maxAdvance);
    var occByDate = {};

    function dayIsOpen(date) {
      if (date.getDay() === 6) return false;
      var hrs = availCfg.weekly[String(date.getDay())];
      if (!hrs || !hrs.length) return false;
      if (availCfg.blackout.indexOf(isoOf(date)) >= 0) return false;
      return true;
    }

    function isoOf(date) {
      var m = String(date.getMonth() + 1).padStart(2, "0");
      var d = String(date.getDate()).padStart(2, "0");
      return date.getFullYear() + "-" + m + "-" + d;
    }

    var SLOT_MIN = 60;
    function slotsNeeded(party) {
      return Math.max(1, Math.ceil((Math.max(1, party | 0) * MIN_PER_PERSON) / SLOT_MIN));
    }
    function openHoursCount(date) {
      if (date.getDay() === 6) return 0;
      var hrs = availCfg.weekly[String(date.getDay())];
      return (hrs && hrs.length) ? hrs.length : 0;
    }

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
      if (open && need >= open) return "none";
      var diffDays = Math.round((date - today0) / 86400000);
      var h = dayHash(date);
      var bias = Math.min(42, (need - 1) * 14);
      if (diffDays <= 3) return h < (35 + bias) ? "mid" : "full";
      if (h < 18 + bias) return "none";
      if (h < 50 + bias) return "mid";
      return "full";
    }

    function renderSlotsLoading() {
      if (slotsEl) slotsEl.innerHTML = '<p class="time-grid__empty">Cargando horarios…</p>';
    }

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
      var startOffset = (first.getDay() + 6) % 7;
      var daysInMonth = new Date(y, m + 1, 0).getDate();

      var cells = "";
      for (var i = 0; i < startOffset; i++) {
        cells += '<span class="okcal__day is-empty" aria-hidden="true"></span>';
      }
      for (var d = 1; d <= daysInMonth; d++) {
        var date = new Date(y, m, d);
        var iso = isoOf(date);
        var selected = state.fecha === iso;
        var serverLvl = occByDate[iso];
        var lvl = (serverLvl && serverLvl !== "full") ? serverLvl : "full";
        var open = openHoursCount(date);
        if (open && slotsNeeded(state.partySize) >= open) lvl = "none";
        var closed = !dayIsOpen(date) || date < minDate || date > maxDate;
        var disabled = closed || lvl === "none";
        var occText = { full: "disponibilidad total", mid: "disponibilidad media", none: "sin disponibilidad" };
        var availLabel = occText[lvl] || "";
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
      var mailOk     = EMAIL_RE.test(mailVal);
      var hasContact = !!qs("input[name='cita-contacto']:checked", section);
      var acceptEl   = qs("#cita-acepto");
      var hasTerms   = !!(acceptEl && acceptEl.checked);

      setFieldError(telInput, "cita-tel-error", (telVal && !telOk) ? "Ingresa un teléfono válido a 10 dígitos." : "");
      setFieldError(emailInput, "cita-correo-error", (mailVal && !mailOk) ? "Revisa tu correo, p. ej. nombre@correo.com." : "");

      var ok = hasName && telOk && mailOk && hasContact && hasTerms;
      next.disabled = !ok;
      next.setAttribute("aria-disabled", String(!ok));
    }

    attachFieldFilter(nameInput, NAME_ALLOW_RE);
    if (nameInput)  nameInput.addEventListener("input", validateStep2);
    if (telInput)   telInput.addEventListener("input", validateStep2);
    if (emailInput) emailInput.addEventListener("input", validateStep2);
    qsa("input[name='cita-contacto']", section).forEach(function (r) {
      r.addEventListener("change", validateStep2);
    });
    var aceptoEl = qs("#cita-acepto");
    if (aceptoEl) aceptoEl.addEventListener("change", validateStep2);

    function renderQuienContacto() {
      var host = qs("#cita-quien-host");
      if (!host) return;

      var people = [];
      (state.guests || []).forEach(function (g, i) {
        if (g && g.name && g.name.trim()) people.push({ i: i, name: g.name.trim(), dob: g.dob, doctype: g.doctype });
      });

      if (!people.length) { host.hidden = true; host.innerHTML = ""; return; }
      host.hidden = false;

      if (typeof state.contactGuest === "number" && !people.some(function (p) { return p.i === state.contactGuest; })) {
        state.contactGuest = null;
        if (state.contactChoice === "si") state.contactChoice = "";
      }
      if (state.contactChoice === "si" && state.contactGuest == null && people.length === 1) {
        state.contactGuest = people[0].i;
      }
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
    function needsDoctype() { return state.tramite === "visa" || state.tramite === "sentri"; }

    function ensureGuests() {
      var n = Math.max(1, state.partySize | 0);
      if (!Array.isArray(state.guests)) state.guests = [];
      while (state.guests.length < n) state.guests.push({ name: "", dob: "", doctype: "", answers: {}, files: {} });
      if (state.guests.length > n) state.guests.length = n;
      if (state.guests[0] && !state.guests[0].name && state.nombre) state.guests[0].name = state.nombre;
      if (typeof state.activeGuest !== "number" || state.activeGuest >= n || state.activeGuest < 0) state.activeGuest = 0;
    }

    function answerCtrlHtml(i, f) {
      var id = "pg-" + i + "-a-" + f.k;
      var req = "";
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
          '<input type="text" id="pg-' + i + '-name" data-pg="name" data-idx="' + i + '" autocomplete="off" placeholder="Ej. Juan Pérez"></div>' +
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
      if (window.OKPhone) window.OKPhone.init(personasHost);
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
        var fl = window.OKQ ? window.OKQ.fields(state.tramite, state.subtype, g.doctype) : [];
        for (var fi = 0; fi < fl.length; fi++) {
          var f = fl[fi], el = qs("#pg-" + k + "-a-" + f.k, personasHost), val = g.answers[f.k];
          if (!el) continue;
          if (f.type === "check") el.checked = (val === true);
          else if (f.type === "tel" && window.OKPhone) window.OKPhone.set(el, val);
          else if (val != null) el.value = val;
        }
        if (g.files) {
          Object.keys(g.files).forEach(function (dk) {
            var d = g.files[dk]; if (!d || !d.file) return;
            setGuestDocStatus(qs('[data-docstatus="' + k + '-' + dk + '"]', personasHost), d.file.name + " · " + fmtFileSize(d.file.size), true);
          });
        }
      }
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
      qsa("[data-ans]", personasHost).forEach(function (el) {
        var ev = (el.type === "checkbox" || el.tagName === "SELECT") ? "change" : "input";
        el.addEventListener(ev, function () {
          var idx = parseInt(el.dataset.idx, 10) || 0;
          if (!state.guests[idx]) state.guests[idx] = { name: "", dob: "", doctype: "", answers: {} };
          if (!state.guests[idx].answers) state.guests[idx].answers = {};
          var val;
          if (el.type === "checkbox") val = el.checked;
          else if (el.type === "tel" && window.OKPhone) val = window.OKPhone.full(el);
          else val = el.value;
          state.guests[idx].answers[el.dataset.ans] = val;
          validateGuests();
        });
      });
      qsa(".input-prefix__cc", personasHost).forEach(function (sel) {
        sel.addEventListener("change", function () {
          var inp = sel.closest(".input-prefix");
          inp = inp ? inp.querySelector("input[data-ans]") : null;
          if (inp) inp.dispatchEvent(new Event("input"));
        });
      });
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
      if (state.tramite === "licencia") return true;
      if (!g || !g.name || !g.name.trim() || !g.dob) return false;
      if (needsDoctype() && !g.doctype) return false;
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

    function buildSummary() {
      if (!summaryEl) return;

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

      var contacto = item("Nombre", sanitize(state.nombre || "—")) +
        item("WhatsApp", sanitize(state.tel || "—")) +
        (state.correo
          ? item("Correo", sanitize(state.correo))
          : item("Correo", "No proporcionado", true));

      var detalle = item("Servicio", sanitize(state.tramiteLabel));
      if (state.tramite === "pasaporte" && state.subtype) {
        var pptLbl = SUBTYPE_LABEL[state.subtype] || state.subtype;
        if (state.subtype === "mexicano" && state.pptTramite && state.pptEdad) {
          pptLbl += " · " + (state.pptTramite === "renovacion" ? "Renovación" : "Primera vez") +
                    " · " + (state.pptEdad === "menor" ? "Menor de edad" : "Mayor de edad");
        }
        detalle += item("Tipo de pasaporte", sanitize(pptLbl));
      }
      detalle += item("Personas", sanitize(String(state.partySize) + (state.partySize === 1 ? " (solo yo)" : ""))) +
        item("Fecha", sanitize(formatDate(state.fecha))) +
        item("Hora", sanitize(state.hora) + " hrs");
      if (state.notas) detalle += item("Notas", sanitize(state.notas));
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

      var exped = (window.OKCitaExpediente && window.OKCitaExpediente.getState)
        ? window.OKCitaExpediente.getState() : null;
      var citaExtras = (exped && exped.services) ? exped.services : [];
      var extrasTotal = 0;
      citaExtras.forEach(function (sv) { if (sv && +sv.price > 0) extrasTotal += +sv.price; });

      var priceDiscriminator = (state.tramite === "acta") ? state.actaState : state.subtype;
      var priceRows = window.OKCitaPriceRows
        ? window.OKCitaPriceRows(state.tramite, priceDiscriminator, state.partySize, extrasTotal)
        : [["Precio", "Te confirmamos el precio"]];
      var totalVal = null, isQuote = false, breakdown = "";
      priceRows.forEach(function (pr) {
        if (/^total/i.test(pr[0]) || pr[0] === "Precio") {
          totalVal = sanitize(pr[1]);
          if (pr[0] === "Precio") isQuote = true;
        } else {
          breakdown += item(sanitize(pr[0]), sanitize(pr[1]));
        }
      });
      var estItems = "";
      if (!isQuote) {
        citaExtras.forEach(function (sv) {
          if (!sv) return;
          var lbl = sanitize(sv.label || sv.key || "Servicio adicional");
          var val = (+sv.price > 0)
            ? sanitize(window.OKMxn0 ? window.OKMxn0(sv.price) : ("$" + sv.price))
            : "Incluido";
          estItems += item(lbl, val);
        });
      }
      estItems += breakdown;
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

      try {
        sessionStorage.setItem("okstation.cita.draft", JSON.stringify({
          tramite: state.tramite,
          fecha: state.fecha,
          hora: state.hora,
          ts: Date.now()
        }));
      } catch (_) {}
    }

    var confirmBtn   = qs("#cita-confirm-btn");
    var successEl    = qs("#cita-success");
    var confirmIntro = qs("#cita-confirm-intro");
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

    function startApptPayment(apptId, btn) {
      var tk = authToken();
      if (!tk) { showToast("Inicia sesión para pagar en línea."); return; }
      if (btn) { btn.disabled = true; btn.textContent = "Abriendo…"; }
      location.href = "pago.html?appt=" + encodeURIComponent(apptId);
    }

    function renderCitaPayCTA(container, appt) {
      if (!container || !appt || !appt.payable) return;
      var amount = window.OKMxn0 ? window.OKMxn0(appt.amount_total) : ("$" + appt.amount_total);
      var must = !!appt.requires_payment;
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
      var exped = (window.OKCitaExpediente && window.OKCitaExpediente.getState) ? window.OKCitaExpediente.getState() : null;
      var payload = {
        tramite: state.tramite,
        passport_subtype: state.subtype || "",
        acta_state: state.actaState || "",
        party_size: state.partySize,
        date: state.fecha,
        time: state.hora,
        name: state.nombre,
        phone: state.tel,
        email: emailEl ? emailEl.value.trim() : "",
        contact_pref: prefEl ? prefEl.value : "",
        notes: (
          (state.tramite === "pasaporte" && state.subtype === "mexicano" && state.pptTramite && state.pptEdad)
            ? ("Pasaporte mexicano · " + (state.pptTramite === "renovacion" ? "Renovación" : "Primera vez") +
               " · " + (state.pptEdad === "menor" ? "Menor de edad" : "Mayor de edad") + (state.notas ? " — " : ""))
          : (state.tramite === "acta" && state.actaStateLabel)
            ? ("Acta de nacimiento · Estado: " + state.actaStateLabel + (state.notas ? " — " : ""))
          : "") + (state.notas || ""),
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
              try {
                var citaServices = (exped && exped.services) ? exped.services : [];
                var apptForTicket = {
                  code: j.appointment.code, tramite: j.appointment.tramite,
                  passport_subtype: j.appointment.passport_subtype, party_size: j.appointment.party_size,
                  acta_state: (j.appointment.acta_state || state.actaState || ""),
                  date: j.appointment.date, time: j.appointment.time, status: j.appointment.status,
                  name: state.nombre, phone: state.tel, guests: state.guests,
                  services: citaServices
                };
                var citaUri = window.OKCitaTicketBlobUrl ? window.OKCitaTicketBlobUrl(apptForTicket) : null;
                var dlBtn = qs("#cita-ticket-dl", successEl);
                if (citaUri && dlBtn) dlBtn.href = citaUri;
                else if (dlBtn) dlBtn.style.display = "none";

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
              try { renderCitaPayCTA(successEl, j.appointment); } catch (e) {}
            }
            if (confirmIntro) confirmIntro.style.display = "none";
            if (summaryEl) summaryEl.style.display = "none";
            confirmBtn.style.display = "none";
            if (successEl) requestAnimationFrame(function () {
              var top = successEl.getBoundingClientRect().top + window.scrollY - 90;
              window.scrollTo({ top: top, behavior: "smooth" });
            });
            showToast("¡Cita registrada! Folio " + j.appointment.code);
            try { sessionStorage.removeItem("okstation.cita.draft"); } catch (_) {}
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

    qsa("[data-cita-next]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (state.step === 0 && !citaSessionOk()) {
          var note = qs("#cita-login-note");
          if (note) note.hidden = false;
          return;
        }
        var target = state.step + 1;
        if (state.tramite === "licencia" && target === 1) target = 2;
        goToStep(target);
      });
    });

    qsa("[data-cita-back]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var target = state.step - 1;
        if (state.tramite === "licencia" && target === 1) target = 0;
        goToStep(target);
      });
    });

    var resetBtn = qs("#cita-reset");
    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        state = { step: 0, tramite: null, tramiteLabel: "", subtype: "", pptTramite: "", pptEdad: "", partySize: 1, partyLabel: "Solo yo", fecha: "", hora: "", nombre: "", tel: "", notas: "", guests: [], activeGuest: 0, contactChoice: "", contactGuest: null };
        if (personasHost) personasHost.innerHTML = "";

        qsa(".tramite-btn").forEach(function (b) {
          b.classList.remove("is-selected");
          b.setAttribute("aria-pressed", "false");
        });

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

        qsa("input[name='cita-contacto']", section).forEach(function (r) { r.checked = false; });
        var aceptoReset = qs("#cita-acepto");
        if (aceptoReset) aceptoReset.checked = false;

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

    renderSteps();
    setParty(1);
    renderSelectedExtra();
    updateStep0Next();
    validateStep1();
    validateStep2();
  }


  function initFotos() {
    var section = qs("#fotos");
    if (!section) return;

    var files = [];
    var config = {
      size: "10x15",
      finish: "Brillante",
      qty: 1
    };

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

    fileInput.addEventListener("change", function () {
      processFiles(fileInput.files);
      fileInput.value = "";
    });

    function fileExt(name) {
      var m = String(name).toLowerCase().match(/\.([a-z0-9]+)$/);
      return m ? m[1] : "";
    }
    function fileKind(f) {
      var ext  = fileExt(f.name);
      var mime = (f.type || "").toLowerCase();
      var extOk  = CONFIG.allowedExts.indexOf(ext) !== -1;
      var mimeOk = mime ? CONFIG.allowedTypes.indexOf(mime) !== -1 : true;
      if (!extOk || !mimeOk) return null;
      return (ext === "pdf" || mime === "application/pdf") ? "pdf" : "image";
    }

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
          files.push(entry);
          renderThumbs();
          updateTotal();
        }
      });
    }

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

    function updateTotal() {
      var images = files.filter(function (f) { return f.kind !== "pdf"; });
      var pdfs   = files.filter(function (f) { return f.kind === "pdf"; });
      var nFotos = images.length;
      var nCopias = nFotos * config.qty;
      var unitPrice = CONFIG.prices[config.size];

      if (totalFotosEl)  totalFotosEl.textContent = nFotos;
      if (totalCopiasEl) totalCopiasEl.textContent = nCopias;

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

    updateTotal();
  }


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

  window.OKStation = window.OKStation || {};
  window.OKStation.showToast = showToast;


  function initImageFade() {
    document.documentElement.classList.add("img-fade");
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
      if (img.complete && img.naturalWidth === 0) { fail(); return; }
      img.addEventListener("error", fail);
      img.addEventListener("load", function () { if (img.naturalWidth === 0) fail(); });
    });
  }

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

      var canLoop = true;
      var originals = Array.prototype.slice.call(track.children);
      var looping = false;
      var period = 0;

      function overflowing() { return track.scrollWidth - track.clientWidth > 4; }

      function neutralizeClone(node) {
        node.setAttribute("aria-hidden", "true");
        node.classList.add("is-clone");
        node.removeAttribute("id");
        var ided = node.querySelectorAll("[id]");
        Array.prototype.forEach.call(ided, function (el) { el.removeAttribute("id"); });
        var foc = node.querySelectorAll("a, button, input, select, textarea, [tabindex]");
        Array.prototype.forEach.call(foc, function (el) { el.setAttribute("tabindex", "-1"); });
        var imgs = node.querySelectorAll(".service-card__img");
        Array.prototype.forEach.call(imgs, function (im) { im.classList.add("is-loaded"); });
      }

      function measurePeriod() {
        var n = originals.length;
        if (n === 0) { period = 0; return; }
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
        jumpTo(period);
      }

      function jumpTo(x) {
        track.style.scrollSnapType = "none";
        track.scrollLeft = x;
        requestAnimationFrame(function () { if (!rafId) track.style.scrollSnapType = ""; });
      }

      function normalize() {
        if (!looping || period <= 0) return;
        var sl = track.scrollLeft;
        var norm = period + (((sl - period) % period) + period) % period;
        if (Math.abs(norm - sl) > 0.5) track.scrollLeft = norm;
      }

      function update() {
        var overflow = looping || overflowing();
        prev.style.display = next.style.display = overflow ? "" : "none";
        prev.disabled = false;
        next.disabled = false;
      }

      function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
      var rafId = null, targetScroll = null;
      function settle() {
        rafId = null; targetScroll = null;
        normalize();
        track.style.scrollSnapType = "";
        update();
      }
      function glide(to) {
        var max = track.scrollWidth - track.clientWidth;
        to = Math.max(0, Math.min(to, max));
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        var start = track.scrollLeft, dist = to - start;
        targetScroll = to;
        if (Math.abs(dist) < 1) { settle(); return; }
        track.style.scrollSnapType = "none";
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
      function posOf(el) { return el.getBoundingClientRect().left - track.getBoundingClientRect().left + track.scrollLeft; }
      function go(dir) {
        var max = track.scrollWidth - track.clientWidth, list = track.children, target = null, i, x;
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
      if (window.ResizeObserver) {
        new ResizeObserver(function () {
          if (canLoop && !looping && overflowing()) buildLoop();
          onResize();
        }).observe(track);
      }
      if (canLoop && overflowing()) buildLoop();
      update();
    });
  }

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