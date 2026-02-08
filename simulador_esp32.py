import requests
import time
import random

# --- CONFIGURACIÓN ---
# URL de tu proyecto en Railway
API_URL = "https://hi-sens-pro-production.up.railway.app/api/lectura"

# La clave secreta (Debe coincidir con backend/main.py)
API_KEY = "una-clave-secreta-larga-para-los-nodos-12345"

# --- SIMULACIÓN DE HARDWARE ---
# Simulemos un nodo NUEVO que no existe en tu base de datos
ID_NODO = "ESP32-SIM-NUEVO"  
ID_SENSOR = "SENSOR-X-99"

def enviar_lectura():
    # Simulamos temperatura ambiente (20-25°C)
    valor = round(random.uniform(20.0, 25.0), 2)
    bateria = random.randint(80, 100)
    
    # Payload actualizado (Ahora incluye id_nodo)
    payload = {
        "id_nodo": ID_NODO,      # <--- ESTO ES LO NUEVO
        "id_sensor": ID_SENSOR,
        "valor": valor,
        "bateria_nodo": bateria
    }
    
    headers = {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY
    }
    
    try:
        print(f"📡 Enviando: {payload}...", end=" ")
        response = requests.post(API_URL, json=payload, headers=headers)
        
        if response.status_code == 200:
            print("✅ OK")
        else:
            print(f"❌ Error {response.status_code}: {response.text}")
            
    except Exception as e:
        print(f"❌ Error de conexión: {e}")

if __name__ == "__main__":
    print(f"🚀 Iniciando simulador de nodo: {ID_NODO}")
    print("Presiona CTRL+C para detener.")
    
    while True:
        enviar_lectura()
        # Enviar cada 5 segundos para probar rápido
        time.sleep(5)