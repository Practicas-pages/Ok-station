/* ============================================================
   Ok.station — Lógica de cuentas (front-end)
   Login, registro, perfil, cambio y restablecimiento de contraseña.
   Habla con el backend PHP (CloudPanel) vía JSON + JWT (Bearer).
   ============================================================ */
(function () {
  "use strict";

  /* EDITAR si el API vive en otro dominio o subcarpeta.
     Por defecto asume mismo dominio: https://tudominio/backend/api */
  var API_BASE = "/backend/api";

  var TKEY = "okstation.token";
  var UKEY = "okstation.user";

  /* ── Sesión ── */
  function getToken() { try { return localStorage.getItem(TKEY); } catch (e) { return null; } }
  function setSession(t, u) { try { localStorage.setItem(TKEY, t); localStorage.setItem(UKEY, JSON.stringify(u)); } catch (e) {} }
  function clearSession() { try { localStorage.removeItem(TKEY); localStorage.removeItem(UKEY); } catch (e) {} }
  function cachedUser() { try { return JSON.parse(localStorage.getItem(UKEY) || "null"); } catch (e) { return null; } }

  /* ── Fetch al API ── */
  function api(path, method, data, auth) {
    var headers = { "Content-Type": "application/json" };
    if (auth && getToken()) headers["Authorization"] = "Bearer " + getToken();
    return fetch(API_BASE + "/" + path, {
      method: method || "GET",
      headers: headers,
      body: data ? JSON.stringify(data) : undefined
    }).then(function (r) {
      return r.json()
        .catch(function () { return { ok: false, error: "No se pudo contactar al servidor." }; })
        .then(function (j) { return { status: r.status, body: j }; });
    }).catch(function () {
      return { status: 0, body: { ok: false, error: "Sin conexión con el servidor." } };
    });
  }

  /* ── Helpers de UI ── */
  function qs(s, c) { return (c || document).querySelector(s); }
  function showAlert(el, type, msg) {
    if (!el) return;
    el.className = "auth-alert auth-alert--" + type;
    el.textContent = msg;
    el.hidden = false;
  }
  function clearAlert(el) { if (el) { el.hidden = true; el.textContent = ""; } }

  /* ── Validación inline por campo (sin alerts del navegador) ──
     Cada input usa un <span id="{input.id}-error"> para su mensaje. */
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  function fieldDigits(s) { return String(s || "").replace(/\D/g, ""); }
  function setFieldError(input, msg) {
    if (!input) return !msg;
    var el = document.getElementById(input.id + "-error");
    if (el) { el.textContent = msg || ""; el.hidden = !msg; }
    if (msg) input.setAttribute("aria-invalid", "true");
    else input.removeAttribute("aria-invalid");
    return !msg;
  }
  /* Limpia el error de un campo en cuanto el usuario lo corrige */
  function liveClear(inputs) {
    inputs.forEach(function (inp) {
      if (inp) inp.addEventListener("input", function () { setFieldError(inp, ""); });
    });
  }
  function setLoading(btn, on, labelWhenIdle) {
    if (!btn) return;
    if (on) { btn.dataset.label = btn.textContent; btn.disabled = true; btn.textContent = "Procesando…"; }
    else { btn.disabled = false; btn.textContent = labelWhenIdle || btn.dataset.label || "Enviar"; }
  }

  /* ============================================================
     Guard: páginas que requieren sesión (body[data-requires-auth])
     ============================================================ */
  function enforceGuard() {
    if (!document.body.hasAttribute("data-requires-auth")) return true;
    if (!getToken()) { window.location.href = "cuenta.html"; return false; }
    return true;
  }

  /* ============================================================
     Página: cuenta.html (login + registro con tabs)
     ============================================================ */
  function initAuthTabs() {
    var tabs = document.querySelectorAll(".auth-tab");
    var panels = { login: qs("#panel-login"), register: qs("#panel-register") };
    if (!tabs.length) return;
    function activate(name) {
      tabs.forEach(function (t) {
        var on = t.dataset.tab === name;
        t.classList.toggle("is-active", on);
        t.setAttribute("aria-selected", String(on));
      });
      Object.keys(panels).forEach(function (k) { if (panels[k]) panels[k].hidden = k !== name; });
    }
    tabs.forEach(function (t) { t.addEventListener("click", function () { activate(t.dataset.tab); }); });
    /* permite abrir directo en registro con #registro */
    if (location.hash === "#registro") activate("register");
  }

  function initLogin() {
    var form = qs("#form-login");
    if (!form) return;
    var box = qs("#login-alert");
    liveClear([form.email, form.password]);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      clearAlert(box);
      var btn = qs('button[type="submit"]', form);
      var emailVal = form.email.value.trim();
      var okEmail = setFieldError(form.email, !emailVal ? "Ingresa tu correo." : (!EMAIL_RE.test(emailVal) ? "Revisa tu correo, p. ej. nombre@correo.com." : ""));
      var okPass  = setFieldError(form.password, !form.password.value ? "Ingresa tu contraseña." : "");
      if (!okEmail || !okPass) return;
      var payload = { email: emailVal, password: form.password.value };
      setLoading(btn, true);
      api("login.php", "POST", payload).then(function (res) {
        setLoading(btn, false, "Iniciar sesión");
        if (res.body.ok) {
          setSession(res.body.token, res.body.user);
          /* El staff (empleado/administrador/directivo) entra directo a su panel; el cliente, a su perfil. */
          var roles = (res.body.user && res.body.user.roles) || [];
          var staff = roles.indexOf("administrador") >= 0 || roles.indexOf("empleado") >= 0 || roles.indexOf("directivo") >= 0;
          window.location.href = staff ? "admin.html" : afterAuthDest("perfil.html");
        }
        else showAlert(box, "error", res.body.error || "No se pudo iniciar sesión.");
      });
    });
  }

  /* Tras iniciar sesión/registrarse, regresa a donde el usuario quería ir (si guardó
     'oks_intended', p. ej. al intentar agendar una cita o hacer un pedido sin sesión).
     Solo acepta una URL del MISMO sitio y que no sea una página de auth (anti open-redirect
     y anti bucle). Si no hay destino guardado, usa el fallback (perfil.html). */
  function afterAuthDest(fallback) {
    var next = null;
    try { next = sessionStorage.getItem("oks_intended"); sessionStorage.removeItem("oks_intended"); } catch (e) {}
    if (!next) return fallback;
    try {
      var u = new URL(next, location.href);
      if (u.origin !== location.origin) return fallback;
      if (/\/(cuenta|recuperar|restablecer|maintenance)\.html$/i.test(u.pathname)) return fallback;
      return u.pathname + u.search + u.hash;
    } catch (e) { return fallback; }
  }

  function initRegister() {
    var form = qs("#form-register");
    if (!form) return;
    var box = qs("#register-alert");
    liveClear([form.full_name, form.email, form.phone, form.password, form.password_confirm]);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      clearAlert(box);
      var btn = qs('button[type="submit"]', form);
      var passVal = form.password.value;
      var emailVal = form.email.value.trim();
      var passMsg = passVal.length < 8
        ? "Mínimo 8 caracteres."
        : ((!/[a-zA-Z]/.test(passVal) || !/[0-9]/.test(passVal)) ? "Incluye letras y números." : "");
      var okName  = setFieldError(form.full_name, !form.full_name.value.trim() ? "Ingresa tu nombre completo." : "");
      var okMail  = setFieldError(form.email, !emailVal ? "Ingresa tu correo." : (!EMAIL_RE.test(emailVal) ? "Revisa tu correo, p. ej. nombre@correo.com." : ""));
      var okPhone = setFieldError(form.phone, fieldDigits(form.phone.value).length < 10 ? "Ingresa un teléfono válido a 10 dígitos." : "");
      var okPass  = setFieldError(form.password, passMsg);
      var okPass2 = setFieldError(form.password_confirm, form.password_confirm.value !== passVal ? "Las contraseñas no coinciden." : "");
      if (!(okName && okMail && okPhone && okPass && okPass2)) return;
      var payload = {
        full_name: form.full_name.value.trim(),
        email: emailVal,
        phone: (window.OKPhone ? window.OKPhone.full(form.phone) : form.phone.value.trim()),
        address: form.address.value.trim(),
        password: passVal,
        password_confirm: form.password_confirm.value
      };
      setLoading(btn, true);
      api("register.php", "POST", payload).then(function (res) {
        setLoading(btn, false, "Crear cuenta");
        if (res.body.ok) { setSession(res.body.token, res.body.user); window.location.href = afterAuthDest("perfil.html"); }
        else showAlert(box, "error", res.body.error || "No se pudo crear la cuenta.");
      });
    });
  }

  function initForgot() {
    var form = qs("#form-forgot");
    if (!form) return;
    var box = qs("#forgot-alert");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      clearAlert(box);
      var btn = qs('button[type="submit"]', form);
      setLoading(btn, true);
      api("forgot-password.php", "POST", { email: form.email.value.trim() }).then(function (res) {
        setLoading(btn, false, "Enviar enlace");
        if (res.body.ok) {
          var msg = res.body.message || "Si el correo existe, te enviamos un enlace.";
          if (res.body.dev_reset_link) msg += " (DEV) " + res.body.dev_reset_link;
          showAlert(box, "success", msg);
          form.reset();
        } else showAlert(box, "error", res.body.error || "No se pudo procesar la solicitud.");
      });
    });
  }

  /* ============================================================
     Página: restablecer.html (token en la URL)
     ============================================================ */
  function initReset() {
    var form = qs("#form-reset");
    if (!form) return;
    var box = qs("#reset-alert");
    var token = new URLSearchParams(location.search).get("token") || "";
    if (!token) { showAlert(box, "error", "Enlace inválido o incompleto."); }
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      clearAlert(box);
      var btn = qs('button[type="submit"]', form);
      var payload = {
        token: token,
        new_password: form.new_password.value,
        new_password_confirm: form.new_password_confirm.value
      };
      if (payload.new_password !== payload.new_password_confirm) { showAlert(box, "error", "Las contraseñas no coinciden."); return; }
      setLoading(btn, true);
      api("reset-password.php", "POST", payload).then(function (res) {
        setLoading(btn, false, "Restablecer contraseña");
        if (res.body.ok) {
          showAlert(box, "success", (res.body.message || "Contraseña restablecida.") + " Redirigiendo…");
          setTimeout(function () { window.location.href = "cuenta.html"; }, 1800);
        } else showAlert(box, "error", res.body.error || "No se pudo restablecer la contraseña.");
      });
    });
  }

  /* ============================================================
     Página: perfil.html (requiere sesión)
     ============================================================ */
  function initProfile() {
    var page = qs("#profile-page");
    if (!page) return;

    /* Pinta de inmediato lo que haya en caché para evitar parpadeo */
    fillProfile(cachedUser());

    /* Trae datos frescos del servidor */
    api("me.php", "GET", null, true).then(function (res) {
      if (res.status === 401) { clearSession(); window.location.href = "cuenta.html"; return; }
      if (res.body.ok) { setSession(getToken(), res.body.user); fillProfile(res.body.user); }
    });

    /* Editar info */
    var infoForm = qs("#profile-form");
    if (infoForm) {
      var infoBox = qs("#profile-alert");
      infoForm.addEventListener("submit", function (e) {
        e.preventDefault();
        clearAlert(infoBox);
        var btn = qs('button[type="submit"]', infoForm);
        var payload = { full_name: infoForm.full_name.value.trim(), phone: (window.OKPhone ? window.OKPhone.full(infoForm.phone) : infoForm.phone.value.trim()), address: infoForm.address.value.trim() };
        setLoading(btn, true);
        api("me.php", "PUT", payload, true).then(function (res) {
          setLoading(btn, false, "Guardar cambios");
          if (res.body.ok) { setSession(getToken(), res.body.user); fillProfile(res.body.user); showAlert(infoBox, "success", "Información actualizada."); }
          else showAlert(infoBox, "error", res.body.error || "No se pudo guardar.");
        });
      });
    }

    /* Cambiar contraseña */
    var passForm = qs("#password-form");
    if (passForm) {
      var passBox = qs("#password-alert");
      passForm.addEventListener("submit", function (e) {
        e.preventDefault();
        clearAlert(passBox);
        var btn = qs('button[type="submit"]', passForm);
        var payload = {
          current_password: passForm.current_password.value,
          new_password: passForm.new_password.value,
          new_password_confirm: passForm.new_password_confirm.value
        };
        if (payload.new_password !== payload.new_password_confirm) { showAlert(passBox, "error", "Las contraseñas nuevas no coinciden."); return; }
        setLoading(btn, true);
        api("change-password.php", "POST", payload, true).then(function (res) {
          setLoading(btn, false, "Actualizar contraseña");
          if (res.body.ok) { passForm.reset(); showAlert(passBox, "success", res.body.message || "Contraseña actualizada."); }
          else showAlert(passBox, "error", res.body.error || "No se pudo cambiar la contraseña.");
        });
      });
    }

    /* Cerrar sesión */
    var logout = qs("#btn-logout");
    if (logout) {
      logout.addEventListener("click", function () {
        api("logout.php", "POST", null, true);
        clearSession();
        window.location.href = "cuenta.html";
      });
    }

    /* ── Navegación por PESTAÑAS (cambia el apartado visible, SIN scroll) ──
       Cada enlace de la barra muestra su apartado y oculta los demás:
         Mis pedidos → #pedidos · Mis citas → #citas · Datos personales → #account-settings
       Al abrir el perfil, la vista por defecto es "Mis pedidos" (o la que pida el
       enlace directo #citas / #datos / #info / #password). */
    var views = { pedidos: qs("#pedidos"), citas: qs("#citas"), datos: qs("#account-settings") };
    var tabs  = {
      pedidos: qs('.profile-nav a[href="#pedidos"]'),
      citas:   qs('.profile-nav a[href="#citas"]'),
      datos:   qs("#toggle-datos")
    };
    function showView(name) {
      if (!views[name]) name = "pedidos";
      Object.keys(views).forEach(function (k) { if (views[k]) views[k].hidden = (k !== name); });
      Object.keys(tabs).forEach(function (k) {
        var t = tabs[k]; if (!t) return;
        t.classList.toggle("is-active", k === name);
        if (k === "datos") t.setAttribute("aria-expanded", k === name ? "true" : "false");
      });
    }
    Object.keys(tabs).forEach(function (k) {
      if (tabs[k]) tabs[k].addEventListener("click", function (e) { e.preventDefault(); showView(k); });
    });
    var h = location.hash;
    showView(h === "#citas" ? "citas"
      : (h === "#datos" || h === "#info" || h === "#password") ? "datos"
      : "pedidos");
  }

  function fillProfile(u) {
    if (!u) return;
    var nameEls = document.querySelectorAll("[data-user-name]");
    var emailEls = document.querySelectorAll("[data-user-email]");
    nameEls.forEach(function (el) { el.textContent = u.full_name || "—"; });
    emailEls.forEach(function (el) { el.textContent = u.email || "—"; });
    var av = qs("#profile-avatar");
    if (av && u.full_name) av.textContent = u.full_name.trim().charAt(0).toUpperCase();
    var f = qs("#profile-form");
    if (f) {
      if (f.full_name) f.full_name.value = u.full_name || "";
      if (f.phone) { if (window.OKPhone) window.OKPhone.set(f.phone, u.phone || ""); else f.phone.value = u.phone || ""; }
      if (f.address) f.address.value = u.address || "";
    }
    /* Acceso al panel solo para staff (oculto para clientes) */
    var adminLink = qs("#profile-admin-link");
    if (adminLink) {
      var roles = (u && u.roles) || [];
      var staff = roles.indexOf("administrador") >= 0 || roles.indexOf("empleado") >= 0 || roles.indexOf("directivo") >= 0;
      adminLink.hidden = !staff;
      if (staff) {
        /* El empleado puro ve "Panel de empleado"; admin/directivo "Panel administrativo". */
        var empOnly = roles.indexOf("empleado") >= 0 && roles.indexOf("administrador") < 0 && roles.indexOf("directivo") < 0;
        adminLink.textContent = "▸ " + (empOnly ? "Panel de empleado" : "Panel administrativo");
      }
    }
  }

  /* ── Init ── */
  function init() {

  // ==========================================
  // MODO MANTENIMIENTO
  // ==========================================

  const MAINTENANCE_MODE = false;

  if (MAINTENANCE_MODE) {

    const currentPage =
      window.location.pathname.split("/").pop();

    const allowedPages = [
      "",
      "maintenance.html",
      "cuenta.html",
      "recuperar.html",
      "restablecer.html"
    ];

    const user = cachedUser();

    const roles = (user && user.roles) || [];

    const isAdmin =
      roles.includes("administrador") || roles.includes("directivo");

    if (!isAdmin && !allowedPages.includes(currentPage)) {
      window.location.href = "maintenance.html";
      return;
    }
  }

  // ==========================================
  // CÓDIGO ORIGINAL
  // ==========================================

  if (!enforceGuard()) return;

  initAuthTabs();
  initLogin();
  initRegister();
  initForgot();
  initReset();
  initProfile();
}

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
