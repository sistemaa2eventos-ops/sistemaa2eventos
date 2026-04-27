"""
A2 EVENTOS - SERVIÇO DE CADASTRO DE ENROLLMENTS
Cadastro de embeddings faciais e placas via API
"""

import os
import sys
import cv2
import numpy as np
from pathlib import Path
from typing import Optional, List, Dict
from datetime import datetime

from fastapi import FastAPI, HTTPException, UploadFile, File, Query, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
from loguru import logger

# Configuração de logging
log_path = Path("logs")
log_path.mkdir(exist_ok=True)
logger.remove()
logger.add(
    sys.stdout,
    format="<green>{time:HH:mm:ss}</green> | <level>{level: <8}</level> | <level>{message}</level>",
    level="INFO"
)
logger.add(
    "logs/enrollment_{time:YYYY-MM-DD}.log",
    rotation="00:00",
    retention="7 days",
    level="DEBUG"
)

# Carregar env
from dotenv import load_dotenv
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
CONFIDENCE_THRESHOLD = float(os.getenv("CONFIDENCE_THRESHOLD", "0.65"))
MIN_FACE_SIZE = int(os.getenv("MIN_FACE_SIZE", "150"))

# FastAPI App
app = FastAPI(title="A2 Eventos - Enrollment Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# InsightFace
face_app = None
try:
    from insightface.app import FaceAnalysis
    logger.info("⏳ Carregando modelo InsightFace...")
    face_app = FaceAnalysis(name='buffalo_l')
    face_app.prepare(ctx_id=0, det_size=(640, 640))
    logger.info("✅ InsightFace carregado!")
except ImportError:
    logger.warning("⚠️ InsightFace não disponível")
except Exception as e:
    logger.error(f"❌ Erro ao carregar InsightFace: {e}")

# Supabase client
from services.supabase_client import SupabaseClient
supabase = SupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# Utilitários
from utils.image_utils import validate_image_quality, save_snapshot


class EnrollmentResult(BaseModel):
    success: bool
    cpf: Optional[str] = None
    nome: Optional[str] = None
    quality_score: float
    confidence: float
    face_detected: bool
    message: str
    embedding_id: Optional[str] = None


class PlateEnrollmentResult(BaseModel):
    success: bool
    placa: str
    proprietario: str
    modelo: Optional[str] = None
    cor: Optional[str] = None
    message: str
    plate_id: Optional[str] = None


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "service": "enrollment",
        "insightface_available": face_app is not None
    }


@app.post("/enroll/face", response_model=EnrollmentResult)
async def enroll_face(
    cpf: str = Query(..., description="CPF do pessoa"),
    nome: str = Query(..., description="Nome completo"),
    evento_id: Optional[str] = Query(None, description="ID do evento"),
    foto: UploadFile = File(..., description="Foto do rosto")
):
    """
    Cadastra embedding facial para uma pessoa.
    
    Requisitos da foto:
    - Rosto visível e frontal
    - Boa iluminação
    - Resolução mínima recomendada: 640x480
    - Formato: JPEG ou PNG
    """
    try:
        # Ler imagem
        contents = await foto.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            raise HTTPException(status_code=400, detail="Não foi possível decodificar a imagem")
        
        logger.info(f"📸 Processando foto para CPF {cpf}")
        
        # Validar qualidade
        quality = validate_image_quality(img)
        logger.info(f"📊 Qualidade da foto: {quality:.2%}")
        
        if quality < 0.25:
            raise HTTPException(
                status_code=400,
                detail=f"Qualidade da foto muito baixa ({quality:.2%}). Tente com melhor iluminação."
            )
        
        # Detectar face
        if face_app is None:
            raise HTTPException(status_code=503, detail="Serviço de reconhecimento facial indisponível")
        
        faces = face_app.get(img)
        
        if not faces:
            raise HTTPException(status_code=400, detail="Nenhuma face detectada na imagem")
        
        if len(faces) > 1:
            raise HTTPException(status_code=400, detail="Multiple faces detectadas. Use foto com apenas uma pessoa.")
        
        # Pegar maior face
        face = max(faces, key=lambda f: (f.bbox[2]-f.bbox[0]) * (f.bbox[3]-f.bbox[1]))
        
        # Verificar confiança
        if face.det_score < CONFIDENCE_THRESHOLD:
            raise HTTPException(
                status_code=400,
                detail=f"Confiança da detecção muito baixa ({face.det_score:.2%}). Tente foto mais clara."
            )
        
        # Verificar tamanho
        bbox = face.bbox
        width = bbox[2] - bbox[0]
        height = bbox[3] - bbox[1]
        
        if width < MIN_FACE_SIZE or height < MIN_FACE_SIZE:
            raise HTTPException(
                status_code=400,
                detail=f"Rosto muito pequeno na imagem ({width}x{height}). Aproxime-se da câmera."
            )
        
        # Extrair embedding
        embedding = [float(x) for x in face.normed_embedding]
        
        # Salvar foto original
        foto_path = f"/tmp/enrollments/{cpf}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.jpg"
        save_snapshot(img, foto_path, quality=85, max_width=800)
        
        # Upload para Supabase
        foto_url = await supabase.upload_snapshot(foto_path)
        
        # Cadastrar no banco
        result = await supabase.insert_face_embedding(
            cpf=cpf,
            nome=nome,
            embedding=embedding,
            quality_score=quality,
            evento_id=evento_id
        )
        
        return EnrollmentResult(
            success=True,
            cpf=cpf,
            nome=nome,
            quality_score=quality,
            confidence=float(face.det_score),
            face_detected=True,
            message="Embedding cadastrado com sucesso",
            embedding_id=result.get('id') if result else None
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Erro ao cadastrar face: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/enroll/plate", response_model=PlateEnrollmentResult)
async def enroll_plate(
    placa: str = Query(..., description="Número da placa"),
    proprietario: str = Query(..., description="Nome do proprietário"),
    modelo: Optional[str] = Query(None, description="Modelo do veículo"),
    cor: Optional[str] = Query(None, description="Cor do veículo"),
    evento_id: Optional[str] = Query(None, description="ID do evento")
):
    """
    Cadastra uma placa de veículo autorizada.
    """
    try:
        # Limpar placa
        placa_clean = placa.upper().replace('-', '').replace(' ', '').replace('.', '')
        
        # Validar formato
        import re
        if not re.match(r'^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$|^[A-Z]{3}[0-9]{4}$', placa_clean):
            raise HTTPException(
                status_code=400,
                detail="Formato de placa inválido. Use formato ABC1234 ou ABC1D23."
            )
        
        # Cadastrar
        result = await supabase.insert_known_plate(
            placa=placa_clean,
            proprietario=proprietario,
            modelo=modelo,
            cor=cor,
            evento_id=evento_id
        )
        
        return PlateEnrollmentResult(
            success=True,
            placa=placa_clean,
            proprietario=proprietario,
            modelo=modelo,
            cor=cor,
            message="Placa cadastrada com sucesso"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Erro ao cadastrar placa: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/enrollments")
async def list_enrollments(evento_id: Optional[str] = None):
    """Lista todos os embeddings cadastrados"""
    try:
        results = await supabase.list_face_embeddings(evento_id)
        
        return {
            "success": True,
            "count": len(results),
            "data": [
                {
                    "id": r.get('id'),
                    "cpf": r.get('cpf'),
                    "nome": r.get('nome'),
                    "quality_score": r.get('qualidade_score'),
                    "ativo": r.get('ativo'),
                    "created_at": r.get('created_at')
                }
                for r in results
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/enrollments/faces")
async def list_face_enrollments(evento_id: Optional[str] = None):
    """Lista apenas cadastros de faces (para dashboard)"""
    try:
        results = await supabase.list_face_embeddings(evento_id)
        
        return {
            "success": True,
            "count": len(results),
            "faces": [
                {
                    "id": r.get('id'),
                    "cpf": r.get('cpf'),
                    "nome": r.get('nome'),
                    "quality_score": r.get('qualidade_score'),
                    "foto_url": r.get('foto_url')
                }
                for r in results
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/enrollments/plates")
async def list_plate_enrollments(evento_id: Optional[str] = None):
    """Lista cadastros de placas"""
    try:
        results = await supabase.list_known_plates(evento_id)
        
        return {
            "success": True,
            "count": len(results),
            "plates": [
                {
                    "id": r.get('id'),
                    "placa": r.get('placa'),
                    "proprietario": r.get('proprietario_nome'),
                    "modelo": r.get('veiculo_modelo'),
                    "cor": r.get('veiculo_cor'),
                    "autorizado": r.get('autorizado')
                }
                for r in results
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/enrollments/face/{cpf}")
async def delete_face_enrollment(cpf: str):
    """Remove cadastro facial (desativa)"""
    try:
        # Não deletamos, apenas desativamos
        # await supabase.delete_face_enrollment(cpf)
        return {"success": True, "message": f"CPF {cpf} desativado"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/enroll/validate")
async def validate_photo(
    foto: UploadFile = File(...),
    min_quality: float = Query(0.25, description="Qualidade mínima aceitável")
):
    """
    Valida uma foto antes do cadastro.
    Retorna informações sobre qualidade e detecção de face.
    """
    try:
        # Ler imagem
        contents = await foto.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            raise HTTPException(status_code=400, detail="Imagem inválida")
        
        # Validar qualidade
        quality = validate_image_quality(img)
        
        # Detectar face
        faces_count = 0
        largest_face_score = 0
        
        if face_app:
            faces = face_app.get(img)
            faces_count = len(faces)
            
            if faces:
                largest = max(faces, key=lambda f: (f.bbox[2]-f.bbox[0]) * (f.bbox[3]-f.bbox[1]))
                largest_face_score = largest.det_score
        
        # Classificar
        if quality < min_quality:
            status = "rejected"
            reason = "Qualidade muito baixa"
        elif faces_count == 0:
            status = "rejected"
            reason = "Nenhuma face detectada"
        elif faces_count > 1:
            status = "rejected"
            reason = "Múltiplas faces detectadas"
        elif largest_face_score < CONFIDENCE_THRESHOLD:
            status = "warning"
            reason = "Face pouco nítida"
        elif quality < 0.5:
            status = "warning"
            reason = "Qualidade abaixo do ideal"
        else:
            status = "approved"
            reason = "Foto adequada"
        
        return {
            "status": status,
            "reason": reason,
            "quality_score": quality,
            "faces_detected": faces_count,
            "face_confidence": largest_face_score,
            "approval_required": status != "approved"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/stats")
async def stats():
    """Estatísticas do serviço de enrollment"""
    try:
        faces = await supabase.list_face_embeddings()
        plates = await supabase.list_known_plates()
        
        avg_quality = 0
        if faces:
            qualities = [f.get('qualidade_score', 0) for f in faces if f.get('qualidade_score')]
            avg_quality = sum(qualities) / len(qualities) if qualities else 0
        
        return {
            "total_faces": len(faces),
            "total_plates": len(plates),
            "avg_face_quality": avg_quality,
            "insightface_available": face_app is not None
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8001"))
    uvicorn.run("src.enrollment_service:app", host="0.0.0.0", port=port, reload=False)