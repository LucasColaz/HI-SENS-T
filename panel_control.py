import streamlit as st
import requests
import time
import uuid

# --- CONFIGURACIÓN ---
# La misma URL y Key que tienes en tu código C++
API_URL = "https://hi-sens-pro-production.up.railway.app/api/lectura"
API_KEY_SECRET = "una-clave-secreta-larga-para-los-nodos-12345"

st.set_page_config(page_title="Simulador ESP32 (Firmware Nuevo)", page_icon="📡", layout="wide")

# --- ESTILOS VISUALES ---
st.markdown("""
<style>
    .stButton button[kind="secondary"] { color: red; border-color: red; }
    .header-style { font-size: 1.1rem; font-weight: bold; color: #4F8BF9; }
</style>
""", unsafe_allow_html=True)

# --- 1. GESTIÓN DE MEMORIA (NODOS Y SENSORES) ---
if 'sistema' not in st.session_state:
    st.session_state.sistema = [
        {
            "id_uuid": str(uuid.uuid4()),
            "nombre": "ESP32-LAB-01", # Coincide con char* id_nodo del C++
            "servicio": "Laboratorio",
            "bateria": 100,
            "sensores": [
                {"id_uuid": str(uuid.uuid4()), "id_sensor": "TEMP-01", "tipo": "Temperatura", "valor": 24.0},
            ]
        }
    ]

# --- FUNCIONES ---
def agregar_nodo():
    st.session_state.sistema.append({
        "id_uuid": str(uuid.uuid4()),
        "nombre": f"ESP32-NUEVO-{len(st.session_state.sistema)+1}",
        "servicio": "General",
        "bateria": 100,
        "sensores": []
    })

def agregar_sensor(nodo_idx):
    st.session_state.sistema[nodo_idx]['sensores'].append({
        "id_uuid": str(uuid.uuid4()),
        "id_sensor": f"SENSOR-{len(st.session_state.sistema[nodo_idx]['sensores'])+1}",
        "tipo": "Temperatura",
        "valor": 0.0
    })

def eliminar_item(lista, indice):
    lista.pop(indice)

def enviar_datos_firmware_nuevo():
    """
    Esta función simula EXACTAMENTE el void enviarDatos() de tu C++
    """
    headers = {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY_SECRET
    }
    
    log_envios = []
    total_enviados = 0
    total_errores = 0
    
    # Recorremos cada NODO creado en pantalla
    for nodo in st.session_state.sistema:
        # Simulamos el desgaste de batería
        nodo['bateria'] = max(0, nodo['bateria'] - 0.5)
        
        # Recorremos cada SENSOR de ese nodo
        for sensor in nodo['sensores']:
            
            # --- AQUÍ ESTÁ EL CAMBIO CLAVE ---
            # Construimos el JSON idéntico a tu String jsonPayload del ESP32
            payload = {
                "id_nodo": nodo['nombre'],       # <--- AHORA SÍ LO ENVIAMOS
                "id_sensor": sensor['id_sensor'],
                "valor": float(sensor['valor']),
                "bateria_nodo": int(nodo['bateria'])
            }
            
            try:
                r = requests.post(API_URL, json=payload, headers=headers, timeout=1)
                if r.status_code == 200:
                    total_enviados += 1
                else:
                    total_errores += 1
                    log_envios.append(f"Error {r.status_code} en {sensor['id_sensor']}")
            except Exception as e:
                total_errores += 1
                log_envios.append(f"Fallo conexión: {sensor['id_sensor']}")

    return total_enviados, total_errores, log_envios

# --- BARRA LATERAL ---
with st.sidebar:
    st.header("⚙️ Configuración")
    modo_auto = st.toggle("🔄 ENVÍO AUTOMÁTICO (Loop)", value=False)
    intervalo = st.slider("Intervalo (segundos)", 1, 30, 10) # 10s igual que tu const long interval
    
    st.divider()
    if st.button("➕ Crear Nuevo ESP32"):
        agregar_nodo()
        st.rerun()

# --- INTERFAZ PRINCIPAL ---
st.title("📡 Simulador de Firmware ESP32")
st.markdown("Este panel genera peticiones **idénticas** a las que haría tu código Arduino/C++.")

if not st.session_state.sistema:
    st.warning("No hay nodos. Crea uno en la barra lateral.")

cols = st.columns(len(st.session_state.sistema)) if st.session_state.sistema else []

for i, nodo in enumerate(st.session_state.sistema):
    with cols[i]:
        with st.container(border=True):
            # CABECERA DEL NODO
            c1, c2 = st.columns([5,1])
            with c1:
                st.markdown(f"<div class='header-style'>片 {nodo['nombre']}</div>", unsafe_allow_html=True)
                nodo['nombre'] = st.text_input("ID Nodo (const char* id_nodo)", value=nodo['nombre'], key=f"name_{nodo['id_uuid']}")
            with c2:
                if st.button("🗑️", key=f"del_n_{nodo['id_uuid']}"):
                    eliminar_item(st.session_state.sistema, i)
                    st.rerun()
            
            nodo['bateria'] = st.slider("Nivel Batería", 0, 100, int(nodo['bateria']), key=f"bat_{nodo['id_uuid']}")
            
            st.divider()
            
            # SENSORES
            for j, sensor in enumerate(nodo['sensores']):
                with st.container(border=True):
                    s1, s2 = st.columns([5,1])
                    with s1:
                        sensor['id_sensor'] = st.text_input("ID Sensor", value=sensor['id_sensor'], key=f"sid_{sensor['id_uuid']}")
                    with s2:
                        if st.button("x", key=f"del_s_{sensor['id_uuid']}"):
                            eliminar_item(nodo['sensores'], j)
                            st.rerun()
                    
                    # Selector de valor según tipo (Solo visual, al final se envía float)
                    sensor['tipo'] = st.selectbox("Tipo", ["Temperatura", "Humedad", "Switch 0/1"], key=f"stype_{sensor['id_uuid']}", label_visibility="collapsed")
                    
                    if sensor['tipo'] == "Switch 0/1":
                        val = st.toggle("Activo", value=(sensor['valor'] == 1.0), key=f"sval_{sensor['id_uuid']}")
                        sensor['valor'] = 1.0 if val else 0.0
                    else:
                        sensor['valor'] = st.number_input("Valor (float)", value=float(sensor['valor']), step=0.5, key=f"sval_{sensor['id_uuid']}")

            if st.button("➕ Añadir Sensor", key=f"add_s_{nodo['id_uuid']}", use_container_width=True):
                agregar_sensor(i)
                st.rerun()

# --- LÓGICA DE ENVÍO ---
st.divider()

if modo_auto:
    # Barra de progreso visual (simula el delay del loop)
    prog = st.progress(0, text=f"Esperando {intervalo} segundos...")
    for p in range(100):
        time.sleep(intervalo / 100)
        prog.progress(p + 1)
    
    # Envío
    ok, err, logs = enviar_datos_firmware_nuevo()
    
    if err == 0:
        st.toast(f"✅ Firmware: Enviados {ok} paquetes JSON correctamente", icon="📡")
    else:
        st.toast(f"⚠️ Errores: {err}. Revisa la consola.", icon="❌")
        for l in logs:
            st.error(l)
            
    st.rerun()

else:
    if st.button("🚀 FORZAR ENVÍO MANUAL (Simular Loop)", type="primary", use_container_width=True):
        ok, err, logs = enviar_datos_firmware_nuevo()
        if err == 0:
            st.success(f"✅ Se enviaron {ok} lecturas al servidor.")
        else:
            st.error(f"❌ Fallaron {err} envíos.")