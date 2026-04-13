import cv2
import threading
import time
from queue import Queue
from typing import Optional, Callable
import logging
from datetime import datetime
import numpy as np

logger = logging.getLogger(__name__)

class RTSPCameraClient:
    """
    Cliente para câmeras IP via protocolo RTSP
    Otimizado para reconhecimento facial em tempo real
    """
    
    def __init__(self, 
                 rtsp_url: str,
                 camera_id: str,
                 name: str = "",
                 location: str = "",
                 width: int = 1280,
                 height: int = 720,
                 fps: int = 30,
                 buffer_size: int = 5,
                 reconnect_delay: int = 5):
        """
        Args:
            rtsp_url: URL RTSP da câmera
            camera_id: Identificador único da câmera
            name: Nome amigável da câmera
            location: Localização física
            width: Largura desejada do frame
            height: Altura desejada do frame
            fps: FPS desejado
            buffer_size: Tamanho do buffer de frames
            reconnect_delay: Delay para reconexão (segundos)
        """
        self.rtsp_url = rtsp_url
        self.camera_id = camera_id
        self.name = name
        self.location = location
        self.width = width
        self.height = height
        self.fps = fps
        self.buffer_size = buffer_size
        self.reconnect_delay = reconnect_delay
        
        self.cap = None
        self.frame_queue = Queue(maxsize=buffer_size)
        self.is_running = False
        self.thread = None
        self.frame_skip = 2  # Processar 1 a cada 2 frames
        self.frame_count = 0
        self.last_frame_time = 0
        self.frame_interval = 1.0 / fps
        
        # Estatísticas
        self.stats = {
            'frames_captured': 0,
            'frames_processed': 0,
            'reconnections': 0,
            'errors': 0,
            'last_frame_time': None,
            'uptime': 0
        }
        self.start_time = time.time()
    
    def connect(self) -> bool:
        """
        Estabelece conexão com a câmera RTSP
        """
        try:
            # Criar captura com parâmetros otimizados
            self.cap = cv2.VideoCapture(self.rtsp_url, cv2.CAP_FFMPEG)
            
            # Configurar propriedades
            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
            self.cap.set(cv2.CAP_PROP_FPS, self.fps)
            self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 2)  # Buffer pequeno para menor latência
            
            if not self.cap.isOpened():
                logger.error(f"❌ Não foi possível conectar à câmera {self.camera_id}")
                return False
            
            logger.info(f"✅ Câmera {self.camera_id} ({self.name}) conectada")
            return True
            
        except Exception as e:
            logger.error(f"Erro ao conectar câmera {self.camera_id}: {str(e)}")
            self.stats['errors'] += 1
            return False
    
    def disconnect(self):
        """Desconecta da câmera"""
        if self.cap:
            self.cap.release()
            self.cap = None
            logger.info(f"🔌 Câmera {self.camera_id} desconectada")
    
    def start(self, frame_callback: Optional[Callable] = None):
        """Inicia captura contínua em thread separada"""
        if self.is_running:
            return
        
        self.is_running = True
        self.frame_callback = frame_callback
        self.thread = threading.Thread(target=self._capture_loop, daemon=True)
        self.thread.start()
        self.start_time = time.time()
        
        logger.info(f"▶️ Captura iniciada na câmera {self.camera_id}")
    
    def stop(self):
        """Para captura"""
        self.is_running = False
        if self.thread:
            self.thread.join(timeout=5.0)
        self.disconnect()
        logger.info(f"⏹️ Captura parada na câmera {self.camera_id}")
    
    def _capture_loop(self):
        """Loop principal de captura"""
        while self.is_running:
            try:
                # Verificar conexão
                if not self.cap or not self.cap.isOpened():
                    logger.warning(f"⚠️ Câmera {self.camera_id} desconectada, reconectando...")
                    self.stats['reconnections'] += 1
                    self.disconnect()
                    time.sleep(self.reconnect_delay)
                    
                    if not self.connect():
                        continue
                
                # Capturar frame
                ret, frame = self.cap.read()
                
                if not ret or frame is None:
                    logger.warning(f"Frame inválido da câmera {self.camera_id}")
                    self.stats['errors'] += 1
                    time.sleep(0.1)
                    continue
                
                # Atualizar estatísticas
                self.stats['frames_captured'] += 1
                self.stats['last_frame_time'] = datetime.now()
                self.stats['uptime'] = time.time() - self.start_time
                
                # Controle de FPS (skip frames)
                self.frame_count += 1
                if self.frame_count % self.frame_skip != 0:
                    continue
                
                # Adicionar ao buffer (não bloqueante)
                if self.frame_queue.full():
                    try:
                        self.frame_queue.get_nowait()
                    except:
                        pass
                
                self.frame_queue.put(frame)
                self.stats['frames_processed'] += 1
                
                # Callback
                if self.frame_callback:
                    try:
                        self.frame_callback(frame, self.camera_id)
                    except Exception as e:
                        logger.error(f"Erro no callback: {str(e)}")
                
            except Exception as e:
                logger.error(f"Erro no loop de captura: {str(e)}")
                self.stats['errors'] += 1
                time.sleep(0.5)
    
    def get_frame(self, timeout: float = 0.1) -> Optional[np.ndarray]:
        """Obtém o frame mais recente da fila"""
        try:
            return self.frame_queue.get(timeout=timeout)
        except:
            return None
    
    def get_stats(self) -> dict:
        """Retorna estatísticas da câmera"""
        return {
            'camera_id': self.camera_id,
            'name': self.name,
            'location': self.location,
            'is_running': self.is_running,
            'is_connected': self.cap.isOpened() if self.cap else False,
            'queue_size': self.frame_queue.qsize(),
            **self.stats,
            'timestamp': datetime.now().isoformat()
        }

class CameraManager:
    """Gerenciador de múltiplas câmeras RTSP"""
    
    def __init__(self):
        self.cameras = {}
        self.callbacks = []
    
    def add_camera(self, camera_id: str, rtsp_url: str, name: str = "", location: str = "", **kwargs) -> RTSPCameraClient:
        """Adiciona nova câmera ao gerenciador"""
        camera = RTSPCameraClient(rtsp_url, camera_id, name, location, **kwargs)
        self.cameras[camera_id] = camera
        return camera
    
    def remove_camera(self, camera_id: str):
        """Remove câmera do gerenciador"""
        if camera_id in self.cameras:
            self.cameras[camera_id].stop()
            del self.cameras[camera_id]
    
    def start_all(self):
        """Inicia todas as câmeras"""
        for camera_id, camera in self.cameras.items():
            camera.start()
    
    def stop_all(self):
        """Para todas as câmeras"""
        for camera_id, camera in self.cameras.items():
            camera.stop()
    
    def get_camera(self, camera_id: str) -> Optional[RTSPCameraClient]:
        """Obtém câmera por ID"""
        return self.cameras.get(camera_id)
    
    def get_all_stats(self) -> dict:
        """Estatísticas de todas as câmeras"""
        return {
            camera_id: camera.get_stats()
            for camera_id, camera in self.cameras.items()
        }