/*
  HI SENS – alarmas.js v3.0 (Con Filtros)
  - Filtros por Fecha y Sensor conectados a la API.
*/

// --- Globales ---
const getToken = window.getGlobalToken;
const fetchWithToken = window.fetchWithToken;
const API_URL = '';

document.addEventListener("DOMContentLoaded", () => {
  
  // Referencias DOM
  const tabLinks = document.querySelectorAll(".tab-link");
  const tabPanes = document.querySelectorAll(".tab-pane");
  
  // Filtros
  const filterForm = document.getElementById("alarm-filter-form");
  const filterDesde = document.getElementById("filter-desde");
  const filterHasta = document.getElementById("filter-hasta");
  const filterSensor = document.getElementById("filter-sensor");

  const tbodies = {
    "tab-alarmas": document.getElementById("alarmas-table-body"),
    "tab-conexiones": document.getElementById("conexiones-table-body"),
  };

  const endpoints = {
    "tab-alarmas": "/api/logs/alarmas",
    "tab-conexiones": "/api/logs/conexiones",
  };

  // --- 1. Lógica Principal: Cargar Logs con Filtros ---
  async function cargarLogs(tabId) {
    const endpoint = endpoints[tabId];
    const tbody = tbodies[tabId];
    if (!endpoint || !tbody) return;

    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: #666;">Cargando datos...</td></tr>`;

    try {
      // Construir Query Params (filtros)
      const params = new URLSearchParams();
      if (filterDesde.value) params.append('desde', filterDesde.value);
      if (filterHasta.value) params.append('hasta', filterHasta.value);
      if (filterSensor.value && filterSensor.value !== 'todos') {
          params.append('sensor_id', filterSensor.value);
      }

      const url = `${API_URL}${endpoint}?${params.toString()}`;
      const response = await fetchWithToken(url);
      
      if (!response.ok) throw new Error("Error al obtener datos");
      const logs = await response.json();
      
      renderTablaEventos(tbody, logs);

    } catch (error) {
      console.error(error);
      tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: #dc3545;">Error: ${error.message}</td></tr>`;
    }
  }

  // --- 2. Cargar Lista de Sensores para el Filtro ---
  async function popularFiltroSensores() {
      try {
          const response = await fetchWithToken(`${API_URL}/api/nodos/all`);
          if(response.ok) {
              const nodos = await response.json();
              // Limpiar (excepto la opción "Todos")
              filterSensor.innerHTML = '<option value="todos">Todos los Sensores</option>';
              
              nodos.forEach(nodo => {
                  nodo.sensores.forEach(sensor => {
                      const option = document.createElement('option');
                      option.value = sensor.id;
                      option.textContent = `${sensor.nombre_tarjeta} (${sensor.id})`;
                      filterSensor.appendChild(option);
                  });
              });
          }
      } catch (e) { console.error("Error cargando sensores para filtro", e); }
  }

  // --- 3. Event Listeners ---

  // Cambio de Pestaña
  tabLinks.forEach(link => {
    link.addEventListener("click", () => {
      const tabId = link.getAttribute("data-tab");

      tabLinks.forEach(item => item.classList.remove("active"));
      tabPanes.forEach(pane => pane.classList.remove("active"));

      link.classList.add("active");
      document.getElementById(tabId).classList.add("active");

      cargarLogs(tabId);
    });
  });

  // Botón Filtrar
  if (filterForm) {
      filterForm.addEventListener("submit", (e) => {
          e.preventDefault(); // Evitar recarga de página
          const activeTab = document.querySelector(".tab-link.active").getAttribute("data-tab");
          cargarLogs(activeTab);
      });
  }

  // --- 4. Inicialización ---
  popularFiltroSensores();
  cargarLogs("tab-alarmas");

  // [web/alarmas.js] Agregar dentro del addEventListener("DOMContentLoaded", ...)

  // Referencia al botón
  const exportBtn = document.getElementById("export-btn");

  if (exportBtn) {
      exportBtn.addEventListener("click", () => {
          // 1. Detectar qué pestaña está activa para saber qué exportar
          const activeTabId = document.querySelector(".tab-link.active").getAttribute("data-tab");
          let tipoReporte = "alarmas"; // Por defecto
          
          if (activeTabId === "tab-conexiones") tipoReporte = "conexiones";
          
          // 2. Recopilar filtros actuales
          const params = new URLSearchParams();
          if (filterDesde.value) params.append('desde', filterDesde.value);
          if (filterHasta.value) params.append('hasta', filterHasta.value);
          if (filterSensor.value && filterSensor.value !== 'todos') {
              params.append('sensor_id', filterSensor.value);
          }
          
          // Agregamos el token a la URL (necesario porque es una descarga directa de navegador)
          // Nota: En producción idealmente se haría vía fetch blob, pero esto es rápido y funcional.
          // Como FastAPI espera el token en Header, usaremos un truco: fetch con descarga.
          
          descargarCSV(tipoReporte, params);
      });
  }

  function descargarCSV(tipo, params) {
      const url = `${API_URL}/api/exportar/${tipo}?${params.toString()}`;
      const btn = document.getElementById("export-btn");
      const textoOriginal = btn.textContent;
      
      btn.textContent = "Generando...";
      btn.disabled = true;

      fetchWithToken(url)
        .then(response => {
            if (!response.ok) throw new Error("Error en descarga");
            return response.blob();
        })
        .then(blob => {
            // Crear link fantasma para forzar la descarga
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = downloadUrl;
            a.download = `reporte_${tipo}_${new Date().toISOString().slice(0,10)}.csv`;
            document.body.appendChild(a);
            a.click();
            a.remove();
        })
        .catch(err => {
            console.error(err);
            alert("No se pudo descargar el reporte. Verifica tus permisos.");
        })
        .finally(() => {
            btn.textContent = textoOriginal;
            btn.disabled = false;
        });
  }
});


// --- Renderizado Genérico ---
function renderTablaEventos(tbody, logs) {
  tbody.innerHTML = '';
  if (logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 20px;">No se encontraron eventos con estos filtros.</td></tr>`;
    return;
  }
  
  logs.forEach(log => {
    const row = document.createElement('tr');
    
    let badgeClass = 'status-ok';
    let textoEvento = log.tipo_evento;

    if (log.tipo_evento.includes('ALARMA')) {
        badgeClass = 'status-alarm';
    } else if (log.tipo_evento === 'DESCONECTADO') {
        badgeClass = 'status-warn';
    } 
    
    // Formatear fecha localmente
    const fecha = new Date(log.ts).toLocaleString();

    row.innerHTML = `
      <td>${fecha}</td>
      <td><strong>${log.id_sensor || '-'}</strong></td>
      <td><span class="status-badge ${badgeClass}">${textoEvento}</span></td>
      <td>${log.detalle}</td>
    `;
    tbody.appendChild(row);
  });
}