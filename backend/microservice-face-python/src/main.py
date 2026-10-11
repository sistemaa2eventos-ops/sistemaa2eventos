import faulthandler
faulthandler.enable()

import os
import sys
import time
import base64
import threading
import json
import urllib.request
from typing import Optional, List, Dict, Any

import cv2
import numpy as np
import uvicorn
from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from loguru import logger

# Desativar uso forçado de GPU (CPU/ONNX por padrão)
os.environ["CUDA_VISIBLE_DEVICES"] = "-1"

# Suporte UTF-8 no Windows
if sys.platform == "win32" and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore
        sys.stderr.reconfigure(encoding="utf-8")  # type: ignore
    except Exception:
        pass

# Configurar logging
logger.remove()
logger.add(sys.stdout, format="<green>{time:HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan> - <level>{message}</level>")

# ==========================================================
# 1. INICIALIZAÇÃO DO MOTOR BIOMÉTRICO (GPU DIRECTML + ONNX)
# ==========================================================
import faiss

try:
    import insightface
    from insightface.app import FaceAnalysis
    INSIGHTFACE_AVAILABLE = True
except ImportError:
    FaceAnalysis = None
    INSIGHTFACE_AVAILABLE = False
    logger.warning("InsightFace não disponível.")

face_app = None
active_providers = ["CPUExecutionProvider"]

if INSIGHTFACE_AVAILABLE and FaceAnalysis is not None:
    try:
        import onnxruntime as ort
        installed_provs = ort.get_available_providers()
        gpu_provs = [p for p in ['DmlExecutionProvider', 'CUDAExecutionProvider', 'CPUExecutionProvider'] if p in installed_provs]
    except Exception as prov_err:
        logger.warning(f"Erro ao detectar provedores ONNX: {prov_err}")
        gpu_provs = ['CPUExecutionProvider']

    logger.info("🚀 Inicializando InsightFace Buffalo_L (Motor Biométrico AVX2/CPU + FAISS)...")
    face_app = FaceAnalysis(name='buffalo_l', providers=['CPUExecutionProvider'])
    face_app.prepare(ctx_id=0, det_size=(640, 640))
    active_providers = ['CPUExecutionProvider']
    logger.info("✅ InsightFace Buffalo_L carregado e estabilizado com sucesso.")

model_lock = threading.Lock()

app = FastAPI(title="A2 Eventos - AI Face Tracking & Biometrics", version="3.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================================
# 2. ÍNDICE VETORIAL DE ALTA PERFORMANCE (FAISS 512-D)
# ==========================================================
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://zznrgwytywgjsjqdjfxn.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")  # obrigatória no .env (nunca no código)

known_persons: List[Dict[str, Any]] = []
known_embeddings: Optional[np.ndarray] = None
faiss_index: Optional[Any] = None
persons_lock = threading.Lock()

def reload_registered_faces():
    """Carrega vetores e indexa no motor vetorial FAISS em RAM"""
    global known_persons, known_embeddings, faiss_index
    try:
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/pessoas?select=id,nome_completo,cpf,status_acesso,bloqueado,foto_url,face_encoding&face_encoding=not.is.null",
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Type": "application/json"
            }
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode('utf-8'))

        loaded = []
        embeddings_list = []

        for p in data:
            enc = p.get('face_encoding')
            if enc and isinstance(enc, list) and len(enc) == 512:
                loaded.append({
                    "id": p['id'],
                    "nome": p.get('nome_completo') or "Sem Nome",
                    "cpf": p.get('cpf') or "",
                    "status_acesso": p.get('status_acesso') or "liberado",
                    "bloqueado": bool(p.get('bloqueado', False)),
                    "foto_url": p.get('foto_url')
                })
                vec = np.array(enc, dtype=np.float32)
                norm = np.linalg.norm(vec)
                if norm > 0:
                    vec = vec / norm
                embeddings_list.append(vec)

        with persons_lock:
            known_persons = loaded
            if embeddings_list:
                known_embeddings = np.array(embeddings_list, dtype=np.float32)
                # Construir índice FAISS (Cosine Similarity / Inner Product em vetores normalizados)
                idx = faiss.IndexFlatIP(512)
                idx.add(known_embeddings)
                faiss_index = idx
                logger.info(f"⚡ [FAISS] Índice vetorial atualizado com {idx.ntotal} identidades (<1ms search).")
            else:
                known_embeddings = None
                faiss_index = None

        logger.info(f"👥 Cache de biometrias sincronizado: {len(known_persons)} pessoas ativas.")
        return len(known_persons)
    except Exception as e:
        logger.error(f"Erro ao carregar biometrias do Supabase: {e}")
        return 0

# Carga inicial em background
threading.Thread(target=reload_registered_faces, daemon=True).start()

# ==========================================================
# 3. GERENCIADOR DE STREAM RTSP DE BAIXA LATÊNCIA
# ==========================================================
class RTSPStreamReader:
    def __init__(self, url: str):
        self.url = url
        self.cap = None
        self.latest_frame = None
        self.latest_annotated_frame = None
        self.latest_results = []
        self.running = False
        self.thread = None
        self.ai_thread = None
        self.lock = threading.Lock()
        self.fps = 0.0
        self.last_frame_time = 0.0
        self.reconnect_count = 0

    def start(self):
        if self.running:
            return
        self.running = True
        self.thread = threading.Thread(target=self._read_loop, daemon=True)
        self.thread.start()
        self.ai_thread = threading.Thread(target=self._ai_loop, daemon=True)
        self.ai_thread.start()

    def stop(self):
        self.running = False
        if self.thread:
            self.thread.join(timeout=1.0)
        if self.ai_thread:
            self.ai_thread.join(timeout=1.0)
        with self.lock:
            if self.cap:
                self.cap.release()
                self.cap = None

    def _read_loop(self):
        logger.info(f"📹 Conectando ao stream RTSP com Zero-Latency: {self.url}")
        os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp|fflags;nobuffer|flags;low_delay|max_delay;0"

        while self.running:
            try:
                if self.cap is None or not self.cap.isOpened():
                    self.cap = cv2.VideoCapture(self.url, cv2.CAP_FFMPEG)
                    self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                    if not self.cap.isOpened():
                        self.reconnect_count += 1
                        time.sleep(1.0)
                        continue
                    logger.info(f"✅ Stream RTSP conectado (Zero-Latency): {self.url}")

                ret, frame = self.cap.read()
                if not ret or frame is None:
                    time.sleep(0.005)
                    continue

                now = time.time()
                dt = now - self.last_frame_time
                if dt > 0:
                    self.fps = 0.9 * self.fps + 0.1 * (1.0 / dt)
                self.last_frame_time = now

                with self.lock:
                    self.latest_frame = frame

            except Exception as e:
                logger.error(f"Erro no loop RTSP: {e}")
                time.sleep(0.5)

    def _ai_loop(self):
        """Worker desacoplado de IA: processa detecção/reconhecimento sem travar o vídeo"""
        while self.running:
            frame = self.get_frame()
            if frame is not None and face_app is not None:
                try:
                    annotated, results = process_and_annotate_frame(frame)
                    with self.lock:
                        self.latest_annotated_frame = annotated
                        self.latest_results = results
                except Exception as e:
                    pass
            time.sleep(0.07)  # ~14 FPS de processamento de IA contínuo

    def get_frame(self) -> Optional[np.ndarray]:
        with self.lock:
            if self.latest_frame is not None:
                return self.latest_frame.copy()
            return None

    def get_annotated_frame(self) -> Optional[np.ndarray]:
        with self.lock:
            if self.latest_annotated_frame is not None:
                return self.latest_annotated_frame.copy()
            if self.latest_frame is not None:
                return self.latest_frame.copy()
            return None

# Instância padrão para a webcam do usuário
DEFAULT_RTSP_URL = "rtsp://a2eventos:19022020@localhost:8554/live"
active_streams: Dict[str, RTSPStreamReader] = {}

def get_or_create_stream(url: str = DEFAULT_RTSP_URL) -> RTSPStreamReader:
    if url not in active_streams:
        reader = RTSPStreamReader(url)
        reader.start()
        active_streams[url] = reader
    return active_streams[url]

# Inicia o leitor da câmera padrão do usuário
default_reader = get_or_create_stream(DEFAULT_RTSP_URL)

# ==========================================================
# 4. RASTREADOR DE FACES (CENTROID / IOU TRACKER)
# ==========================================================
class SimpleFaceTracker:
    def __init__(self, max_disappeared: int = 15):
        self.next_id = 1
        self.tracks: Dict[int, Dict[str, Any]] = {}
        self.disappeared: Dict[int, int] = {}

    def update(self, detected_boxes: List[List[int]]) -> Dict[int, List[int]]:
        if len(detected_boxes) == 0:
            for track_id in list(self.disappeared.keys()):
                self.disappeared[track_id] += 1
                if self.disappeared[track_id] > 15:
                    del self.tracks[track_id]
                    del self.disappeared[track_id]
            return {tid: d['box'] for tid, d in self.tracks.items()}

        if len(self.tracks) == 0:
            for box in detected_boxes:
                self.tracks[self.next_id] = {'box': box, 'hits': 1}
                self.disappeared[self.next_id] = 0
                self.next_id += 1
            return {tid: d['box'] for tid, d in self.tracks.items()}

        track_ids = list(self.tracks.keys())
        track_boxes = [self.tracks[tid]['box'] for tid in track_ids]

        # Calcular matriz de distâncias de centro
        centers_track = np.array([[(b[0]+b[2])/2, (b[1]+b[3])/2] for b in track_boxes])
        centers_det = np.array([[(b[0]+b[2])/2, (b[1]+b[3])/2] for b in detected_boxes])

        distances = np.linalg.norm(centers_track[:, np.newaxis] - centers_det, axis=2)

        assigned_det = set()
        assigned_track = set()

        for _ in range(min(len(track_ids), len(detected_boxes))):
            min_idx = np.unravel_index(np.argmin(distances), distances.shape)
            t_idx, d_idx = min_idx[0], min_idx[1]
            if distances[t_idx, d_idx] > 150:  # Distância máxima em pixels entre frames
                break

            tid = track_ids[t_idx]
            self.tracks[tid]['box'] = detected_boxes[d_idx]
            self.tracks[tid]['hits'] += 1
            self.disappeared[tid] = 0
            assigned_track.add(tid)
            assigned_det.add(d_idx)
            distances[t_idx, :] = np.inf
            distances[:, d_idx] = np.inf

        for t_idx, tid in enumerate(track_ids):
            if tid not in assigned_track:
                self.disappeared[tid] += 1
                if self.disappeared[tid] > 15:
                    del self.tracks[tid]
                    del self.disappeared[tid]

        for d_idx, box in enumerate(detected_boxes):
            if d_idx not in assigned_det:
                self.tracks[self.next_id] = {'box': box, 'hits': 1}
                self.disappeared[self.next_id] = 0
                self.next_id += 1

        return {tid: d['box'] for tid, d in self.tracks.items()}

tracker = SimpleFaceTracker()

# ==========================================================
# 5. ENDPOINTS DA API
# ==========================================================

class ExtractRequest(BaseModel):
    image_base64: str

@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "engine": "insightface_onnx" if INSIGHTFACE_AVAILABLE else "mock",
        "registered_persons": len(known_persons),
        "rtsp_connected": default_reader.cap.isOpened() if default_reader.cap else False,
        "rtsp_fps": round(default_reader.fps, 1)
    }

@app.post("/api/reload-faces")
async def reload_faces_endpoint():
    count = reload_registered_faces()
    return {"success": True, "count": count}

@app.post("/api/extract")
async def extract_face(req: ExtractRequest):
    """Extrai o embedding de 512 dimensões de uma imagem em Base64"""
    try:
        img_data = base64.b64decode(req.image_base64)
        nparr = np.frombuffer(img_data, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            raise HTTPException(status_code=400, detail="Imagem decodificada inválida")

        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        laplacian_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        is_live = laplacian_var > 65.0

        if not is_live:
            return {
                "success": False,
                "message": "FALHA DE LIVENESS: Imagem com textura insuficiente (possível tela).",
                "liveness_score": laplacian_var,
                "is_live": False
            }

        if not INSIGHTFACE_AVAILABLE or face_app is None:
            return {"success": True, "embedding": [0.0] * 512, "mock": True}

        with model_lock:
            faces = face_app.get(img)
        if not faces:
            return {"success": False, "message": "Nenhum rosto detectado na imagem."}

        largest_face = max(faces, key=lambda f: (f.bbox[2]-f.bbox[0]) * (f.bbox[3]-f.bbox[1]))
        embedding = [float(x) for x in largest_face.normed_embedding]

        return {
            "success": True,
            "embedding": embedding,
            "det_score": float(largest_face.det_score),
            "liveness_score": laplacian_var,
            "is_live": True
        }
    except Exception as e:
        logger.error(f"Erro em extract_face: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/camera/test")
async def test_camera_connection(stream_url: str = DEFAULT_RTSP_URL):
    """Testa se a câmera RTSP está online e respondendo"""
    reader = get_or_create_stream(stream_url)
    frame = reader.get_frame()
    online = frame is not None and (reader.cap is not None and reader.cap.isOpened())
    return {
        "success": True,
        "online": online,
        "fps": round(reader.fps, 1),
        "resolution": f"{frame.shape[1]}x{frame.shape[0]}" if frame is not None else None
    }

@app.get("/api/camera/snapshot")
async def get_camera_snapshot(stream_url: str = DEFAULT_RTSP_URL, annotate: bool = False):
    """Retorna um snapshot JPEG direto do stream RTSP"""
    reader = get_or_create_stream(stream_url)
    frame = reader.get_frame()

    if frame is None:
        # Se frame não estiver disponível, gera imagem de placeholder elegante
        blank = np.zeros((720, 1280, 3), dtype=np.uint8)
        cv2.putText(blank, "A2 EVENTOS - CONECTANDO AO RTSP...", (360, 360),
                    cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 212, 255), 2)
        _, jpeg = cv2.imencode('.jpg', blank)
        return Response(content=jpeg.tobytes(), media_type="image/jpeg")

    if annotate and face_app is not None:
        frame, _ = process_and_annotate_frame(frame)

    _, jpeg = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
    return Response(content=jpeg.tobytes(), media_type="image/jpeg")

def process_and_annotate_frame(frame: np.ndarray, threshold: float = 0.50):
    """Detecta faces, compara com o banco de dados e renderiza HUD de rastreamento no frame"""
    h, w, _ = frame.shape
    faces = []
    if face_app is not None:
        with model_lock:
            faces = face_app.get(frame)
    detected_boxes = []
    tracking_results = []

    for face in faces:
        x1, y1, x2, y2 = [int(v) for v in face.bbox]
        detected_boxes.append([x1, y1, x2, y2])

    tracked_map = tracker.update(detected_boxes)

    for face, box in zip(faces, detected_boxes):
        x1, y1, x2, y2 = box
        fw, fh = x2 - x1, y2 - y1

        # 1. Filtro de Qualidade Facial (FQA - Face Quality Assessment)
        is_low_res = fw < 45 or fh < 45
        is_low_conf = face.det_score < 0.40

        # Checagem de rotação/pose lateral (Yaw)
        pose_profile = False
        if hasattr(face, 'pose') and face.pose is not None:
            try:
                pitch, yaw, roll = face.pose
                if abs(yaw) > 55.0:
                    pose_profile = True
            except Exception:
                pass

        # 2. Identificação biométrica de ultra-alta velocidade via FAISS (<1ms)
        query_emb = face.normed_embedding
        best_match = None
        best_sim = 0.0

        if not is_low_res and not pose_profile:
            with persons_lock:
                if faiss_index is not None and faiss_index.ntotal > 0:
                    q_vec = np.ascontiguousarray(query_emb.reshape(1, -1), dtype=np.float32)
                    distances, indices = faiss_index.search(q_vec, 1)
                    sim_val = float(distances[0][0])
                    idx_val = int(indices[0][0])
                    if idx_val >= 0 and sim_val >= threshold and idx_val < len(known_persons):
                        best_match = known_persons[idx_val]
                        best_sim = sim_val
                elif known_embeddings is not None and len(known_persons) > 0:
                    sims = np.dot(known_embeddings, query_emb)
                    best_idx = int(np.argmax(sims))
                    best_sim = float(sims[best_idx])
                    if best_sim >= threshold:
                        best_match = known_persons[best_idx]

        # Liveness Laplaciano do recorte da face
        face_crop = frame[max(0, y1):min(h, y2), max(0, x1):min(w, x2)]
        liveness_score = 0.0
        face_crop_b64 = None
        if face_crop.size > 0:
            gray_crop = cv2.cvtColor(face_crop, cv2.COLOR_BGR2GRAY)
            liveness_score = float(cv2.Laplacian(gray_crop, cv2.CV_64F).var())
            if best_match is not None:
                _, c_buf = cv2.imencode('.jpg', face_crop, [cv2.IMWRITE_JPEG_QUALITY, 85])
                face_crop_b64 = base64.b64encode(c_buf).decode('utf-8')

        track_id = None
        for tid, tbox in tracked_map.items():
            if tbox == box:
                track_id = tid
                break

        res_item = {
            "track_id": track_id or 1,
            "bbox": [x1, y1, x2, y2],
            "det_score": round(float(face.det_score), 3),
            "age": int(face.age),
            "gender": "M" if face.gender == 1 else "F",
            "liveness_score": round(liveness_score, 1),
            "is_live": liveness_score > 50.0,
            "quality_status": "low_resolution" if is_low_res else ("profile_view" if pose_profile else "optimal"),
            "face_crop_base64": face_crop_b64,
            "matched_person": {
                "id": best_match["id"],
                "nome": best_match["nome"],
                "cpf": best_match["cpf"],
                "similarity": round(best_sim, 3),
                "status_acesso": best_match["status_acesso"],
                "bloqueado": best_match["bloqueado"],
                "foto_url": best_match.get("foto_url")
            } if best_match else None
        }
        tracking_results.append(res_item)

        # RENDERIZAR HUD DE RASTREAMENTO NO FRAME
        is_identified = best_match is not None
        is_blocked = best_match and (best_match["bloqueado"] or best_match["status_acesso"] == "bloqueado")

        if is_blocked:
            color = (0, 0, 255)  # Vermelho
            status_text = f"ALERTA: {best_match['nome']} (BLOQUEADO)"
        elif is_identified:
            color = (0, 255, 128)  # Verde Neon
            status_text = f"{best_match['nome']} [{best_sim*100:.1f}%]"
        elif pose_profile:
            color = (0, 165, 255)  # Laranja
            status_text = f"PERFIL LATERAL (ID #{track_id})"
        elif is_low_res:
            color = (180, 180, 180)  # Cinza
            status_text = f"DISTANTE (ID #{track_id})"
        else:
            color = (255, 212, 0)  # Ciano
            status_text = f"DESCONHECIDO (ID #{track_id})"

        # Caixa com cantos estilizados (Bracket Box)
        line_len = int(min(fw, fh) * 0.25)
        thick = 2
        # Cantos
        cv2.line(frame, (x1, y1), (x1 + line_len, y1), color, thick)
        cv2.line(frame, (x1, y1), (x1, y1 + line_len), color, thick)
        cv2.line(frame, (x2, y1), (x2 - line_len, y1), color, thick)
        cv2.line(frame, (x2, y1), (x2, y1 + line_len), color, thick)
        cv2.line(frame, (x1, y2), (x1 + line_len, y2), color, thick)
        cv2.line(frame, (x1, y2), (x1, y2 - line_len), color, thick)
        cv2.line(frame, (x2, y2), (x2 - line_len, y2), color, thick)
        cv2.line(frame, (x2, y2), (x2, y2 - line_len), color, thick)

        # Fundo do label
        label_y = max(25, y1 - 10)
        (tw, th), _ = cv2.getTextSize(status_text, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 1)
        cv2.rectangle(frame, (x1, label_y - th - 6), (x1 + tw + 10, label_y + 4), (10, 20, 30), -1)
        cv2.rectangle(frame, (x1, label_y - th - 6), (x1 + tw + 10, label_y + 4), color, 1)
        cv2.putText(frame, status_text, (x1 + 5, label_y - 2), cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 1, cv2.LINE_AA)

        # Informações biométricas adicionais
        info_sub = f"Det: {face.det_score*100:.0f}% | Idade: {face.age} | Sexo: {'M' if face.gender==1 else 'F'}"
        cv2.putText(frame, info_sub, (x1, y2 + 18), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (200, 200, 200), 1, cv2.LINE_AA)

    # Banner superior de telemetria
    cv2.rectangle(frame, (0, 0), (w, 36), (10, 15, 25), -1)
    cv2.line(frame, (0, 36), (w, 36), (0, 212, 255), 1)
    cv2.putText(frame, f"A2 EVENTOS - RASTREAMENTO FACIAL ATIVO | FACES: {len(faces)} | FPS: {default_reader.fps:.1f} | BASE: {len(known_persons)} PESSOAS",
                (15, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 212, 255), 1, cv2.LINE_AA)

    return frame, tracking_results

@app.get("/api/track/live")
def track_live_endpoint(stream_url: str = DEFAULT_RTSP_URL, threshold: float = 0.50):
    """Executa um ciclo de rastreamento facial completo e retorna JSON estruturado"""
    reader = get_or_create_stream(stream_url)
    frame = reader.get_frame()

    if frame is None:
        return {
            "success": False,
            "error": "Câmera RTSP temporariamente indisponível.",
            "timestamp": time.time()
        }

    t0 = time.time()
    annotated_frame, results = process_and_annotate_frame(frame, threshold=threshold)
    proc_time_ms = (time.time() - t0) * 1000

    # Converter imagem anotada para base64 para visualização na UI se desejado
    _, buffer = cv2.imencode('.jpg', annotated_frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
    img_b64 = base64.b64encode(buffer).decode('utf-8')

    return {
        "success": True,
        "timestamp": time.time(),
        "processing_time_ms": round(proc_time_ms, 1),
        "faces_detected": len(results),
        "results": results,
        "annotated_frame_base64": img_b64
    }

def mjpeg_generator(stream_url: str):
    """Gerador contínuo de frames MJPEG com ultra-baixa latência (30 FPS em tempo real)"""
    reader = get_or_create_stream(stream_url)
    while True:
        frame = reader.get_annotated_frame()
        if frame is not None:
            ret, jpeg = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 72])
            if ret:
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + jpeg.tobytes() + b'\r\n')
        time.sleep(0.033)  # ~30 FPS fluido sem latência acumulada

@app.get("/api/camera/stream")
async def get_camera_stream(stream_url: str = DEFAULT_RTSP_URL):
    """Endpoint de Stream MJPEG com rastreamento facial direto para tags <img> no navegador"""
    return StreamingResponse(
        mjpeg_generator(stream_url),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )

@app.get("/api/engine/status")
def get_engine_status():
    """Retorna o status detalhado do hardware de aceleracao e indice FAISS"""
    return {
        "engine": "InsightFace Buffalo_L (SCRFD 10G + ArcFace 512-D ONNX)",
        "hardware_acceleration": "CPU AVX2 Multi-Threaded",
        "active_providers": active_providers,
        "vector_search_engine": "FAISS IndexFlatIP (Sub-millisecond Search)",
        "registered_faces_indexed": len(known_persons),
        "faiss_total_vectors": faiss_index.ntotal if faiss_index is not None else 0,
        "max_capacity_target": "50,000+ faces em tempo real"
    }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=False)