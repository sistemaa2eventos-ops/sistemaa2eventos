"""
A2 EVENTOS - CONFIGURAÇÕES
Carregamento e validação de variáveis de ambiente
"""

import os
from dataclasses import dataclass, field
from typing import List, Optional
from dotenv import load_dotenv

# Carregar .env se existir
load_dotenv()

@dataclass
class CameraConfig:
    """Configuração de uma câmera"""
    name: str
    rtsp_url: str
    location: str = ""
    tipo: str = "face"  # face, plate, both

@dataclass
class AppConfig:
    """Configurações da aplicação"""
    
    # Supabase
    supabase_url: str = field(default_factory=lambda: os.getenv("SUPABASE_URL", ""))
    supabase_anon_key: str = field(default_factory=lambda: os.getenv("SUPABASE_ANON_KEY", ""))
    supabase_service_key: str = field(default_factory=lambda: os.getenv("SUPABASE_SERVICE_ROLE_KEY", ""))
    
    # API A2
    a2_api_url: str = field(default_factory=lambda: os.getenv("A2_API_URL", "http://localhost:3001"))
    a2_api_key: str = field(default_factory=lambda: os.getenv("A2_API_KEY", ""))
    
    # Reconhecimento Facial
    face_tolerance: float = field(default_factory=lambda: float(os.getenv("FACE_TOLERANCE", "0.6")))
    min_face_size: int = field(default_factory=lambda: int(os.getenv("MIN_FACE_SIZE", "150")))
    confidence_threshold: float = field(default_factory=lambda: float(os.getenv("CONFIDENCE_THRESHOLD", "0.65")))
    frame_skip: int = field(default_factory=lambda: int(os.getenv("FRAME_SKIP", "3")))
    use_gpu: bool = field(default_factory=lambda: os.getenv("USE_GPU", "false").lower() == "true")
    
    # Reconhecimento de Placas
    plate_tolerance: float = field(default_factory=lambda: float(os.getenv("PLATE_TOLERANCE", "0.85")))
    plate_min_confidence: float = field(default_factory=lambda: float(os.getenv("PLATE_MIN_CONFIDENCE", "0.6")))
    
    # Redis
    redis_host: str = field(default_factory=lambda: os.getenv("REDIS_HOST", "localhost"))
    redis_port: int = field(default_factory=lambda: int(os.getenv("REDIS_PORT", "6379")))
    redis_password: str = field(default_factory=lambda: os.getenv("REDIS_PASSWORD", ""))
    redis_channel: str = field(default_factory=lambda: os.getenv("REDIS_CHANNEL", "detections"))
    
    # Servidor
    host: str = field(default_factory=lambda: os.getenv("HOST", "0.0.0.0"))
    port: int = field(default_factory=lambda: int(os.getenv("PORT", "8000")))
    log_level: str = field(default_factory=lambda: os.getenv("LOG_LEVEL", "INFO"))
    
    # Storage
    storage_bucket: str = field(default_factory=lambda: os.getenv("STORAGE_BUCKET", "camera-snapshots"))
    
    # Webcam de teste
    test_webcam_index: int = field(default_factory=lambda: int(os.getenv("TEST_WEBCAM_INDEX", "0")))
    test_webcam_width: int = field(default_factory=lambda: int(os.getenv("TEST_WEBCAM_WIDTH", "1920")))
    test_webcam_height: int = field(default_factory=lambda: int(os.getenv("TEST_WEBCAM_HEIGHT", "1080")))
    
    # Câmeras configuradas
    cameras: List[CameraConfig] = field(default_factory=list)
    
    def __post_init__(self):
        """Carrega câmeras das variáveis de ambiente"""
        self.cameras = self._load_cameras()
    
    def _load_cameras(self) -> List[CameraConfig]:
        """Carrega configuração de câmeras do .env"""
        cameras = []
        i = 1
        
        while True:
            name = os.getenv(f"CAMERA_{i}_NAME")
            rtsp = os.getenv(f"CAMERA_{i}_RTSP")
            
            if not name or not rtsp:
                break
            
            cameras.append(CameraConfig(
                name=name,
                rtsp_url=rtsp,
                location=os.getenv(f"CAMERA_{i}_LOCATION", ""),
                tipo=os.getenv(f"CAMERA_{i}_TYPE", "face")
            ))
            
            i += 1
        
        return cameras
    
    def validate(self) -> List[str]:
        """Valida configurações e retorna lista de erros"""
        errors = []
        
        if not self.supabase_url:
            errors.append("SUPABASE_URL não definido")
        
        if not self.supabase_service_key:
            errors.append("SUPABASE_SERVICE_ROLE_KEY não definido")
        
        return errors
    
    def is_valid(self) -> bool:
        """Retorna se configuração é válida"""
        return len(self.validate()) == 0

# Instância global de configuração
config = AppConfig()

# Validação na importação
if not config.is_valid():
    from loguru import logger
    for error in config.validate():
        logger.warning(f"⚠️ Configuração inválida: {error}")