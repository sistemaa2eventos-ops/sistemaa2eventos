"""
A2 EVENTOS - LEITOR DE PLACAS
Detecção e reconhecimento de placas de veículos via OCR
"""

import re
import numpy as np
from typing import List, Dict, Optional, Tuple
from loguru import logger
import cv2

try:
    import easyocr
    EASYOCR_AVAILABLE = True
except ImportError:
    EASYOCR_AVAILABLE = False
    logger.warning("⚠️ EasyOCR não disponível")

try:
    from ultralytics import YOLO
    YOLO_AVAILABLE = True
except ImportError:
    YOLO_AVAILABLE = False
    logger.warning("⚠️ Ultralytics (YOLOv8) não disponível")


class PlateReader:
    """Leitor de placas de veículos"""
    
    # Formato padrão de placa brasileira (antigo e Mercosul)
    PLATE_PATTERN = re.compile(r'^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$|^[A-Z]{3}[0-9]{4}$')
    
    def __init__(self, confidence: float = 0.6):
        self.confidence = confidence
        
        # Inicializar EasyOCR (lento na primeira execução)
        self.ocr_reader = None
        if EASYOCR_AVAILABLE:
            try:
                self.ocr_reader = easyocr.Reader(['en', 'pt'], gpu=False, verbose=False)
                logger.info("✅ EasyOCR inicializado para leitura de placas")
            except Exception as e:
                logger.error(f"❌ Erro ao inicializar EasyOCR: {e}")
                self.ocr_reader = None
        
        # Modelo YOLO para detecção de placas (se disponível)
        self.yolo_model = None
        if YOLO_AVAILABLE:
            try:
                # Usar modelo pré-treinado ou modelo genérico
                # Para placas, pode usar YOLOv8 com dataset personalizado
                # Aqui usamos detecção genérica de objetos
                self.yolo_model = YOLO('yolov8n.pt')
                logger.info("✅ YOLOv8 carregado para detecção de objetos")
            except Exception as e:
                logger.error(f"❌ Erro ao carregar YOLOv8: {e}")
                self.yolo_model = None
    
    def detect_plates(self, frame: np.ndarray) -> List[Dict]:
        """Detecta placas no frame"""
        results = []
        
        if self.ocr_reader is None:
            logger.warning("⚠️ OCR não disponível, retornando lista vazia")
            return results
        
        try:
            # OCR direta no frame (mais lento mas funciona sem YOLO)
            detections = self.ocr_reader.readtext(frame)
            
            for detection in detections:
                bbox, text, conf = detection
                
                if conf < self.confidence:
                    continue
                
                # Limpar texto
                clean_text = self._clean_plate_text(text)
                
                if clean_text and self._validate_plate(clean_text):
                    results.append({
                        'plate': clean_text,
                        'confidence': conf,
                        'bbox': bbox,
                        'raw_text': text
                    })
                    logger.info(f"🚗 Placa detectada: {clean_text} ({conf:.2%})")
            
            # Se YOLO disponível, tentar detectar região primeiro
            if self.yolo_model and not results:
                plate_regions = self._detect_plate_regions_yolo(frame)
                
                for region in plate_regions:
                    x1, y1, x2, y2 = region
                    plate_img = frame[y1:y2, x1:x2]
                    
                    plate_results = self.ocr_reader.readtext(plate_img)
                    
                    for detection in plate_results:
                        bbox, text, conf = detection
                        
                        if conf < self.confidence:
                            continue
                        
                        clean_text = self._clean_plate_text(text)
                        
                        if clean_text and self._validate_plate(clean_text):
                            results.append({
                                'plate': clean_text,
                                'confidence': conf,
                                'bbox': bbox,
                                'raw_text': text
                            })
            
        except Exception as e:
            logger.error(f"❌ Erro ao detectar placas: {e}")
        
        return results
    
    def _detect_plate_regions_yolo(self, frame: np.ndarray) -> List[Tuple]:
        """Usa YOLO para detectar regiões prováveis de placas"""
        try:
            results = self.yolo_model(frame, verbose=False)
            
            regions = []
            
            for result in results:
                boxes = result.boxes
                
                for box in boxes:
                    # YOLO COCO - carro/moto/classe relevante
                    cls = int(box.cls[0])
                    
                    # Classes de veículos: 2=car, 3=motorcycle, 7=truck
                    if cls in [2, 3, 7]:
                        x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                        regions.append((int(x1), int(y1), int(x2), int(y2)))
            
            return regions
            
        except Exception as e:
            logger.error(f"❌ Erro na detecção YOLO: {e}")
            return []
    
    def _clean_plate_text(self, text: str) -> Optional[str]:
        """Limpa e formata texto da placa"""
        # Remover caracteres especiais
        text = re.sub(r'[^A-Z0-9]', '', text.upper())
        
        # Remover prefixos/sufixos comuns
        text = text.replace('BRA', '').replace('BR', '')
        
        # Garantir formato válido
        if len(text) >= 7:
            return text[:7]
        
        return None
    
    def _validate_plate(self, plate: str) -> bool:
        """Valida formato de placa brasileira"""
        if not plate or len(plate) < 7:
            return False
        
        # Padrão Mercosul: ABC1D23 ou ABC1234 (antigo)
        if self.PLATE_PATTERN.match(plate):
            return True
        
        # Aceitar variações comuns
        if re.match(r'^[A-Z]{3}[0-9]{4}$', plate):  # ABC1234
            return True
        
        if re.match(r'^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$', plate):  # ABC1D23
            return True
        
        return False
    
    async def find_match(self, supabase, placa: str) -> Optional[Dict]:
        """Busca placa no banco de dados"""
        try:
            # Buscar placa conhecida
            result = await supabase.find_plate(placa)
            
            if result:
                return {
                    'placa': result.get('placa'),
                    'proprietario': result.get('proprietario_nome'),
                    'modelo': result.get('veiculo_modelo'),
                    'cor': result.get('veiculo_cor'),
                    'autorizado': result.get('autorizado', True),
                    'is_watchlist': False
                }
            
            # Verificar watchlist
            watchlist = await supabase.check_placa_watchlist(placa)
            
            if watchlist:
                return {
                    'placa': watchlist.get('placa'),
                    'proprietario': watchlist.get('proprietario_nome'),
                    'is_watchlist': True,
                    'nivel_alerta': watchlist.get('nivel_alerta'),
                    'motivo': watchlist.get('motivo'),
                    'autorizado': False
                }
            
            return None
            
        except Exception as e:
            logger.error(f"❌ Erro ao buscar placa: {e}")
            return None
    
    def draw_plate_boxes(self, frame: np.ndarray, plates: List[Dict]) -> np.ndarray:
        """Desenha bounding boxes das placas no frame"""
        import cv2
        
        output = frame.copy()
        
        for plate_data in plates:
            bbox = plate_data.get('bbox', [])
            
            if len(bbox) >= 4:
                pts = np.array(bbox, np.int32)
                
                # Cor baseada em autorização
                is_authorized = plate_data.get('autorizado', True)
                is_watchlist = plate_data.get('is_watchlist', False)
                
                if is_watchlist:
                    color = (0, 0, 255)  # Vermelho - watchlist
                elif is_authorized:
                    color = (0, 255, 0)  # Verde - autorizado
                else:
                    color = (0, 255, 255)  # Amarelo - não autorizado
                
                # Desenhar polígono
                cv2.polylines(output, [pts], True, color, 2)
                
                # Texto
                plate = plate_data.get('plate', '')
                conf = plate_data.get('confidence', 0)
                
                text = f"{plate} ({conf:.0%})"
                if is_watchlist:
                    text = f"⚠️ {text}"
                
                # Posição do texto
                x = int(min([p[0] for p in pts]))
                y = int(min([p[1] for p in pts])) - 10
                
                cv2.putText(output, text, (x, y),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
        
        return output