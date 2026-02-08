/*
  HI SENS – auth-nav.js v3.0
  - Gestión de tokens y roles.
  - [NUEVO] Cierre de sesión por inactividad (Excluye Visitante y Supervisor).
*/

// --- 1. Definiciones Globales ---
window.getGlobalToken = function() {
  return localStorage.getItem("hiSens_token");
}

window.getGlobalRole = function() {
  return localStorage.getItem("hiSens_rol");
}

window.globalLogout = function() {
  localStorage.removeItem("hiSens_token");
  localStorage.removeItem("hiSens_rol");
  window.location.href = 'login.html';
}

window.fetchWithToken = async function(url, options = {}) {
  const token = window.getGlobalToken();
  if (!token) {
    console.warn("No hay token. Redirigiendo a login.");
    window.location.href = 'login.html';
    throw new Error("No autorizado");
  }
  
  const headers = {
    ...options.headers,
    'Authorization': `Bearer ${token}`
  };

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    console.error("Token inválido o expirado. Cerrando sesión.");
    window.globalLogout();
    throw new Error("No autorizado");
  }

  return response;
}


// --- 2. Lógica de Permisos ---

function checkPagePermission() {
  const rol = window.getGlobalRole();
  const path = window.location.pathname;
  if (!rol) return true;

  // Nodos: Solo Admin
  if (path.endsWith('nodos.html') && rol !== 'Admin') {
    return false;
  }

  // Config, Registros, Usuarios: Solo Admin
  if ( (path.endsWith('config.html') || 
         path.endsWith('registros.html') || 
         path.endsWith('usuarios.html')) 
       && rol !== 'Admin') {
    return false;
  }

  // Alarmas: Tecnico, Supervisor, Admin
  if (path.endsWith('alarmas.html') && !['Admin', 'Supervisor', 'Tecnico'].includes(rol)) {
    return false;
  }
  
  return true;
}

function applyRolePermissions() {
  const rol = window.getGlobalRole();
  if (!rol) return; 
  
  document.querySelectorAll('.user-role-display').forEach(el => el.textContent = rol);

  const navLinks = document.querySelectorAll('.nav-main a');
  navLinks.forEach(link => {
    const rolRequerido = link.getAttribute('data-role');
    
    if (rolRequerido) { 
      if (rolRequerido === 'Admin' && rol !== 'Admin') {
         link.style.display = 'none';
      }
      else if (rolRequerido === 'Supervisor' && !['Admin', 'Supervisor'].includes(rol)) {
         link.style.display = 'none';
      }
      else if (rolRequerido === 'Tecnico' && !['Admin', 'Supervisor', 'Tecnico'].includes(rol)) {
         link.style.display = 'none';
      }
    }
  });
}

function setupGlobalLogout() {
  const logoutLinks = document.querySelectorAll('.header-user a');
  logoutLinks.forEach(link => {
    if (link.textContent.includes("Cerrar Sesión")) {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        window.globalLogout();
      });
    }
  });
}

function globalCheckAuth() {
  if (!window.getGlobalToken()) {
    const path = window.location.pathname;
    if (!path.endsWith('login.html') && !path.endsWith('reset-password.html')) {
      window.location.href = 'login.html';
    }
    return false;
  }
  return true;
}

function setupProfileLink() {
  const profileLinks = document.querySelectorAll('.header-user a');
  profileLinks.forEach(link => {
    if (link.textContent.trim() === "Configurar Usuario") {
       link.href = "perfil.html";
    }
  });
}

// --- 3. Lógica de Timeout de Sesión (NUEVA) ---
async function initSessionTimeout() {
  const rol = window.getGlobalRole();
  
  // [VERIFICACIÓN] Excluir roles Visitante y Supervisor
  if (['Visitante', 'Supervisor'].includes(rol)) {
    console.log(`[Auth] Timeout de sesión desactivado intencionalmente para: ${rol}`);
    return; // Salimos de la función, no se activa el timer
  }

  try {
    // Consultar configuración al backend
    // Usamos ruta relativa vacía para la API (asume mismo dominio)
    const response = await window.fetchWithToken('/api/configuracion'); 
    if (!response.ok) return;
    
    const config = await response.json();
    const timeoutMinutos = parseInt(config.sesion_inactividad);

    if (!timeoutMinutos || timeoutMinutos <= 0) return;

    console.log(`[Auth] Monitor de inactividad iniciado: ${timeoutMinutos} minutos.`);

    let timeoutTimer;
    const timeoutMS = timeoutMinutos * 60 * 1000;

    function resetTimer() {
      clearTimeout(timeoutTimer);
      timeoutTimer = setTimeout(() => {
        console.warn("[Auth] Sesión expirada por inactividad.");
        alert("Tu sesión ha expirado por inactividad.");
        window.globalLogout();
      }, timeoutMS);
    }

    // Eventos que reinician el contador
    window.onload = resetTimer;
    document.onmousemove = resetTimer;
    document.onkeypress = resetTimer;
    document.onclick = resetTimer;
    document.onscroll = resetTimer;

    resetTimer(); // Iniciar contador

  } catch (e) {
    console.error("Error al iniciar timeout de sesión:", e);
  }
}


// --- 4. Arranque ---
if (globalCheckAuth()) {
  if (!checkPagePermission()) {
    window.location.href = 'index.html'; 
  } else {
    setupGlobalLogout();
    setupProfileLink();
    document.addEventListener("DOMContentLoaded", () => {
        applyRolePermissions();
        initSessionTimeout(); // <--- Iniciar el monitor
    });
  }
}