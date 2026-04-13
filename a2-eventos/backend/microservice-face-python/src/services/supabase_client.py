import os
from supabase import create_client, Client
from dotenv import load_dotenv
import json
import logging
from typing import Optional, Dict, List
from datetime import datetime

load_dotenv()
logger = logging.getLogger(__name__)

class SupabaseClient:
    _instance = None
    _client: Client = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            url = os.getenv('SUPABASE_URL')
            key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
            if not url or not key:
                raise ValueError("SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não definidos")
            cls._instance._client = create_client(url, key)
            logger.info("✅ Cliente Supabase inicializado")
        return cls._instance
    
    @property
    def client(self) -> Client:
        return self._client
    
    def get_funcionarios_com_face(self, evento_id: str = None) -> List[Dict]:
        try:
            query = self._client.table('funcionarios').select('id,nome,face_encoding,foto_url,status_acesso').not_.is_('face_encoding', 'null')
            if evento_id:
                query = query.eq('evento_id', evento_id)
            result = query.execute()
            for func in result.data:
                if isinstance(func.get('face_encoding'), str):
                    try:
                        func['face_encoding'] = json.loads(func['face_encoding'])
                    except:
                        pass
            logger.info(f"📥 Carregados {len(result.data)} funcionários com face cadastrada")
            return result.data
        except Exception as e:
            logger.error(f"Erro ao buscar funcionários: {e}")
            return []
    
    def registrar_log_acesso(self, log_data: Dict) -> Optional[Dict]:
        try:
            result = self._client.table('logs_acesso').insert(log_data).execute()
            logger.info(f"✅ Log registrado: {log_data.get('funcionario_id')}")
            return result.data[0] if result.data else None
        except Exception as e:
            logger.error(f"Erro ao registrar log: {e}")
            return None
    
    def atualizar_status_funcionario(self, funcionario_id: str, status: str) -> bool:
        try:
            result = self._client.table('funcionarios').update({
                'status_acesso': status,
                'updated_at': datetime.now().isoformat()
            }).eq('id', funcionario_id).execute()
            return len(result.data) > 0
        except Exception as e:
            logger.error(f"Erro ao atualizar status: {e}")
            return False
    
    def get_evento_ativo(self) -> Optional[Dict]:
        try:
            result = self._client.table('eventos').select('id').eq('status', 'ativo').execute()
            if result.data:
                return result.data[0]
            return None
        except Exception as e:
            logger.error(f"Erro ao buscar evento ativo: {e}")
            return None