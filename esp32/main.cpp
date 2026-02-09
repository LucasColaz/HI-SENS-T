#include <Arduino.h>
#include <ArduinoJson.h>
#include <DallasTemperature.h>
#include <OneWire.h>
#include <SocketIoClient.h> // Asegurate de tener la libreria correcta
#include <WiFi.h>
#include <WiFiMulti.h>

// ---------------- CONFIGURACIÓN DE USUARIO ----------------
const char *SSID_WIFI = "HI Publica";
const char *PASS_WIFI = "Italiano";

// Poner SIN "https://" y SIN la barra al final "/"
// Ejemplo: hi-sens-t.up.railway.app
const char *BACKEND_HOST = "hi-sens-t-production.up.railway.app";
const int BACKEND_PORT = 443; // Puerto SSL para Railway

// ---------------- PINES ----------------
#define PIN_DS18B20 4 // Sensor Temperatura
#define PIN_ZMPT 34   // Sensor Voltaje (Analogico)

// ---------------- OBJETOS ----------------
OneWire oneWire(PIN_DS18B20);
DallasTemperature sensors(&oneWire);
SocketIoClient socket;
WiFiMulti wiFiMulti;

// Variables globales
unsigned long lastSendTime = 0;
const int sendInterval = 5000; // Enviar cada 5 segundos

// CALIBRACIÓN ZMPT (AJUSTAR MANUALMENTE CON MULTIMETRO)
// Si el ESP muestra 200V y el multimetro 220V, aumenta este valor.
float SENSIBILIDAD = 580.0;

void setup() {
  Serial.begin(115200);

  // Iniciar Sensores
  sensors.begin();
  pinMode(PIN_ZMPT, INPUT);

  // Conectar WiFi
  wiFiMulti.addAP(SSID_WIFI, PASS_WIFI);
  Serial.print("Conectando a WiFi");
  while (wiFiMulti.run() != WL_CONNECTED) {
    Serial.print(".");
    delay(500);
  }
  Serial.println("\nWiFi conectado!");

  // Conectar Socket.IO (SSL Activado para Railway)
  socket.beginSSL(BACKEND_HOST, BACKEND_PORT, "/socket.io/?EIO=4");

  // Evento de conexión
  socket.on("connect", [](const char *payload, size_t length) {
    Serial.println("Conectado al Servidor Railway!");
  });
}

// Función para calcular Voltaje RMS
float leerVoltajeAC() {
  int maxVal = 0;
  int minVal = 4095;
  unsigned long startMillis = millis();

  // Muestrear durante 20ms (un ciclo completo de 50Hz)
  while (millis() - startMillis < 20) {
    int val = analogRead(PIN_ZMPT);
    if (val > maxVal)
      maxVal = val;
    if (val < minVal)
      minVal = val;
  }

  // Diferencia Pico a Pico
  int peakToPeak = maxVal - minVal;

  // Si hay ruido y es muy bajo, asumimos 0V
  if (peakToPeak < 30)
    return 0.0;

  // Convertir a voltaje real (Fórmula simplificada para calibración)
  float voltaje = peakToPeak / SENSIBILIDAD * 220.0;

  // *Nota: La calibración real depende de tu módulo ZMPT específico.
  // Empieza ajustando el trimpot azul del módulo hasta que veas una onda,
  // luego ajusta la variable SENSIBILIDAD en el código.

  return voltaje;
}

void enviarDatos() {
  // 1. Leer Temperatura
  sensors.requestTemperatures();
  float tempC = sensors.getTempCByIndex(0);

  // Validar error de lectura (-127 es error en DS18B20)
  if (tempC == -127.00) {
    Serial.println("Error leyendo sensor temperatura!");
    return;
  }

  // 2. Leer Voltaje
  float voltaje = leerVoltajeAC();

  // 3. Crear el documento JSON (Capacidad para 2 objetos)
  // Calculadora: 2 objetos * 150 bytes c/u + extra = 512 bytes sobrados
  DynamicJsonDocument doc(512);

  // Convertimos el documento en un Array (Lista [])
  JsonArray array = doc.to<JsonArray>();

  // --- OBJETO 1: TEMPERATURA ---
  JsonObject objTemp = array.createNestedObject();
  objTemp["id_nodo"] = "ESP32-LAB-01";       // <-- OBLIGATORIO
  objTemp["id_sensor"] = "TEMP-DS18B20";     // <-- OBLIGATORIO
  objTemp["tipo"] = "TEMPERATURA";           // <-- OBLIGATORIO
  objTemp["valor"] = tempC;                  // Variable float
  objTemp["ubicacion"] = "Laboratorio Real"; // Opcional

  // --- OBJETO 2: VOLTAJE ---
  JsonObject objVolt = array.createNestedObject();
  objVolt["id_nodo"] = "ESP32-LAB-01";       // <-- OBLIGATORIO
  objVolt["id_sensor"] = "VOLT-ZMPT101";     // <-- OBLIGATORIO
  objVolt["tipo"] = "VOLTAJE";               // <-- OBLIGATORIO
  objVolt["valor"] = voltaje;                // Variable float
  objVolt["ubicacion"] = "Laboratorio Real"; // Opcional

  // 4. Serializar (Convertir a Texto)
  String jsonString;
  serializeJson(doc, jsonString);

  // 5. Enviar por Socket.IO
  if (socket.isConnected()) {
    socket.emit("dato_sensor", jsonString.c_str());
    Serial.println("📤 Datos enviados: " + jsonString);
  } else {
    Serial.println("❌ Error: No hay conexión para enviar datos");
  }
}

void loop() {
  socket.loop();

  if (millis() - lastSendTime > sendInterval) {
    lastSendTime = millis();
    enviarDatos();
  }
}