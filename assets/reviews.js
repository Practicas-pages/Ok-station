/* ============================================================
   Ok.station — Reseñas (agregar / editar / eliminar) ligadas al login
   MODO DEMO: persiste en localStorage. Con backend en CloudPanel,
   cambia DEMO=false y usa los endpoints reales (/backend/api/reviews/*).
   El CRUD respeta la sesión: solo editas/eliminas TUS reseñas.
   ============================================================ */
(function () {
  "use strict";

  var DEMO = false;                      // PRODUCCIÓN: usa el API real (/backend/api/reviews/*)
  var API = "/backend/api/reviews";
  var LS = "okstation.reviews.demo";
  /* Reseñas de Google vía Featurable (gratis, sin tarjeta). ID público del widget. */
  var FEATURABLE_ID = "30bf3581-fa31-45bf-b825-63cf9e6bb10e";

  /* ── Sesión (compartida con auth.js) ── */
  function token() { try { return localStorage.getItem("okstation.token"); } catch (e) { return null; } }
  function storedUser() { try { return JSON.parse(localStorage.getItem("okstation.user") || "null"); } catch (e) { return null; } }
  function currentUser() {
    var u = storedUser();
    if (u && (token() || DEMO)) return { id: String(u.id || "me"), name: u.full_name || "Cliente" };
    if (DEMO) return { id: "demo-me", name: "Tú (demo)" };   // permite probar el flujo sin backend
    return null;                                              // producción sin sesión → CTA de login
  }

  /* ── Utilidades ── */
  var $ = function (s, c) { return (c || document).querySelector(s); };
  function esc(s) { var d = document.createElement("div"); d.textContent = String(s == null ? "" : s); return d.innerHTML; }
  function initials(name) { return String(name || "?").trim().split(/\s+/).map(function (w) { return w[0]; }).slice(0, 2).join("").toUpperCase(); }
  function fmtDate(iso) {
    if (!iso) return "";
    try { return new Date(iso).toLocaleDateString("es-MX", { month: "short", year: "numeric" }); }
    catch (e) { return ""; }
  }

  /* ============================================================
     CAPA DE DATOS (demo localStorage | API real)
     ============================================================ */
  function seed() {
    return [
      { id: "seed-1", rating: 5, author: "María G.", comment: "Me ayudaron con la cita de mi visa y además imprimí las fotos en el mismo lugar. Rápido y sin vueltas.", owner: "seed" },
      { id: "seed-2", rating: 5, author: "Jorge R.", comment: "Engargolé mi tesis y quedó impecable. El trato es súper amable y te asesoran en todo.", owner: "seed" },
      { id: "seed-3", rating: 5, author: "Ana L.", comment: "Imprimí fotos en gran formato para un regalo y quedaron de excelente calidad. Volveré seguro.", owner: "seed" }
    ];
  }
  function demoLoad() {
    try { var v = JSON.parse(localStorage.getItem(LS) || "null"); if (Array.isArray(v)) return v; } catch (e) {}
    var s = seed(); demoSave(s); return s;
  }
  function demoSave(arr) { try { localStorage.setItem(LS, JSON.stringify(arr)); } catch (e) {} }

  var Data = {
    list: function () {
      if (DEMO) {
        var me = currentUser();
        var arr = demoLoad().map(function (r) { return { id: r.id, rating: r.rating, comment: r.comment, author: r.author, mine: !!(me && r.owner === me.id) }; });
        return Promise.resolve({ reviews: arr });
      }
      return fetch(API + "/list.php", { headers: token() ? { Authorization: "Bearer " + token() } : {} })
        .then(function (r) { return r.json(); });
    },
    create: function (rating, comment) {
      if (DEMO) {
        var me = currentUser();
        var arr = demoLoad();
        var item = { id: "r" + Date.now(), rating: rating, comment: comment, author: me.name, owner: me.id };
        arr.unshift(item); demoSave(arr);
        return Promise.resolve({ ok: true });
      }
      return apiPost(API + "/create.php", { rating: rating, comment: comment });
    },
    update: function (id, rating, comment) {
      if (DEMO) {
        var arr = demoLoad();
        for (var i = 0; i < arr.length; i++) if (arr[i].id === id) { arr[i].rating = rating; arr[i].comment = comment; }
        demoSave(arr);
        return Promise.resolve({ ok: true });
      }
      return apiPost(API + "/update.php", { id: id, rating: rating, comment: comment });
    },
    remove: function (id) {
      if (DEMO) {
        demoSave(demoLoad().filter(function (r) { return r.id !== id; }));
        return Promise.resolve({ ok: true });
      }
      return apiPost(API + "/delete.php", { id: id });
    },
    /* Las reseñas de Google se muestran con el WIDGET OFICIAL de Featurable
       (bloque aparte en el home), porque Featurable no permite leerlas con un
       fetch propio. Aquí devolvemos [] para que la rejilla muestre solo las
       reseñas propias. */
    google: function () {
      return Promise.resolve({ reviews: [] });
    }
  };
  function apiPost(url, body) {
    return fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token() }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); });
  }

  /* ============================================================
     RENDER
     ============================================================ */
  var state = { editingId: null };

  function starsRow(rating) {
    var out = "";
    for (var i = 1; i <= 5; i++) {
      out += '<svg class="' + (i <= rating ? "" : "is-empty") + '" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
    }
    return '<div class="stars" role="img" aria-label="' + rating + ' de 5 estrellas">' + out + '</div>';
  }

  function renderSummary(list) {
    var el = $("#reviews-summary");
    if (!el) return;
    if (!list.length) { el.hidden = true; return; }
    var avg = list.reduce(function (a, r) { return a + r.rating; }, 0) / list.length;
    el.hidden = false;
    el.innerHTML =
      '<div class="rating-summary__num">' + (Math.round(avg * 10) / 10).toFixed(1) + '</div>' +
      '<div class="rating-summary__info">' + starsRow(Math.round(avg)) +
      '<span>' + list.length + (list.length === 1 ? ' reseña' : ' reseñas') + ' de clientes</span></div>';
  }

  function renderAction() {
    var host = $("#reviews-action");
    if (!host) return;
    var me = currentUser();
    if (!me) {
      host.innerHTML = '<a class="btn btn--primary btn--sm" href="cuenta.html">Inicia sesión para opinar</a>';
      return;
    }
    host.innerHTML = '<button type="button" class="btn btn--primary btn--sm" id="review-open">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg> Escribir reseña</button>';
    $("#review-open").addEventListener("click", function () { openForm(); });
  }

  function openForm(review) {
    var host = $("#review-form-host");
    var me = currentUser();
    if (!host || !me) return;
    state.editingId = review ? review.id : null;
    var rating = review ? review.rating : 0;
    var comment = review ? review.comment : "";
    host.innerHTML =
      '<form class="review-form" id="review-form" novalidate>' +
      '<div class="review-form__head"><b>' + (review ? "Editar tu reseña" : "Escribe tu reseña") + '</b><span>como ' + esc(me.name) + '</span></div>' +
      '<div class="star-input" id="star-input" role="radiogroup" aria-label="Calificación">' +
        [1, 2, 3, 4, 5].map(function (n) {
          return '<button type="button" class="star-input__btn' + (n <= rating ? " is-on" : "") + '" data-star="' + n + '" role="radio" aria-checked="' + (n === rating) + '" aria-label="' + n + ' estrellas">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg></button>';
        }).join("") +
      '</div>' +
      '<textarea class="review-textarea" id="review-comment" rows="3" maxlength="600" placeholder="Cuéntanos tu experiencia: servicio, calidad, tiempo de entrega…">' + esc(comment) + '</textarea>' +
      '<div class="review-alert" id="review-alert" role="alert" hidden></div>' +
      '<div class="review-form__foot"><span class="review-counter" id="review-counter">0 / 600</span>' +
      '<div class="review-form__btns"><button type="button" class="btn btn--sm review-cancel" id="review-cancel">Cancelar</button>' +
      '<button type="submit" class="btn btn--primary btn--sm" id="review-submit">' + (review ? "Guardar cambios" : "Publicar reseña") + '</button></div></div>' +
      '</form>';

    var data = { rating: rating };
    var stars = Array.prototype.slice.call(host.querySelectorAll(".star-input__btn"));
    function paint(v) { stars.forEach(function (b) { var on = +b.dataset.star <= v; b.classList.toggle("is-on", on); b.setAttribute("aria-checked", String(+b.dataset.star === v)); }); }
    stars.forEach(function (b) {
      b.addEventListener("mouseenter", function () { paint(+b.dataset.star); });
      b.addEventListener("click", function () { data.rating = +b.dataset.star; paint(data.rating); });
    });
    host.querySelector("#star-input").addEventListener("mouseleave", function () { paint(data.rating); });

    var ta = host.querySelector("#review-comment");
    var counter = host.querySelector("#review-counter");
    function upd() { counter.textContent = ta.value.length + " / 600"; }
    ta.addEventListener("input", upd); upd();

    host.querySelector("#review-cancel").addEventListener("click", function () { host.innerHTML = ""; state.editingId = null; });

    host.querySelector("#review-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var alert = host.querySelector("#review-alert");
      alert.hidden = true;
      if (!data.rating) { alert.hidden = false; alert.textContent = "Selecciona una calificación de 1 a 5 estrellas."; return; }
      if (ta.value.trim().length < 4) { alert.hidden = false; alert.textContent = "Escribe tu comentario."; return; }
      var btn = host.querySelector("#review-submit"); btn.disabled = true; btn.textContent = "Guardando…";
      var op = state.editingId ? Data.update(state.editingId, data.rating, ta.value.trim()) : Data.create(data.rating, ta.value.trim());
      op.then(function (res) {
        if (!res || !res.ok) { btn.disabled = false; btn.textContent = "Reintentar"; alert.hidden = false; alert.textContent = (res && res.error) || "No se pudo guardar."; return; }
        state.editingId = null;
        if (res.pending) {
          /* Reseña en moderación: aún no aparece públicamente. */
          host.innerHTML = '<div class="review-thanks" role="status" style="text-align:center;padding:20px;border:1px solid var(--border-light,#e5e7eb);border-radius:12px;background:#f8fafc"><b style="display:block;margin-bottom:4px">¡Gracias por tu reseña! 🙌</b><span style="color:var(--text-muted,#6b7280);font-size:.9rem">' + esc(res.message || "Se publicará en cuanto la revisemos.") + '</span></div>';
          return;
        }
        host.innerHTML = ""; load();
      }).catch(function () { btn.disabled = false; btn.textContent = "Reintentar"; alert.hidden = false; alert.textContent = "Sin conexión. Inténtalo de nuevo."; });
    });

    ta.focus();
    host.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function renderGrid(list) {
    var grid = $("#reviews-grid");
    var empty = $("#reviews-empty");
    if (!grid) return;
    if (!list.length) { grid.innerHTML = ""; if (empty) empty.hidden = false; return; }
    if (empty) empty.hidden = true;
    var GOOGLE_G = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">' +
      '<path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>' +
      '<path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>' +
      '<path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>' +
      '<path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>';

    grid.innerHTML = list.map(function (r) {
      var isGoogle = r.source === "google";
      var actions = (r.mine && !isGoogle)
        ? '<div class="testimonio-card__actions">' +
            '<button type="button" class="review-act" data-act="edit" data-id="' + esc(r.id) + '" aria-label="Editar reseña"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg></button>' +
            '<button type="button" class="review-act review-act--danger" data-act="del" data-id="' + esc(r.id) + '" aria-label="Eliminar reseña"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button>' +
          '</div>'
        : "";
      var badge = !isGoogle
        ? '<span class="review-source review-source--ok">Ok.station</span>'
        : (r.url
            ? '<a class="review-source review-source--google" href="' + esc(r.url) + '" target="_blank" rel="noopener" aria-label="Ver reseña en Google">' + GOOGLE_G + 'Google</a>'
            : '<span class="review-source review-source--google">' + GOOGLE_G + 'Google</span>');
      var avatar = (isGoogle && r.photo)
        ? '<img class="testimonio-author__avatar testimonio-author__avatar--img" src="' + esc(r.photo) + '" alt="" loading="lazy" referrerpolicy="no-referrer">'
        : '<span class="testimonio-author__avatar" aria-hidden="true">' + esc(initials(r.author)) + '</span>';
      var sub = isGoogle ? ("Reseña en Google" + (r.time_desc ? " · " + esc(r.time_desc) : "")) : "Cliente · Tijuana";
      return '<article class="testimonio-card' + (r.mine ? " is-mine" : "") + (isGoogle ? " testimonio-card--google" : "") + '">' +
        '<div class="testimonio-card__top">' + starsRow(r.rating) + actions + '</div>' +
        '<blockquote>' + esc(r.comment) + '</blockquote>' +
        '<div class="testimonio-author">' + avatar +
        '<div><b>' + esc(r.author) + '</b><span>' + sub + '</span></div>' +
        badge + '</div></article>';
    }).join("");

    grid._all = list;
    Array.prototype.slice.call(grid.querySelectorAll(".review-act")).forEach(function (b) {
      b.addEventListener("click", function () {
        var id = b.dataset.id;
        var rev = (grid._all || []).filter(function (x) { return String(x.id) === String(id); })[0];
        if (b.dataset.act === "edit") { openForm(rev); }
        else {
          if (window.confirm("¿Eliminar tu reseña? Esta acción no se puede deshacer.")) {
            Data.remove(id).then(load);
          }
        }
      });
    });
  }

  function load() {
    Promise.all([
      Data.list().catch(function () { return { reviews: [] }; }),
      Data.google().catch(function () { return { reviews: [] }; })
    ]).then(function (out) {
      var nativeRes = out[0] || {};
      if (nativeRes.ok === false) { showReviewsError(nativeRes.error || "No se pudieron cargar las reseñas."); return; }
      var nativeList = (nativeRes.reviews || []).map(function (r) { r.source = "okstation"; return r; });
      var g = out[1] || {};
      var googleList = (g.reviews || []).map(function (r, i) {
        return {
          id: "g-" + i, rating: r.rating, comment: r.comment, author: r.author,
          photo: r.photo, time_desc: r.time_desc, url: r.url, source: "google", mine: false
        };
      });
      var list = nativeList.concat(googleList);
      renderSummary(list);
      renderGrid(list);
      renderAction();
    }).catch(function () { showReviewsError("No se pudieron cargar las reseñas. Revisa la conexión."); });
  }
  function showReviewsError(msg) {
    var g = $("#reviews-grid"); if (g) g.innerHTML = "";
    var s = $("#reviews-summary"); if (s) s.hidden = true;
    var e = $("#reviews-empty"); if (e) { e.hidden = false; e.textContent = msg; e.style.color = "var(--color-error)"; }
    renderAction();
  }

  function init() { if ($("#reviews-grid")) load(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
