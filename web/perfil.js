/*
  HI SENS – Perfil.js v1.0
  - Carga datos del usuario (/api/usuarios/me).
  - Permite cambiar contraseña propia.
*/

const getToken = window.getGlobalToken;
const fetchWithToken = window.fetchWithToken;
const API_URL = '';

document.addEventListener("DOMContentLoaded", () => {
  
  // Referencias DOM
  const inputNombre = document.getElementById("profile-nombre");
  const inputUser = document.getElementById("profile-username");
  const inputEmail = document.getElementById("profile-email");
  const inputRolPuesto = document.getElementById("profile-rol-puesto");
  const divSubs = document.getElementById("profile-subs");
  
  const formPass = document.getElementById("change-pass-form");
  const inputPass = document.getElementById("new-pass");
  const inputConfirm = document.getElementById("confirm-pass");
  const errorMsg = document.getElementById("pass-error");
  
  const reqLength = document.getElementById("req-length");
  const reqUpper = document.getElementById("req-upper");
  const reqNumber = document.getElementById("req-number");

  // 1. Cargar Datos del Perfil
  cargarPerfil();

  async function cargarPerfil() {
    try {
      const response = await fetchWithToken(`${API_URL}/api/usuarios/me`);
      if (!response.ok) throw new Error("Error cargando perfil");
      const user = await response.json();
      
      inputNombre.value = user.nombre_completo;
      inputUser.value = user.username;
      inputEmail.value = user.email;
      inputRolPuesto.value = `${user.rol} - ${user.puesto || 'Sin puesto'}`;
      
      if (user.suscripciones && user.suscripciones.length > 0) {
          divSubs.textContent = user.suscripciones.join(", ");
      } else {
          divSubs.textContent = "Sin suscripciones activas.";
      }

    } catch (e) {
      console.error(e);
      alert("No se pudo cargar la información del usuario.");
    }
  }

  // 2. Validación en Tiempo Real
  inputPass.addEventListener("keyup", () => {
      const val = inputPass.value;
      if (val.length >= 8) reqLength.classList.add("valid"); else reqLength.classList.remove("valid");
      if (/[A-Z]/.test(val)) reqUpper.classList.add("valid"); else reqUpper.classList.remove("valid");
      if (/[0-9]/.test(val)) reqNumber.classList.add("valid"); else reqNumber.classList.remove("valid");
  });

  // 3. Cambiar Contraseña
  formPass.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorMsg.classList.add("hidden");
      
      const p1 = inputPass.value;
      const p2 = inputConfirm.value;
      
      if (p1 !== p2) {
          showError("Las contraseñas no coinciden.");
          return;
      }
      // Validar requisitos manualmente también
      if (p1.length < 8 || !/[A-Z]/.test(p1) || !/[0-9]/.test(p1)) {
          showError("La contraseña no cumple los requisitos.");
          return;
      }
      
      try {
          const response = await fetchWithToken(`${API_URL}/api/usuarios/cambiar-password-propio`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ new_password: p1 })
          });
          
          const data = await response.json();
          if (!response.ok) throw new Error(data.detail || "Error al cambiar contraseña");
          
          alert("Contraseña actualizada correctamente.");
          formPass.reset();
          // Resetear validadores visuales
          reqLength.classList.remove("valid");
          reqUpper.classList.remove("valid");
          reqNumber.classList.remove("valid");
          
      } catch (e) {
          showError(e.message);
      }
  });

  function showError(msg) {
      errorMsg.textContent = msg;
      errorMsg.classList.remove("hidden");
  }
});