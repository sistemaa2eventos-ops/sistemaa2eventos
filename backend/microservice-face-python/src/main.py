# pyrefly: ignore-errors
# pyright: reportAttributeAccessIssue=false, reportOptionalMemberAccess=false, reportArgumentType=false, reportCallIssue=false, reportGeneralTypeIssues=false, reportMissingImports=false, reportIndexIssue=false, reportOperatorIssue=false, reportReturnType=false
import faulthandler
faulthandler.enable()

import os
import sys
import time
import math
import base64
import asyncio
import threading
import json
from collections import deque
import urllib.request
import urllib.parse
from typing import Optional, List, Dict, Any, Tuple

# Opções do FFMPEG valem para todas as câmeras: definidas uma vez, antes de qualquer VideoCapture
# (antes cada thread de leitura reescrevia a variável do processo).
os.environ.setdefault("OPENCV_FFMPEG_CAPTURE_OPTIONS", "rtsp_transport;tcp|fflags;nobuffer|flags;low_delay|max_delay;500000")

import cv2
import numpy as np
import uvicorn
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
from loguru import logger

# ==========================================================
# 0. CONFIGURAÇÃO (perfil + ajustes do painel, aplicados ao vivo por POST /api/config)
# ==========================================================
# Placa de vídeo: IA_GPU=auto (padrão) usa DirectML/CUDA se o onnxruntime tiver; IA_GPU=off força a CPU.
IA_GPU = os.getenv("IA_GPU", "auto").lower()
if IA_GPU == "off":
    os.environ["CUDA_VISIBLE_DEVICES"] = "-1"

# Perfis: quanto de IA o servidor do evento gasta, somando todas as câmeras.
#  ia_fps_total       teto de análises/s do motor inteiro (dividido entre as câmeras pelo escalonador)
#  ia_fps_foco/mini   análises/s de uma câmera aberta em tela grande / em miniatura
#  ia_fps_vigilancia  análises/s de câmera sem ninguém assistindo, só com movimento
#  ia_stream          sub: IA sempre no sub-stream (leve) · auto: stream principal se alguém
#                     assiste em tela grande · principal: sempre o stream principal (mais nítido)
PERFIS: Dict[str, Dict[str, Any]] = {
    "leve":        {"ia_fps_total": 15, "ia_fps_foco": 6,  "ia_fps_mini": 3, "ia_fps_vigilancia": 2, "det_size": 480,
                    "ia_stream": "sub", "limiar": 0.50, "margem": 0.06, "confirmacoes": 2, "video_fps_max": 12},
    "equilibrado": {"ia_fps_total": 30, "ia_fps_foco": 10, "ia_fps_mini": 4, "ia_fps_vigilancia": 3, "det_size": 640,
                    "ia_stream": "auto", "limiar": 0.48, "margem": 0.06, "confirmacoes": 2, "video_fps_max": 15},
    "maximo":      {"ia_fps_total": 45, "ia_fps_foco": 15, "ia_fps_mini": 6, "ia_fps_vigilancia": 5, "det_size": 640,
                    "ia_stream": "principal", "limiar": 0.46, "margem": 0.05, "confirmacoes": 2, "video_fps_max": 20},
}
COMUNS: Dict[str, Any] = {
    "min_face_px": 36,          # menor lado do rosto no quadro analisado (menor que isso: "distante")
    "min_det_score": 0.60,      # confiança mínima do detector para tentar reconhecer
    "min_nitidez": 25.0,        # variância do Laplaciano no rosto alinhado 112x112 (menor: borrado)
    "max_yaw": 45.0,            # graus; rosto mais virado que isso não é reconhecido
    "reconhecer_s": 1.0,        # mesmo rosto rastreado: reconhece de novo a cada N s
    "movimento": True,          # câmera parada sem ninguém assistindo: IA dorme
    "movimento_limiar": 0.004,  # fração de pixels que mudou
    "movimento_janela_s": 3.0,  # segue analisando por N s após o movimento
    "cena_parada_s": 2.0,       # com espectador e cena parada: 1 análise a cada N s
    "vigilancia_repetir_s": 30.0,  # mesma pessoa na mesma câmera: 1 detecção a cada N s
    "aprender": True,           # guarda até 5 vetores ao vivo por pessoa (melhora o acerto no CFTV)
}
# Faixas aceitas para cada ajuste vindo do painel (valores fora são limitados)
FAIXAS: Dict[str, Tuple[float, float]] = {
    "ia_fps_total": (2, 120), "ia_fps_foco": (1, 30), "ia_fps_mini": (0.5, 15), "ia_fps_vigilancia": (0.5, 15),
    "det_size": (320, 1024), "limiar": (0.30, 0.75), "margem": (0.0, 0.20), "confirmacoes": (1, 3),
    "video_fps_max": (5, 30), "min_face_px": (16, 200), "min_det_score": (0.3, 0.95), "min_nitidez": (0, 200),
    "max_yaw": (15, 90), "reconhecer_s": (0.2, 10), "movimento_limiar": (0.0005, 0.05),
    "movimento_janela_s": (0.5, 30), "cena_parada_s": (0.5, 30), "vigilancia_repetir_s": (5, 3600),
}
ESPECTADOR_S = 10.0                                                       # sem pedido há 10 s: ninguém assistindo
CAMERA_OCIOSA_S = max(30, int(os.getenv("IA_CAMERA_OCIOSA_S", "120")))  # leitor sem uso desliga após N s
SEM_QUADRO_S = max(4, int(os.getenv("IA_SEM_QUADRO_S", "8")))           # sem quadro há N s: reconecta
RECARGA_ROSTOS_S = max(60, int(os.getenv("IA_RECARGA_ROSTOS_S", "300")))
APRENDIDOS_POR_PESSOA = 5
config_lock = threading.Lock()


def montar_config(perfil: str, ajustes: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    perfil = perfil if perfil in PERFIS else "equilibrado"
    cfg = {"perfil": perfil, **COMUNS, **PERFIS[perfil]}
    for chave, valor in (ajustes or {}).items():
        if valor is None or chave not in cfg or chave == "perfil":
            continue
        if chave in ("movimento", "aprender"):
            cfg[chave] = bool(valor)
        elif chave == "ia_stream":
            if valor in ("sub", "auto", "principal"):
                cfg[chave] = valor
        else:
            try:
                v = float(valor)
            except (TypeError, ValueError):
                continue
            lo, hi = FAIXAS.get(chave, (-math.inf, math.inf))
            v = min(max(v, lo), hi)
            cfg[chave] = round(v) if chave in ("det_size", "confirmacoes", "min_face_px") else v
    det_sz: Any = cfg["det_size"]
    cfg["det_size"] = int(det_sz) // 32 * 32  # o detector exige múltiplos de 32
    return cfg


CFG: Dict[str, Any] = montar_config(os.getenv("IA_PERFIL", "equilibrado"))

# Suporte UTF-8 no Windows
if sys.platform == "win32" and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore
        sys.stderr.reconfigure(encoding="utf-8")  # type: ignore
    except Exception:
        pass

logger.remove()
logger.add(sys.stdout, format="<green>{time:HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan> - <level>{message}</level>")

# ==========================================================
# 1. MOTOR BIOMÉTRICO (InsightFace: só detector SCRFD + ArcFace; GPU DirectML/CUDA se houver)
# ==========================================================
import faiss

try:
    from insightface.app import FaceAnalysis
    from insightface.utils import face_align
    INSIGHTFACE_AVAILABLE = True
except ImportError:
    FaceAnalysis = None
    face_align = None
    INSIGHTFACE_AVAILABLE = False
    logger.warning("InsightFace não disponível.")

face_app = None
det_model = None
rec_model = None
active_providers = ["CPUExecutionProvider"]

if INSIGHTFACE_AVAILABLE and FaceAnalysis is not None:
    try:
        import onnxruntime as ort
        installed_provs = ort.get_available_providers()
        gpu_provs = [p for p in ['DmlExecutionProvider', 'CUDAExecutionProvider', 'CPUExecutionProvider'] if p in installed_provs]
    except Exception as prov_err:
        logger.warning(f"Erro ao detectar provedores ONNX: {prov_err}")
        gpu_provs = ['CPUExecutionProvider']
    if IA_GPU == "off":
        gpu_provs = ['CPUExecutionProvider']

    # Só os 2 modelos usados: idade/sexo e os 2 de landmarks densos dobravam o tempo de cada análise
    # (a pose sai dos 5 pontos do próprio detector)
    modulos = ['detection', 'recognition']
    logger.info(f"🚀 Inicializando InsightFace Buffalo_L {modulos} + FAISS (provedores: {gpu_provs})...")
    try:
        face_app = FaceAnalysis(name='buffalo_l', providers=gpu_provs, allowed_modules=modulos)
        face_app.prepare(ctx_id=0, det_size=(640, 640))
    except Exception as gpu_err:
        logger.warning(f"Placa de vídeo indisponível ({gpu_err}); usando CPU.")
        face_app = FaceAnalysis(name='buffalo_l', providers=['CPUExecutionProvider'], allowed_modules=modulos)
        face_app.prepare(ctx_id=0, det_size=(640, 640))
    det_model = face_app.models.get('detection')
    rec_model = face_app.models.get('recognition')
    active_providers = sorted({m.session.get_providers()[0] for m in face_app.models.values()})
    logger.info(f"✅ InsightFace carregado em {active_providers}.")

model_lock = threading.Lock()
# DirectML compila o detector para o tamanho preparado (640): qualquer outro falha ("Parâmetro incorreto").
# Na GPU o detector a 640 custa ~17 ms, então o det_size do perfil só vale na CPU.
DET_FIXO: Optional[int] = 640 if "DmlExecutionProvider" in active_providers else None


def detectar(img: np.ndarray, det_size: int) -> List[Tuple[np.ndarray, float, np.ndarray]]:
    """Rostos do quadro: [(bbox x1,y1,x2,y2), det_score, 5 pontos]."""
    if det_model is None:
        return []
    det_size = DET_FIXO or det_size
    with model_lock:
        bboxes, kpss = det_model.detect(img, input_size=(det_size, det_size), max_num=0, metric='default')
    if bboxes is None or len(bboxes) == 0:
        return []
    return [(bboxes[i, :4], float(bboxes[i, 4]), kpss[i]) for i in range(bboxes.shape[0])]


def alinhar(img: np.ndarray, kps: np.ndarray) -> np.ndarray:
    if face_align is None:
        return cv2.resize(img, (112, 112))
    return face_align.norm_crop(img, landmark=kps, image_size=112)


def embeddings(alinhados: List[np.ndarray]) -> np.ndarray:
    """Vetores 512-D normalizados de todos os rostos do quadro, numa só tomada do modelo.
    Um por vez: o DirectML recusa lote no ArcFace ("Parâmetro incorreto" no BatchNormalization)."""
    if rec_model is None or not alinhados:
        return np.zeros((0, 512), dtype=np.float32)
    with model_lock:
        feats = [rec_model.get_feat(a).reshape(-1) for a in alinhados]
    feats = np.asarray(feats, dtype=np.float32).reshape(len(alinhados), -1)
    feats /= np.maximum(np.linalg.norm(feats, axis=1, keepdims=True), 1e-6)
    return feats


def nitidez(alinhado: np.ndarray) -> float:
    return float(cv2.Laplacian(cv2.cvtColor(alinhado, cv2.COLOR_BGR2GRAY), cv2.CV_64F).var())


def yaw_estimado(kps: np.ndarray) -> float:
    """Giro horizontal aproximado (graus) pelos olhos e nariz: 0 = de frente, ±90 = de perfil."""
    olho_e, olho_d, nariz = kps[0], kps[1], kps[2]
    de, dd = nariz[0] - olho_e[0], olho_d[0] - nariz[0]
    if de <= 0 or dd <= 0:
        return 90.0
    return abs(math.degrees(math.asin(max(-1.0, min(1.0, (de - dd) / (de + dd))))))


app = FastAPI(title="NZT - IA de rastreamento facial", version="4.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# ==========================================================
# 2. ÍNDICE DE ROSTOS (FAISS, vários vetores por pessoa)
# ==========================================================
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://zznrgwytywgjsjqdjfxn.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")  # obrigatória no .env (nunca no código)


class Indice:
    """Imutável depois de montado: a busca usa uma referência e a recarga troca o índice inteiro."""

    def __init__(self, pessoas: List[Dict[str, Any]], cadastro: List[np.ndarray], aprendidos: Dict[str, List[np.ndarray]]):
        self.pessoas = pessoas
        self.pos_por_id = {p["id"]: i for i, p in enumerate(pessoas)}
        vetores, dono, origem = [], [], []
        for i, v in enumerate(cadastro):
            vetores.append(v); dono.append(i); origem.append(0)
        for pid, lista in aprendidos.items():
            i = self.pos_por_id.get(pid)
            if i is None:
                continue
            for v in lista:
                vetores.append(v); dono.append(i); origem.append(1)
        self.dono = np.array(dono, dtype=np.int64)
        self.origem = np.array(origem, dtype=np.int8)
        self.index = faiss.IndexFlatIP(512)
        if vetores:
            self.index.add(np.ascontiguousarray(np.stack(vetores), dtype=np.float32))

    def buscar(self, emb: np.ndarray) -> Tuple[int, float, float, bool]:
        """(posição da pessoa, similaridade, similaridade da 2ª pessoa, melhor foi o vetor do cadastro)"""
        n = self.index.ntotal
        if n == 0:
            return -1, 0.0, 0.0, False
        sims, idxs = self.index.search(np.ascontiguousarray(emb.reshape(1, -1), dtype=np.float32), min(n, 16))
        melhor: Dict[int, Tuple[float, bool]] = {}
        for s, ix in zip(sims[0], idxs[0]):
            if ix < 0:
                continue
            p = int(self.dono[ix])
            if p not in melhor or s > melhor[p][0]:
                melhor[p] = (float(s), self.origem[ix] == 0)
        ordem = sorted(melhor.items(), key=lambda kv: kv[1][0], reverse=True)
        p1, (s1, cad1) = ordem[0]
        s2 = ordem[1][1][0] if len(ordem) > 1 else 0.0
        return p1, s1, s2, cad1


indice = Indice([], [], {})
aprendidos: Dict[str, List[np.ndarray]] = {}   # pessoa_id → vetores bons capturados ao vivo
aprendidos_lock = threading.Lock()
cadastro_por_id: Dict[str, np.ndarray] = {}
ultima_carga: Dict[str, Any] = {"ts": 0.0, "ok": False, "erro": None}
_falhas_biometria: Dict[str, str] = {}         # pessoa_id → foto_url que já falhou (não baixa de novo)
_recarregar = threading.Event()


def _supabase_get(caminho: str, timeout: int = 15) -> Any:
    req = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/{caminho}", headers={
        "apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode('utf-8'))


def avaliar_rosto_cadastro(img: np.ndarray) -> Dict[str, Any]:
    """Embedding da foto de cadastro, recusando foto ruim com o motivo (vetor ruim erra para sempre)."""
    det_size = 640
    faces = detectar(img, det_size)
    if not faces:
        # Foto 3x4 ou selfie muito recortada: margem ao redor para o detector ancorar
        h, w = img.shape[:2]
        pad = max(120, int(max(h, w) * 0.45))
        img = cv2.copyMakeBorder(img, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=[128, 128, 128])
        faces = detectar(img, det_size)
    if not faces:
        return {"ok": False, "motivo": "sem_rosto", "mensagem": "Nenhum rosto encontrado na foto."}
    area = lambda f: float((f[0][2] - f[0][0]) * (f[0][3] - f[0][1]))
    faces.sort(key=area, reverse=True)
    bbox, score, kps = faces[0]
    if len(faces) > 1 and area(faces[1]) > 0.35 * area(faces[0]) and faces[1][1] >= 0.6:
        return {"ok": False, "motivo": "varios_rostos", "mensagem": "Há mais de um rosto na foto."}
    lado = float(min(bbox[2] - bbox[0], bbox[3] - bbox[1]))
    if lado < 60:
        return {"ok": False, "motivo": "rosto_pequeno", "mensagem": "Rosto muito pequeno: aproxime ou recorte a foto."}
    if score < 0.6:
        return {"ok": False, "motivo": "baixa_confianca", "mensagem": "Rosto pouco visível (iluminação ou obstrução)."}
    if yaw_estimado(kps) > 35:
        return {"ok": False, "motivo": "de_lado", "mensagem": "Rosto virado: a foto precisa ser de frente."}
    alinhado = alinhar(img, kps)
    nit = nitidez(alinhado)
    if nit < 12:
        return {"ok": False, "motivo": "borrada", "mensagem": "Foto borrada ou desfocada."}
    emb = embeddings([alinhado])[0]
    return {"ok": True, "embedding": emb, "det_score": score, "nitidez": nit, "lado_px": lado}


def sincronizar_biometrias_pendentes() -> int:
    """Gera o embedding de quem tem foto_url mas ainda está sem face_encoding."""
    if det_model is None or not SUPABASE_KEY:
        return 0
    try:
        pendentes = _supabase_get("pessoas?select=id,nome_completo,foto_url&foto_url=not.is.null&face_encoding=is.null&limit=200")
    except Exception as e:
        logger.debug(f"Falha ao verificar biometrias pendentes: {e}")
        return 0
    pendentes = [p for p in pendentes if str(p.get('foto_url') or '').startswith('http') and _falhas_biometria.get(p['id']) != p['foto_url']]
    if not pendentes:
        return 0
    logger.info(f"🧬 Gerando biometria de {len(pendentes)} pessoa(s)...")
    gerados = 0
    for p in pendentes:
        pid, nome, url = p['id'], p.get('nome_completo') or p['id'], p['foto_url']
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=10) as r:
                img = cv2.imdecode(np.asarray(bytearray(r.read()), dtype=np.uint8), cv2.IMREAD_COLOR)
            if img is None:
                _falhas_biometria[pid] = url
                continue
            av = avaliar_rosto_cadastro(img)
            if not av["ok"]:
                _falhas_biometria[pid] = url
                logger.warning(f"⚠️ Foto de {nome} recusada para biometria: {av['mensagem']}")
                continue
            req = urllib.request.Request(
                f"{SUPABASE_URL}/rest/v1/pessoas?id=eq.{urllib.parse.quote(str(pid))}",
                data=json.dumps({"face_encoding": [float(x) for x in av["embedding"]]}).encode('utf-8'),
                headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}",
                         "Content-Type": "application/json", "Prefer": "return=minimal"},
                method="PATCH")
            with urllib.request.urlopen(req, timeout=10):
                gerados += 1
                logger.info(f"✅ Biometria gerada para: {nome}")
        except Exception as p_err:
            logger.warning(f"Erro ao gerar biometria para {nome}: {p_err}")
    return gerados


def reload_registered_faces() -> int:
    """Carrega TODAS as pessoas com biometria (paginado: o Supabase devolve no máximo 1000 por vez)
    e troca o índice de uma vez. Atualiza também nome, bloqueio e status de quem já estava no índice."""
    global indice, cadastro_por_id
    if not SUPABASE_KEY:
        ultima_carga.update(ts=time.time(), ok=False, erro="SUPABASE_SERVICE_ROLE_KEY ausente")
        return len(indice.pessoas)
    try:
        linhas, offset = [], 0
        while True:
            pagina = _supabase_get(
                "pessoas?select=id,nome_completo,cpf,status_acesso,bloqueado,foto_url,face_encoding"
                f"&face_encoding=not.is.null&order=id&limit=1000&offset={offset}", timeout=30)
            linhas.extend(pagina)
            if len(pagina) < 1000:
                break
            offset += 1000
        pessoas, cadastro, por_id = [], [], {}
        for p in linhas:
            enc = p.get('face_encoding')
            if isinstance(enc, str):
                try:
                    enc = json.loads(enc)
                except Exception:
                    enc = None
            if not (isinstance(enc, list) and len(enc) == 512):
                continue
            vec = np.array(enc, dtype=np.float32)
            norma = float(np.linalg.norm(vec))
            if norma <= 0:
                continue
            vec /= norma
            pessoas.append({
                "id": p['id'], "nome": p.get('nome_completo') or "Sem Nome", "cpf": p.get('cpf') or "",
                "status_acesso": p.get('status_acesso') or "liberado", "bloqueado": bool(p.get('bloqueado', False)),
                "foto_url": p.get('foto_url')})
            cadastro.append(vec)
            por_id[p['id']] = vec
        with aprendidos_lock:
            # Vetor do cadastro mudou (foto nova): os aprendidos daquela pessoa não valem mais
            for pid in list(aprendidos):
                antigo = cadastro_por_id.get(pid)
                if pid not in por_id or (antigo is not None and float(np.dot(antigo, por_id[pid])) < 0.98):
                    del aprendidos[pid]
            novo = Indice(pessoas, cadastro, aprendidos)
        indice, cadastro_por_id = novo, por_id
        ultima_carga.update(ts=time.time(), ok=True, erro=None)
        logger.info(f"👥 Índice de rostos: {len(pessoas)} pessoas, {novo.index.ntotal} vetores.")
        return len(pessoas)
    except Exception as e:
        ultima_carga.update(ts=time.time(), ok=False, erro=str(e))
        logger.error(f"Erro ao carregar biometrias do Supabase: {e}")
        return len(indice.pessoas)


def aprender_vetor(pessoa_id: str, emb: np.ndarray):
    """Rosto confirmado com folga no CFTV: guarda o vetor (ângulo/luz reais da câmera) para a pessoa."""
    global indice
    cad = cadastro_por_id.get(pessoa_id)
    if cad is None:
        return
    with aprendidos_lock:
        lista = aprendidos.setdefault(pessoa_id, [])
        if len(lista) >= APRENDIDOS_POR_PESSOA or any(float(np.dot(v, emb)) > 0.9 for v in lista):
            return
        lista.append(emb.copy())
        atual = indice
        indice = Indice(atual.pessoas, [cadastro_por_id[p["id"]] for p in atual.pessoas], aprendidos)


def _loop_rostos():
    """Biometrias pendentes a cada 60 s; recarga completa a cada RECARGA_ROSTOS_S ou quando pedida."""
    reload_registered_faces()
    proxima_carga = time.time() + RECARGA_ROSTOS_S
    while True:
        pedido = _recarregar.wait(timeout=60)
        _recarregar.clear()
        try:
            gerados = sincronizar_biometrias_pendentes()
            if pedido or gerados > 0 or time.time() >= proxima_carga:
                reload_registered_faces()
                proxima_carga = time.time() + RECARGA_ROSTOS_S
        except Exception as e:
            logger.debug(f"Sincronização de rostos: {e}")


THREADS_ESSENCIAIS = {}
THREADS_ESSENCIAIS["rostos"] = threading.Thread(target=_loop_rostos, daemon=True, name="rostos")
THREADS_ESSENCIAIS["rostos"].start()

# ==========================================================
# 3. CÂMERAS: leitores de vídeo (principal e sub-stream) e estado da IA por câmera
# ==========================================================
DEFAULT_RTSP_URL = os.getenv("IA_CAMERA_PADRAO", "rtsp://localhost:8554/live")


def derivar_substream(url: str) -> Optional[str]:
    """Sub-stream (resolução baixa) dos padrões conhecidos: Intelbras/Dahua subtype=0→1, Hikvision 101→102."""
    u = url or ""
    if "subtype=0" in u:
        return u.replace("subtype=0", "subtype=1")
    low = u.lower()
    for chave in ("/streaming/channels/", "/streaming/channel/"):
        i = low.find(chave)
        if i >= 0:
            j = i + len(chave)
            k = j
            while k < len(u) and u[k].isdigit():
                k += 1
            canal = u[j:k]
            if len(canal) >= 3 and canal.endswith("01"):
                return u[:j] + canal[:-2] + "02" + u[k:]
    return None


class Rastro:
    """Um rosto acompanhado entre análises (mesma pessoa andando na frente da câmera)."""
    __slots__ = ("id", "box", "visto", "ultimo_rec", "votos", "pessoa", "sim", "qualidade", "crop_b64", "melhor_nitidez")

    def __init__(self, tid: int, box):
        self.id, self.box, self.visto = tid, box, time.time()
        self.ultimo_rec = 0.0
        self.votos: deque = deque(maxlen=3)
        self.pessoa: Optional[str] = None   # id da pessoa confirmada (a posição no índice muda a cada recarga)
        self.sim = 0.0
        self.qualidade = "optimal"
        self.crop_b64: Optional[str] = None
        self.melhor_nitidez = 0.0


def _iou(a, b) -> float:
    x1, y1, x2, y2 = max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])
    inter = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    ua = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / ua if ua > 0 else 0.0


class Rastreador:
    """IoU guloso, um por câmera (antes era um só para todas, misturando os IDs)."""

    def __init__(self):
        self.proximo = 1
        self.rastros: Dict[int, Rastro] = {}

    def atualizar(self, boxes: List[np.ndarray]) -> List[Rastro]:
        agora = time.time()
        livres = dict(self.rastros)
        pares = sorted(((_iou(r.box, b), tid, i) for tid, r in livres.items() for i, b in enumerate(boxes)), reverse=True)
        atribuido: Dict[int, Rastro] = {}
        for iou, tid, i in pares:
            if iou < 0.25:
                break
            if i in atribuido or tid not in livres:
                continue
            r = livres.pop(tid)
            r.box, r.visto = boxes[i], agora
            atribuido[i] = r
        for i, b in enumerate(boxes):
            if i not in atribuido:
                r = Rastro(self.proximo, b)
                self.proximo += 1
                self.rastros[r.id] = r
                atribuido[i] = r
        for tid, r in livres.items():
            if agora - r.visto > 2.5:
                del self.rastros[tid]
        return [atribuido[i] for i in range(len(boxes))]


class Camera:
    """Estado de uma câmera (chave: URL do stream principal). Os quadrados da IA ficam em coordenadas
    normalizadas para servirem tanto ao sub-stream quanto ao principal."""

    def __init__(self, url: str):
        self.url = url
        self.camera_id: Optional[str] = None
        self.nome: Optional[str] = None
        self.vigilancia = False
        self.ia_ativa = True
        self.prioridade = 1             # 0 baixa · 1 normal · 2 alta · 3 crítica
        self.url_sub_config: Optional[str] = None
        self.usar_sub = True
        self.sub_ruim = False           # sub-stream derivado não abriu: usa o principal
        self.uso_foco = 0.0
        self.uso_mini = 0.0
        self.ultimo_movimento = time.time()
        self.ultima_analise = 0.0
        self.ultimo_seq = -1
        self.results: List[Dict[str, Any]] = []
        self.results_time = 0.0
        self.rastreador = Rastreador()
        self.lock = threading.Lock()
        self.analises = 0
        self.ia_ms = 0.0
        self.fonte_ia = ""
        self._ultima_deteccao: Dict[str, float] = {}

    def url_sub(self) -> Optional[str]:
        if not self.usar_sub or self.sub_ruim:
            return None
        sub = self.url_sub_config or derivar_substream(self.url)
        return sub if sub and sub != self.url else None

    def intervalo_ia(self, agora: float) -> Optional[float]:
        """Intervalo entre análises desta câmera agora, ou None se a IA deve dormir."""
        if not self.ia_ativa or det_model is None:
            return None
        foco = agora - self.uso_foco <= ESPECTADOR_S
        mini = agora - self.uso_mini <= ESPECTADOR_S
        if not (foco or mini or self.vigilancia):
            return None
        fps = CFG["ia_fps_foco"] if foco else (CFG["ia_fps_mini"] if mini else CFG["ia_fps_vigilancia"])
        # Rosto na cena e alguém assistindo: pessoa parada (olhando o celular) mexe pouco a imagem, mas o
        # quadrado precisa acompanhar; sem isso caía para 1 análise a cada 2 s e o quadrado piscava
        rosto_na_tela = (foco or mini) and bool(self.results) and agora - self.results_time < 5
        if CFG["movimento"] and not rosto_na_tela and agora - self.ultimo_movimento > CFG["movimento_janela_s"]:
            # Cena parada: só quem está assistindo mantém um batimento lento (pessoa parada segue com quadrado)
            return max(1.0 / fps, CFG["cena_parada_s"]) if (foco or mini) else None
        return 1.0 / fps

    def resultados_validos(self) -> List[Dict[str, Any]]:
        with self.lock:
            return self.results if time.time() - self.results_time <= CFG["cena_parada_s"] + 1.5 else []


class Leitor:
    """Lê uma fonte de vídeo em thread própria e guarda só o quadro mais recente."""

    def __init__(self, url: str, cam: Camera, eh_sub: bool):
        self.url, self.cam, self.eh_sub = url, cam, eh_sub
        self.cap = None
        self.quadro: Optional[np.ndarray] = None
        self.seq = 0
        self.quadro_ts = 0.0
        self.fps = 0.0
        self.resolucao = ""
        self.ultimo_uso = time.time()
        self.reconexoes = 0
        self.falhas_abertura = 0
        self.lock = threading.Lock()
        self._estado = threading.Lock()
        self.rodando = False
        self.saindo = False
        self.thread: Optional[threading.Thread] = None
        self._fundo = None
        self._jpeg_lock = threading.Lock()
        self._jpeg_seq = -1
        self._jpeg_cache: Dict[Tuple, bytes] = {}

    def iniciar(self):
        self.rodando = True
        self.thread = threading.Thread(target=self._loop, daemon=True, name=f"leitor-{self.url.split('@')[-1][:40]}")
        self.thread.start()

    def reviver(self) -> bool:
        """Pedido chegou enquanto o leitor desligava: reaproveita em vez de abrir uma 2ª conexão."""
        with self._estado:
            if self.thread and self.thread.is_alive() and not self.saindo:
                self.rodando = True
                return True
        return False

    def parar(self):
        # Quem libera a câmera é a própria thread ao sair (liberar no meio de um read() derruba o OpenCV)
        self.rodando = False

    def vivo(self) -> bool:
        return bool(self.thread and self.thread.is_alive())

    def conectado(self) -> bool:
        return self.quadro is not None and time.time() - self.quadro_ts <= SEM_QUADRO_S

    def pegar(self) -> Tuple[Optional[np.ndarray], int, float]:
        """(quadro, seq, instante). O quadro nunca é alterado depois de publicado: quem desenha copia."""
        with self.lock:
            return self.quadro, self.seq, self.quadro_ts

    # ------------------------------------------------------------ abertura
    def _abrir_webcam_usb(self, indice_preferido: Optional[int] = None):
        indices = [indice_preferido] if indice_preferido is not None else [0, 1, 2]
        backends = [cv2.CAP_DSHOW, cv2.CAP_MSMF, cv2.CAP_ANY] if sys.platform == "win32" else [cv2.CAP_ANY]
        for idx in indices:
            for backend in backends:
                try:
                    cap = cv2.VideoCapture(idx, backend)
                    if cap is not None and cap.isOpened():
                        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
                        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
                        ret, frame = cap.read()
                        if ret and frame is not None:
                            logger.info(f"✅ Webcam USB conectada (índice {idx}, {frame.shape[1]}x{frame.shape[0]})")
                            return cap
                    if cap is not None:
                        cap.release()
                except Exception:
                    pass
        return None

    def _eh_local_padrao(self) -> bool:
        u = (self.url or "").lower()
        return "localhost:8554" in u or "127.0.0.1:8554" in u

    def _abrir(self):
        u = (self.url or "").strip()
        low = u.lower()
        if low.startswith("webcam") or low.startswith("usb") or u.isdigit():
            partes = [p for p in low.replace("://", ":").split(":") if p.isdigit()]
            return self._abrir_webcam_usb(int(partes[0]) if partes else None)
        # Timeouts reais: câmera fora do ar não trava mais a leitura por 30 s
        cap = cv2.VideoCapture(u, cv2.CAP_FFMPEG, [cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 5000, cv2.CAP_PROP_READ_TIMEOUT_MSEC, 5000])
        if cap is not None and cap.isOpened():
            logger.info(f"✅ Vídeo conectado{' (sub-stream)' if self.eh_sub else ''}: {u.split('@')[-1]}")
            return cap
        if cap is not None:
            cap.release()
        if self._eh_local_padrao():
            logger.info("🔄 RTSP local (8554) indisponível; usando a webcam USB direto...")
            return self._abrir_webcam_usb()
        return None

    # ------------------------------------------------------------ laço
    def _detectar_movimento(self, frame: np.ndarray):
        pequeno = cv2.GaussianBlur(cv2.cvtColor(cv2.resize(frame, (160, 90), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY), (5, 5), 0)
        if self._fundo is None or self._fundo.shape != pequeno.shape:
            self._fundo = pequeno.astype(np.float32)
            return
        diferenca = cv2.absdiff(pequeno, cv2.convertScaleAbs(self._fundo))
        if float((diferenca > 25).mean()) > CFG["movimento_limiar"]:
            self.cam.ultimo_movimento = time.time()
        cv2.accumulateWeighted(pequeno, self._fundo, 0.05)

    def _loop(self):
        espera = [2, 5, 10, 30]
        ultimo_quadro = time.time()
        ultima_decodificacao = 0.0
        n = 0
        while True:
            with self._estado:
                if not self.rodando:
                    self.saindo = True
                    break
            try:
                if self.cap is None:
                    self.cap = self._abrir()
                    if self.cap is None:
                        self.falhas_abertura += 1
                        self.reconexoes += 1
                        if self.eh_sub and self.falhas_abertura >= 3 and not self.cam.url_sub_config:
                            # Sub-stream deduzido não existe nesta câmera: daqui em diante só o principal
                            self.cam.sub_ruim = True
                            logger.warning(f"Sub-stream indisponível em {self.url.split('@')[-1]}; usando o stream principal.")
                            self.rodando = False
                            continue
                        pausa = espera[min(self.falhas_abertura - 1, len(espera) - 1)]
                        fim = time.time() + pausa
                        while time.time() < fim and self.rodando:
                            time.sleep(0.25)
                        continue
                    self.falhas_abertura = 0
                    ultimo_quadro = time.time()

                # grab() só avança o vídeo; a conversão para imagem (retrieve) é feita no ritmo
                # necessário (video_fps_max), não na velocidade da câmera
                if not self.cap.grab():
                    if time.time() - ultimo_quadro > SEM_QUADRO_S:
                        logger.warning(f"⚠️ Sem vídeo há {SEM_QUADRO_S}s ({self.url.split('@')[-1]}), reconectando...")
                        self.cap.release()
                        self.cap = None
                        self.reconexoes += 1
                    else:
                        time.sleep(0.05)
                    continue
                agora = time.time()
                ultimo_quadro = agora
                if agora - ultima_decodificacao < 1.0 / CFG["video_fps_max"]:
                    continue
                ret, frame = self.cap.retrieve()
                if not ret or frame is None:
                    continue
                dt = agora - ultima_decodificacao
                ultima_decodificacao = agora
                if 0 < dt < 5:
                    self.fps = 0.9 * self.fps + 0.1 * (1.0 / dt) if self.fps else 1.0 / dt
                n += 1
                if CFG["movimento"] and n % 3 == 0:
                    self._detectar_movimento(frame)
                with self.lock:
                    self.quadro = frame
                    self.seq += 1
                    self.quadro_ts = agora
                self.resolucao = f"{frame.shape[1]}x{frame.shape[0]}"
            except Exception as e:
                logger.error(f"Erro na leitura de {self.url.split('@')[-1]}: {e}")
                time.sleep(0.5)
        if self.cap is not None:
            self.cap.release()
            self.cap = None

    # ------------------------------------------------------------ imagem para o painel
    def jpeg(self, annotate: bool, max_width: int, quality: int) -> Tuple[Optional[bytes], int, float]:
        """JPEG do quadro atual, codificado uma vez por quadro e por formato (serve todos os espectadores)."""
        frame, seq, ts = self.pegar()
        if frame is None:
            return None, 0, 0.0
        chave = (annotate, max_width, quality)
        with self._jpeg_lock:
            if self._jpeg_seq != seq:
                self._jpeg_seq = seq
                self._jpeg_cache.clear()
            dados = self._jpeg_cache.get(chave)
            if dados is None:
                img = frame
                if max_width and img.shape[1] > max_width:
                    img = cv2.resize(img, (max_width, int(img.shape[0] * max_width / img.shape[1])), interpolation=cv2.INTER_AREA)
                if annotate:
                    img = desenhar_hud(img.copy() if img is frame else img, self.cam.resultados_validos(), self.fps)
                ok, buf = cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, quality])
                dados = buf.tobytes() if ok else None
                if dados:
                    self._jpeg_cache[chave] = dados
        return dados, seq, ts


cameras: Dict[str, Camera] = {}
leitores: Dict[str, Leitor] = {}
streams_lock = threading.Lock()


def camera_de(url: str) -> Camera:
    with streams_lock:
        cam = cameras.get(url)
        if cam is None:
            cam = cameras[url] = Camera(url)
        return cam


def _leitor(url: str, cam: Camera, eh_sub: bool) -> Leitor:
    with streams_lock:
        lt = leitores.get(url)
        if lt is not None and (lt.rodando or lt.reviver()):
            return lt
        antigo = lt
    if antigo is not None and antigo.thread is not None:
        antigo.thread.join(timeout=6)  # conexão anterior terminando de fechar: evita 2 conexões à mesma câmera
    with streams_lock:
        lt = leitores.get(url)
        if lt is None or lt is antigo:
            lt = Leitor(url, cam, eh_sub)
            lt.iniciar()
            leitores[url] = lt
        return lt


def leitor_para(url: str, qualidade: str = "foco", uso: bool = True) -> Leitor:
    """Leitor para quem assiste: miniatura usa o sub-stream (se houver), tela grande o principal."""
    cam = camera_de(url)
    sub = cam.url_sub() if qualidade == "mini" else None
    lt = _leitor(sub, cam, True) if sub else _leitor(url, cam, False)
    if uso:
        agora = time.time()
        lt.ultimo_uso = agora
        if qualidade == "mini":
            cam.uso_mini = agora
        else:
            cam.uso_foco = agora
    return lt


def fonte_ia(cam: Camera) -> Optional[Leitor]:
    """Leitor de onde a IA tira o quadro, conforme o perfil (sub-stream é bem mais leve de decodificar)."""
    principal = leitores.get(cam.url)
    sub_url = cam.url_sub()
    sub = leitores.get(sub_url) if sub_url else None
    vivo = lambda lt: lt is not None and lt.rodando and lt.quadro is not None
    modo = CFG["ia_stream"]
    if modo == "principal" or (modo == "auto" and time.time() - cam.uso_foco <= ESPECTADOR_S):
        if vivo(principal):
            return principal
    if vivo(sub):
        return sub
    return principal if vivo(principal) else None


def garantir_vigilancia():
    """Câmeras sob vigilância ficam com o leitor da IA aberto mesmo sem ninguém assistindo."""
    for cam in list(cameras.values()):
        if cam.vigilancia and cam.ia_ativa:
            sub = cam.url_sub() if CFG["ia_stream"] != "principal" else None
            lt = _leitor(sub, cam, True) if sub else _leitor(cam.url, cam, False)
            lt.ultimo_uso = time.time()


def _zelador():
    """A cada 10 s: desliga leitores sem uso e garante os da vigilância (inclusive após trocar de sub para principal)."""
    while True:
        time.sleep(10)
        try:
            garantir_vigilancia()
            agora = time.time()
            with streams_lock:
                ociosos = [(u, lt) for u, lt in leitores.items() if lt.rodando and agora - lt.ultimo_uso > CAMERA_OCIOSA_S]
                for _, lt in ociosos:
                    lt.parar()
                for u in [u for u, lt in leitores.items() if not lt.rodando and not lt.vivo()]:
                    del leitores[u]
            for u, _ in ociosos:
                logger.info(f"💤 Vídeo sem uso há {CAMERA_OCIOSA_S}s, desligado: {u.split('@')[-1]}")
        except Exception as e:
            logger.debug(f"Zelador: {e}")


THREADS_ESSENCIAIS["zelador"] = threading.Thread(target=_zelador, daemon=True, name="zelador")
THREADS_ESSENCIAIS["zelador"].start()

# ==========================================================
# 4. IA: escalonador único (divide o orçamento entre as câmeras) e análise por quadro
# ==========================================================
estatisticas = {"analises": 0, "ia_ms": 0.0, "fila": 0, "ocupacao": 0.0}


def analisar(cam: Camera, frame: np.ndarray, src: Leitor):
    h, w = frame.shape[:2]
    faces = detectar(frame, CFG["det_size"])
    boxes = [f[0] for f in faces]
    rastros = cam.rastreador.atualizar(boxes)
    agora = time.time()
    idx = indice

    # Quem precisa de (novo) reconhecimento: rastro novo, sem confirmação ou com reconhecimento velho
    para_rec, avaliados = [], []
    for (bbox, score, kps), r in zip(faces, rastros):
        lado = float(min(bbox[2] - bbox[0], bbox[3] - bbox[1]))
        if lado < CFG["min_face_px"]:
            r.qualidade = "low_resolution"
        elif score < CFG["min_det_score"]:
            r.qualidade = "low_confidence"
        elif yaw_estimado(kps) > CFG["max_yaw"]:
            r.qualidade = "profile_view"
        else:
            r.qualidade = "optimal"
        intervalo = CFG["reconhecer_s"] if r.pessoa is not None else min(0.3, CFG["reconhecer_s"])
        if r.qualidade == "optimal" and agora - r.ultimo_rec >= intervalo:
            alinhado = alinhar(frame, kps)
            nit = nitidez(alinhado)
            if nit < CFG["min_nitidez"]:
                r.qualidade = "blurry"
            else:
                para_rec.append((r, alinhado, nit, bbox))
        avaliados.append((bbox, score, r))

    if para_rec:
        feats = embeddings([a for _, a, _, _ in para_rec])
        for (r, alinhado, nit, bbox), emb in zip(para_rec, feats):
            r.ultimo_rec = agora
            pos, s1, s2, do_cadastro = idx.buscar(emb)
            aceito = pos >= 0 and s1 >= CFG["limiar"] and (s1 - s2 >= CFG["margem"])
            p = idx.pessoas[pos]["id"] if aceito else None
            r.votos.append(p)
            forte = aceito and s1 >= CFG["limiar"] + 0.08
            confirmado = aceito and (forte or sum(1 for v in r.votos if v == p) >= CFG["confirmacoes"])
            if confirmado and p is not None:
                if r.pessoa != p:
                    r.crop_b64 = None
                    r.melhor_nitidez = 0.0
                r.pessoa, r.sim = p, s1
                if nit > r.melhor_nitidez or r.crop_b64 is None:
                    r.melhor_nitidez = nit
                    x1, y1, x2, y2 = [int(v) for v in bbox]
                    recorte = frame[max(0, y1):min(h, y2), max(0, x1):min(w, x2)]
                    if recorte.size:
                        ok, buf = cv2.imencode('.jpg', recorte, [cv2.IMWRITE_JPEG_QUALITY, 85])
                        if ok:
                            r.crop_b64 = base64.b64encode(buf).decode('utf-8')
                # Só aprende com folga, casando com o vetor do cadastro e já visto 2x (um erro aprendido erra para sempre)
                if (CFG["aprender"] and do_cadastro and s1 >= CFG["limiar"] + 0.10 and s1 - s2 >= CFG["margem"] + 0.04
                        and sum(1 for v in r.votos if v == p) >= 2):
                    aprender_vetor(p, emb)
            elif r.pessoa is not None and len(r.votos) == r.votos.maxlen and r.pessoa not in r.votos:
                r.pessoa = None  # três leituras seguidas sem ela: não era ela
                r.crop_b64 = None

    resultados = []
    for bbox, score, r in avaliados:
        x1, y1, x2, y2 = [int(v) for v in bbox]
        pos = idx.pos_por_id.get(r.pessoa) if r.pessoa is not None else None
        pessoa = idx.pessoas[pos] if pos is not None else None
        resultados.append({
            "track_id": r.id,
            "bbox": [x1, y1, x2, y2],
            "bbox_n": [x1 / w, y1 / h, x2 / w, y2 / h],
            "det_score": round(score, 3),
            "quality_status": r.qualidade,
            "liveness_score": round(r.melhor_nitidez, 1),
            "is_live": r.melhor_nitidez > 50.0,
            "face_crop_base64": r.crop_b64 if pessoa else None,
            "matched_person": {
                "id": pessoa["id"], "nome": pessoa["nome"], "cpf": pessoa["cpf"], "similarity": round(r.sim, 3),
                "status_acesso": pessoa["status_acesso"], "bloqueado": pessoa["bloqueado"], "foto_url": pessoa.get("foto_url"),
            } if pessoa else None,
        })
    with cam.lock:
        cam.results = resultados
        cam.results_time = time.time()
    if cam.camera_id:
        registrar_deteccoes(cam, frame, resultados, src.fps)


def _escalonador():
    """Uma só thread de IA para todas as câmeras: escolhe a mais atrasada (pesando a prioridade) e
    respeita o teto global de análises/s. Antes eram 2 threads por câmera disputando o mesmo modelo."""
    while True:
        try:
            agora = time.time()
            escolhida, melhor, devidas = None, 0.0, 0
            for cam in list(cameras.values()):
                iv = cam.intervalo_ia(agora)
                if iv is None:
                    continue
                atraso = (agora - cam.ultima_analise) / iv
                if atraso < 1.0:
                    continue
                devidas += 1
                nota = atraso * (1.0 + 0.5 * cam.prioridade)
                if nota > melhor:
                    escolhida, melhor = cam, nota
            estatisticas["fila"] = devidas
            if escolhida is None:
                time.sleep(0.01)
                continue
            src = fonte_ia(escolhida)
            frame, seq, ts = src.pegar() if src else (None, -1, 0.0)
            if src is None or frame is None or (seq == escolhida.ultimo_seq and src.url == escolhida.fonte_ia) or agora - ts > SEM_QUADRO_S:
                # Sem quadro novo ainda: tenta de novo em meio intervalo, sem girar em falso
                iv = escolhida.intervalo_ia(agora) or 1.0
                escolhida.ultima_analise = agora - iv * 0.5
                time.sleep(0.005)
                continue
            escolhida.ultimo_seq, escolhida.fonte_ia = seq, src.url
            escolhida.ultima_analise = agora
            t0 = time.time()
            analisar(escolhida, frame, src)
            dt = time.time() - t0
            escolhida.analises += 1
            escolhida.ia_ms = 0.8 * escolhida.ia_ms + 0.2 * dt * 1000 if escolhida.ia_ms else dt * 1000
            estatisticas["analises"] += 1
            estatisticas["ia_ms"] = 0.9 * estatisticas["ia_ms"] + 0.1 * dt * 1000 if estatisticas["ia_ms"] else dt * 1000
            orcamento = 1.0 / CFG["ia_fps_total"]
            estatisticas["ocupacao"] = 0.95 * estatisticas["ocupacao"] + 0.05 * min(1.0, dt / orcamento)
            time.sleep(max(0.0, orcamento - dt))
        except Exception as e:
            # Mensagens do onnxruntime no Windows vêm na página de código local (ex.: "Parâmetro"): repr não quebra
            logger.warning(f"Falha na análise: {type(e).__name__}: {repr(e)[:300]}")
            time.sleep(0.2)


THREADS_ESSENCIAIS["ia"] = threading.Thread(target=_escalonador, daemon=True, name="ia")
THREADS_ESSENCIAIS["ia"].start()

# ==========================================================
# VIGILÂNCIA: pessoas reconhecidas viram detecções que o agente leva à nuvem (alertas sem painel aberto)
# ==========================================================
deteccoes: deque = deque(maxlen=200)
deteccoes_lock = threading.Lock()
deteccao_seq = 0
INICIO_MOTOR = time.time()


def registrar_deteccoes(cam: Camera, frame: np.ndarray, results: List[Dict[str, Any]], fps: float):
    """Pessoa confirmada vira detecção no máximo 1 vez a cada vigilancia_repetir_s por câmera."""
    global deteccao_seq
    agora = time.time()
    novos = []
    for r in results:
        mp = r.get("matched_person")
        if not mp:
            continue
        if agora - cam._ultima_deteccao.get(mp["id"], 0) < CFG["vigilancia_repetir_s"]:
            continue
        cam._ultima_deteccao[mp["id"]] = agora
        novos.append(r)
    if len(cam._ultima_deteccao) > 500:
        cam._ultima_deteccao = {k: t for k, t in cam._ultima_deteccao.items() if agora - t < CFG["vigilancia_repetir_s"]}
    if not novos:
        return
    quadro = frame
    if quadro.shape[1] > 640:
        quadro = cv2.resize(quadro, (640, int(quadro.shape[0] * 640 / quadro.shape[1])), interpolation=cv2.INTER_AREA)
    else:
        quadro = quadro.copy()
    quadro = desenhar_hud(quadro, results, fps)
    _, jpg = cv2.imencode('.jpg', quadro, [cv2.IMWRITE_JPEG_QUALITY, 60])
    with deteccoes_lock:
        deteccao_seq += 1
        deteccoes.append({
            "seq": deteccao_seq,
            "camera_id": cam.camera_id,
            "ts": agora,
            "results": novos,
            "annotated_frame_base64": base64.b64encode(jpg).decode('utf-8'),
        })
    logger.info(f"👁️ Reconhecido: {', '.join(r['matched_person']['nome'] for r in novos)} (câmera {cam.nome or cam.camera_id})")


# ==========================================================
# 5. HUD (desenho sobre o vídeo, proporcional ao tamanho do quadro)
# ==========================================================
def desenhar_hud(frame: np.ndarray, results: List[Dict[str, Any]], fps: float = 0.0) -> np.ndarray:
    h, w = frame.shape[:2]
    escala = max(0.38, min(0.7, w / 1280 * 0.55))
    esp = 1 if w < 900 else 2
    for r in results:
        bx = r.get("bbox_n")
        x1, y1, x2, y2 = (int(bx[0] * w), int(bx[1] * h), int(bx[2] * w), int(bx[3] * h)) if bx else r["bbox"]
        mp = r.get("matched_person")
        q = r.get("quality_status")
        if mp and (mp["bloqueado"] or mp["status_acesso"] == "bloqueado"):
            cor, texto = (0, 0, 255), f"ALERTA: {mp['nome']} (BLOQUEADO)"
        elif mp:
            cor, texto = (0, 255, 128), f"{mp['nome']} [{mp['similarity'] * 100:.0f}%]"
        elif q == "profile_view":
            cor, texto = (0, 165, 255), "DE LADO"
        elif q == "low_resolution":
            cor, texto = (180, 180, 180), "DISTANTE"
        elif q == "blurry":
            cor, texto = (180, 180, 180), "EM MOVIMENTO"
        else:
            cor, texto = (255, 212, 0), "DESCONHECIDO"
        tam = int(max(6, min(x2 - x1, y2 - y1) * 0.25))
        for (ax, ay, dx, dy) in ((x1, y1, 1, 1), (x2, y1, -1, 1), (x1, y2, 1, -1), (x2, y2, -1, -1)):
            cv2.line(frame, (ax, ay), (ax + dx * tam, ay), cor, esp)
            cv2.line(frame, (ax, ay), (ax, ay + dy * tam), cor, esp)
        (tw, th), _ = cv2.getTextSize(texto, cv2.FONT_HERSHEY_SIMPLEX, escala, 1)
        ly = max(th + 8, y1 - 6)
        cv2.rectangle(frame, (x1, ly - th - 6), (x1 + tw + 8, ly + 3), (10, 20, 30), -1)
        cv2.putText(frame, texto, (x1 + 4, ly - 2), cv2.FONT_HERSHEY_SIMPLEX, escala, cor, 1, cv2.LINE_AA)
    if w >= 640:
        barra = int(26 * escala / 0.55)
        cv2.rectangle(frame, (0, 0), (w, barra), (10, 15, 25), -1)
        cv2.putText(frame, f"NZT - RASTREAMENTO FACIAL | ROSTOS: {len(results)} | {fps:.0f} FPS | BASE: {len(indice.pessoas)}",
                    (10, int(barra * 0.7)), cv2.FONT_HERSHEY_SIMPLEX, escala, (0, 212, 255), 1, cv2.LINE_AA)
    return frame


# ==========================================================
# 6. ENDPOINTS
# ==========================================================
_PLACEHOLDER: Dict[int, bytes] = {}


def placeholder(largura: int = 960) -> bytes:
    if largura not in _PLACEHOLDER:
        alt = int(largura * 9 / 16)
        img = np.zeros((alt, largura, 3), dtype=np.uint8)
        cv2.putText(img, "CONECTANDO A CAMERA...", (int(largura * 0.22), alt // 2), cv2.FONT_HERSHEY_SIMPLEX,
                    largura / 1280, (0, 212, 255), 2)
        _PLACEHOLDER[largura] = cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 60])[1].tobytes()
    return _PLACEHOLDER[largura]


def url_da_camera(stream_url: str, camera_id: str = "") -> str:
    """camera_id (de cameras_ip, conhecido pela vigilância) no lugar da URL: a credencial da câmera não
    precisa trafegar na consulta."""
    if camera_id:
        for cam in list(cameras.values()):
            if cam.camera_id == camera_id:
                return cam.url
        raise HTTPException(status_code=404, detail="Câmera não está na lista do motor")
    return stream_url


class ExtractRequest(BaseModel):
    image_base64: str
    skip_liveness: bool = False


@app.get("/health")
async def health():
    agora = time.time()
    # Thread essencial morta (exceção não tratada) = motor "de pé" mas sem IA: responde 503
    # para o vigia (scripts/ligar-ia-facial.ps1) reiniciar o motor, em vez de "healthy" para sempre
    mortas = [nome for nome, t in THREADS_ESSENCIAIS.items() if not t.is_alive()]
    if mortas:
        return JSONResponse(status_code=503, content={"status": "unhealthy", "threads_paradas": mortas,
                                                      "uptime_s": int(agora - INICIO_MOTOR)})
    return {
        "status": "healthy",
        "engine": "insightface_onnx" if det_model is not None else "mock",
        "providers": active_providers,
        "perfil": CFG["perfil"],
        "registered_persons": len(indice.pessoas),
        "cameras_em_uso": sum(1 for lt in list(leitores.values()) if lt.rodando),
        "cameras_com_video": sum(1 for lt in list(leitores.values()) if lt.rodando and lt.conectado()),
        "ia_analises_s": round(min(CFG["ia_fps_total"], 1000.0 / estatisticas["ia_ms"]) * estatisticas["ocupacao"], 1) if estatisticas["ia_ms"] else 0.0,
        "uptime_s": int(agora - INICIO_MOTOR),
    }


@app.post("/api/reload-faces")
def reload_faces_endpoint():
    """Pede a recarga do índice em segundo plano (não segura a resposta)."""
    _recarregar.set()
    return {"success": True, "count": len(indice.pessoas), "agendado": True}


@app.post("/api/extract")
def extract_face(req: ExtractRequest):
    """Embedding 512-D da foto de cadastro; foto ruim volta com o motivo em vez de gerar vetor ruim."""
    try:
        img = cv2.imdecode(np.frombuffer(base64.b64decode(req.image_base64.split(',')[-1]), np.uint8), cv2.IMREAD_COLOR)
    except Exception:
        img = None
    if img is None:
        raise HTTPException(status_code=400, detail="Imagem inválida")
    laplacian_var = float(cv2.Laplacian(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), cv2.CV_64F).var())
    if not req.skip_liveness and laplacian_var <= 65.0:
        return {"success": False, "motivo": "textura_insuficiente", "is_live": False, "liveness_score": laplacian_var,
                "message": "FALHA DE LIVENESS: imagem com textura insuficiente (possível foto de tela)."}
    if det_model is None:
        return {"success": True, "embedding": [0.0] * 512, "mock": True}
    av = avaliar_rosto_cadastro(img)
    if not av["ok"]:
        return {"success": False, "motivo": av["motivo"], "message": av["mensagem"]}
    return {"success": True, "embedding": [float(x) for x in av["embedding"]], "det_score": av["det_score"],
            "nitidez": round(av["nitidez"], 1), "liveness_score": laplacian_var, "is_live": True}


@app.get("/api/camera/test")
def test_camera_connection(stream_url: str = DEFAULT_RTSP_URL, camera_id: str = ""):
    """A câmera manda vídeo? Espera até 6 s pelo primeiro quadro (antes respondia offline na 1ª chamada)."""
    stream_url = url_da_camera(stream_url, camera_id)
    lt = leitor_para(stream_url, "foco", uso=False)
    lt.ultimo_uso = time.time()
    fim = time.time() + 6
    while time.time() < fim and not lt.conectado():
        time.sleep(0.2)
    return {"success": True, "online": lt.conectado(), "fps": round(lt.fps, 1), "resolution": lt.resolucao or None}


@app.get("/api/camera/snapshot")
def get_camera_snapshot(stream_url: str = DEFAULT_RTSP_URL, annotate: bool = False, max_width: int = 0,
                        quality: int = 85, qualidade: str = "foco", apos_seq: int = -1, camera_id: str = ""):
    """Quadro atual em JPEG. qualidade=mini usa o sub-stream; apos_seq devolve 204 se o quadro não mudou
    (o agente não reenvia quadro repetido). Cabeçalhos X-Frame-Seq e X-Frame-Age-Ms."""
    stream_url = url_da_camera(stream_url, camera_id)
    lt = leitor_para(stream_url, "mini" if qualidade == "mini" else "foco")
    _, seq, _ = lt.pegar()
    if apos_seq >= 0 and seq == apos_seq and seq > 0:
        return Response(status_code=204, headers={"X-Frame-Seq": str(seq)})
    dados, seq, ts = lt.jpeg(annotate, max(0, min(max_width, 3840)), max(30, min(quality, 95)))
    if dados is None:
        return Response(content=placeholder(max_width or 960), media_type="image/jpeg", headers={"X-Frame-Seq": "0", "X-Frame-Age-Ms": "-1"})
    return Response(content=dados, media_type="image/jpeg",
                    headers={"X-Frame-Seq": str(seq), "X-Frame-Age-Ms": str(int((time.time() - ts) * 1000))})


@app.get("/api/track/live")
def track_live_endpoint(stream_url: str = DEFAULT_RTSP_URL, threshold: float = 0.0, camera_id: str = ""):
    """Últimos resultados da IA desta câmera (não roda uma análise extra) e o quadro anotado reduzido."""
    stream_url = url_da_camera(stream_url, camera_id)
    lt = leitor_para(stream_url, "foco")
    cam = lt.cam
    results = cam.resultados_validos()
    dados, _, _ = lt.jpeg(True, 640, 60)
    if dados is None:
        return {"success": False, "error": "Câmera temporariamente sem vídeo.", "timestamp": time.time(), "results": []}
    return {
        "success": True,
        "timestamp": time.time(),
        "processing_time_ms": round(cam.ia_ms, 1),
        "faces_detected": len(results),
        "results": results,
        "annotated_frame_base64": base64.b64encode(dados).decode('utf-8'),
    }


@app.get("/api/camera/stream")
async def get_camera_stream(request: Request, stream_url: str = DEFAULT_RTSP_URL, annotate: bool = True,
                            qualidade: str = "foco", max_width: int = 0, quality: int = 72, camera_id: str = ""):
    """MJPEG direto para <img> (API no próprio servidor do evento). Assíncrono: não prende thread e
    termina quando o navegador fecha."""
    stream_url = url_da_camera(stream_url, camera_id)
    lt = leitor_para(stream_url, "mini" if qualidade == "mini" else "foco")
    largura, q = max(0, min(max_width, 3840)), max(30, min(quality, 95))

    async def gerar():
        ultimo = -1
        while not await request.is_disconnected():
            leitor_para(stream_url, "mini" if qualidade == "mini" else "foco")
            _, seq, _ = lt.pegar()
            if seq != ultimo:
                dados, ultimo, _ = await asyncio.to_thread(lt.jpeg, annotate, largura, q)
                if dados:
                    yield b'--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ' + str(len(dados)).encode() + b'\r\n\r\n' + dados + b'\r\n'
            await asyncio.sleep(1.0 / CFG["video_fps_max"])

    return StreamingResponse(gerar(), media_type="multipart/x-mixed-replace; boundary=frame",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


class VigilanciaConfig(BaseModel):
    # [{ id, stream_url, nome?, url_substream?, ia_ativa?, vigilancia_ativa?, prioridade? }]
    cameras: List[Dict[str, Any]] = []


@app.post("/api/vigilancia")
def configurar_vigilancia(cfg: VigilanciaConfig):
    """Câmeras do evento (enviado pelo agente/API e repetido periodicamente): quem vigia 24 h, quem tem IA,
    prioridade e sub-stream. Toda câmera da lista gera detecções quando a IA a analisa."""
    novas: Dict[str, Dict[str, Any]] = {}
    for c in cfg.cameras:
        url = str(c.get("stream_url") or "")
        if c.get("id") and url.lower().startswith(("rtsp", "webcam", "usb")):
            novas[url] = c
    for url, cam in list(cameras.items()):
        if url not in novas:
            cam.vigilancia = False
            cam.camera_id = None
            with streams_lock:
                for u_lt in (url, cam.url_sub()):
                    lt = leitores.get(u_lt) if u_lt else None
                    if lt is not None and lt.rodando:
                        lt.parar()
    for url, c in novas.items():
        cam = camera_de(url)
        cam.camera_id = str(c["id"])
        cam.nome = c.get("nome")
        cam.ia_ativa = c.get("ia_ativa", True) is not False
        cam.vigilancia = cam.ia_ativa and c.get("vigilancia_ativa", True) is not False
        try:
            cam.prioridade = min(3, max(0, int(c.get("prioridade", 1))))
        except (TypeError, ValueError):
            cam.prioridade = 1
        sub = str(c.get("url_substream") or "").strip()
        if sub != (cam.url_sub_config or ""):
            cam.sub_ruim = False
        cam.url_sub_config = sub or None
        cam.usar_sub = c.get("usar_substream", True) is not False
    garantir_vigilancia()
    return {"success": True, "cameras": len(novas), "vigiadas": sum(1 for c in cameras.values() if c.vigilancia)}


@app.get("/api/vigilancia/deteccoes")
def listar_deteccoes(desde: int = 0, max_idade_s: float = 0):
    """Detecções com seq > desde (e, se pedido, com no máximo max_idade_s). inicio identifica esta
    execução do motor: se mudar, o agente sabe que a contagem recomeçou."""
    agora = time.time()
    with deteccoes_lock:
        novas = [d for d in deteccoes if d["seq"] > desde and (not max_idade_s or agora - d["ts"] <= max_idade_s)][:50]
        return {"seq": deteccao_seq, "inicio": INICIO_MOTOR, "deteccoes": novas}


class ConfigIA(BaseModel):
    perfil: Optional[str] = None
    ajustes: Dict[str, Any] = {}


@app.get("/api/config")
def ler_config():
    return {"config": CFG, "perfis": PERFIS, "comuns": COMUNS, "faixas": FAIXAS}


@app.post("/api/config")
def aplicar_config(req: ConfigIA):
    """Perfil e ajustes do painel (Configurações > IA facial), aplicados na hora."""
    global CFG
    with config_lock:
        CFG = montar_config(req.perfil or CFG["perfil"], req.ajustes)
    logger.info(f"⚙️ Configuração da IA: perfil {CFG['perfil']}, {CFG['ia_fps_total']} análises/s, limiar {CFG['limiar']}")
    garantir_vigilancia()
    return {"success": True, "config": CFG}


@app.get("/api/engine/status")
def get_engine_status():
    agora = time.time()
    lista = []
    for url, cam in list(cameras.items()):
        principal, sub_url = leitores.get(url), cam.url_sub()
        sub = leitores.get(sub_url) if sub_url else None
        ativos = [lt for lt in (principal, sub) if lt is not None and lt.rodando]
        if not ativos and not cam.camera_id:
            continue
        iv = cam.intervalo_ia(agora)
        lista.append({
            "camera_id": cam.camera_id,
            "nome": cam.nome,
            "camera": url.split('@')[-1],
            "conectada": any(lt.conectado() for lt in ativos),
            "video_fps": round(max([lt.fps for lt in ativos] or [0.0]), 1),
            "resolucao": {"principal": principal.resolucao if principal and principal.rodando else None,
                          "sub": sub.resolucao if sub and sub.rodando else None},
            "sub_stream": bool(sub_url),
            "ia_ativa": cam.ia_ativa,
            "ia_analisando": iv is not None,
            "ia_fps_alvo": round(1.0 / iv, 1) if iv else 0,
            "ia_ms": round(cam.ia_ms, 1),
            "analises": cam.analises,
            "rostos": len(cam.resultados_validos()),
            "movimento_ha_s": round(agora - cam.ultimo_movimento, 1),
            "vigilancia": cam.vigilancia,
            "prioridade": cam.prioridade,
            "reconexoes": sum(lt.reconexoes for lt in ativos),
        })
    hw = "GPU (DirectML)" if "DmlExecutionProvider" in active_providers else (
        "GPU (CUDA)" if "CUDAExecutionProvider" in active_providers else "CPU")
    return {
        "engine": "InsightFace Buffalo_L (SCRFD 10G + ArcFace 512-D ONNX)",
        "hardware_acceleration": hw,
        "active_providers": active_providers,
        "config": CFG,
        "ia": {
            "det_size_efetivo": DET_FIXO or CFG["det_size"],
            "ms_por_analise": round(estatisticas["ia_ms"], 1),
            "ocupacao": round(estatisticas["ocupacao"], 2),
            "cameras_na_fila": estatisticas["fila"],
            "analises_total": estatisticas["analises"],
        },
        "cameras_em_uso": sum(1 for lt in list(leitores.values()) if lt.rodando),
        "cameras": lista,
        "registered_faces_indexed": len(indice.pessoas),
        "faiss_total_vectors": indice.index.ntotal,
        "vetores_aprendidos": sum(len(v) for v in aprendidos.values()),
        "ultima_carga_rostos": {"ha_s": int(agora - ultima_carga["ts"]) if ultima_carga["ts"] else None,
                                "ok": ultima_carga["ok"], "erro": ultima_carga["erro"]},
        "vector_search_engine": "FAISS IndexFlatIP",
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=False)
