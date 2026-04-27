"""
A2 EVENTOS - CLIENTE SUPABASE
Conexão com banco de dados para o módulo de câmeras
"""

import os
import json
from typing import Optional, List, Dict, Any
from datetime import datetime
import httpx
from loguru import logger

class SupabaseClient:
    """Cliente Supabase para operações do módulo de câmeras"""
    
    def __init__(self, url: str, service_key: str):
        self.url = url.rstrip('/')
        self.headers = {
            'apikey': service_key,
            'Authorization': f'Bearer {service_key}',
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        }
        self.service_key = service_key
        logger.info(f"🔗 SupabaseClient inicializado: {url}")
    
    async def _request(self, method: str, endpoint: str, json_data: Optional[dict] = None, params: Optional[dict] = None):
        """Método genérico para requisições HTTP"""
        url = f"{self.url}{endpoint}"
        
        async with httpx.AsyncClient(timeout=30) as client:
            try:
                if method == 'GET':
                    response = await client.get(url, headers=self.headers, params=params)
                elif method == 'POST':
                    response = await client.post(url, headers=self.headers, json=json_data)
                elif method == 'PUT':
                    response = await client.put(url, headers=self.headers, json=json_data)
                elif method == 'DELETE':
                    response = await client.delete(url, headers=self.headers)
                else:
                    raise ValueError(f"Método {method} não suportado")
                
                if response.status_code >= 400:
                    logger.error(f"❌ Erro na requisição {method} {endpoint}: {response.status_code} - {response.text}")
                    return None
                
                return response.json() if response.text else None
                
            except httpx.TimeoutException:
                logger.error(f"⏰ Timeout na requisição {method} {endpoint}")
                return None
            except Exception as e:
                logger.error(f"❌ Erro na requisição {method} {endpoint}: {e}")
                return None
    
    # ============================================
    # FACE EMBEDDINGS
    # ============================================
    
    async def insert_face_embedding(self, cpf: str, nome: str, embedding: List[float], 
                                     quality_score: float, evento_id: Optional[str] = None) -> dict:
        """Insere um novo embedding facial"""
        data = {
            'cpf': cpf,
            'nome': nome,
            'embedding': embedding,
            'qualidade_score': quality_score,
            'ativo': True,
            'evento_id': evento_id
        }
        
        result = await self._request('POST', '/rest/v1/camera_face_embeddings', json_data=data)
        
        if result:
            logger.info(f"✅ Embedding cadastrado: CPF {cpf}")
        else:
            # Tentar atualizar se já existir
            await self._request('PATCH', f'/rest/v1/camera_face_embeddings?cpf=eq.{cpf}', json_data=data)
            logger.info(f"🔄 Embedding atualizado: CPF {cpf}")
        
        return result
    
    async def search_similar_faces(self, embedding: List[float], limit: int = 1, 
                                   threshold: float = 0.4) -> Optional[dict]:
        """Busca face mais similar usando similaridade cosseno"""
        # Usar operador <=> (cosine distance) do pgvector
        # Quanto menor a distância, maior a similaridade
        # threshold 0.4 = similaridade ~0.6 (60%)
        
        params = {
            'embedding': f'["{",".join(str(x) for x in embedding)}"]',
            'limit': limit
        }
        
        # Busca via RPC se existir função, senão via REST
        try:
            result = await self._request('POST', '/rest/v1/rpc/match_face', json_data={
                'query_embedding': embedding,
                'match_threshold': threshold
            })
            
            if result and len(result) > 0:
                return result[0]
        except:
            pass
        
        # Fallback: busca todos e filtra localmente (menos eficiente)
        all_faces = await self._request('GET', '/rest/v1/camera_face_embeddings?ativo=eq.true&select=*')
        
        if not all_faces:
            return None
        
        # Encontrar melhor match localmente
        import numpy as np
        
        best_match = None
        best_distance = float('inf')
        
        for face in all_faces:
            try:
                stored_embedding = face.get('embedding', [])
                if not stored_embedding:
                    continue
                
                # Calcular distância cosseno
                emb1 = np.array(embedding)
                emb2 = np.array(stored_embedding)
                
                # Distância cosseno = 1 - similaridade cosseno
                similarity = np.dot(emb1, emb2) / (np.linalg.norm(emb1) * np.linalg.norm(emb2))
                distance = 1 - similarity
                
                if distance < best_distance and distance < threshold:
                    best_distance = distance
                    best_match = {
                        'cpf': face.get('cpf'),
                        'nome': face.get('nome'),
                        'id': face.get('id'),
                        'distance': float(distance),
                        'quality_score': face.get('qualidade_score')
                    }
            except Exception as e:
                continue
        
        return best_match
    
    async def list_face_embeddings(self, evento_id: Optional[str] = None) -> List[dict]:
        """Lista todos os embeddings cadastrados"""
        endpoint = '/rest/v1/camera_face_embeddings?ativo=eq.true&select=*'
        
        if evento_id:
            endpoint += f'&evento_id=eq.{evento_id}'
        
        return await self._request('GET', endpoint) or []
    
    # ============================================
    # KNOWN PLATES
    # ============================================
    
    async def insert_known_plate(self, placa: str, proprietario: str, 
                                  modelo: Optional[str] = None, cor: Optional[str] = None,
                                  evento_id: Optional[str] = None) -> dict:
        """Insere uma placa conhecida"""
        data = {
            'placa': placa.upper(),
            'proprietario_nome': proprietario,
            'veiculo_modelo': modelo,
            'veiculo_cor': cor,
            'autorizado': True,
            'evento_id': evento_id
        }
        
        result = await self._request('POST', '/rest/v1/camera_known_plates', json_data=data)
        
        if not result:
            # Atualizar se existir
            await self._request('PATCH', f'/rest/v1/camera_known_plates?placa=eq.{placa}', json_data=data)
        
        logger.info(f"✅ Placa cadastrada: {placa}")
        return result
    
    async def find_plate(self, placa: str) -> Optional[dict]:
        """Busca uma placa no banco"""
        placa_clean = placa.upper().replace('-', '').replace(' ', '')
        
        result = await self._request('GET', f'/rest/v1/camera_known_plates?placa=eq.{placa_clean}')
        
        if result and len(result) > 0:
            return result[0]
        return None
    
    async def list_known_plates(self, evento_id: Optional[str] = None) -> List[dict]:
        """Lista todas as placas conhecidas"""
        endpoint = '/rest/v1/camera_known_plates?autorizado=eq.true&select=*'
        
        if evento_id:
            endpoint += f'&evento_id=eq.{evento_id}'
        
        return await self._request('GET', endpoint) or []
    
    # ============================================
    # WATCHLIST
    # ============================================
    
    async def insert_watchlist_cpf(self, cpf: str, nome: Optional[str] = None,
                                    motivo: Optional[str] = None, nivel: str = 'medio') -> dict:
        """Adiciona CPF à watchlist"""
        data = {
            'cpf': cpf,
            'nome': nome,
            'motivo': motivo,
            'nivel_alerta': nivel,
            'ativo': True
        }
        
        return await self._request('POST', '/rest/v1/camera_watchlist_cpf', json_data=data)
    
    async def delete_watchlist_cpf(self, cpf: str) -> bool:
        """Remove CPF da watchlist"""
        result = await self._request('DELETE', f'/rest/v1/camera_watchlist_cpf?cpf=eq.{cpf}')
        return result is not None
    
    async def check_cpf_watchlist(self, cpf: str) -> Optional[dict]:
        """Verifica se CPF está na watchlist"""
        result = await self._request('GET', f'/rest/v1/camera_watchlist_cpf?cpf=eq.{cpf}&ativo=eq.true')
        
        if result and len(result) > 0:
            return result[0]
        return None
    
    async def insert_watchlist_placa(self, placa: str, proprietario: Optional[str] = None,
                                      motivo: Optional[str] = None, nivel: str = 'medio') -> dict:
        """Adiciona placa à watchlist"""
        data = {
            'placa': placa.upper(),
            'proprietario_nome': proprietario,
            'motivo': motivo,
            'nivel_alerta': nivel,
            'ativo': True
        }
        
        return await self._request('POST', '/rest/v1/camera_watchlist_placa', json_data=data)
    
    async def check_placa_watchlist(self, placa: str) -> Optional[dict]:
        """Verifica se placa está na watchlist"""
        placa_clean = placa.upper().replace('-', '').replace(' ', '')
        
        result = await self._request('GET', f'/rest/v1/camera_watchlist_placa?placa=eq.{placa_clean}&ativo=eq.true')
        
        if result and len(result) > 0:
            return result[0]
        return None
    
    # ============================================
    # DETECTIONS
    # ============================================
    
    async def insert_detection(self, camera_id: str, tipo: str, 
                                cpf: Optional[str] = None, nome: Optional[str] = None,
                                placa: Optional[str] = None, camera_name: Optional[str] = None,
                                location: Optional[str] = None, confidence: float = 0.0,
                                snapshot_url: Optional[str] = None, is_watchlist: bool = False,
                                is_authorized: bool = True, metadata: dict = None) -> dict:
        """Registra uma detecção"""
        data = {
            'camera_id': camera_id,
            'tipo': tipo,
            'cpf_detectado': cpf,
            'nome_detectado': nome,
            'placa_detectada': placa,
            'localizacao': location or camera_name,
            'confianca': confidence,
            'snapshot_url': snapshot_url,
            'is_watchlist': is_watchlist,
            'is_authorized': is_authorized,
            'metadata': metadata or {}
        }
        
        result = await self._request('POST', '/rest/v1/camera_detections', json_data=data)
        
        if result:
            logger.info(f"📝 Detecção registrada: {tipo} - {cpf or placa} (confiança: {confidence:.2%})")
        
        return result
    
    async def list_detections(self, evento_id: Optional[str] = None, 
                              tipo: Optional[str] = None, limit: int = 100) -> List[dict]:
        """Lista detecções recentes"""
        endpoint = f'/rest/v1/camera_detections?select=*&order=created_at.desc&limit={limit}'
        
        if evento_id:
            endpoint += f'&evento_id=eq.{evento_id}'
        
        if tipo:
            endpoint += f'&tipo=eq.{tipo}'
        
        return await self._request('GET', endpoint) or []
    
    # ============================================
    # CAMERA DEVICES
    # ============================================
    
    async def list_cameras(self, evento_id: Optional[str] = None) -> List[dict]:
        """Lista câmeras cadastradas"""
        endpoint = '/rest/v1/camera_devices?ativo=eq.true&select=*'
        
        if evento_id:
            endpoint += f'&evento_id=eq.{evento_id}'
        
        return await self._request('GET', endpoint) or []
    
    async def update_camera_status(self, camera_id: str, status: str) -> bool:
        """Atualiza status de uma câmera"""
        result = await self._request('PATCH', f'/rest/v1/camera_devices?id=eq.{camera_id}', json_data={
            'status': status,
            'last_seen': datetime.now().isoformat()
        })
        return result is not None
    
    # ============================================
    # STORAGE
    # ============================================
    
    async def upload_snapshot(self, file_path: str, bucket: str = 'camera-snapshots') -> Optional[str]:
        """Faz upload de um snapshot para o Supabase Storage"""
        import base64
        
        try:
            with open(file_path, 'rb') as f:
                file_content = f.read()
            
            file_name = f"snapshots/{datetime.now().strftime('%Y%m%d')}/{os.path.basename(file_path)}"
            
            url = f"{self.url}/storage/v1/object/{bucket}/{file_name}"
            
            headers_upload = {
                'apikey': self.service_key,
                'Authorization': f'Bearer {self.service_key}',
                'Content-Type': 'image/jpeg',
                'x-upsert': 'true'
            }
            
            async with httpx.AsyncClient(timeout=60) as client:
                response = await client.post(url, headers=headers_upload, content=file_content)
                
                if response.status_code in [200, 201]:
                    # Retornar URL pública
                    public_url = f"{self.url}/storage/v1/object/public/{bucket}/{file_name}"
                    logger.info(f"📤 Snapshot enviado: {public_url}")
                    return public_url
                else:
                    logger.error(f"❌ Erro ao enviar snapshot: {response.status_code} - {response.text}")
                    return None
                    
        except Exception as e:
            logger.error(f"❌ Erro ao fazer upload: {e}")
            return None