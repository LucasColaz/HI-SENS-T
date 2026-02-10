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

    socket.on("dato_sensor", (data) => {
      // Efecto visual de latido cada vez que llega un dato
      pulseHeartbeat();
      console.log("📦 Datos recibidos:", data);

      const lista = Array.isArray(data) ? data : [data];

      lista.forEach(d => {
        // Backend envía 'id_sensor', el frontend usaba 'id' anteriormente
        const id = d.id_sensor || d.id;
        const cardId = `card-${id}`;

        console.log(`🔄 Procesando: ${d.tipo} (${d.valor}) -> Card: ${cardId}`);

        if (estadoNodos[cardId]) {
          estadoNodos[cardId].valor = d.valor;
          // Si viene batería, actualizamos
          if (d.bateria_nodo !== undefined) estadoNodos[cardId].bateria = d.bateria_nodo;

          // Si recibimos dato, está conectado
          estadoNodos[cardId].conectado = true;

          actualizarTarjeta(cardId, estadoNodos[cardId]);
        } else {
          console.warn(`⚠️ No encontré tarjeta para ID: ${cardId}. IDs disponibles:`, Object.keys(estadoNodos));
        }
        estadoNodos[cardId].valor = d.valor;
        // Si viene batería, actualizamos
        if (d.bateria_nodo !== undefined) estadoNodos[cardId].bateria = d.bateria_nodo;

        // Si recibimos dato, está conectado
        estadoNodos[cardId].conectado = true;

        actualizarTarjeta(cardId, estadoNodos[cardId]);
      }
      });
  });
} catch (e) { console.warn("Socket error", e); }
}

// --- GESTIÓN DE SONIDO ---
function setupSoundSystem() {
  const btn = document.getElementById("btn-sound-toggle");
  if (!btn) return;

  btn.addEventListener("click", () => {
    isSoundEnabled = !isSoundEnabled;
    if (isSoundEnabled) {
      // Necesario para desbloquear audio en navegadores
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();

      // Prueba de sonido (beep corto)
      beep(0.1, 880, "sine");

      btn.textContent = "🔊 Sonido ON";
      btn.classList.add("sound-on");
      btn.classList.remove("sound-off");
    } else {
      stopAlarmLoop();
      btn.textContent = "🔇 Sonido OFF";
      btn.classList.remove("sound-on");
      btn.classList.add("sound-off");
    }
  });
}

function beep(duration, frequency, type) {
  if (!isSoundEnabled || !audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();

  osc.type = type;
  osc.frequency.value = frequency;
  osc.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  osc.start();
  gainNode.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + duration);
  osc.stop(audioCtx.currentTime + duration);
}

function checkGlobalAlarmState() {
  // Si hay al menos una alarma activa, iniciamos el loop de sonido
  if (activeAlarms > 0) {
    if (!alarmInterval && isSoundEnabled) {
      // Loop: Beep-Beep cada segundo
      const btn = document.getElementById("btn-sound-toggle");
      if (btn) btn.classList.add("sound-active"); // Efecto visual botón

      alarmInterval = setInterval(() => {
        beep(0.2, 1000, "square"); // Tono agudo
        setTimeout(() => beep(0.2, 1000, "square"), 300); // Doble beep
      }, 2000);
    }
  } else {
    stopAlarmLoop();
  }
}

function stopAlarmLoop() {
  if (alarmInterval) {
    clearInterval(alarmInterval);
    alarmInterval = null;
  }
  const btn = document.getElementById("btn-sound-toggle");
  if (btn) btn.classList.remove("sound-active");
}

// --- INDICADOR VISUAL (HEARTBEAT) ---
function setSystemStatus(isOnline) {
  const el = document.getElementById("system-heartbeat");
  if (!el) return; // Validación por si el usuario borró el elemento (aunque acabamos de ver que lo puso)
  const dot = el.querySelector(".pulse-dot");
  if (isOnline) {
    el.style.color = "#28a745";
    el.innerHTML = '<span class="pulse-dot">●</span> Sistema Online';
  } else {
    el.style.color = "#dc3545"; // Rojo
    el.innerHTML = '<span>⚠️</span> Desconectado';
  }
}

function pulseHeartbeat() {
  const dot = document.querySelector(".pulse-dot");
  if (dot) {
    dot.style.transform = "scale(1.5)";
    setTimeout(() => dot.style.transform = "scale(1)", 200);
  }
}

// --- CREAR TARJETA ---
function crearTarjeta(sensorConfig, estadoSensor, areaGlobal, detalleNodo) {
  const cardId = `card-${sensorConfig.id}`;
  const userRole = getRole();

  const card = document.createElement("div");
  card.className = "status-card";
  card.id = cardId;
  card.setAttribute("data-location", areaGlobal);
  card.setAttribute("data-visible", sensorConfig.visible);

  // Header
  const h2 = document.createElement("h2");
  h2.textContent = sensorConfig.nombre_tarjeta;

  // Ubicación
  const subTitle = document.createElement("div");
  subTitle.className = "card-sublocation";
  subTitle.style.fontSize = "0.75rem";
  subTitle.style.color = "#666";
  subTitle.style.padding = "0 20px 5px 20px";
  subTitle.style.borderBottom = "1px solid #eee";
  subTitle.innerHTML = detalleNodo;

  const valorEl = document.createElement("div");
  valorEl.className = "valor";

  const infoEl = document.createElement("div");
  infoEl.className = "info";

  // Botón Config (Supervisor)
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