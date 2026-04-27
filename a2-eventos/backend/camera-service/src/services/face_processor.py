"""
A2 EVENTOS - PROCESSADOR DE FACES
Detecção e reconhecimento facial via InsightFace
"""

import numpy as np
from typing import List, Dict, Optional, Tuple
from loguru import logger

class FaceProcessor:
    """Processador de reconhecimento facial"""
    
    def __init__(self, face_app, tolerance: float = 0.6, min_size: int = 150, confidence: float = 0.65):
        self.face_app = face_app
        self.tolerance = tolerance  # Distância máxima para considerar match (0.4 = 60% similaridade)
        self.min_size = min_size    # Tamanho mínimo da face em pixels
        self.confidence = confidence  # Confiança mínima de detecção
        
        logger.info(f"🔍 FaceProcessor inicializado (tolerance={tolerance}, min_size={min_size})")
    
    def detect_faces(self, frame: np.ndarray) -> List[Dict]:
        """Detecta todas as faces em um frame"""
        if self.face_app is None:
            return []
        
        try:
            # Detectar faces
            faces = self.face_app.get(frame)
            
            results = []
            
            for face in faces:
                # Verificar tamanho mínimo
                bbox = face.bbox
                width = bbox[2] - bbox[0]
                height = bbox[3] - bbox[1]
                
                if width < self.min_size or height < self.min_size:
                    continue
                
                # Verificar confiança mínima
                if face.det_score < self.confidence:
                    continue
                
                results.append({
                    'bbox': bbox,
                    'embedding': face.normed_embedding.tolist() if hasattr(face, 'normed_embedding') else None,
                    'confidence': face.det_score,
                    'age': face.age if hasattr(face, 'age') else None,
                    'gender': face.sex if hasattr(face, 'sex') else None
                })
            
            return results
            
        except Exception as e:
            logger.error(f"❌ Erro ao detectar faces: {e}")
            return []
    
    async def find_match(self, supabase, embedding: List[float], pg_client=None) -> Optional[Dict]:
        """Busca match no banco de dados (PostgreSQL do sistema A2)"""
        # PRIORIDADE: PostgreSQL (mesmo banco do sistema A2)
        if pg_client:
            try:
                match = pg_client.search_similar_face(
                    embedding, 
                    threshold=self.tolerance
                )
                
                if match and match.get('cpf'):
                    logger.info(f"✅ Face reconhecida: {match['nome']} ({match['cpf']}) - Confiança: {match['confidence']:.1%}")
                    return match
                
                return None
                
            except Exception as e:
                logger.error(f"❌ Erro ao buscar match no PostgreSQL: {e}")
        
        # Fallback: Supabase
        try:
            # Usar similaridade cosseno
            match = await supabase.search_similar_faces(
                embedding, 
                limit=1, 
                threshold=self.tolerance
            )
            
            if match and match.get('cpf'):
                # Verificar se está na watchlist
                watchlist = await supabase.check_cpf_watchlist(match['cpf'])
                
                if watchlist:
                    match['is_watchlist'] = True
                    match['watchlist_nivel'] = watchlist.get('nivel_alerta')
                    match['watchlist_motivo'] = watchlist.get('motivo')
                    logger.warning(f"🚨 ALERTA: CPF em watchlist - {match['cpf']} ({watchlist.get('motivo')})")
                else:
                    match['is_watchlist'] = False
                
                return match
            
            return None
            
        except Exception as e:
            logger.error(f"❌ Erro ao buscar match: {e}")
            return None
    
    def compare_faces(self, embedding1: List[float], embedding2: List[float]) -> float:
        """Compara dois embeddings e retorna distância cosseno"""
        try:
            emb1 = np.array(embedding1)
            emb2 = np.array(embedding2)
            
            # Normalizar
            emb1 = emb1 / np.linalg.norm(emb1)
            emb2 = emb2 / np.linalg.norm(emb2)
            
            # Similaridade cosseno
            similarity = np.dot(emb1, emb2)
            
            # Distância = 1 - similaridade
            distance = 1 - similarity
            
            return float(distance)
            
        except Exception as e:
            logger.error(f"❌ Erro ao comparar faces: {e}")
            return 1.0
    
    def draw_face_boxes(self, frame: np.ndarray, faces: List[Dict], labels: bool = True) -> np.ndarray:
        """Desenha bounding boxes das faces no frame"""
        import cv2
        
        output = frame.copy()
        
        for face_data in faces:
            bbox = face_data['bbox']
            x1, y1, x2, y2 = [int(v) for v in bbox]
            
            # Cor baseada na confiança
            conf = face_data.get('confidence', 0)
            if conf > 0.9:
                color = (0, 255, 0)  # Verde - alta confiança
            elif conf > 0.7:
                color = (0, 255, 255)  # Amarelo - média confiança
            else:
                color = (0, 0, 255)  # Vermelho - baixa confiança
            
            # Desenhar retângulo
            cv2.rectangle(output, (x1, y1), (x2, y2), color, 2)
            
            if labels:
                # Escrever confiança
                label = f"{conf:.2%}"
                if face_data.get('nome'):
                    label = f"{face_data['nome']} ({conf:.2%})"
                
                cv2.putText(output, label, (x1, y1 - 10),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
        
        return output