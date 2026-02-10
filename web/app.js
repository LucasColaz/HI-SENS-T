/*
  HI SENS – Dashboard v16.0 (Alarmas Sonoras y Heartbeat)
  - Generador de tonos de alarma.
  - Indicador visual de conexión.
  - Sin popups bloqueantes.
*/

// --- Globales ---
const getToken = window.getGlobalToken;
const getRole = window.getGlobalRole;
const fetchWithToken = window.fetchWithToken;

// --- Constantes ---
const API_URL = '';
const contenedor = document.getElementById("contenedor");
const tarjetas = {};
const estadoNodos = {};

// Modales
const graphModalBackdrop = document.getElementById("graph-modal-backdrop");
const graphModal = document.getElementById("graph-modal");
const chartCanvas = document.getElementById("history-chart");
const configModal = document.getElementById("config-modal");
const configBackdrop = document.getElementById("config-modal-backdrop");

let historyChartInstance = null;

// --- AUDIO SYSTEM ---
let audioCtx = null;
let isSoundEnabled = false;
let alarmInterval = null;
let activeAlarms = 0; // Contador de alarmas activas

// --- INICIO ---
async function iniciarDashboard() {
  console.log("🚀 Iniciando Dashboard (v16.0)...");

  setupSoundSystem(); // Configurar botón de audio

  const data = await cargarConfiguracionDesdeAPI();
  if (!data) {
    setSystemStatus(false); // Marcar desconectado si falla carga
    return;
  }
  const { configNodos, estadoMap } = data;

  // 1. Configurar Selector de Áreas
  const locationSelect = document.getElementById("location-select");
  if (locationSelect) {
    const areas = new Set();
    configNodos.forEach(nodo => { if (nodo.area && nodo.area !== "Pendiente") areas.add(nodo.area); });
    locationSelect.innerHTML = "";
    if (areas.size === 0) locationSelect.add(new Option("Sin áreas", ""));
    else areas.forEach(area => locationSelect.add(new Option(area, area)));
    locationSelect.addEventListener("change", () => filtrarTarjetasVisibles(allCards));
  }

  if (contenedor) contenedor.innerHTML = "";
  const allCards = [];

  // 2. Procesar Nodos y Sensores
  configNodos.forEach(nodo => {
    if (nodo.area === "Pendiente") return; // No mostramos nodos sin configurar

    const areaGlobal = nodo.area;
    const subUbicacion = [nodo.piso, nodo.direccion].filter(Boolean).join(" - ");
    const detalleNodo = `${subUbicacion} <small style='opacity:0.7'>[${nodo.id}]</small>`;

    nodo.sensores.forEach(sensorConfig => {
      // Ignorar sensores no visibles
      if (!sensorConfig.visible) return;

      const estadoSensor = estadoMap[sensorConfig.id] || { conectado: false, valor: null, bateria: null };

      estadoSensor.unidad = sensorConfig.unidad;
      estadoSensor.tipo = sensorConfig.tipo;
      estadoSensor.bateria = nodo.bateria;

      const nuevaTarjeta = crearTarjeta(sensorConfig, estadoSensor, areaGlobal, detalleNodo);
      if (contenedor) contenedor.appendChild(nuevaTarjeta);
      allCards.push(nuevaTarjeta);
    });
  });

  // Listeners Generales
  const closeGraphBtn = document.getElementById("graph-modal-close-btn");
  if (closeGraphBtn) closeGraphBtn.addEventListener("click", cerrarModalGrafico);
  if (graphModalBackdrop) graphModalBackdrop.addEventListener("click", cerrarModalGrafico);

  setupConfigModalListeners();
  filtrarTarjetasVisibles(allCards);
  setupFullscreenControls();

  // Sockets (Tiempo Real)
  try {
    const socket = io(API_URL, { auth: { token: getToken() } });

    socket.on("connect", () => setSystemStatus(true));
    socket.on("disconnect", () => setSystemStatus(false));
    socket.on('dato_sensor', (data) => {
      // 1. Convertimos a lista siempre
      let lista = Array.isArray(data) ? data : [data];

      console.log("⚡ Procesando datos...", lista);

      lista.forEach(sensor => {
        // Construimos el ID único que buscamos en el HTML
        // Si el sensor es LAB-T1, buscamos "dato-LAB-T1"
        const idElemento = `dato-${sensor.id_sensor}`;
        const elemento = document.getElementById(idElemento);

        if (elemento) {
          // Si encontramos la tarjeta, actualizamos el valor
          let valorTexto = sensor.valor;

          // Formato bonito según el tipo
          if (sensor.tipo === "TEMPERATURA") {
            valorTexto = parseFloat(sensor.valor).toFixed(1) + " °C";
          } else if (sensor.tipo === "VOLTAJE") {
            valorTexto = parseFloat(sensor.valor).toFixed(0) + " V";
          }

          elemento.innerText = valorTexto;

          // Quitamos estilos de advertencia
          if (elemento.classList.contains("text-warning")) {
            elemento.classList.remove("text-warning");
            // Intentar buscar el padre card para actualizar estado
            const card = elemento.closest(".status-card");
            if (card) {
              card.classList.remove("estado-aviso");
              card.classList.add("estado-ok");
            }
          }

          // Efecto visual (Flash)
          elemento.style.transition = "color 0.2s";
          elemento.style.color = "#28a745"; // Verde
          setTimeout(() => elemento.style.color = "", 500);

        } else {
          console.warn(`⚠️ Llegó el sensor [${sensor.id_sensor}] pero no hay tarjeta con id="${idElemento}"`);
        }
      });
    });
  } catch (e) { console.warn("Socket error", e); }
}


// --- GESTIÓN DE SONIDO ---
function setupSoundSystem() {
  const btn = document.getElementById("btn-sound-toggle");
  if (['Admin', 'Supervisor'].includes(userRole)) {
    const configBtn = document.createElement("button");
    configBtn.className = "card-config-btn";
    configBtn.innerHTML = "⚙️";
    configBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      abrirModalConfiguracion(sensorConfig);
    });
    card.appendChild(configBtn);
  }

  card.append(h2, subTitle, valorEl, infoEl);
  card.addEventListener("click", () => abrirModalGrafico(sensorConfig.id, sensorConfig.nombre_tarjeta));

  tarjetas[cardId] = { card, valorEl, infoEl };

  estadoNodos[cardId] = {
    titulo: sensorConfig.nombre_tarjeta,
    limAlto: parseFloat(sensorConfig.limite_alto),
    limBajo: parseFloat(sensorConfig.limite_bajo),
    conectado: estadoSensor.conectado,
    valor: estadoSensor.valor,
    bateria: estadoSensor.bateria,
    unidad: estadoSensor.unidad,
    isAlarm: false // Estado local de alarma
  };

  actualizarTarjeta(cardId, estadoNodos[cardId]);
  return card;
}

// --- ACTUALIZAR UI (Con Lógica de Alarma Sonora) ---
function actualizarTarjeta(id, estado) {
  if (!tarjetas[id]) return;
  const { card, valorEl, infoEl } = tarjetas[id];
  card.classList.remove("estado-ok", "estado-alarma", "estado-aviso");

  const unidad = estado.unidad || "";
  const bateriaHTML = `<span class="card-battery-info">${estado.bateria || '--'}% ${estado.bateria > 20 ? '🔋' : '🪫'}</span>`;

  // 1. DESCONECTADO
  if (!estado.conectado) {
    card.classList.add("estado-aviso");
    valorEl.textContent = "Desconectado";
    infoEl.innerHTML = `${bateriaHTML} | Sin Conexión`;
    updateAlarmState(id, false);
    return;
  }

  // 2. SIN DATOS
  if (estado.valor === null || typeof estado.valor === 'undefined') {
    card.classList.add("estado-aviso");
    valorEl.textContent = "---";
    infoEl.innerHTML = `${bateriaHTML} | Esperando...`;
    updateAlarmState(id, false);
    return;
  }

  let hayAlarma = false;

  // 3. DATOS Y ALARMAS
  if (!unidad) {
    // Digital
    const esAlarma = estado.valor > 0.5;
    valorEl.textContent = esAlarma ? "ABIERTA / ON" : "CERRADA / OFF";

    if (esAlarma) {
      card.classList.add("estado-alarma");
      hayAlarma = true;
    } else {
      card.classList.add("estado-ok");
    }
    infoEl.innerHTML = `${bateriaHTML} | Digital`;
  } else {
    // Analógico
    valorEl.textContent = `${estado.valor.toFixed(1)} ${unidad}`;
    infoEl.innerHTML = `${bateriaHTML} | <small>H:${estado.limAlto} / L:${estado.limBajo}</small>`;

    if (estado.valor > estado.limAlto || estado.valor < estado.limBajo) {
      card.classList.add("estado-alarma");
      hayAlarma = true;
    } else {
      card.classList.add("estado-ok");
    }
  }

  // Actualizar contador global de alarmas sonoras
  updateAlarmState(id, hayAlarma);
}

function updateAlarmState(id, isAlarming) {
  const estado = estadoNodos[id];
  if (estado.isAlarm !== isAlarming) {
    estado.isAlarm = isAlarming;
    if (isAlarming) activeAlarms++;
    else activeAlarms = Math.max(0, activeAlarms - 1);

    checkGlobalAlarmState(); // Encender/Apagar sonido según el contador
  }
}

// --- MODALES (Config, Graficos) ---
function abrirModalConfiguracion(sensorConfig) {
  // Llenar datos
  document.getElementById("config-modal-title").textContent = `Ajustar: ${sensorConfig.nombre_tarjeta}`;
  document.getElementById("config-sensor-id").value = sensorConfig.id;
  document.getElementById("config-lim-alto").value = sensorConfig.limite_alto;
  document.getElementById("config-lim-bajo").value = sensorConfig.limite_bajo;
  document.getElementById("config-visible").checked = sensorConfig.visible;

  // Mostrar
  configModal.classList.remove("hidden");
  configBackdrop.classList.remove("hidden");
}

function cerrarModalConfig() {
  configModal.classList.add("hidden");
  configBackdrop.classList.add("hidden");
}

function setupConfigModalListeners() {
  const btnClose = document.getElementById("config-modal-close-btn");
  const btnCancel = document.getElementById("config-modal-cancel-btn");
  const btnSave = document.getElementById("config-modal-save-btn");

  // Listeners para cerrar
  if (btnClose) btnClose.onclick = cerrarModalConfig;
  if (btnCancel) btnCancel.onclick = cerrarModalConfig;

  // IMPORTANTE: Listener para guardar
  if (btnSave) {
    // Quitamos listeners previos para no duplicar si se recarga la función
    const newBtn = btnSave.cloneNode(true);
    btnSave.parentNode.replaceChild(newBtn, btnSave);

    newBtn.addEventListener("click", async () => {
      const id = document.getElementById("config-sensor-id").value;
      const limAlto = parseFloat(document.getElementById("config-lim-alto").value);
      const limBajo = parseFloat(document.getElementById("config-lim-bajo").value);
      const visible = document.getElementById("config-visible").checked;

      if (isNaN(limAlto) || isNaN(limBajo)) {
        alert("Por favor ingrese valores numéricos válidos.");
        return;
      }

      // Efecto visual de carga
      const originalText = newBtn.textContent;
      newBtn.textContent = "Guardando...";
      newBtn.disabled = true;

      try {
        const response = await fetchWithToken(`${API_URL}/api/sensor/config/${id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            limite_alto: limAlto,
            limite_bajo: limBajo,
            visible: visible
          })
        });

        if (!response.ok) throw new Error("Error al guardar configuración");

        // Éxito
        alert("Cambios guardados correctamente.");
        cerrarModalConfig();
        // Recargar dashboard para ver cambios
        iniciarDashboard();

      } catch (error) {
        console.error(error);
        alert("Error: " + error.message);
      } finally {
        newBtn.textContent = originalText;
        newBtn.disabled = false;
      }
    });
  }
}

async function abrirModalGrafico(sensorId, titulo) {
  if (!estadoNodos[`card-${sensorId}`]) return;

  // Si no está ya activo o es diferente, re-creamos, pero en general solo abrimos el modal
  // (La lógica anterior destruía el chart cada vez, mantenemos eso)

  graphModal.classList.remove("hidden");
  if (graphModalBackdrop) graphModalBackdrop.classList.remove("hidden");
  document.getElementById("graph-modal-title").textContent = `Histórico (1h) - ${titulo}`;

  if (historyChartInstance) historyChartInstance.destroy();

  const ctx = chartCanvas.getContext("2d");
  ctx.clearRect(0, 0, chartCanvas.width, chartCanvas.height);
  ctx.font = "16px sans-serif";
  ctx.fillStyle = "#666";
  ctx.textAlign = "center";
  ctx.fillText("Cargando...", chartCanvas.width / 2, chartCanvas.height / 2);

  let historial = [];
  try {
    const res = await fetchWithToken(`${API_URL}/api/sensor/${sensorId}/historial`);
    if (res.ok) historial = await res.json();
  } catch (e) { console.error(e); }

  const labels = [], dataPoints = [];
  historial.forEach(p => {
    labels.push(new Date(p.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    dataPoints.push(p.valor);
  });

  const estado = estadoNodos[`card-${sensorId}`];

  historyChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: titulo,
          data: dataPoints,
          borderColor: "#007bff",
          backgroundColor: "rgba(0,123,255,0.1)",
          fill: true,
          tension: 0.3,
          pointRadius: dataPoints.length > 20 ? 0 : 3
        },
        { label: 'Máx', data: Array(labels.length).fill(estado.limAlto), borderColor: "red", borderDash: [5, 5], pointRadius: 0, borderWidth: 1 },
        { label: 'Mín', data: Array(labels.length).fill(estado.limBajo), borderColor: "red", borderDash: [5, 5], pointRadius: 0, borderWidth: 1 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { suggestedMin: estado.limBajo - 5, suggestedMax: estado.limAlto + 5 }
      }
    }
  });
}

function cerrarModalGrafico() {
  if (graphModalBackdrop) graphModalBackdrop.classList.add("hidden");
  graphModal.classList.add("hidden");
  if (historyChartInstance) { historyChartInstance.destroy(); historyChartInstance = null; }
}

// --- UTILS ---
async function cargarConfiguracionDesdeAPI() {
  try {
    const [cRes, eRes] = await Promise.all([
      fetchWithToken(`${API_URL}/api/nodos/all`),
      fetchWithToken(`${API_URL}/api/sensores/estado-actual`)
    ]);
    if (!cRes.ok || !eRes.ok) throw new Error("API Error");
    return { configNodos: await cRes.json(), estadoMap: (await eRes.json()).reduce((acc, e) => { acc[e.id] = e; return acc; }, {}) };
  } catch (error) { console.error(error); return null; }
}

function filtrarTarjetasVisibles(allCards) {
  const sel = document.getElementById("location-select");
  if (!sel) return;
  const val = sel.value;
  allCards.forEach(c => {
    const loc = c.getAttribute("data-location");
    if (c.getAttribute("data-visible") === 'true' && (!val || loc === val)) c.classList.remove("hidden");
    else c.classList.add("hidden");
  });
}

function setupFullscreenControls() {
  const fullscreenBtn = document.getElementById("fullscreen-btn");
  if (!fullscreenBtn) return;

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => console.warn("Error:", err));
    } else {
      document.exitFullscreen();
    }
  }

  fullscreenBtn.onclick = toggleFullscreen;

  document.addEventListener("dblclick", (e) => {
    if (document.fullscreenElement && !e.target.closest(".status-card")) {
      document.exitFullscreen();
    }
  });

  document.addEventListener("fullscreenchange", () => {
    if (document.fullscreenElement) {
      fullscreenBtn.textContent = "Salir Pantalla Completa";
      document.body.classList.add("fullscreen-mode");
    } else {
      fullscreenBtn.textContent = "Pantalla Completa";
      document.body.classList.remove("fullscreen-mode");
    }
  });
}

document.addEventListener("DOMContentLoaded", iniciarDashboard);