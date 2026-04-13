import os
import json
import numpy as np
from loguru import logger

class RedisFaceCache:
    """
    Controlador de Cache Multi-Node para o Reconhecimento Facial.
    Permite escalar os workers horizontalmente, compartilhando os rostos via Redis.
    Possui tolerância a falhas utilizando memória local.
    """
    def __init__(self):
        self.host = os.getenv('REDIS_HOST', 'localhost')
        self.port = int(os.getenv('REDIS_PORT', 6379))
        self.password = os.getenv('REDIS_PASSWORD', None)
        self.client = None
        self.enabled = os.getenv('USE_REDIS', 'false').lower() == 'true'
        
        # Fallback RAM local se não houver cluster Redis configurado ou caso o Redis caia
        self._local_cache = {}
        
        if self.enabled:
            try:
                import redis
                self.client = redis.Redis(
                    host=self.host,
                    port=self.port,
                    password=self.password,
                    decode_responses=True
                )
                self.client.ping()
                logger.info(f"✅ Redis Service conectado em {self.host}:{self.port} (A2 Eventos SaaS Cloud Mode)")
            except ImportError:
                logger.warning("⚠️ Biblioteca 'redis' não instalada (pip install redis). Degradando para cache local.")
                self.enabled = False
            except Exception as e:
                logger.warning(f"⚠️ Falha ao conectar no Redis: {e}. Degradando para cache em memória local.")
                self.enabled = False
    
    def set_face(self, funcionario_id: str, face_encoding: list):
        """Salva a face serializando o numpy array para armazenar no BD KV"""
        if isinstance(face_encoding, np.ndarray):
            face_encoding = face_encoding.tolist()
            
        if self.enabled and self.client:
            try:
                self.client.hset('a2_faces', funcionario_id, json.dumps(face_encoding))
            except Exception as e:
                logger.error(f"Erro ao salvar pipeline no Redis: {e}")
        
        # Mantém cache em memória por segurança L1, Redis como L2
        self._local_cache[funcionario_id] = face_encoding
        return True

    def get_all_faces(self):
        """Retorna todas as faces registradas no ecossistema (Cloud + Memória). Formato: { id: [encoding] }"""
        if self.enabled and self.client:
            try:
                data = self.client.hgetall('a2_faces')
                faces = {}
                for k, v in data.items():
                    faces[k] = json.loads(v)
                
                # Mescla a memória local com a remota
                merged = {**self._local_cache, **faces}
                # Atualizar a memória local caso outro worker tenha enviado algo novo
                self._local_cache = merged 
                return merged
            except Exception as e:
                logger.error(f"Erro na ponte Redis: {e}")
                
        return self._local_cache

    def remove_face(self, funcionario_id: str):
        if self.enabled and self.client:
            try:
                self.client.hdel('a2_faces', funcionario_id)
            except Exception as e:
                logger.error(f"Erro ao deletar flush no Redis: {e}")
                
        if funcionario_id in self._local_cache:
            del self._local_cache[funcionario_id]

    def clear(self):
        if self.enabled and self.client:
            try:
                self.client.delete('a2_faces')
            except Exception:
                pass
        self._local_cache.clear()

    @property
    def is_active(self):
        return self.enabled and self.client is not None
