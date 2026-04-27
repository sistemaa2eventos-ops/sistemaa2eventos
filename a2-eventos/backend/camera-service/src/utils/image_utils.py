"""
A2 EVENTOS - UTILITÁRIOS DE IMAGEM
Funções auxiliares para processamento de imagens
"""

import os
import cv2
import numpy as np
from typing import Tuple, Optional
from loguru import logger
from datetime import datetime

def save_snapshot(frame: np.ndarray, path: str, quality: int = 80, max_width: int = 800) -> bool:
    """Salva um frame como JPEG com redimensionamento"""
    try:
        # Criar diretório se não existir
        os.makedirs(os.path.dirname(path), exist_ok=True)
        
        # Redimensionar se necessário
        if max_width and frame.shape[1] > max_width:
            scale = max_width / frame.shape[1]
            new_width = int(frame.shape[1] * scale)
            new_height = int(frame.shape[0] * scale)
            frame = cv2.resize(frame, (new_width, new_height))
        
        # Salvar como JPEG
        success, encoded = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, quality])
        
        if success:
            with open(path, 'wb') as f:
                f.write(encoded.tobytes())
            logger.debug(f"📸 Snapshot salvo: {path}")
            return True
        
        return False
        
    except Exception as e:
        logger.error(f"❌ Erro ao salvar snapshot: {e}")
        return False

def validate_image_quality(frame: np.ndarray) -> float:
    """
    Valida qualidade da imagem usando Laplaciano (mede nitidez)
    Retorna pontuação entre 0 e 1
    """
    try:
        # Converter para escala de cinza
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        
        # Calcular Laplaciano (variância = nitidez)
        laplacian = cv2.Laplacian(gray, cv2.CV_64F)
        variance = laplacian.var()
        
        # Normalizar para 0-1 (valores típicos: 100-1000)
        score = min(variance / 500, 1.0)
        
        return float(score)
        
    except Exception as e:
        logger.error(f"❌ Erro ao validar qualidade: {e}")
        return 0.0

def check_face_size(frame: np.ndarray, bbox: Tuple, min_size: int = 150) -> bool:
    """Verifica se a face detectada tem tamanho mínimo"""
    x1, y1, x2, y2 = [int(v) for v in bbox]
    width = x2 - x1
    height = y2 - y1
    
    return width >= min_size and height >= min_size

def check_lighting(frame: np.ndarray) -> dict:
    """Analisa condições de iluminação do frame"""
    try:
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        
        # Média e desvio padrão dos pixels
        mean = gray.mean()
        std = gray.std()
        
        # Classificar iluminação
        if mean < 50:
            lighting = "muito_escuro"
            usable = False
        elif mean > 200:
            lighting = "muito_brilhante"
            usable = std < 30
        elif std < 20:
            lighting = "baixo_contraste"
            usable = False
        else:
            lighting = "boa"
            usable = True
        
        return {
            'lighting': lighting,
            'usable': usable,
            'mean_brightness': mean,
            'std_contrast': std
        }
        
    except Exception as e:
        return {'lighting': 'erro', 'usable': False, 'mean_brightness': 0, 'std_contrast': 0}

def crop_face(frame: np.ndarray, bbox: Tuple, margin: float = 0.2) -> np.ndarray:
    """Recorta a região da face com margem ao redor"""
    try:
        x1, y1, x2, y2 = [int(v) for v in bbox]
        height, width = frame.shape[:2]
        
        # Calcular margem
        face_width = x2 - x1
        face_height = y2 - y1
        margin_x = int(face_width * margin)
        margin_y = int(face_height * margin)
        
        # Aplicar margem
        x1 = max(0, x1 - margin_x)
        y1 = max(0, y1 - margin_y)
        x2 = min(width, x2 + margin_x)
        y2 = min(height, y2 + margin_y)
        
        return frame[y1:y2, x1:x2]
        
    except Exception as e:
        logger.error(f"❌ Erro ao recortar face: {e}")
        return frame

def encode_base64(frame: np.ndarray) -> str:
    """Codifica frame para base64"""
    import base64
    
    try:
        ret, encoded = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
        
        if ret:
            return base64.b64encode(encoded.tobytes()).decode('utf-8')
        
        return ""
        
    except Exception as e:
        logger.error(f"❌ Erro ao codificar base64: {e}")
        return ""

def decode_base64(data: str) -> Optional[np.ndarray]:
    """Decodifica base64 para frame"""
    import base64
    
    try:
        nparr = np.frombuffer(base64.b64decode(data), np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        return frame
        
    except Exception as e:
        logger.error(f"❌ Erro ao decodificar base64: {e}")
        return None

def resize_frame(frame: np.ndarray, width: Optional[int] = None, 
                 height: Optional[int] = None, maintain_aspect: bool = True) -> np.ndarray:
    """Redimensiona frame mantendo aspect ratio"""
    try:
        h, w = frame.shape[:2]
        
        if maintain_aspect:
            if width:
                scale = width / w
                new_w = width
                new_h = int(h * scale)
            elif height:
                scale = height / h
                new_h = height
                new_w = int(w * scale)
            else:
                return frame
        else:
            new_w = width or w
            new_h = height or h
        
        return cv2.resize(frame, (new_w, new_h))
        
    except Exception as e:
        logger.error(f"❌ Erro ao redimensionar: {e}")
        return frame

def create_thumbnail(frame: np.ndarray, max_size: int = 150) -> np.ndarray:
    """Cria thumbnail do frame"""
    try:
        h, w = frame.shape[:2]
        
        if h > w:
            new_h = max_size
            new_w = int(w * (max_size / h))
        else:
            new_w = max_size
            new_h = int(h * (max_size / w))
        
        return cv2.resize(frame, (new_w, new_h))
        
    except Exception as e:
        logger.error(f"❌ Erro ao criar thumbnail: {e}")
        return frame

def apply_blur_detection(frame: np.ndarray, threshold: float = 100) -> bool:
    """Detecta se imagem está borrada usando Laplacian variance"""
    try:
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
        
        return laplacian_var < threshold
        
    except Exception as e:
        return True  # Considerar borrada em caso de erro

def draw_debug_info(frame: np.ndarray, info: dict) -> np.ndarray:
    """Desenha informações de debug no frame"""
    import cv2
    
    output = frame.copy()
    y_offset = 30
    
    for key, value in info.items():
        text = f"{key}: {value}"
        cv2.putText(output, text, (10, y_offset),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)
        y_offset += 20
    
    return output