/* ============================================================
   OK.station — Aviso de retorno del checkout de pago (Mercado Pago / pasarela).
   Tras pagar, el proveedor redirige a:
     perfil.html?pago=ok|pendiente|cancelado#pedidos   (o #citas)
   Mercado Pago anexa además sus propios parámetros (status, payment_id…).
   Aquí solo mostramos un aviso amable y limpiamos la URL: el estado REAL
   ("pagado") lo confirma el webhook del servidor y el historial lo refleja
   por sí mismo (hace polling mientras la entidad esté en "procesando").
   ============================================================ */
(function () {
  "use strict";

  var params = new URLSearchParams(location.search);
  var pago = params.get("pago");
  // Respaldo: si por algún motivo no llegó nuestro ?pago=, deducirlo del de MP.
  var mp = (params.get("status") || params.get("collection_status") || "").toLowerCase();
  if (!pago) {
    if (mp === "approved") pago = "ok";
    else if (mp === "pending" || mp === "in_process") pago = "pendiente";
    else if (mp === "rejected" || mp === "failure" || mp === "cancelled" || mp === "null") pago = "cancelado";
  }
  if (!pago) return; // no venimos de un checkout

  var MSG = {
    ok:        { t: "¡Pago recibido!",       d: "Estamos confirmando tu pago. El estado se actualizará aquí en unos segundos.",        c: "#15803D", bg: "#DCFCE7" },
    pendiente: { t: "Pago en revisión",      d: "Tu pago quedó pendiente de aprobación. Te avisaremos en cuanto se confirme.",          c: "#B45309", bg: "#FEF3C7" },
    cancelado: { t: "Pago no completado",    d: "No se realizó ningún cargo. Puedes intentarlo de nuevo cuando quieras.",               c: "#B91C1C", bg: "#FEE2E2" }
  };
  var m = MSG[pago] || MSG.ok;

  function show() {
    var hash = (location.hash || "").replace("#", "");
    var host = document.getElementById(hash === "citas" ? "citas" : "pedidos") ||
               document.querySelector(".profile-panel") || document.body;
    var box = document.createElement("div");
    box.setAttribute("role", "status");
    box.style.cssText =
      "margin:0 0 16px;padding:14px 16px;border-radius:12px;background:" + m.bg +
      ";color:" + m.c + ";border:1px solid " + m.c + "40;font-size:.92rem;line-height:1.45";
    box.innerHTML =
      '<strong style="display:block;margin-bottom:2px">' + m.t + '</strong>' +
      '<span>' + m.d + '</span>';
    host.insertBefore(box, host.firstChild);
    try { box.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (e) {}
    if (pago !== "cancelado") {
      setTimeout(function () {
        box.style.transition = "opacity .5s";
        box.style.opacity = "0";
        setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 600);
      }, 9000);
    }
  }

  // Limpia los parámetros del proveedor de la URL (conserva el hash) para que
  // el aviso no reaparezca al recargar.
  try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) {}

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", show);
  else show();
})();
