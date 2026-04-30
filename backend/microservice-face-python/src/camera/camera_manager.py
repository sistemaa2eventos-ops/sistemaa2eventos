import cv2
import threading
import time
from queue import Queue, Empty
from typing import Optional, Callable, Dict
import logging
from datetime import datetime
import numpy as np

logger = logging.getLogger(__name__)

class RTSPCameraClient:
    def __init__(self, rtsp_url: str, camera_id: str, name: str = "", location: str = "",
                 width: int = 1280, height: int = 720, fps: int = 30,
                 buffer_size: int = 5, reconnect_delay: int = 5):
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
        self.frame_callback = None
        self.frame_skip = 2
        self.frame_count = 0
        self.frame_interval = 1.0 / fps if fps > 0 else 0.033
        self.stats = {
            'frames_captured': 0,
            'frames_processed': 0,
            'reconnections': 0,
            'errors': 0,
            'last_frame_time': None,
            'uptime': 0
        }
        self.start_time = time.time()
        self.lock = threading.Lock()
    
    def connect(self) -> bool:
        try:
            self.cap = cv2.VideoCapture(self.rtsp_url)
            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
            if self.fps > 0:
                self.cap.set(cv2.CAP_PROP_FPS, self.fps)
            self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 2)
            
            if not self.cap.isOpened():
                logger.error(f"❌ Não foi possível conectar à câmera {self.camera_id}")
                return False
            logger.info(f"✅ Câmera {self.camera_id} ({self.name}) conectada")
            return True
        except Exception as e:
            logger.error(f"Erro ao conectar câmera {self.camera_id}: {str(e)}")
            with self.lock:
                self.stats['errors'] += 1
            return False
    
    def disconnect(self):
        with self.lock:
            if self.cap:
                self.cap.release()
                self.cap = None
                logger.info(f"🔌 Câmera {self.camera_id} desconectada")
    
    def start(self, frame_callback: Optional[Callable] = None):
        if self.is_running:
            return
        self.is_running = True
        self.frame_callback = frame_callback
        self.thread = threading.Thread(target=self._capture_loop, daemon=True)
        self.thread.start()
        self.start_time = time.time()
        logger.info(f"▶️ Captura iniciada na câmera {self.camera_id}")
    
    def stop(self):
        self.is_running = False
        if self.thread:
            self.thread.join(timeout=5.0)
        self.disconnect()
        logger.info(f"⏹️ Captura parada na câmera {self.camera_id}")
    
    def _capture_loop(self):
        while self.is_running:
            try:
                if not self.cap or not self.cap.isOpened():
                    logger.warning(f"⚠️ Câmera {self.camera_id} desconectada, reconectando...")
                    with self.lock:
                        self.stats['reconnections'] += 1
                    self.disconnect()
                    time.sleep(self.reconnect_delay)
                    if not self.connect():
                        continue
                
                ret, frame = self.cap.read()
                if not ret or frame is None:
                    logger.warning(f"Frame inválido da câmera {self.camera_id}")
                    with self.lock:
                        self.stats['errors'] += 1
                    time.sleep(0.1)
                    continue
                
                with self.lock:
                    self.stats['frames_captured'] += 1
                    self.stats['last_frame_time'] = datetime.now()
                    self.stats['uptime'] = time.time() - self.start_time
                
                self.frame_count += 1
                if self.frame_count % self.frame_skip != 0:
                    continue
                
                if self.frame_queue.full():
                    try:
                        self.frame_queue.get_nowait()
                    except Empty:
                        pass
                
                self.frame_queue.put(frame)
                with self.lock:
                    self.stats['frames_processed'] += 1
                
                if self.frame_callback and callable(self.frame_callback):
                    try:
                        self.frame_callback(frame, self.camera_id)
                    except Exception as e:
                        logger.error(f"Erro no callback: {e}")
            except Exception as e:
                logger.error(f"Erro no loop de captura: {e}")
                with self.lock:
                    self.stats['errors'] += 1
                time.sleep(0.5)
    
    def get_frame(self, timeout: float = 0.1) -> Optional[np.ndarray]:
        try:
            return self.frame_queue.get(timeout=timeout)
        except Empty:
            return None
    
    def get_stats(self) -> dict:
        with self.lock:
            stats_copy = self.stats.copy()
        return {
            'camera_id': self.camera_id,
            'name': self.name,
            'location': self.location,
            'is_running': self.is_running,
            'is_connected': self.cap.isOpened() if self.cap else False,
            'queue_size': self.frame_queue.qsize(),
            **stats_copy,
            'timestamp': datetime.now().isoformat()
        }

class CameraManager:
    def __init__(self):
        self.cameras: Dict[str, RTSPCameraClient] = {}
        self.lock = threading.Lock()
    
    def add_camera(self, camera_id: str, rtsp_url: str, name: str = "", location: str = "", **kwargs) -> RTSPCameraClient:
        camera = RTSPCameraClient(rtsp_url, camera_id, name, location, **kwargs)
        with self.lock:
            self.cameras[camera_id] = camera
        return camera
    
    def remove_camera(self, camera_id: str):
        with self.lock:
            if camera_id in self.cameras:
                self.cameras[camera_id].stop()
                del self.cameras[camera_id]
                logger.info(f"🗑️ Câmera {camera_id} removida")
    
    def start_all(self):
        with self.lock:
            for camera_id, camera in self.cameras.items():
                try:
                    camera.start()
                except Exception as e:
                    logger.error(f"Erro ao iniciar câmera {camera_id}: {e}")
    
    def stop_all(self):
        with self.lock:
            for camera_id, camera in self.cameras.items():
                try:
                    camera.stop()
                except Exception as e:
                    logger.error(f"Erro ao parar câmera {camera_id}: {e}")
    
    def get_camera(self, camera_id: str) -> Optional[RTSPCameraClient]:
        return self.cameras.get(camera_id)
    
    def get_all_stats(self) -> dict:
        stats = {}
        with self.lock:
            for camera_id, camera in self.cameras.items():
                try:
                    stats[camera_id] = camera.get_stats()
                except:
                    stats[camera_id] = {'error': 'Erro ao obter estatísticas'}
        return stats