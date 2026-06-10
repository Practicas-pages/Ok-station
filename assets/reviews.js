/* ============================================================
   OK.station — Reseñas (agregar / editar / eliminar) ligadas al login
   MODO DEMO: persiste en localStorage. Con backend en CloudPanel,
   cambia DEMO=false y usa los endpoints reales (/backend/api/reviews/*).
   El CRUD respeta la sesión: solo editas/eliminas TUS reseñas.
   ============================================================ */
(function () {
  "use strict";

  var DEMO = true;                       // false → API real
  var API = "/backend/api/reviews";
  var LS = "okstation.reviews.demo";

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
        if (res && res.ok === false) { btn.disabled = false; btn.textContent = "Reintentar"; alert.hidden = false; alert.textContent = res.error || "No se pudo guardar."; return; }
        host.innerHTML = ""; state.editingId = null; load();
      });
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
    grid.innerHTML = list.map(function (r) {
      var actions = r.mine
        ? '<div class="testimonio-card__actions">' +
            '<button type="button" class="review-act" data-act="edit" data-id="' + esc(r.id) + '" aria-label="Editar reseña"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg></button>' +
            '<button type="button" class="review-act review-act--danger" data-act="del" data-id="' + esc(r.id) + '" aria-label="Eliminar reseña"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button>' +
          '</div>'
        : "";
      return '<article class="testimonio-card' + (r.mine ? " is-mine" : "") + '">' +
        '<div class="testimonio-card__top">' + starsRow(r.rating) + actions + '</div>' +
        '<blockquote>' + esc(r.comment) + '</blockquote>' +
        '<div class="testimonio-author"><span class="testimonio-author__avatar" aria-hidden="true">' + esc(initials(r.author)) + '</span>' +
        '<div><b>' + esc(r.author) + '</b><span>Cliente · Tijuana</span></div></div></article>';
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
    Data.list().then(function (res) {
      var list = (res && res.reviews) || [];
      renderSummary(list);
      renderGrid(list);
      renderAction();
    });
  }

  function init() { if ($("#reviews-grid")) load(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
