/*
  HI SENS – Config.js v1.0
  - Carga y Guarda la configuración global del sistema.
*/

const getToken = window.getGlobalToken;
const fetchWithToken = window.fetchWithToken;
const API_URL = '';

document.addEventListener("DOMContentLoaded", () => {
  
  // Referencias DOM
  const confTimeout = document.getElementById("conf-timeout");
  const confSilencio = document.getElementById("conf-silencio");
  const confSonido = document.getElementById("conf-sonido");
  
  const confSesion = document.getElementById("conf-sesion");
  const confRetConexiones = document.getElementById("conf-ret-conexiones");
  const confRetAuditoria = document.getElementById("conf-ret-auditoria");
  const confRetAccesos = document.getElementById("conf-ret-accesos");
  
  const smtpHost = document.getElementById("smtp-host");
  const smtpPort = document.getElementById("smtp-port");
  const smtpUser = document.getElementById("smtp-user");
  const smtpPass = document.getElementById("smtp-pass");
  const smtpFrom = document.getElementById("smtp-from");
  const smtpTls = document.getElementById("smtp-tls");
  
  const mainForm = document.getElementById("config-form-smtp"); // Usamos el form del final como trigger

  // 1. Cargar Configuración al Iniciar
  cargarConfiguracion();

  async function cargarConfiguracion() {
    try {
      const response = await fetchWithToken(`${API_URL}/api/configuracion`);
      if (!response.ok) throw new Error("Error al obtener configuración");
      
      const config = await response.json();
      
      // Poblar campos
      if (confTimeout) confTimeout.value = config.timeout_desconexion;
      if (confSilencio) confSilencio.value = config.silencio_alarmas;
      if (confSonido) confSonido.checked = (config.sonido_alarma === true || config.sonido_alarma === "true");
      
      if (confSesion) confSesion.value = config.sesion_inactividad;
      if (confRetConexiones) confRetConexiones.value = config.retencion_conexiones;
      if (confRetAuditoria) confRetAuditoria.value = config.retencion_auditoria;
      if (confRetAccesos) confRetAccesos.value = config.retencion_accesos;
      
      if (smtpHost) smtpHost.value = config.smtp_host || "";
      if (smtpPort) smtpPort.value = config.smtp_port || 587;
      if (smtpUser) smtpUser.value = config.smtp_user || "";
      if (smtpPass) smtpPass.value = config.smtp_pass || "";
      if (smtpFrom) smtpFrom.value = config.smtp_from || "";
      if (smtpTls) smtpTls.checked = (config.smtp_tls === true || config.smtp_tls === "true");

    } catch (error) {
      console.error(error);
      // No mostrar alerta intrusiva al cargar, solo en consola
    }
  }

  // 2. Guardar Configuración
  if (mainForm) {
    mainForm.addEventListener("submit", async (e) => {
      e.preventDefault(); // Evitar recarga
      
      // Recolectar datos de TODOS los campos
      const newConfig = {
        timeout_desconexion: parseInt(confTimeout.value) || 300,
        silencio_alarmas: parseInt(confSilencio.value) || 60,
        sonido_alarma: confSonido.checked,
        
        sesion_inactividad: parseInt(confSesion.value) || 15,
        retencion_conexiones: parseInt(confRetConexiones.value) || 90,
        retencion_auditoria: parseInt(confRetAuditoria.value) || 365,
        retencion_accesos: parseInt(confRetAccesos.value) || 180,
        
        smtp_host: smtpHost.value,
        smtp_port: parseInt(smtpPort.value) || 587,
        smtp_user: smtpUser.value,
        smtp_pass: smtpPass.value,
        smtp_from: smtpFrom.value,
        smtp_tls: smtpTls.checked
      };

      try {
        const response = await fetchWithToken(`${API_URL}/api/configuracion`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newConfig)
        });

        if (!response.ok) throw new Error("Error al guardar");
        
        // Respuesta exitosa
        const result = await response.json();
        alert("Configuración guardada exitosamente.");
        
        // Recargar para confirmar valores
        cargarConfiguracion();

      } catch (error) {
        console.error(error);
        alert("Error al guardar la configuración.");
      }
    });
  }
});