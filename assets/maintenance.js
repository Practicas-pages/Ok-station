
const MAINTENANCE_MODE = false;


if (!MAINTENANCE_MODE) {
    window.location.href = "index.html";
}


document.addEventListener("DOMContentLoaded", () => {

    const loginBtn = document.getElementById("adminLogin");

    if (loginBtn) {

        loginBtn.addEventListener("click", () => {

            window.location.href = "cuenta.html?admin=true";

        });

    }

});