#include <Arduino.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFi.h>


// --- TUS CREDENCIALES ---
const char *ssid = "HI Publica";
const char *password = "Italiano";

// --- TU URL DE RAILWAY (OJO: Es HTTPS, pero usaremos setInsecure) ---
// Cambia esto por tu URL real, mantén el /api/telemetria al final
const char *serverUrl =
    "https://hi-sens-t-production.up.railway.app/api/telemetria";

// --- VARIABLES ---
float tempC = 25.5; // Simuladas
float voltaje = 220.0;
unsigned long lastTime = 0;
unsigned long timerDelay = 5000; // 5 segundos

void setup() {
  Serial.begin(115200);
  WiFi.begin(ssid, password);

  Serial.print("Conectando a WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\n✅ WiFi Conectado!");
}

void enviarDatosHTTP() {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;

    // 1. Configurar conexión insegura (Vital para Railway)
    WiFiClientSecure client;
    client.setInsecure(); // <--- LA CLAVE MÁGICA

    // 2. Iniciar conexión
    if (http.begin(client, serverUrl)) {
      http.addHeader("Content-Type", "application/json");

      // 3. Crear JSON
      DynamicJsonDocument doc(1024);
      JsonArray array = doc.to<JsonArray>();

      JsonObject obj1 = array.createNestedObject();
      obj1["id_nodo"] = "ESP32-LAB-01";
      obj1["id_sensor"] = "TEMP-001";
      obj1["tipo"] = "TEMPERATURA";
      obj1["valor"] = tempC; // Tu variable real
      obj1["ubicacion"] = "Laboratorio";

      JsonObject obj2 = array.createNestedObject();
      obj2["id_nodo"] = "ESP32-LAB-01";
      obj2["id_sensor"] = "VOLT-001";
      obj2["tipo"] = "VOLTAJE";
      obj2["valor"] = voltaje; // Tu variable real
      obj2["ubicacion"] = "Laboratorio";

      String jsonString;
      serializeJson(doc, jsonString);

      // 4. Enviar POST
      Serial.println("📤 Enviando: " + jsonString);
      int httpResponseCode = http.POST(jsonString);

      if (httpResponseCode > 0) {
        String response = http.getString();
        Serial.println("✅ Servidor respondió: " + String(httpResponseCode));
        Serial.println(response);
      } else {
        Serial.print("❌ Error enviando POST: ");
        Serial.println(httpResponseCode);
      }

      http.end(); // Liberar recursos
    } else {
      Serial.println("❌ No se pudo conectar al servidor");
    }
  } else {
    Serial.println("❌ WiFi desconectado");
  }
}

void loop() {
  // Enviar cada 5 segundos
  if ((millis() - lastTime) > timerDelay) {
    // Actualiza tus sensores aquí
    tempC = tempC + 0.1; // Simulación

    enviarDatosHTTP();
    lastTime = millis();
  }
}