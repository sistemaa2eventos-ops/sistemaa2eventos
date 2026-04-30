import cv2
import numpy as np
import time
import face_recognition
import base64
import logging
import faiss
from datetime import datetime
from typing import List, Tuple, Optional, Dict
from dataclasses import dataclass
from .liveness_detector import LivenessDetector

logger = logging.getLogger(__name__)

@dataclass
class RecognitionResult:
    funcionario_id: Optional[str]
    nome: Optional[str]
    confidence: float
    method: str
    timestamp: datetime
    face_location: Tuple
    image_base64: Optional[str] = None
    is_live: bool = False
    ear_score: float = 0.0

class FaceProcessor:
    def __init__(self, tolerance: float = 0.5, min_face_size: int = 100, use_gpu: bool = False):
        """
        Args:
            tolerance: Quão estrito é o reconhecimento (menor = mais rigoroso).
            min_face_size: Tamanho mínimo da face em pixels para ser processada.
            use_gpu: Se True, utiliza o modelo 'cnn' (requer dlib compilada com CUDA).
        """
        self.tolerance = tolerance
        self.min_face_size = min_face_size
        # O modelo 'cnn' é muito preciso mas pesado. 'hog' é ideal para CPU.
        self.model = "cnn" if use_gpu else "hog"
        
        self.liveness_detector = LivenessDetector(ear_threshold=0.2, consecutive_frames=2)
        
        self.stats = {
            'faces_detected': 0,
            'recognitions': 0,
            'errors': 0,
            'avg_processing_time': 0.0
        }
        self.faiss_index = None
        self.known_ids = []
        logger.info(f"✅ FaceProcessor real inicializado (modelo={self.model}, tolerance={tolerance})")

    def update_known_faces(self, known_faces: Dict[str, List[float]]):
        """Atualiza o índice FAISS com a nova lista de faces"""
        self.known_ids = list(known_faces.keys())
        if not self.known_ids:
            self.faiss_index = None
        else:
            encodings = np.array(list(known_faces.values())).astype('float32')
            dim = encodings.shape[1] if len(encodings) > 0 else 128
            self.faiss_index = faiss.IndexFlatL2(dim)
            self.faiss_index.add(encodings)
        logger.info(f"⚡ FAISS index atualizado com {len(self.known_ids)} faces")

    def _convert_to_base64(self, frame: np.ndarray) -> str:
        """Converte o frame do OpenCV para string Base64 para envio via API"""
        try:
            _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
            return base64.b64encode(buffer).decode('utf-8')
        except Exception as e:
            logger.error(f"Erro ao converter imagem para base64: {e}")
            return ""

    def process_frame(self, frame: np.ndarray, known_faces: Dict[str, List[float]], camera_id: str = "default", confidence_threshold: float = 0.6) -> List[RecognitionResult]:
        """
        Processa um frame real, detecta faces e compara com o banco de dados.
        """
        if frame is None:
            return []

        start_time = time.time()
        results = []

        try:
            # 1. Otimização: Reduz o tamanho do frame para 1/4 para processamento mais rápido
            small_frame = cv2.resize(frame, (0, 0), fx=0.25, fy=0.25)
            
            # 2. Conversão: OpenCV usa BGR, face_recognition usa RGB
            rgb_small_frame = cv2.cvtColor(small_frame, cv2.COLOR_BGR2RGB)

            # 3. Detecção: Encontra todas as localizações de faces no frame
            face_locations = face_recognition.face_locations(rgb_small_frame, model=self.model)
            
            if not face_locations:
                return []

            # Anti-spoofing via landmarks
            face_landmarks_list = face_recognition.face_landmarks(rgb_small_frame, face_locations)

            # 4. Encoding: Gera os vetores matemáticos das faces detectadas
            face_encodings = face_recognition.face_encodings(rgb_small_frame, face_locations)
            
            self.stats['faces_detected'] += len(face_locations)

            for face_encoding, face_location, face_landmarks in zip(face_encodings, face_locations, face_landmarks_list):
                match_id = None
                best_confidence = 0.0
                
                # Verifica liveness para a face
                is_live, avg_ear = self.liveness_detector.check_liveness(camera_id, face_landmarks)

                # 5. Comparação: Compara a face detectada com o índice FAISS
                if self.faiss_index is not None and self.faiss_index.ntotal > 0:
                    query_encoding = face_encoding.astype('float32').reshape(1, -1)
                    
                    # FAISS retorna a distância L2 (Euclidiana ao quadrado)
                    distances, indices = self.faiss_index.search(query_encoding, 1)
                    
                    if distances.shape[1] > 0 and indices[0][0] != -1:
                        # Para alinhar com a `tolerance` do face_recognition (que é euclidiana simples):
                        euclidean_distance = float(np.sqrt(distances[0][0]))
                        
                        confidence = 1.0 - euclidean_distance
                        
                        if euclidean_distance <= self.tolerance and confidence >= confidence_threshold:
                            best_match_index = indices[0][0]
                            match_id = self.known_ids[best_match_index]
                            best_confidence = confidence

                # 6. Se reconhecido, prepara o resultado
                if match_id:
                    # Ajusta as coordenadas da face de volta para o tamanho original (x4)
                    top, right, bottom, left = face_location
                    original_location = (top * 4, right * 4, bottom * 4, left * 4)

                    # Opcional: Recortar a face para o log (economiza banda da API)
                    # face_img = frame[top*4:bottom*4, left*4:right*4]
                    
                    results.append(RecognitionResult(
                        funcionario_id=match_id,
                        nome=None, # O nome será preenchido pelo Backend
                        confidence=best_confidence,
                        method=f"face_recognition_{self.model}",
                        timestamp=datetime.now(),
                        face_location=original_location,
                        image_base64=self._convert_to_base64(frame), # Envia o frame completo para prova
                        is_live=is_live,
                        ear_score=avg_ear
                    ))
                    self.stats['recognitions'] += 1

            # Atualiza estatística de tempo médio
            proc_time = time.time() - start_time
            self.stats['avg_processing_time'] = (self.stats['avg_processing_time'] + proc_time) / 2

        except Exception as e:
            logger.error(f"❌ Erro no processamento de frame: {e}")
            self.stats['errors'] += 1

        return results

    def get_stats(self) -> dict:
        """Retorna o estado atual do processador"""
        return {
            **self.stats,
            'model': self.model,
            'tolerance': self.tolerance,
            'timestamp': datetime.now().isoformat()
        }
    