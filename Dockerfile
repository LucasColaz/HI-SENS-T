# 1. Usamos una imagen base de Python ligera
FROM python:3.10-slim

# 2. Definimos la carpeta de trabajo dentro del contenedor
WORKDIR /app

# 3. Copiamos los requerimientos primero (para aprovechar la caché de Docker)
COPY /backend/requirements.txt .

# 4. Instalamos las librerías
RUN pip install --no-cache-dir -r requirements.txt

# 5. Copiamos el resto del código del proyecto
COPY . .

# 6. Comando de arranque
# OJO: Cambia "main:app" si tu archivo principal no se llama main.py
# $PORT es una variable que Railway rellena automáticamente.
CMD sh -c "uvicorn backend.main:app --host 0.0.0.0 --port $PORT"


#sa
