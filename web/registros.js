/*
  HI SENS – Registros.js
  - Gestión de logs históricos.
  - Exportación a CSV.
*/

const getToken = window.getGlobalToken;
const fetchWithToken = window.fetchWithToken;
const API_URL = '';

let currentTab = 'alarmas';

document.addEventListener("DOMContentLoaded", () => {
    // Configurar fechas por defecto (Últimos 7 días)
    const today = new Date();
    const lastWeek = new Date();
    lastWeek.setDate(today.getDate() - 7);
    
    document.getElementById("filter-date-to").valueAsDate = today;
    document.getElementById("filter-date-from").valueAsDate = lastWeek;

    // Listeners Pestañas
    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            // Activar visualmente
            document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
            e.target.classList.add("active");
            
            // Cambiar lógica
            currentTab = e.target.dataset.tab;
            updateUIForTab();
            cargarRegistros();
        });
    });

    // Listeners Botones
    document.getElementById("btn-search").addEventListener("click", cargarRegistros);
    document.getElementById("btn-export").addEventListener("click", exportarCSV);

    // Carga inicial
    updateUIForTab();
    cargarRegistros();
});

function updateUIForTab() {
    const label = document.getElementById("dynamic-filter-label");
    const input = document.getElementById("filter-dynamic");
    const headers = document.getElementById("table-headers");

    // Limpiar input al cambiar
    input.value = "";

    if (currentTab === 'alarmas' || currentTab === 'conexiones') {
        label.textContent = "ID Sensor (Opcional):";
        input.placeholder = "Ej: LAB-T1";
        headers.innerHTML = `<th>Fecha/Hora</th><th>Tipo</th><th>Sensor</th><th>Detalle</th>`;
    } else if (currentTab === 'auditoria') {
        label.textContent = "Usuario (Opcional):";
        input.placeholder = "Ej: admin";
        headers.innerHTML = `<th>Fecha/Hora</th><th>Acción</th><th>Usuario</th><th>Detalle</th>`;
    } else if (currentTab === 'accesos') {
        label.textContent = "Usuario (Opcional):";
        input.placeholder = "Ej: admin";
        headers.innerHTML = `<th>Fecha/Hora</th><th>Resultado</th><th>Usuario</th><th>IP / Detalle</th>`;
    }
}

async function cargarRegistros() {
    const tbody = document.getElementById("table-body");
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Cargando datos...</td></tr>';

    // Construir URL con parámetros
    const desde = document.getElementById("filter-date-from").value;
    const hasta = document.getElementById("filter-date-to").value;
    const extraFilter = document.getElementById("filter-dynamic").value;

    let endpoint = "";
    let params = `?desde=${desde}&hasta=${hasta}`;

    if (currentTab === 'alarmas') {
        endpoint = "/api/logs/alarmas";
        if (extraFilter) params += `&sensor_id=${extraFilter}`;
    } else if (currentTab === 'conexiones') {
        endpoint = "/api/logs/conexiones";
        if (extraFilter) params += `&sensor_id=${extraFilter}`;
    } else if (currentTab === 'auditoria') {
        endpoint = "/api/logs/auditoria";
        if (extraFilter) params += `&username=${extraFilter}`;
    } else if (currentTab === 'accesos') {
        endpoint = "/api/logs/accesos";
        if (extraFilter) params += `&username=${extraFilter}`;
    }

    try {
        const res = await fetchWithToken(`${API_URL}${endpoint}${params}`);
        if (!res.ok) throw new Error("Error cargando registros");
        
        const logs = await res.json();
        renderTable(logs);
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="4" style="color:red; text-align:center;">Error: ${e.message}</td></tr>`;
    }
}

function renderTable(logs) {
    const tbody = document.getElementById("table-body");
    tbody.innerHTML = "";

    if (logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No se encontraron registros en este rango.</td></tr>';
        return;
    }

    logs.forEach(log => {
        const tr = document.createElement("tr");
        
        // Formatear Fecha
        const fecha = new Date(log.ts).toLocaleString();
        
        // Determinar Estilo Badge
        let badgeClass = "";
        if(log.tipo_evento.includes("ALARMA")) badgeClass = "badge-alarma";
        else if(log.tipo_evento.includes("CREAR") || log.tipo_evento.includes("BORRAR") || log.tipo_evento.includes("EDITAR")) badgeClass = "badge-audit";
        else if(log.tipo_evento.includes("CONECTADO")) badgeClass = "badge-conn";

        // Determinar Columnas según el tab
        let colOrigen = ""; // Puede ser Usuario o Sensor
        if (currentTab === 'alarmas' || currentTab === 'conexiones') {
            colOrigen = log.id_sensor || "Desconocido";
        } else {
            colOrigen = log.username || "Sistema";
        }

        tr.innerHTML = `
            <td>${fecha}</td>
            <td><span class="${badgeClass}">${log.tipo_evento}</span></td>
            <td><strong>${colOrigen}</strong></td>
            <td>${log.detalle}</td>
        `;
        tbody.appendChild(tr);
    });
}

async function exportarCSV() {
    const btn = document.getElementById("btn-export");
    btn.textContent = "Generando..."; btn.disabled = true;

    const desde = document.getElementById("filter-date-from").value;
    const hasta = document.getElementById("filter-date-to").value;
    const extraFilter = document.getElementById("filter-dynamic").value;
    
    let params = `?desde=${desde}&hasta=${hasta}`;
    
    // Mapear filtros al endpoint de exportación
    if (['alarmas', 'conexiones'].includes(currentTab)) {
        if (extraFilter) params += `&sensor_id=${extraFilter}`;
    } else {
        if (extraFilter) params += `&username=${extraFilter}`;
    }

    // El endpoint de exportar usa {tipo_log} en la URL
    // Tipos soportados por backend: alarmas, conexiones, auditoria, accesos
    const url = `${API_URL}/api/exportar/${currentTab}${params}`;

    try {
        const token = getToken();
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) throw new Error("Error en descarga");

        // Truco para descargar el Blob
        const blob = await res.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = `reporte_${currentTab}_${desde}_${hasta}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        
    } catch (e) {
        alert("Error exportando: " + e.message);
    } finally {
        btn.textContent = "📥 Exportar Excel/CSV"; btn.disabled = false;
    }
}