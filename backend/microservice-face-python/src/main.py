import os
import sys
import base64
import numpy as np
import cv2
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
from loguru import logger

# Desativar uso de GPU via flag (CPU/ONNX por padrão pra Edge)
os.environ["CUDA_VISIBLE_DEVICES"] = "-1"

try:
    import insightface
    from insightface.app import FaceAnalysis
    INSIGHTFACE_AVAILABLE = True
except ImportError:
    INSIGHTFACE_AVAILABLE = False
    logger.warning("InsightFace não está instalado. Simulação ativada se requisitado.")

# Configurar logging
logger.remove()
logger.add(sys.stdout, format="<green>{time:HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan> - <level>{message}</level>")

app = FastAPI(title="A2 Eventos - Stateless Biometric API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Inicializar o Model ArcFace / RetianFace via InsightFace (Buffalo_L é o melhor C++)
face_app = None
if INSIGHTFACE_AVAILABLE:
    logger.info("⏳ Inicializando modelo ONNX (ArcFace)...")
    face_app = FaceAnalysis(name='buffalo_l')
    face_app.prepare(ctx_id=0, det_size=(640, 640))
    logger.info("✅ ONNX Stateless Engine Pronto.")

class ExtractRequest(BaseModel):
    image_base64: str

@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "mode": "stateless_api",
        "engine": "insightface_onnx" if INSIGHTFACE_AVAILABLE else "mock",
        "memory_cost": "O(1) - Zero Caching"
    }

@app.post("/api/extract")
async def extract_face(req: ExtractRequest):
    try:
        # Decodificar Base64 -> Matriz Numpy/Cv2
        img_data = base64.b64decode(req.image_base64)
        nparr = np.frombuffer(img_data, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            raise HTTPException(status_code=400, detail="Imagem decodificada inválida")

        if not INSIGHTFACE_AVAILABLE:
            # Mock de 512 posições se não conseguir buildar o C++ native
            return {"success": True, "embedding": [0.0] * 512, "mock": True}

        # Inferência Ultra-Rápida ONNX no Tópico Único da Image
        faces = face_app.get(img)
        
        if not faces:
            return {"success": False, "message": "Nenhum rosto detectado na imagem."}
            
        # Pega a face principal (Maior Bouding Box)
        largest_face = max(faces, key=lambda f: (f.bbox[2]-f.bbox[0]) * (f.bbox[3]-f.bbox[1]))
        
        # O vetor normatizado contém 512 dimensões perfeitas para Cossenos
        embedding = [float(x) for x in largest_face.normed_embedding]
        
        return {
            "success": True,
            "embedding": embedding,
            "det_score": float(largest_face.det_score)
        }

    except Exception as e:
        logger.error(f"Erro durante abstração ONNX HNSW: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)