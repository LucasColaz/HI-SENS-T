# [backend/main.py] - Versión Completa con Emails + Limpieza Automática + Fixes Usuarios

import socketio
from fastapi import FastAPI, HTTPException, Depends, status, Request, Header, BackgroundTasks
from sqlalchemy import create_engine, Column, Integer, String, Float, Boolean, ForeignKey, MetaData, Table, text, DateTime, func, PrimaryKeyConstraint
from sqlalchemy.orm import sessionmaker, relationship, declarative_base, Session, joinedload
from sqlalchemy.exc import OperationalError, IntegrityError 
from pydantic import BaseModel, EmailStr
from typing import List, Optional, Annotated
from fastapi.middleware.cors import CORSMiddleware
import datetime
from datetime import timedelta
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from passlib.context import CryptContext
import re 
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse
import os
import csv
import io
from fastapi.responses import StreamingResponse
# --- LIBRERÍAS NUEVAS (Email y Scheduler) ---
from fastapi_mail import FastMail, MessageSchema, ConnectionConfig, MessageType
from apscheduler.schedulers.asyncio import AsyncIOScheduler

# --- 1. Configuración de Base de Datos ---
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://hisens_user:hisens_pass@localhost:5432/hisens_db")
if DATABASE_URL and DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# --- 2. Seguridad ---
SECRET_KEY = "09d25e094faa6ca2556c818166b7a9563b93f7099f6f0f4caa6cf63b88e8d3e7" 
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/token")
API_KEY_SECRET = "una-clave-secreta-larga-para-los-nodos-12345"

# --- 3. Modelos de Datos (Tablas) ---
class Nodo(Base):
    __tablename__ = "nodos"
    id = Column(String, primary_key=True, index=True) 
    area = Column(String, index=True)
    direccion = Column(String, nullable=True)
    piso = Column(String, nullable=True)
    bateria = Column(Integer, default=100)
    sensores = relationship("Sensor", back_populates="nodo")

class Sensor(Base):
    __tablename__ = "sensores"
    id = Column(String, primary_key=True, index=True) 
    id_nodo = Column(String, ForeignKey("nodos.id"))
    nombre_tarjeta = Column(String)
    tipo = Column(String)   # Ej: Temperatura, Contacto, Presión
    unidad = Column(String, nullable=True) # [NUEVO] Ej: °C, Pa, %, (vacío para bool)
    limite_alto = Column(Float, nullable=True)
    limite_bajo = Column(Float, nullable=True)
    visible = Column(Boolean, default=True)
    nodo = relationship("Nodo", back_populates="sensores")
    lecturas = relationship("Lectura", back_populates="sensor")
    eventos = relationship("Evento", back_populates="sensor_obj")

class Lectura(Base):
    __tablename__ = "lecturas"
    id = Column(Integer, autoincrement=True)
    ts = Column(DateTime(timezone=True), default=func.now(), index=True)
    id_sensor = Column(String, ForeignKey("sensores.id"))
    valor = Column(Float)
    sensor = relationship("Sensor", back_populates="lecturas")
    __table_args__ = (PrimaryKeyConstraint('id', 'ts'),)

class Suscripcion(Base):
    __tablename__ = "suscripciones"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, ForeignKey("usuarios.username"))
    area = Column(String) 
    usuario = relationship("Usuario", back_populates="suscripciones")

class Usuario(Base):
    __tablename__ = "usuarios"
    username = Column(String, primary_key=True, index=True)
    nombre_completo = Column(String)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    rol = Column(String, default="Tecnico")
    puesto = Column(String, nullable=True)
    activo = Column(Boolean, default=True)
    force_password_change = Column(Boolean, default=True)
    eventos = relationship("Evento", back_populates="usuario_obj")
    suscripciones = relationship("Suscripcion", back_populates="usuario", cascade="all, delete-orphan")

class Evento(Base):
    __tablename__ = "eventos"
    id = Column(Integer, primary_key=True, autoincrement=True)
    ts = Column(DateTime(timezone=True), default=func.now(), index=True)
    tipo_evento = Column(String, index=True) 
    username = Column(String, ForeignKey("usuarios.username"), nullable=True) 
    id_sensor = Column(String, ForeignKey("sensores.id"), nullable=True) 
    detalle = Column(String) 
    usuario_obj = relationship("Usuario", back_populates="eventos")
    sensor_obj = relationship("Sensor", back_populates="eventos")

class Configuracion(Base):
    __tablename__ = "configuracion"
    id = Column(String, primary_key=True, index=True) 
    valor = Column(String, nullable=True)


# --- 4. Modelos Pydantic ---
class SensorConfig(BaseModel):
    limite_alto: float
    limite_bajo: float
    visible: bool

class SensorInfo(BaseModel):
    id: str
    nombre_tarjeta: str
    nombre_tarjeta: str
    tipo: str
    unidad: Optional[str] = None # [NUEVO]
    limite_alto: Optional[float]
    limite_bajo: Optional[float]
    visible: bool
    class Config: from_attributes = True 

class NodoInfo(BaseModel):
    id: str
    area: str
    direccion: Optional[str] = None
    piso: Optional[str] = None
    bateria: int
    sensores: List[SensorInfo] = []
    class Config: from_attributes = True 

class NodoCreate(BaseModel):
    id: str
    area: str
    direccion: Optional[str] = None
    piso: Optional[str] = None

class NodoUpdate(BaseModel):
    area: str
    direccion: Optional[str] = None
    piso: Optional[str] = None

class SensorCreate(BaseModel):
    id: str
    nombre_tarjeta: str
    nombre_tarjeta: str
    tipo: str
    unidad: Optional[str] = None # [NUEVO]
    id_nodo: str

class LecturaRequest(BaseModel):
    id_nodo: str # <--- AHORA ES OBLIGATORIO
    id_sensor: str
    valor: float
    bateria_nodo: Optional[int] = None

class SensorEstado(BaseModel):
    id: str
    valor: Optional[float]
    bateria: Optional[int]
    conectado: bool
    
class User(BaseModel):
    username: str
    nombre_completo: str
    email: str
    rol: str
    puesto: Optional[str]
    activo: bool
    suscripciones: List[str] = [] 
    class Config: from_attributes = True
    @staticmethod
    def resolve_suscripciones(user_obj):
        return [s.area for s in user_obj.suscripciones]

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    must_reset: bool = False
    rol: str 

class PasswordChangeRequest(BaseModel):
    new_password: str

class UserCreateRequest(BaseModel):
    username: str
    nombre_completo: str
    email: str
    rol: str
    puesto: Optional[str] = None
    password: str 
    suscripciones: List[str] = []

class UserUpdateRequest(BaseModel):
    nombre_completo: str
    email: str
    rol: str
    puesto: Optional[str] = None
    suscripciones: List[str] = []

class UserDeleteRequest(BaseModel):
    username_to_delete: str
    admin_password: str

class LecturaHistorial(BaseModel):
    ts: datetime.datetime
    valor: float

class EventoLog(BaseModel):
    ts: datetime.datetime
    tipo_evento: str
    username: Optional[str] = None
    id_sensor: Optional[str] = None
    detalle: str
    class Config: from_attributes = True

class ConfiguracionUpdate(BaseModel):
    timeout_desconexion: int
    silencio_alarmas: int
    sonido_alarma: bool
    sesion_inactividad: int
    retencion_conexiones: int
    retencion_auditoria: int
    retencion_accesos: int
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_user: Optional[str] = None
    smtp_pass: Optional[str] = None
    smtp_from: Optional[str] = None
    smtp_tls: bool = False

class ConfiguracionGet(ConfiguracionUpdate):
    pass

class RecoveryRequest(BaseModel):
    email: EmailStr

class RecoveryReset(BaseModel):
    token: str
    new_password: str

# --- 5. Funciones Auxiliares ---
def create_recovery_token(email: str):
    # Token válido por 15 minutos solo para recuperación
    expire = datetime.datetime.now(datetime.timezone.utc) + timedelta(minutes=15)
    to_encode = {"sub": email, "scope": "recovery", "exp": expire}
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def get_db():
    db = SessionLocal()
    try: yield db
    finally: db.close()

def get_api_key(x_api_key: str = Header(None)):
    if not x_api_key or x_api_key != API_KEY_SECRET:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="X-API-Key inválida")
    return x_api_key

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def validate_password_complexity(password: str):
    if len(password) < 8: raise HTTPException(400, "Mínimo 8 caracteres")
    if not re.search(r"[A-Z]", password): raise HTTPException(400, "Falta mayúscula")
    if not re.search(r"[0-9]", password): raise HTTPException(400, "Falta número")
    return password

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.datetime.now(datetime.timezone.utc) + (expires_delta or timedelta(minutes=15))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def get_user(db: Session, username: str):
    return db.query(Usuario).filter(Usuario.username == username).first()

async def get_current_user(token: Annotated[str, Depends(oauth2_scheme)], db: Session = Depends(get_db)):
    creds_exc = HTTPException(status.HTTP_401_UNAUTHORIZED, "Credenciales inválidas", {"WWW-Authenticate": "Bearer"})
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None: raise creds_exc
    except JWTError: raise creds_exc
    user = get_user(db, username)
    if user is None: raise creds_exc
    return user

async def get_current_active_user(current_user: Annotated[User, Depends(get_current_user)]):
    if not current_user.activo: raise HTTPException(400, "Usuario inactivo")
    return current_user

async def get_current_tecnico_user(current_user: Annotated[User, Depends(get_current_active_user)]):
    if current_user.rol not in ["Admin", "Supervisor", "Tecnico"]: raise HTTPException(403, "Permisos insuficientes")
    return current_user

async def get_current_supervisor_user(current_user: Annotated[User, Depends(get_current_active_user)]):
    if current_user.rol not in ["Admin", "Supervisor"]: raise HTTPException(403, "Permisos insuficientes")
    return current_user

async def get_current_admin_user(current_user: Annotated[User, Depends(get_current_active_user)]):
    if current_user.rol != "Admin": raise HTTPException(403, "Permisos insuficientes")
    return current_user

# --- TAREA ASÍNCRONA: Enviar Email ---
async def enviar_email_alerta(conf_dict: dict, destinatarios: List[str], asunto: str, cuerpo: str):
    try:
        conf = ConnectionConfig(
            MAIL_USERNAME = conf_dict.get("smtp_user"),
            MAIL_PASSWORD = conf_dict.get("smtp_pass"),
            MAIL_FROM = conf_dict.get("smtp_from"),
            MAIL_PORT = int(conf_dict.get("smtp_port", 587)),
            MAIL_SERVER = conf_dict.get("smtp_host"),
            MAIL_STARTTLS = str(conf_dict.get("smtp_tls")).lower() == "true",
            MAIL_SSL_TLS = False,
            USE_CREDENTIALS = True,
            VALIDATE_CERTS = True
        )
        message = MessageSchema(
            subject=asunto,
            recipients=destinatarios,
            body=cuerpo,
            subtype=MessageType.html
        )
        fm = FastMail(conf)
        await fm.send_message(message)
        print(f"📧 Email enviado a {len(destinatarios)} destinatarios.")
    except Exception as e:
        print(f"❌ Error enviando email: {e}")

# --- TAREA PROGRAMADA: Limpieza de Datos ---
async def ejecutar_limpieza_diaria():
    print("🧹 Ejecutando limpieza automática de datos...")
    db = SessionLocal()
    try:
        # 1. Leer configuración
        configs = db.query(Configuracion).all()
        conf = {c.id: int(c.valor) for c in configs if c.valor and c.valor.isdigit()}
        
        # 2. Definir límites (días)
        dias_conex = conf.get("retencion_conexiones", 90)
        dias_audit = conf.get("retencion_auditoria", 365)
        dias_acceso = conf.get("retencion_accesos", 180)
        
        ahora = datetime.datetime.now(datetime.timezone.utc)

        # 3. Limpiar EVENTOS
        # Accesos (Login)
        fecha_acceso = ahora - timedelta(days=dias_acceso)
        db.query(Evento).filter(
            Evento.tipo_evento.in_(["LOGIN_EXITOSO", "LOGIN_FALLIDO"]),
            Evento.ts < fecha_acceso
        ).delete(synchronize_session=False)

        # Conexiones (Sensores)
        fecha_conex = ahora - timedelta(days=dias_conex)
        db.query(Evento).filter(
            Evento.tipo_evento.in_(["DESCONECTADO", "RECONECTADO"]),
            Evento.ts < fecha_conex
        ).delete(synchronize_session=False)

        # Auditoría (Resto)
        fecha_audit = ahora - timedelta(days=dias_audit)
        db.query(Evento).filter(
            Evento.tipo_evento.notin_(["LOGIN_EXITOSO", "LOGIN_FALLIDO", "DESCONECTADO", "RECONECTADO"]),
            Evento.ts < fecha_audit
        ).delete(synchronize_session=False)

        # 4. Limpiar LECTURAS (Crítico: Usamos 90 días por defecto para no saturar)
        # Se asume una retención prudente para las series temporales
        dias_lecturas = 90
        fecha_lecturas = ahora - timedelta(days=dias_lecturas)
        db.query(Lectura).filter(Lectura.ts < fecha_lecturas).delete(synchronize_session=False)

        db.commit()
        print("✅ Limpieza completada.")
        
    except Exception as e:
        print(f"❌ Error en limpieza diaria: {e}")
        db.rollback()
    finally:
        db.close()


# --- 6. Inicialización App ---
app = FastAPI(title="HI-SENS API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins="*")
socket_app = socketio.ASGIApp(sio, app)
app.mount("/web", StaticFiles(directory="web"), name="web")

# Scheduler (Planificador)
scheduler = AsyncIOScheduler()

@app.get("/")
def read_root(): return RedirectResponse(url="/web/login.html")

def seed_database(db: Session):
    # --- LIMPIEZA MVP: Borrar sensores que no sean Temperatura, Contacto o Voltaje ---
    tipos_permitidos = ["Temperatura", "Contacto", "Voltaje", "Generico"]
    sensores_borrar = db.query(Sensor).filter(Sensor.tipo.notin_(tipos_permitidos)).all()
    if sensores_borrar:
        print(f"🧹 MVP Cleanup: Borrando {len(sensores_borrar)} sensores no permitidos...")
        for s in sensores_borrar:
            db.delete(s)
        db.commit()
    # ----------------------------------------------------------------------------- 


    if db.query(Nodo).count() == 0:
        print("Sembrando datos...")
        nodo_lab = Nodo(id="ESP32-LAB-01", area="Laboratorio", direccion="Roma 123", piso="PB", bateria=95)
        nodo_qrf = Nodo(id="ESP32-QRF-01", area="Quirófanos", direccion="Roma 123", piso="Piso 2", bateria=15)
        db.add_all([nodo_lab, nodo_qrf])
        db.commit() 
        sensores = [
            Sensor(id="LAB-T1", id_nodo="ESP32-LAB-01", nombre_tarjeta="Heladera 1", tipo="Temperatura", unidad="°C", limite_alto=6, limite_bajo=-0.5),
            Sensor(id="LAB-T2", id_nodo="ESP32-LAB-01", nombre_tarjeta="Heladera 2", tipo="Temperatura", unidad="°C", limite_alto=8, limite_bajo=2),
            Sensor(id="LAB-P1", id_nodo="ESP32-LAB-01", nombre_tarjeta="Puerta Lab", tipo="Contacto", unidad="", limite_alto=0.5, limite_bajo=None), # 0=Cerrada, 1=Abierta
            # [MVP] Agregamos un sensor de Voltaje como ejemplo
            Sensor(id="UPS-V1", id_nodo="ESP32-LAB-01", nombre_tarjeta="Voltaje UPS", tipo="Voltaje", unidad="V", limite_alto=240, limite_bajo=210)
        ]
        db.add_all(sensores)
        db.commit()
    if db.query(Usuario).count() == 0:
        admin_user = Usuario(username="admin", nombre_completo="Admin", email="admin@hospital.com", hashed_password=get_password_hash("Admin1234"), rol="Admin", activo=True, force_password_change=False)
        db.add(admin_user)
        db.commit()
    if db.query(Configuracion).count() == 0:
        default_config = [
            Configuracion(id="timeout_desconexion", valor="300"), 
            Configuracion(id="silencio_alarmas", valor="60"),
            Configuracion(id="retencion_conexiones", valor="90"),
            Configuracion(id="retencion_auditoria", valor="365"),
            Configuracion(id="retencion_accesos", valor="180")
        ]
        db.add_all(default_config)

        db.commit()
# [NUEVO] Crear usuario Sistema para logs automáticos
    if db.query(Usuario).filter(Usuario.username == "Sistema").count() == 0:
        system_user = Usuario(
            username="Sistema",
            nombre_completo="Sistema Automático",
            email="sistema@hisens.local",
            hashed_password="!", # Contraseña inútil, nadie puede loguearse
            rol="System", # Rol especial
            activo=True,
            force_password_change=False
        )
        db.add(system_user)
        db.commit()
@app.on_event("startup")
async def on_startup():
    try:
        engine.connect()
        Base.metadata.create_all(bind=engine)
        db = SessionLocal()
        seed_database(db)
        db.close()
        
        # INICIAR SCHEDULER
        scheduler.add_job(ejecutar_limpieza_diaria, 'interval', hours=24)
        scheduler.start()
        print("🕒 Planificador de tareas iniciado.")
        
    except Exception as e: print(f"Error startup: {e}")


# --- ENDPOINTS ---

@app.get("/api/usuarios/me", response_model=User)
def read_users_me(current_user: Annotated[User, Depends(get_current_active_user)]):
    lista_areas = [s.area for s in current_user.suscripciones]
    return User(
        username=current_user.username,
        nombre_completo=current_user.nombre_completo,
        email=current_user.email,
        rol=current_user.rol,
        puesto=current_user.puesto,
        activo=current_user.activo,
        suscripciones=lista_areas
    )

@app.post("/api/token", response_model=TokenResponse)
async def login(request: Request, form_data: Annotated[OAuth2PasswordRequestForm, Depends()], db: Session = Depends(get_db)):
    user = get_user(db, form_data.username)
    if not user or not verify_password(form_data.password, user.hashed_password):
        try:
            ip = request.client.host
            db.add(Evento(tipo_evento="LOGIN_FALLIDO", username=form_data.username if user else None, detalle=f"IP: {ip}"))
            db.commit()
        except: pass
        raise HTTPException(401, "Credenciales inválidas")
    
    token = create_access_token({"sub": user.username})
    try:
        ip = request.client.host
        db.add(Evento(tipo_evento="LOGIN_EXITOSO", username=user.username, detalle=f"IP: {ip}"))
        db.commit()
    except: pass
    
    return {"access_token": token, "token_type": "bearer", "must_reset": user.force_password_change, "rol": user.rol}

@app.post("/api/usuarios/crear", response_model=User)
def create_user(d: UserCreateRequest, u: Annotated[User, Depends(get_current_admin_user)], db: Session = Depends(get_db)):
    if not d.email or not d.email.strip() or "@" not in d.email:
        raise HTTPException(400, "Email inválido u obligatorio")
        
    validate_password_complexity(d.password)
    try:
        new_u = Usuario(
            username=d.username, 
            nombre_completo=d.nombre_completo, 
            email=d.email.strip(), 
            hashed_password=get_password_hash(d.password), 
            rol=d.rol, 
            puesto=d.puesto, 
            activo=True, 
            force_password_change=True
        )
        db.add(new_u)
        db.flush()
        for area in set(d.suscripciones): db.add(Suscripcion(username=new_u.username, area=area))
        db.add(Evento(tipo_evento="CREAR_USUARIO", username=u.username, detalle=f"Usuario {d.username} creado"))
        db.commit(); db.refresh(new_u)
    except IntegrityError:
        db.rollback(); raise HTTPException(400, "Usuario o email ya existe")
    except Exception as e:
        db.rollback(); raise HTTPException(500, f"Error: {e}")
    
    lista_areas = [s.area for s in new_u.suscripciones]
    return User(
        username=new_u.username, nombre_completo=new_u.nombre_completo, email=new_u.email,
        rol=new_u.rol, puesto=new_u.puesto, activo=new_u.activo, suscripciones=lista_areas
    )

@app.put("/api/usuarios/editar/{username}", response_model=User)
def update_user(username: str, d: UserUpdateRequest, u: Annotated[User, Depends(get_current_admin_user)], db: Session = Depends(get_db)):
    db_user = get_user(db, username)
    if not db_user: raise HTTPException(404, "No encontrado")
    
    if not d.email or not d.email.strip() or "@" not in d.email:
        raise HTTPException(400, "Email inválido")

    db_user.nombre_completo = d.nombre_completo
    db_user.email = d.email.strip()
    db_user.rol = d.rol
    db_user.puesto = d.puesto
    
    db_user.suscripciones = []
    for area in set(d.suscripciones):
        db_user.suscripciones.append(Suscripcion(area=area))
        
    db.add(Evento(tipo_evento="EDITAR_USUARIO", username=u.username, detalle=f"Usuario {username} editado"))
    try:
        db.commit(); db.refresh(db_user)
    except IntegrityError:
        db.rollback(); raise HTTPException(400, "Email duplicado")
    except Exception as e:
        db.rollback(); raise HTTPException(500, f"Error: {e}")
    
    lista_areas = [s.area for s in db_user.suscripciones]
    return User(
        username=db_user.username, nombre_completo=db_user.nombre_completo, email=db_user.email,
        rol=db_user.rol, puesto=db_user.puesto, activo=db_user.activo, suscripciones=lista_areas
    )

@app.get("/api/usuarios/all", response_model=List[User])
def get_all_users(u: Annotated[User, Depends(get_current_admin_user)], db: Session = Depends(get_db)):
    users = db.query(Usuario).options(joinedload(Usuario.suscripciones)).all()
    return [
        User(username=usr.username, nombre_completo=usr.nombre_completo, email=usr.email, rol=usr.rol, puesto=usr.puesto, activo=usr.activo, suscripciones=[s.area for s in usr.suscripciones]) 
        for usr in users
    ]

@app.post("/api/usuarios/borrar", status_code=204)
def delete_user_verified(req: UserDeleteRequest, u: Annotated[User, Depends(get_current_admin_user)], db: Session = Depends(get_db)):
    if not verify_password(req.admin_password, u.hashed_password): raise HTTPException(401, "Pass incorrecta")
    if u.username == req.username_to_delete: raise HTTPException(400, "No automorición")
    db_user = get_user(db, req.username_to_delete)
    if not db_user: raise HTTPException(404, "No encontrado")
    
    db.delete(db_user)
    db.add(Evento(tipo_evento="BORRAR_USUARIO", username=u.username, detalle=f"Usuario {req.username_to_delete} eliminado"))
    db.commit()

@app.get("/api/nodos/all", response_model=List[NodoInfo])
def get_all_nodos(u: Annotated[User, Depends(get_current_active_user)], db: Session = Depends(get_db)):
    query = db.query(Nodo).options(joinedload(Nodo.sensores))
    if u.rol != "Admin":
        areas_permitidas = [s.area for s in u.suscripciones]
        if not areas_permitidas: return []
        query = query.filter(Nodo.area.in_(areas_permitidas))
    return query.all()

@app.post("/api/nodos/crear")
def create_node(d: NodoCreate, u: Annotated[User, Depends(get_current_supervisor_user)], db: Session = Depends(get_db)):
    if db.query(Nodo).filter(Nodo.id==d.id).first(): raise HTTPException(400, "Existe")
    db.add(Nodo(id=d.id, area=d.area, direccion=d.direccion, piso=d.piso))
    db.add(Evento(tipo_evento="CREAR_NODO", username=u.username, detalle=f"Nodo {d.id} creado"))
    db.commit()
    return {"status":"ok"}

@app.put("/api/nodos/editar/{nid}")
def update_node(nid: str, d: NodoUpdate, u: Annotated[User, Depends(get_current_supervisor_user)], db: Session = Depends(get_db)):
    n = db.query(Nodo).filter(Nodo.id==nid).first()
    if not n: raise HTTPException(404)
    n.area, n.direccion, n.piso = d.area, d.direccion, d.piso
    db.add(Evento(tipo_evento="EDITAR_NODO", username=u.username, detalle=f"Nodo {nid} editado"))
    db.commit()
    return n

@app.post("/api/sensores/crear")
def create_sensor(d: SensorCreate, u: Annotated[User, Depends(get_current_supervisor_user)], db: Session = Depends(get_db)):
    if db.query(Sensor).filter(Sensor.id==d.id).first(): raise HTTPException(400, "Existe")
    if db.query(Sensor).filter(Sensor.id==d.id).first(): raise HTTPException(400, "Existe")
    # [NUEVO] Guardamos la Unidad
    db.add(Sensor(id=d.id, id_nodo=d.id_nodo, nombre_tarjeta=d.nombre_tarjeta, tipo=d.tipo, unidad=d.unidad, limite_alto=30, limite_bajo=0))
    db.add(Evento(tipo_evento="CREAR_SENSOR", username=u.username, detalle=f"Sensor {d.id} creado"))
    db.commit()
    return {"status":"ok"}

@app.post("/api/sensor/config/{sid}")
def update_sensor(sid: str, c: SensorConfig, u: Annotated[User, Depends(get_current_supervisor_user)], db: Session = Depends(get_db)):
    s = db.query(Sensor).filter(Sensor.id==sid).first()
    if not s: raise HTTPException(404)
    s.limite_alto, s.limite_bajo, s.visible = c.limite_alto, c.limite_bajo, c.visible
    db.add(Evento(tipo_evento="CAMBIO_LIMITE", username=u.username, detalle=f"Sensor {sid} configurado"))
    db.commit()
    return {"status":"ok"}

@app.get("/api/sensores/estado-actual", response_model=List[SensorEstado])
def get_status(u: Annotated[User, Depends(get_current_active_user)], db: Session = Depends(get_db)):
    config_timeout = db.query(Configuracion).filter(Configuracion.id == "timeout_desconexion").first()
    timeout_limite = int(config_timeout.valor) if config_timeout and config_timeout.valor.isdigit() else 300
    
    query = text("SELECT DISTINCT ON (id_sensor) id_sensor, valor, ts FROM lecturas ORDER BY id_sensor, ts DESC")
    raw = db.execute(query).fetchall()
    ultimos_datos = {row[0]: {"valor": row[1], "ts": row[2]} for row in raw}
    
    sensores = db.query(Sensor).options(joinedload(Sensor.nodo)).all()
    estado_final = []
    ahora = datetime.datetime.now(datetime.timezone.utc)
    
    for s in sensores:
        dato = ultimos_datos.get(s.id)
        esta_conectado = False
        valor_actual = None
        if dato:
            valor_actual = dato["valor"]
            fecha_dato = dato["ts"]
            if fecha_dato.tzinfo is None: fecha_dato = fecha_dato.replace(tzinfo=datetime.timezone.utc)
            if (ahora - fecha_dato).total_seconds() < timeout_limite:
                esta_conectado = True
        
        estado_final.append(SensorEstado(id=s.id, valor=valor_actual, bateria=s.nodo.bateria, conectado=esta_conectado))
    return estado_final

@app.get("/api/sensor/{sid}/historial", response_model=List[LecturaHistorial])
def get_hist(sid: str, u: Annotated[User, Depends(get_current_active_user)], db: Session = Depends(get_db)):
    t = datetime.datetime.now(datetime.timezone.utc) - timedelta(hours=1)
    return db.query(Lectura).filter(Lectura.id_sensor==sid, Lectura.ts >= t).order_by(Lectura.ts.asc()).all()

@app.get("/api/logs/accesos", response_model=List[EventoLog])
def logs_acc(u: Annotated[User, Depends(get_current_admin_user)], db: Session = Depends(get_db), desde: Optional[str]=None, hasta: Optional[str]=None, username: Optional[str]=None):
    q = db.query(Evento).filter(Evento.tipo_evento.in_(["LOGIN_EXITOSO", "LOGIN_FALLIDO"]))
    if desde: q = q.filter(Evento.ts >= desde)
    if hasta: q = q.filter(Evento.ts < datetime.datetime.fromisoformat(hasta) + timedelta(days=1))
    if username and username != "todos": q = q.filter(Evento.username == username)
    return q.order_by(Evento.ts.desc()).limit(200).all()

@app.get("/api/logs/auditoria", response_model=List[EventoLog])
def logs_audit(u: Annotated[User, Depends(get_current_admin_user)], db: Session = Depends(get_db), desde: Optional[str]=None, hasta: Optional[str]=None, username: Optional[str]=None, sensor_id: Optional[str]=None):
    q = db.query(Evento).filter(Evento.tipo_evento.notin_(["LOGIN_EXITOSO", "LOGIN_FALLIDO", "ALARMA_ALTA", "ALARMA_BAJA", "DESCONECTADO", "RECONECTADO"]))
    if desde: q = q.filter(Evento.ts >= desde)
    if hasta: q = q.filter(Evento.ts < datetime.datetime.fromisoformat(hasta) + timedelta(days=1))
    if username and username != "todos": q = q.filter(Evento.username == username)
    if sensor_id and sensor_id != "todos": q = q.filter(Evento.id_sensor == sensor_id)
    return q.order_by(Evento.ts.desc()).limit(200).all()

@app.get("/api/logs/alarmas", response_model=List[EventoLog])
def logs_alarm(u: Annotated[User, Depends(get_current_tecnico_user)], db: Session = Depends(get_db), desde: Optional[str]=None, hasta: Optional[str]=None, sensor_id: Optional[str]=None):
    q = db.query(Evento).filter(Evento.tipo_evento.in_(["ALARMA_ALTA", "ALARMA_BAJA"]))
    if desde: q = q.filter(Evento.ts >= desde)
    if hasta: q = q.filter(Evento.ts < datetime.datetime.fromisoformat(hasta) + timedelta(days=1))
    if sensor_id and sensor_id != "todos": q = q.filter(Evento.id_sensor == sensor_id)
    return q.order_by(Evento.ts.desc()).limit(200).all()

@app.get("/api/logs/conexiones", response_model=List[EventoLog])
def logs_conn(u: Annotated[User, Depends(get_current_tecnico_user)], db: Session = Depends(get_db), desde: Optional[str]=None, hasta: Optional[str]=None, sensor_id: Optional[str]=None):
    q = db.query(Evento).filter(Evento.tipo_evento.in_(["DESCONECTADO", "RECONECTADO"]))
    if desde: q = q.filter(Evento.ts >= desde)
    if hasta: q = q.filter(Evento.ts < datetime.datetime.fromisoformat(hasta) + timedelta(days=1))
    if sensor_id and sensor_id != "todos": q = q.filter(Evento.id_sensor == sensor_id)
    return q.order_by(Evento.ts.desc()).limit(200).all()

@app.get("/api/configuracion", response_model=ConfiguracionGet)
def get_conf(u: Annotated[User, Depends(get_current_admin_user)], db: Session = Depends(get_db)):
    items = db.query(Configuracion).all()
    d = {i.id: i.valor for i in items}
    return ConfiguracionGet(**d)

@app.put("/api/configuracion", response_model=ConfiguracionGet)
def upd_conf(c: ConfiguracionUpdate, u: Annotated[User, Depends(get_current_admin_user)], db: Session = Depends(get_db)):
    d = c.model_dump()
    for k, v in d.items():
        val = str(v)
        item = db.query(Configuracion).filter(Configuracion.id==k).first()
        if item: item.valor = val
        else: db.add(Configuracion(id=k, valor=val))
    return get_conf(u, db)

@app.get("/api/exportar/{tipo_log}")
def exportar_csv(tipo_log: str, u: Annotated[User, Depends(get_current_active_user)], db: Session = Depends(get_db), desde: Optional[str] = None, hasta: Optional[str] = None, sensor_id: Optional[str] = None, username: Optional[str] = None):
    if tipo_log in ["auditoria", "accesos"] and u.rol != "Admin": raise HTTPException(403)
    if tipo_log in ["alarmas", "conexiones"] and u.rol not in ["Admin", "Supervisor", "Tecnico"]: raise HTTPException(403)

    q = db.query(Evento)
    if tipo_log == "alarmas": q = q.filter(Evento.tipo_evento.in_(["ALARMA_ALTA", "ALARMA_BAJA"]))
    elif tipo_log == "conexiones": q = q.filter(Evento.tipo_evento.in_(["DESCONECTADO", "RECONECTADO"]))
    elif tipo_log == "auditoria": q = q.filter(Evento.tipo_evento.notin_(["LOGIN_EXITOSO", "LOGIN_FALLIDO", "ALARMA_ALTA", "ALARMA_BAJA", "DESCONECTADO", "RECONECTADO"]))
    elif tipo_log == "accesos": q = q.filter(Evento.tipo_evento.in_(["LOGIN_EXITOSO", "LOGIN_FALLIDO"]))
    else: raise HTTPException(400)

    if desde: q = q.filter(Evento.ts >= desde)
    if hasta: q = q.filter(Evento.ts < datetime.datetime.fromisoformat(hasta) + timedelta(days=1))
    if sensor_id and sensor_id != "todos": q = q.filter(Evento.id_sensor == sensor_id)
    if username and username != "todos": q = q.filter(Evento.username == username)
    
    resultados = q.order_by(Evento.ts.desc()).all()
    output = io.StringIO(); writer = csv.writer(output)
    writer.writerow(["Fecha", "Tipo", "Origen", "Detalle"])
    for r in resultados: writer.writerow([r.ts.strftime("%Y-%m-%d %H:%M:%S"), r.tipo_evento, r.id_sensor or r.username or "Sistema", r.detalle])
    output.seek(0)
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv", headers={"Content-Disposition": f"attachment; filename=reporte_{tipo_log}.csv"})

@app.post("/api/usuarios/cambiar-password-propio")
def cambiar_password_propio(r: PasswordChangeRequest, u: Annotated[User, Depends(get_current_active_user)], db: Session = Depends(get_db)):
    validate_password_complexity(r.new_password)
    db_user = get_user(db, u.username)
    db_user.hashed_password = get_password_hash(r.new_password)
    db_user.force_password_change = False
    db.add(Evento(tipo_evento="CAMBIO_PASSWORD", username=u.username, detalle="Usuario cambió su propia contraseña"))
    db.commit()
    return {"status": "ok", "message": "Contraseña actualizada exitosamente."}

# [backend/main.py] - Agregar antes de @app.post("/api/lectura")

class NodeReplaceRequest(BaseModel):
    id_viejo: str
    id_nuevo: str

@app.post("/api/nodos/reemplazar")
def replace_node(req: NodeReplaceRequest, u: Annotated[User, Depends(get_current_admin_user)], db: Session = Depends(get_db)):
    # 1. Buscar ambos nodos
    nodo_viejo = db.query(Nodo).filter(Nodo.id == req.id_viejo).first()
    nodo_nuevo = db.query(Nodo).filter(Nodo.id == req.id_nuevo).first()
    
    if not nodo_viejo or not nodo_nuevo:
        raise HTTPException(404, "Uno de los nodos no existe")
        
    if nodo_nuevo.area != "Pendiente":
        raise HTTPException(400, "El nodo nuevo debe estar en estado 'Pendiente' (sin asignar).")

    # 2. LIMPIEZA DEL NUEVO: Borrar los sensores genéricos que se auto-detectaron en el nuevo
    # (Porque vamos a ponerle los sensores viejos configurados)
    sensores_basura = db.query(Sensor).filter(Sensor.id_nodo == req.id_nuevo).all()
    for s in sensores_basura:
        db.delete(s) # Borramos el sensor genérico "Nuevo SENSOR-X"
    
    # 3. MIGRACIÓN: Mover sensores del viejo al nuevo
    sensores_viejos = db.query(Sensor).filter(Sensor.id_nodo == req.id_viejo).all()
    for s in sensores_viejos:
        s.id_nodo = req.id_nuevo # <--- AQUÍ OCURRE LA MAGIA (Cambiamos el padre)
    
    # 4. HERENCIA: Copiar datos de ubicación
    nodo_nuevo.area = nodo_viejo.area
    nodo_nuevo.direccion = nodo_viejo.direccion
    nodo_nuevo.piso = nodo_viejo.piso
    # (Opcional: Copiar batería no tiene sentido, usamos la del nuevo)

    # 5. ELIMINACIÓN: Borrar el nodo viejo
    db.delete(nodo_viejo)
    
    # 6. Auditoría
    db.add(Evento(tipo_evento="REEMPLAZO_NODO", username=u.username, detalle=f"Nodo {req.id_viejo} reemplazado por {req.id_nuevo}"))
    
    db.commit()
    return {"status": "ok", "message": "Reemplazo exitoso. El historial se ha conservado."}
# [backend/main.py] Reemplazar función ingest

@app.post("/api/lectura")
async def ingest(
    l: LecturaRequest, 
    bg: BackgroundTasks, 
    k: str = Depends(get_api_key), 
    db: Session = Depends(get_db)
):
    # 1. AUTO-DESCUBRIMIENTO DE NODO
    nodo = db.query(Nodo).filter(Nodo.id == l.id_nodo).first()
    if not nodo:
        # Si no existe, lo creamos en estado "Pendiente"
        nodo = Nodo(
            id=l.id_nodo, 
            area="Pendiente", # Marca para que el frontend sepa que es nuevo
            direccion="Sin asignar", 
            piso="-", 
            bateria=l.bateria_nodo or 100
        )
        db.add(nodo)
        db.add(Evento(tipo_evento="NODO_DETECTADO", username="Sistema", detalle=f"Nuevo hardware detectado: {l.id_nodo}"))
        db.commit() # Guardar para que el sensor pueda referenciarlo
        db.refresh(nodo)

    # 2. AUTO-DESCUBRIMIENTO DE SENSOR
    sensor = db.query(Sensor).filter(Sensor.id == l.id_sensor).first()
    if not sensor:
        # Si no existe, lo creamos DESHABILITADO
        sensor = Sensor(
            id=l.id_sensor,
            id_nodo=l.id_nodo,
            nombre_tarjeta=f"Nuevo {l.id_sensor}", # Nombre genérico
            tipo="Generico",
            unidad="",
            visible=False, # <--- IMPORTANTE: Deshabilitado por defecto
            limite_alto=None,
            limite_bajo=None
        )
        db.add(sensor)
        db.add(Evento(tipo_evento="SENSOR_DETECTADO", username="Sistema", detalle=f"Nuevo sensor {l.id_sensor} en {l.id_nodo}"))
        db.commit()
        db.refresh(sensor)

    # 3. Actualizar batería si cambió
    if l.bateria_nodo is not None:
        nodo.bateria = l.bateria_nodo

    # 4. Guardar Lectura
    db.add(Lectura(id_sensor=l.id_sensor, valor=l.valor))
    
    # 5. Lógica de Alarmas (Solo si el sensor es visible/configurado)
    alarma_activa = False
    tipo = ""
    msg = ""
    
    # Solo evaluamos alarmas si tiene límites configurados
    if sensor.visible and sensor.limite_alto is not None and l.valor > sensor.limite_alto:
         alarma_activa = True; tipo = "ALARMA_ALTA"; msg = f"Valor {l.valor}{sensor.unidad or ''} > {sensor.limite_alto}"
         db.add(Evento(tipo_evento=tipo, id_sensor=l.id_sensor, detalle=msg))
    elif sensor.visible and sensor.limite_bajo is not None and l.valor < sensor.limite_bajo:
         alarma_activa = True; tipo = "ALARMA_BAJA"; msg = f"Valor {l.valor}{sensor.unidad or ''} < {sensor.limite_bajo}"
         db.add(Evento(tipo_evento=tipo, id_sensor=l.id_sensor, detalle=msg))

    db.commit()
    
    # Notificar al dashboard (incluso si no está configurado, para ver que "está vivo")
    await sio.emit('nueva_lectura', {"id": l.id_sensor, "valor": l.valor, "bateria": l.bateria_nodo, "conectado": True})

    # Enviar email solo si es visible y hay alarma
    if alarma_activa:
        configs = db.query(Configuracion).all()
        conf_dict = {c.id: c.valor for c in configs}
        if conf_dict.get("smtp_host"):
            users = db.query(Usuario).filter(Usuario.rol.in_(["Admin", "Supervisor"]), Usuario.activo == True).all()
            emails = [u.email for u in users if u.email and "@" in u.email]
            if emails:
                html = f"<h2>⚠️ {tipo}</h2><p>Sensor: {sensor.nombre_tarjeta}</p><p>{msg}</p>"
                bg.add_task(enviar_email_alerta, conf_dict, emails, f"Alerta: {sensor.nombre_tarjeta}", html)

    return {"status":"ok"}

@app.post("/api/password-recovery/request")
async def request_password_recovery(
    r: RecoveryRequest, 
    background_tasks: BackgroundTasks, 
    request: Request,
    db: Session = Depends(get_db)
):
    # 1. Buscar usuario por email
    user = db.query(Usuario).filter(Usuario.email == r.email).first()
    
    # Por seguridad, si no existe no damos error 404, pero tampoco enviamos nada.
    # (Opcional: puedes lanzar 404 si prefieres usabilidad sobre seguridad estricta)
    if not user or not user.activo:
        # Simulamos éxito para no revelar usuarios
        return {"message": "Si el email existe, se enviaron las instrucciones."}

    # 2. Generar Token
    token = create_recovery_token(user.email)
    
    # 3. Construir Link (Detecta automáticamente la URL del servidor)
    # Nota: Asume que el frontend está en la misma URL base bajo /web/
    base_url = str(request.base_url).rstrip("/")
    link = f"{base_url}/web/recover-password.html?token={token}"
    
    # 4. Enviar Email
    configs = db.query(Configuracion).all()
    conf_dict = {c.id: c.valor for c in configs}
    
    if conf_dict.get("smtp_host"):
        html = f"""
        <div style="font-family: Arial; padding: 20px; border: 1px solid #ccc; border-radius: 8px;">
            <h2 style="color: #0056b3;">Recuperación de Contraseña</h2>
            <p>Hola <strong>{user.nombre_completo}</strong>,</p>
            <p>Recibimos una solicitud para restablecer tu contraseña en HI-SENS.</p>
            <p>Haz clic en el siguiente botón para crear una nueva clave:</p>
            <a href="{link}" style="background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Restablecer Contraseña</a>
            <p><small>Este enlace expirará en 15 minutos.</small></p>
            <p><small>Si no solicitaste esto, ignora este correo.</small></p>
        </div>
        """
        background_tasks.add_task(enviar_email_alerta, conf_dict, [user.email], "Restablecer Contraseña - HI SENS", html)
    
    return {"message": "Si el email existe, se enviaron las instrucciones."}

@app.post("/api/password-recovery/reset")
def reset_password_with_token(r: RecoveryReset, db: Session = Depends(get_db)):
    # 1. Validar nueva contraseña
    validate_password_complexity(r.new_password)
    
    # 2. Decodificar y validar token
    try:
        payload = jwt.decode(r.token, SECRET_KEY, algorithms=[ALGORITHM])
        email = payload.get("sub")
        scope = payload.get("scope")
        if not email or scope != "recovery":
            raise HTTPException(400, "Token inválido")
    except JWTError:
        raise HTTPException(400, "El enlace ha expirado o es inválido.")
    
    # 3. Actualizar usuario
    user = db.query(Usuario).filter(Usuario.email == email).first()
    if not user:
        raise HTTPException(404, "Usuario no encontrado")
        
    user.hashed_password = get_password_hash(r.new_password)
    # Ya no necesita cambiarla obligatoriamente
    user.force_password_change = False 
    
    db.add(Evento(tipo_evento="RESET_PASSWORD", username=user.username, detalle="Recuperación por email exitosa"))
    db.commit()
    
    return {"message": "Contraseña actualizada correctamente."}

    return {"status":"ok"}

