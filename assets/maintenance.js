// =========================
// OK.station Maintenance Mode
// =========================

const MAINTENANCE_MODE = true;

// Si el mantenimiento está desactivado
// enviamos al inicio normal

if (!MAINTENANCE_MODE) {
    window.location.href = "index.html";
}

// Botón administrador

document.addEventListener("DOMContentLoaded", () => {

    const loginBtn = document.getElementById("adminLogin");

    if (loginBtn) {

        loginBtn.addEventListener("click", () => {

            window.location.href = "cuenta.html?admin=true";

        });

    }

});