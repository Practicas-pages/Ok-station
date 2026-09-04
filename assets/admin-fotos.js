(function () {
  "use strict";

  var API = "/backend/api";
  function token() { try { return localStorage.getItem("okstation.token") || ""; } catch (e) { return ""; } }
  function esc(s) {
    var d = document.createElement("div");
    d.textContent = String(s == null ? "" : s);
    return d.innerHTML.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  var modal = null, actual = null;
  var seleccionadas = [], portadaUrl = "", maxSeleccion = 5;
  var cola = [], colaTotal = 0;

  function fraseBusqueda(nombre, marca) {
    var s = String(nombre || "");
    s = s.replace(/\bC\s*\/\s*\d+\b/gi, " ");
    s = s.replace(/\bcon\s+\d+\s+(pz|pzas|piezas)\b/gi, " ");
    s = s.replace(/\b(pz|pzas|piezas|paq|paquete)\b\.?/gi, " ");
    s = s.replace(/["“”«»'’´]/g, " ");
    s = s.replace(/\s+/g, " ").trim();

    var m = String(marca || "").trim()
      .replace(/\b(soluciones|brands|mexico|méxico|s\.?a\.?|de|c\.?v\.?|inc\.?|corp\.?|ltd\.?|sa|cv)\b/gi, " ")
      .replace(/\s+/g, " ").trim();

    if (m && s.toUpperCase().indexOf(m.toUpperCase()) === -1) s = m + " " + s;
    return s.trim();
  }

  function urlBusqueda(texto) {
    var q = String(texto || "").trim();
    if (!q) return null;
    return "https://www.google.com/search?tbm=isch&q=" + encodeURIComponent(q);
  }

  function construir() {
    if (modal) return modal;
    modal = document.createElement("div");
    modal.className = "fotos-ov";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.innerHTML =
      '<div class="fotos-box">' +
        '<div class="fotos-head">' +
          '<div><b id="fotos-nombre"></b><span id="fotos-marca" class="fotos-marca"></span>' +
            '<div id="fotos-cola" class="fotos-cola"></div></div>' +
          '<button type="button" class="fotos-skip" data-fotos-siguiente>Saltar →</button>' +
          '<button type="button" class="fotos-x" data-fotos-cerrar aria-label="Cerrar">✕</button>' +
        '</div>' +
        '<div class="fotos-body" id="fotos-body"></div>' +
        '<div class="fotos-foot">' +
          '<div class="fotos-selection" id="fotos-selection">' +
            '<div><b id="fotos-selection-count">0 seleccionadas</b>' +
              '<span id="fotos-selection-help">Marca las fotografías que correspondan al producto.</span></div>' +
            '<button type="button" id="fotos-save-selected" data-fotos-guardar disabled>Agregar seleccionadas</button>' +
          '</div>' +
          '<div class="fotos-drop" id="fotos-drop" tabindex="0">' +
            'Arrastra una imagen aquí, o haz clic y pega con <b>Ctrl+V</b>' +
            '<input type="file" id="fotos-file" accept="image/jpeg,image/png,image/webp,image/gif" hidden>' +
          '</div>' +
          '<div class="fotos-msg" id="fotos-msg" role="status"></div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);

    modal.addEventListener("click", function (e) {
      if (e.target === modal || e.target.closest("[data-fotos-cerrar]")) return cerrar();
      if (e.target.closest("[data-fotos-siguiente]")) return siguiente();
      if (e.target.closest("[data-fotos-guardar]")) return guardarSeleccionadas();
      if (e.target.closest("[data-fotos-buscar]")) {
        var campo = modal.querySelector("#fotos-query");
        var consulta = campo ? campo.value.trim() : "";
        if (!consulta || !actual) return;
        modal.querySelector("#fotos-body").innerHTML = '<div class="fotos-cargando">Buscando otras opciones…</div>';
        cargarCandidatas(actual.id, consulta);
        return;
      }
      var cover = e.target.closest("[data-cand-primary]");
      if (cover) {
        e.preventDefault();
        e.stopPropagation();
        marcarPortada(cover.getAttribute("data-cand-primary"));
        return;
      }
      var cand = e.target.closest("[data-cand]");
      if (cand) return alternarSeleccion(cand.getAttribute("data-cand"));
    });
    var drop = modal.querySelector("#fotos-drop");
    var file = modal.querySelector("#fotos-file");
    drop.addEventListener("click", function () { file.click(); });
    file.addEventListener("change", function () { if (file.files[0]) subirArchivo(file.files[0]); });
    ["dragenter", "dragover"].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("on"); });
    });
    ["dragleave", "drop"].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove("on"); });
    });
    drop.addEventListener("drop", function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) subirArchivo(f);
    });
    document.addEventListener("paste", function (e) {
      if (!modal || !modal.classList.contains("on")) return;
      var items = (e.clipboardData || {}).items || [];
      for (var i = 0; i < items.length; i++) {
        if (items[i].type && items[i].type.indexOf("image/") === 0) {
          var f = items[i].getAsFile();
          if (f) { e.preventDefault(); subirArchivo(f); return; }
        }
      }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && modal && modal.classList.contains("on")) cerrar();
      if (e.key === "Enter" && modal && modal.classList.contains("on") &&
          e.target && e.target.id === "fotos-query") {
        e.preventDefault();
        var buscar = modal.querySelector("[data-fotos-buscar]");
        if (buscar) buscar.click();
      }
      if ((e.key === "Enter" || e.key === " ") && e.target && e.target.matches("[data-cand]")) {
        e.preventDefault();
        alternarSeleccion(e.target.getAttribute("data-cand"));
      }
    });
    return modal;
  }

  function pintarProgreso() {
    var el = modal && modal.querySelector("#fotos-cola");
    if (!el) return;
    if (colaTotal <= 1) { el.textContent = ""; return; }
    var hechos = colaTotal - cola.length;
    el.textContent = hechos + " de " + colaTotal + " · faltan " + cola.length;
  }

  function siguiente() {
    var p = cola.shift();
    if (!p) { cerrar(); return; }
    actual = { id: p.id, nombre: p.nombre, marca: p.marca };
    limpiarSeleccion();
    modal.querySelector("#fotos-nombre").textContent = p.nombre;
    modal.querySelector("#fotos-marca").textContent = p.marca ? "· " + p.marca : "";
    modal.querySelector("#fotos-body").innerHTML = '<div class="fotos-cargando">Buscando fotos…</div>';
    msg("");
    pintarProgreso();
    cargarCandidatas(p.id);
  }

  function msg(texto, tipo) {
    var el = modal && modal.querySelector("#fotos-msg");
    if (!el) return;
    el.textContent = texto || "";
    el.className = "fotos-msg" + (tipo ? " is-" + tipo : "");
  }

  function cerrar() {
    if (!modal) return;
    modal.classList.remove("on");
    actual = null;
    limpiarSeleccion();
  }

  function abrir(id, nombre, marca) {
    construir();
    actual = { id: id, nombre: nombre, marca: marca };
    limpiarSeleccion();

    var pend = (typeof window.okAdminSinFoto === "function") ? window.okAdminSinFoto() : [];
    cola = pend.filter(function (p) { return String(p.id) !== String(id); });
    colaTotal = pend.length;

    modal.querySelector("#fotos-nombre").textContent = nombre;
    modal.querySelector("#fotos-marca").textContent = marca ? "· " + marca : "";
    pintarProgreso();
    modal.querySelector("#fotos-body").innerHTML = '<div class="fotos-cargando">Buscando fotos…</div>';
    modal.classList.add("on");
    msg("");
    cargarCandidatas(id);
  }

  function cargarCandidatas(id, consulta) {
    var endpoint = API + "/admin/image-candidates.php?product_id=" + encodeURIComponent(id);
    if (consulta) endpoint += "&q=" + encodeURIComponent(consulta);
    fetch(endpoint, {
      headers: { Authorization: "Bearer " + token() }
    })
      .then(function (r) {
        return r.text().then(function (txt) {
          if (!r.ok) {
            var m = "";
            try { m = (JSON.parse(txt) || {}).error || ""; } catch (e) {}
            throw new Error(m || ("El servidor respondió " + r.status + "."));
          }
          try { return JSON.parse(txt); }
          catch (e) {
            console.error("[fotos] respuesta no-JSON:", txt.slice(0, 800));
            throw new Error("El servidor devolvió un error: " + txt.replace(/<[^>]*>/g, " ").trim().slice(0, 160));
          }
        });
      })
      .then(function (j) {
        try { pintarCandidatas(j); }
        catch (e) {
          console.error("[fotos] falló al pintar:", e);
          modal.querySelector("#fotos-body").innerHTML =
            '<div class="fotos-cargando">Se encontraron datos pero no se pudieron mostrar (' + esc(e.message) + ').<br>' +
            'Puedes pegar o subir la imagen abajo.</div>';
        }
      })
      .catch(function (e) {
        console.error("[fotos]", e);
        modal.querySelector("#fotos-body").innerHTML =
          '<div class="fotos-cargando">' + esc(e.message || "No se pudo consultar al servidor.") +
          '<br>Puedes pegar o subir la imagen abajo — esa vía no depende del buscador.</div>';
      });
  }

  function pintarCandidatas(j) {
    if (!actual) return;
    var body = modal.querySelector("#fotos-body");
    var cands = (j && j.candidatas) || [];
    var actuales = cands.filter(function (c) { return c.origen === "actual"; }).length;
    maxSeleccion = Math.max(0, 5 - actuales);
    if (seleccionadas.length > maxSeleccion) seleccionadas = seleccionadas.slice(0, maxSeleccion);
    if (seleccionadas.length && !seleccionadas.some(function (c) { return c.url === portadaUrl; })) {
      portadaUrl = seleccionadas[0].url;
    }
    var html = "";

    if (cands.length) {
      html += '<div class="fotos-grid">';
      cands.forEach(function (c) {
        var yaEs = c.origen === "actual";
        var pie  = yaEs ? (c.descargada ? "actual" : "actual · sin descargar") : c.fuente;
        var esExterna = (c.origen === "marca" || c.origen === "buscador" || c.origen === "nextep");
        var elegida = seleccionadas.some(function (s) { return s.url === c.url; });
        var portada = elegida && portadaUrl === c.url;
        html += '<figure class="fotos-cand' + (yaEs ? " es-actual" : "") +
                  (elegida ? " is-selected" : "") +
                  (esExterna ? " es-marca" : "") + '"' +
                  (yaEs ? "" : ' data-cand="' + esc(c.url) + '" tabindex="0" role="button" aria-pressed="' +
                    (elegida ? "true" : "false") + '" title="Seleccionar esta foto — ' + esc(c.fuente || "") + '"') + '>' +
                  '<img src="' + esc(c.miniatura || c.url) + '" alt="" loading="lazy" ' +
                    'onerror="this.closest(\'figure\').remove()">' +
                  (yaEs ? "" : '<span class="fotos-check" aria-hidden="true">' + (elegida ? "✓" : "+") + '</span>') +
                  (elegida ? '<button type="button" class="fotos-cover' + (portada ? " on" : "") +
                    '" data-cand-primary="' + esc(c.url) + '">' + (portada ? "Portada" : "Hacer portada") + '</button>' : "") +
                  '<figcaption>' + esc(pie) + (c.medidas ? ' <span class="fotos-med">' + esc(c.medidas) + '</span>' : '') +
                  '</figcaption>' +
                '</figure>';
      });
      html += '</div>';
    }

    var prod  = (j && j.producto) || {};
    var marca = actual.marca || prod.brand || "";
    var clave = prod.sku || prod.ref || "";
    var desc  = (prod.description || "").trim();

    var frase = fraseBusqueda(actual.nombre, marca);
    var enlaces = [];
    enlaces.push('<a href="' + esc(urlBusqueda(frase)) + '" target="_blank" rel="noopener">por nombre</a>');
    if (clave) {
      enlaces.push('<a href="' + esc(urlBusqueda(marca + " " + clave)) + '" target="_blank" rel="noopener">por clave</a>');
    }
    if (desc) {
      var frDesc = fraseBusqueda(desc.split(/\s+/).slice(0, 12).join(" "), marca);
      enlaces.push('<a href="' + esc(urlBusqueda(frDesc)) + '" target="_blank" rel="noopener">por descripción</a>');
    }

    html += '<div class="fotos-marca-buscar"><b>Buscar la foto:</b> ' + enlaces.join(" · ") +
            '<div class="fotos-tip">Buscará: «' + esc(frase) + '»</div>' +
            '<div class="fotos-tip">Abre el resultado, prefiere la página del fabricante, ' +
            'copia la imagen (clic derecho → Copiar imagen) y pégala aquí con <b>Ctrl+V</b>.</div></div>';

    var busc = (j && j.buscador) || {};
    html += '<div class="fotos-refine">' +
      '<label for="fotos-query">Ajustar búsqueda</label>' +
      '<div><input type="search" id="fotos-query" value="' + esc((j && j.consulta) || frase) +
        '" maxlength="160" autocomplete="off">' +
      '<button type="button" data-fotos-buscar>Buscar otras</button></div>' +
      '<span>Agrega color, medida, modelo o código si las opciones no corresponden.</span>' +
      '</div>';

    if (busc.configurado === false) {
      html += '<div class="fotos-nota">El buscador de fotos está apagado: faltan ' +
              'GOOGLE_CSE_KEY y GOOGLE_CSE_ID en backend/.env. Mientras tanto, ' +
              'busca la foto con los enlaces de arriba y pégala con Ctrl+V.</div>';
    }

    ((j && j.notas) || []).forEach(function (n) {
      if (n === 'no_configurado') return;
      html += '<div class="fotos-nota">' + esc(n) + '</div>';
    });

    if (!cands.length) html = '<div class="fotos-cargando">Sin candidatas automáticas para este producto.</div>' + html;
    body.innerHTML = html;
    pintarSeleccion();
  }

  function limpiarSeleccion() {
    seleccionadas = [];
    portadaUrl = "";
    maxSeleccion = 5;
    pintarSeleccion();
  }

  function alternarSeleccion(url) {
    if (!url) return;
    var index = seleccionadas.findIndex(function (c) { return c.url === url; });
    if (index >= 0) {
      seleccionadas.splice(index, 1);
      if (portadaUrl === url) portadaUrl = seleccionadas.length ? seleccionadas[0].url : "";
    } else {
      if (seleccionadas.length >= maxSeleccion) {
        msg("Este producto solo tiene espacio para " + maxSeleccion + " fotografía(s) más.", "mal");
        return;
      }
      seleccionadas.push({ url: url });
      if (!portadaUrl) portadaUrl = url;
      msg("");
    }
    pintarCandidatasSeleccionadas();
    pintarSeleccion();
  }

  function marcarPortada(url) {
    if (!seleccionadas.some(function (c) { return c.url === url; })) return;
    portadaUrl = url;
    pintarCandidatasSeleccionadas();
    pintarSeleccion();
  }

  function pintarCandidatasSeleccionadas() {
    if (!modal) return;
    [].forEach.call(modal.querySelectorAll("[data-cand]"), function (card) {
      var url = card.getAttribute("data-cand");
      var chosen = seleccionadas.some(function (c) { return c.url === url; });
      card.classList.toggle("is-selected", chosen);
      card.setAttribute("aria-pressed", chosen ? "true" : "false");
      var check = card.querySelector(".fotos-check");
      if (check) check.textContent = chosen ? "✓" : "+";
      var cover = card.querySelector(".fotos-cover");
      if (chosen && !cover) {
        cover = document.createElement("button");
        cover.type = "button";
        cover.className = "fotos-cover";
        cover.setAttribute("data-cand-primary", url);
        card.insertBefore(cover, card.querySelector("figcaption"));
      }
      if (cover) {
        if (!chosen) cover.remove();
        else {
          var isCover = portadaUrl === url;
          cover.classList.toggle("on", isCover);
          cover.textContent = isCover ? "Portada" : "Hacer portada";
        }
      }
    });
  }

  function pintarSeleccion() {
    if (!modal) return;
    var count = modal.querySelector("#fotos-selection-count");
    var help = modal.querySelector("#fotos-selection-help");
    var save = modal.querySelector("#fotos-save-selected");
    if (count) count.textContent = seleccionadas.length + " de " + maxSeleccion + " seleccionadas";
    if (help) help.textContent = seleccionadas.length
      ? "La marcada como Portada se mostrará en las tarjetas; las demás aparecerán en la galería."
      : (maxSeleccion > 0
          ? "Marca diferentes ángulos y después agrégalos juntos."
          : "La galería ya tiene 5 fotografías.");
    if (save) {
      save.disabled = seleccionadas.length === 0;
      save.textContent = seleccionadas.length
        ? "Agregar seleccionadas (" + seleccionadas.length + ")"
        : "Agregar seleccionadas";
    }
  }

  function enviar(fd) {
    if (!actual) return;
    fd.append("product_id", actual.id);
    msg("Guardando…");
    fetch(API + "/admin/image-set.php", {
      method: "POST",
      headers: { Authorization: "Bearer " + token() },
      body: fd
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok) { msg((res.j && res.j.error) || "No se pudo guardar.", "mal"); return; }
        msg("✓ Foto guardada.", "bien");
        if (typeof window.okAdminRecargarCatalogo === "function") window.okAdminRecargarCatalogo();
        setTimeout(function () { cola.length ? siguiente() : cerrar(); }, 600);
      })
      .catch(function () { msg("Falló la conexión.", "mal"); });
  }

  function guardarSeleccionadas() {
    if (!actual || !seleccionadas.length) return;
    var save = modal.querySelector("#fotos-save-selected");
    if (save) save.disabled = true;
    msg("Descargando y validando " + seleccionadas.length + " fotografía(s)…");
    fetch(API + "/admin/image-set-batch.php", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        product_id: Number(actual.id),
        images: seleccionadas,
        primary_url: portadaUrl || seleccionadas[0].url
      })
    })
      .then(function (r) {
        return r.json().then(function (j) { return { ok: r.ok, j: j }; });
      })
      .then(function (res) {
        if (!res.ok) {
          msg((res.j && res.j.error) || "No se pudieron guardar las fotografías.", "mal");
          pintarSeleccion();
          return;
        }
        msg("✓ " + ((res.j && (res.j.message || res.j.mensaje)) || "Fotografías guardadas."), "bien");
        if (typeof window.okAdminRecargarCatalogo === "function") window.okAdminRecargarCatalogo();
        setTimeout(function () { cola.length ? siguiente() : cerrar(); }, 850);
      })
      .catch(function () {
        msg("Falló la conexión al guardar las fotografías.", "mal");
        pintarSeleccion();
      });
  }

  function subirArchivo(file) {
    if (!/^image\//.test(file.type)) { msg("Eso no es una imagen.", "mal"); return; }
    var fd = new FormData(); fd.append("file", file, file.name || "foto.jpg"); enviar(fd);
  }

  document.addEventListener("click", function (e) {
    var b = e.target && e.target.closest && e.target.closest("[data-foto]");
    if (!b) return;
    e.preventDefault();
    abrir(b.getAttribute("data-foto"), b.getAttribute("data-foto-nombre") || "", b.getAttribute("data-foto-marca") || "");
  });

  window.OKfotos = { abrir: abrir };
})();
