"""
A2 EVENTOS - MÓDULO CÂMERAS
Servidor de Processamento de Vídeo

Autor: A2 Eventos
Descrição: FastAPI server para reconhecimento facial e de placas em tempo real
"""

import os
import sys
import asyncio
import json
import base64
import threading
from datetime import datetime
from typing import Optional, List, Dict, Any
from pathlib import Path

import cv2
import numpy as np
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, HTMLResponse
from pydantic import BaseModel
import uvicorn
from loguru import logger
import redis.asyncio as redis

# Configuração de logging
log_path = Path("logs")
log_path.mkdir(exist_ok=True)
logger.remove()
logger.add(
    sys.stdout,
    format="<green>{time:HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan> - <level>{message}</level>",
    level=os.getenv("LOG_LEVEL", "INFO")
)
logger.add(
    "logs/video_server_{time:YYYY-MM-DD}.log",
    rotation="00:00",
    retention="7 days",
    level="DEBUG",
    format="{time:HH:mm:ss} | {level: <8} | {name} - {message}"
)

# Carregar variáveis de ambiente
from dotenv import load_dotenv
load_dotenv()

# Configurações
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
REDIS_CHANNEL = os.getenv("REDIS_CHANNEL", "detections")
FACE_TOLERANCE = float(os.getenv("FACE_TOLERANCE", 0.6))
MIN_FACE_SIZE = int(os.getenv("MIN_FACE_SIZE", 150))
CONFIDENCE_THRESHOLD = float(os.getenv("CONFIDENCE_THRESHOLD", 0.65))
FRAME_SKIP = int(os.getenv("FRAME_SKIP", 3))
A2_API_URL = os.getenv("A2_API_URL", "http://localhost:3001")
A2_API_KEY = os.getenv("A2_API_KEY", "")
STORAGE_BUCKET = os.getenv("STORAGE_BUCKET", "camera-snapshots")

# FastAPI App
app = FastAPI(
    title="A2 Eventos - Módulo Câmeras",
    description="Reconhecimento facial e de placas em tempo real",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================
# INICIALIZAÇÃO DO INSIGHTFACE
# ============================================
face_app = None
INSIGHTFACE_AVAILABLE = False

try:
    from insightface.app import FaceAnalysis
    logger.info("⏳ Carregando modelo InsightFace Buffalo_L...")
    face_app = FaceAnalysis(name='buffalo_l')
    face_app.prepare(ctx_id=0, det_size=(640, 640))
    INSIGHTFACE_AVAILABLE = True
    logger.info("✅ InsightFace carregado com sucesso!")
except ImportError:
    logger.warning("⚠️ InsightFace não instalado. Usando modo simulação.")
except Exception as e:
    logger.error(f"❌ Erro ao carregar InsightFace: {e}")

# ============================================
# MÓDULOS INTERNOS
# ============================================
sys.path.insert(0, str(Path(__file__).parent))

from services.supabase_client import SupabaseClient
from services.postgres_edge import PostgresEdgeClient
from services.face_processor import FaceProcessor
from services.plate_reader import PlateReader
from services.redis_pubsub import RedisPubSub
from utils.image_utils import save_snapshot, validate_image_quality

supabase = SupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
pg_client = None

# Conectar ao PostgreSQL Edge (mesmo banco do sistema A2)
try:
    pg_client = PostgresEdgeClient()
    logger.info("✅ Conectado ao PostgreSQL Edge do sistema A2")
except Exception as e:
    logger.warning(f"⚠️ PostgreSQL Edge não disponível: {e}")

face_processor = FaceProcessor(face_app, FACE_TOLERANCE, MIN_FACE_SIZE, CONFIDENCE_THRESHOLD)
plate_reader = PlateReader()
redis_pubsub = RedisPubSub(REDIS_HOST, REDIS_PORT, REDIS_CHANNEL)

# ============================================
# GERENCIAMENTO DE CÂMERAS
# ============================================
class CameraStream:
    """Gerencia uma câmera RTSP ou webcam"""
    
    def __init__(self, camera_id: str, rtsp_url: str, name: str = "", location: str = "", tipo: str = "face"):
        self.camera_id = camera_id
        self.rtsp_url = rtsp_url
        self.name = name
        self.location = location
        self.tipo = tipo
        self.cap = None
        self.is_running = False
        self.thread = None
        self.frame_count = 0
        self.last_frame = None
        self.stats = {
            'frames_captured': 0,
            'faces_detected': 0,
            'plates_detected': 0,
            'matches': 0,
            'errors': 0,
            'last_detection': None
        }
        self.lock = threading.Lock()
    
    def connect(self) -> bool:
        """Conecta à câmera"""
        try:
            if self.rtsp_url.startswith('/dev/video') or self.rtsp_url.isdigit():
                # Webcam
                index = int(self.rtsp_url)
                self.cap = cv2.VideoCapture(index)
            else:
                # RTSP
                self.cap = cv2.VideoCapture(self.rtsp_url)
            
            if not self.cap.isOpened():
                logger.error(f"❌ Câmera {self.camera_id} não conseguiu abrir stream")
                return False
            
            logger.info(f"✅ Câmera {self.camera_id} ({self.name}) conectada em {self.rtsp_url}")
            return True
        except Exception as e:
            logger.error(f"❌ Erro ao conectar câmera {self.camera_id}: {e}")
            return False
    
    def disconnect(self):
        """Desconecta da câmera"""
        if self.cap:
            self.cap.release()
            self.cap = None
    
    def start(self):
        """Inicia captura em thread separada"""
        if self.is_running:
            return
        
        if not self.connect():
            return
        
        self.is_running = True
        self.thread = threading.Thread(target=self._capture_loop, daemon=True)
        self.thread.start()
    
    def stop(self):
        """Para captura"""
        self.is_running = False
        if self.thread:
            self.thread.join(timeout=3)
        self.disconnect()
    
    def _capture_loop(self):
        """Loop principal de captura"""
        skip_counter = 0
        
        while self.is_running:
            try:
                if not self.cap or not self.cap.isOpened():
                    logger.warning(f"⚠️ Câmera {self.camera_id} desconectada")
                    break
                
                ret, frame = self.cap.read()
                if not ret or frame is None:
                    with self.lock:
                        self.stats['errors'] += 1
                    continue
                
                with self.lock:
                    self.stats['frames_captured'] += 1
                
                skip_counter += 1
                if skip_counter % FRAME_SKIP != 0:
                    continue
                
                # Processar frame
                self._process_frame(frame)
                
                # Atualizar último frame (para streaming)
                self.last_frame = frame.copy()
                
            except Exception as e:
                logger.error(f"Erro no loop de captura {self.camera_id}: {e}")
                with self.lock:
                    self.stats['errors'] += 1
    
    def _process_frame(self, frame):
        """Processa um frame - detecta faces e placas"""
        try:
            results = []
            
            # Detecção facial
            if self.tipo in ['face', 'both'] and INSIGHTFACE_AVAILABLE:
                faces = face_processor.detect_faces(frame)
                
                for face_data in faces:
                    embedding = face_data['embedding']
                    bbox = face_data['bbox']
                    confidence = face_data['confidence']
                    
                    # Buscar match no banco (PostgreSQL do sistema A2)
                    match = asyncio.run(face_processor.find_match(supabase, embedding, pg_client))
                    
                    if match:
                        with self.lock:
                            self.stats['faces_detected'] += 1
                            self.stats['matches'] += 1
                            self.stats['last_detection'] = datetime.now().isoformat()
                        
                        results.append({
                            'type': 'face',
                            'match': match,
                            'confidence': confidence,
                            'bbox': bbox,
                            'camera_id': self.camera_id,
                            'camera_name': self.name,
                            'location': self.location
                        })
                        
                        # Capturar snapshot
                        self._save_detection(frame, bbox, match, 'face', confidence)
            
            # Detecção de placas
            if self.tipo in ['plate', 'both']:
                plates = plate_reader.detect_plates(frame)
                
                for plate_data in plates:
                    placa = plate_data['plate']
                    confidence = plate_data['confidence']
                    bbox = plate_data['bbox']
                    
                    # Buscar match
                    match = asyncio.run(plate_reader.find_match(supabase, placa))
                    
                    with self.lock:
                        self.stats['plates_detected'] += 1
                    
                    if match:
                        self.stats['matches'] += 1
                        self.stats['last_detection'] = datetime.now().isoformat()
                    
                    results.append({
                        'type': 'plate',
                        'match': match,
                        'confidence': confidence,
                        'plate': placa,
                        'bbox': bbox,
                        'camera_id': self.camera_id,
                        'camera_name': self.name,
                        'location': self.location
                    })
                    
                    if match:
                        self._save_detection(frame, bbox, match, 'plate', confidence)
            
            # Publicar detecções no Redis
            if results:
                for result in results:
                    asyncio.run(redis_pubsub.publish(result))
            
        except Exception as e:
            logger.error(f"Erro ao processar frame: {e}")
    
    def _save_detection(self, frame, bbox, match, detection_type, confidence):
        """Salva snapshot da detecção"""
        try:
            # Recortar região do frame
            x1, y1, x2, y2 = [int(v) for v in bbox]
            x1, y1 = max(0, x1), max(0, y1)
            x2, y2 = min(frame.shape[1], x2), min(frame.shape[0], y2)
            
            if x2 > x1 and y2 > y1:
                snapshot = frame[y1:y2, x1:x2]
                
                # Salvar snapshot
                filename = f"{detection_type}_{self.camera_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.jpg"
                local_path = f"/tmp/camera-snapshots/{filename}"
                
                save_snapshot(snapshot, local_path, quality=80, max_width=800)
                
                # Publicar evento
                event = {
                    'type': detection_type,
                    'camera_id': self.camera_id,
                    'match': match,
                    'confidence': float(confidence),
                    'snapshot_path': local_path,
                    'timestamp': datetime.now().isoformat()
                }
                
                asyncio.run(redis_pubsub.publish(event))
                logger.info(f"📸 Snapshot salvo: {filename}")
                
        except Exception as e:
            logger.error(f"Erro ao salvar snapshot: {e}")
    
    def get_frame_jpeg(self) -> Optional[bytes]:
        """Retorna último frame como JPEG"""
        with self.lock:
            if self.last_frame is None:
                return None
            
            ret, jpeg = cv2.imencode('.jpg', self.last_frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
            if ret:
                return jpeg.tobytes()
            return None
    
    def get_stats(self) -> dict:
        """Retorna estatísticas da câmera"""
        with self.lock:
            return {
                'camera_id': self.camera_id,
                'name': self.name,
                'location': self.location,
                'tipo': self.tipo,
                'is_running': self.is_running,
                **self.stats
            }

# Gerenciador global de câmeras
camera_manager: Dict[str, CameraStream] = {}

def load_cameras_from_env():
    """Carrega câmeras das variáveis de ambiente"""
    i = 1
    while True:
        name = os.getenv(f"CAMERA_{i}_NAME")
        rtsp = os.getenv(f"CAMERA_{i}_RTSP")
        
        if not name or not rtsp:
            break
        
        camera_id = f"camera_{i}"
        location = os.getenv(f"CAMERA_{i}_LOCATION", "")
        tipo = os.getenv(f"CAMERA_{i}_TYPE", "face")
        
        camera_manager[camera_id] = CameraStream(
            camera_id=camera_id,
            rtsp_url=rtsp,
            name=name,
            location=location,
            tipo=tipo
        )
        
        i += 1
    
    logger.info(f"📷 {len(camera_manager)} câmeras carregadas das variáveis de ambiente")

# ============================================
# WEBSOCKET MANAGER
# ============================================
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.lock = asyncio.Lock()
    
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        async with self.lock:
            self.active_connections.append(websocket)
        logger.info(f"🔌 WebSocket conectado: {websocket.client}")
    
    async def disconnect(self, websocket: WebSocket):
        async with self.lock:
            if websocket in self.active_connections:
                self.active_connections.remove(websocket)
        logger.info(f"🔌 WebSocket desconectado: {websocket.client}")
    
    async def broadcast(self, message: dict):
        async with self.lock:
            disconnected = []
            for connection in self.active_connections:
                try:
                    await connection.send_json(message)
                except Exception:
                    disconnected.append(connection)
            
            for conn in disconnected:
                self.active_connections.remove(conn)

ws_manager = ConnectionManager()

# ============================================
# MODELOS PYDANTIC
# ============================================
class EnrollmentRequest(BaseModel):
    cpf: str
    nome: str
    evento_id: Optional[str] = None

class DetectionAlert(BaseModel):
    tipo: str
    camera_id: str
    cpf: Optional[str] = None
    nome: Optional[str] = None
    plate: Optional[str] = None
    confidence: float
    snapshot_url: Optional[str] = None
    is_watchlist: bool = False
    is_authorized: bool = True

# ============================================
# ENDPOINTS
# ============================================

@app.on_event("startup")
async def startup():
    """Inicialização do servidor"""
    logger.info("🚀 Iniciando servidor de câmeras...")
    
    # Conectar ao Redis
    await redis_pubsub.connect()
    
    # Carregar câmeras
    load_cameras_from_env()
    
    # Iniciar câmeras
    for cam_id, camera in camera_manager.items():
        camera.start()
    
    logger.info(f"✅ Servidor iniciado com {len(camera_manager)} câmeras ativas")

@app.on_event("shutdown")
async def shutdown():
    """Finalização do servidor"""
    logger.info("⏹️ Encerrando servidor de câmeras...")
    
    # Parar todas as câmeras
    for cam_id, camera in camera_manager.items():
        camera.stop()
    
    # Desconectar Redis
    await redis_pubsub.disconnect()
    
    logger.info("✅ Servidor encerrado")

@app.get("/health")
async def health():
    """Health check"""
    return {
        "status": "healthy",
        "service": "camera-module",
        "version": "1.0.0",
        "insightface_available": INSIGHTFACE_AVAILABLE,
        "cameras_active": sum(1 for c in camera_manager.values() if c.is_running),
        "cameras_total": len(camera_manager)
    }

@app.get("/stats")
async def stats():
    """Estatísticas de todas as câmeras"""
    return {
        'cameras': {cam_id: cam.get_stats() for cam_id, cam in camera_manager.items()},
        'redis_connected': redis_pubsub.is_connected,
        'insightface_available': INSIGHTFACE_AVAILABLE
    }

@app.post("/cameras/start")
async def start_camera(camera_id: str):
    """Inicia uma câmera específica"""
    if camera_id in camera_manager:
        camera_manager[camera_id].start()
        return {"success": True, "message": f"Câmera {camera_id} iniciada"}
    raise HTTPException(status_code=404, detail="Câmera não encontrada")

@app.post("/cameras/stop")
async def stop_camera(camera_id: str):
    """Para uma câmera específica"""
    if camera_id in camera_manager:
        camera_manager[camera_id].stop()
        return {"success": True, "message": f"Câmera {camera_id} parada"}
    raise HTTPException(status_code=404, detail="Câmera não encontrada")

@app.get("/stream/{camera_id}")
async def stream_camera(camera_id: str):
    """Stream MJPEG de uma câmera"""
    if camera_id not in camera_manager:
        raise HTTPException(status_code=404, detail="Câmera não encontrada")
    
    camera = camera_manager[camera_id]
    
    async def generate():
        while camera.is_running:
            frame = camera.get_frame_jpeg()
            if frame:
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')
            await asyncio.sleep(0.033)  # ~30fps
    
    return StreamingResponse(generate(), media_type="multipart/x-mixed-replace; boundary=frame")

@app.get("/snapshot/{camera_id}")
async def get_snapshot(camera_id: str):
    """Captura snapshot atual de uma câmera"""
    if camera_id not in camera_manager:
        raise HTTPException(status_code=404, detail="Câmera não encontrada")
    
    camera = camera_manager[camera_id]
    frame = camera.get_frame_jpeg()
    
    if not frame:
        raise HTTPException(status_code=500, detail="Nenhum frame disponível")
    
    return StreamingResponse(
        iter([frame]),
        media_type="image/jpeg",
        headers={"Content-Disposition": f"inline; filename={camera_id}_snapshot.jpg"}
    )

# ============================================
# WEBSOCKET ENDPOINT
# ============================================
@app.websocket("/ws/alerts")
async def websocket_alerts(websocket: WebSocket):
    """WebSocket para alertas em tempo real"""
    await ws_manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # Echo para manter conexão viva
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        await ws_manager.disconnect(websocket)

# ============================================
# ENDPOINTS DE ENROLMENT (Cadastro)
# ============================================
@app.post("/enroll/face")
async def enroll_face(
    cpf: str = Query(...),
    nome: str = Query(...),
    evento_id: Optional[str] = Query(None),
    foto: UploadFile = File(...)
):
    """Cadastra embedding facial para um CPF"""
    try:
        # Ler imagem
        contents = await foto.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            raise HTTPException(status_code=400, detail="Imagem inválida")
        
        # Validar qualidade
        quality = validate_image_quality(img)
        logger.info(f"📸 Qualidade da foto: {quality:.2%}")
        
        if quality < 0.3:
            raise HTTPException(status_code=400, detail="Qualidade da foto muito baixa")
        
        # Detectar face e extrair embedding
        if not INSIGHTFACE_AVAILABLE:
            raise HTTPException(status_code=503, detail="InsightFace não disponível")
        
        faces = face_app.get(img)
        if not faces:
            raise HTTPException(status_code=400, detail="Nenhuma face detectada na imagem")
        
        # Pegar maior face
        largest = max(faces, key=lambda f: (f.bbox[2]-f.bbox[0]) * (f.bbox[3]-f.bbox[1]))
        
        if largest.det_score < CONFIDENCE_THRESHOLD:
            raise HTTPException(status_code=400, detail="Face com confiança muito baixa")
        
        embedding = [float(x) for x in largest.normed_embedding]
        
        # Salvar no banco
        result = await supabase.insert_face_embedding(cpf, nome, embedding, quality, evento_id)
        
        return {
            "success": True,
            "cpf": cpf,
            "nome": nome,
            "quality_score": quality,
            "face_detected": True,
            "confidence": float(largest.det_score)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erro ao cadastrar face: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/enroll/plate")
async def enroll_plate(
    placa: str = Query(...),
    proprietario: str = Query(...),
    modelo: Optional[str] = Query(None),
    cor: Optional[str] = Query(None),
    evento_id: Optional[str] = Query(None)
):
    """Cadastra uma placa de veículo autorizada"""
    try:
        placa_upper = placa.upper().replace('-', '').replace(' ', '')
        
        result = await supabase.insert_known_plate(
            placa_upper, proprietario, modelo, cor, evento_id
        )
        
        return {
            "success": True,
            "placa": placa_upper,
            "proprietario": proprietario
        }
        
    except Exception as e:
        logger.error(f"Erro ao cadastrar placa: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================
# ENDPOINTS DE WATCHLIST
# ============================================
@app.post("/watchlist/cpf")
async def add_watchlist_cpf(
    cpf: str = Query(...),
    nome: Optional[str] = Query(None),
    motivo: Optional[str] = Query(None),
    nivel: str = Query("medio")
):
    """Adiciona CPF à watchlist"""
    try:
        result = await supabase.insert_watchlist_cpf(cpf, nome, motivo, nivel)
        return {"success": True, "result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/watchlist/cpf/{cpf}")
async def remove_watchlist_cpf(cpf: str):
    """Remove CPF da watchlist"""
    try:
        result = await supabase.delete_watchlist_cpf(cpf)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/watchlist/plate")
async def add_watchlist_placa(
    placa: str = Query(...),
    proprietario: Optional[str] = Query(None),
    motivo: Optional[str] = Query(None),
    nivel: str = Query("medio")
):
    """Adiciona placa à watchlist"""
    try:
        placa_upper = placa.upper().replace('-', '').replace(' ', '')
        result = await supabase.insert_watchlist_placa(placa_upper, proprietario, motivo, nivel)
        return {"success": True, "result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ============================================
# ENDPOINTS DE CONSULTA
# ============================================
@app.get("/detections")
async def list_detections(
    evento_id: Optional[str] = None,
    tipo: Optional[str] = None,
    limit: int = 100
):
    """Lista detecções recentes"""
    try:
        results = await supabase.list_detections(evento_id, tipo, limit)
        return {"success": True, "data": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/enrollments")
async def list_enrollments(evento_id: Optional[str] = None):
    """Lista embeddings cadastrados"""
    try:
        results = await supabase.list_face_embeddings(evento_id)
        return {"success": True, "count": len(results), "data": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ============================================
# PROCESSAMENTO EXTERNO (Webhook)
# ============================================
@app.post("/webhook/detection")
async def webhook_detection(alert: DetectionAlert):
    """Recebe detecção e notifica sistema principal"""
    try:
        import httpx
        
        payload = {
            "tipo": alert.tipo,
            "camera_id": alert.camera_id,
            "cpf": alert.cpf,
            "nome": alert.nome,
            "plate": alert.plate,
            "confidence": alert.confidence,
            "snapshot_url": alert.snapshot_url,
            "is_watchlist": alert.is_watchlist,
            "is_authorized": alert.is_authorized,
            "timestamp": datetime.now().isoformat()
        }
        
        # Enviar para API A2 Eventos
        if A2_API_URL:
            async with httpx.AsyncClient() as client:
                try:
                    response = await client.post(
                        f"{A2_API_URL}/api/detections",
                        json=payload,
                        headers={"X-API-Key": A2_API_KEY},
                        timeout=10
                    )
                    logger.info(f"📤 Webhook enviado para A2: {response.status_code}")
                except Exception as e:
                    logger.warning(f"⚠️ Falha ao enviar webhook: {e}")
        
        # Broadcast para WebSocket
        await ws_manager.broadcast(payload)
        
        return {"success": True}
        
    except Exception as e:
        logger.error(f"Erro no webhook: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================
# MAIN
# ============================================
if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    host = os.getenv("HOST", "0.0.0.0")
    
    logger.info(f"🎥 Iniciando servidor na porta {port}...")
    
    uvicorn.run(
        "src.video_server:app",
        host=host,
        port=port,
        reload=False,
        log_level="info"
    )