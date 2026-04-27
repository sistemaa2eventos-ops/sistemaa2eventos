"""
A2 EVENTOS - REDIS PUB/SUB
Publicação e订阅 de eventos via Redis
"""

import os
import json
from typing import Dict, Any, Callable, Optional
from loguru import logger
import redis.asyncio as redis

class RedisPubSub:
    """Gerenciador de Pub/Sub via Redis"""
    
    def __init__(self, host: str = 'localhost', port: int = 6379, channel: str = 'detections'):
        self.host = host
        self.port = port
        self.channel = channel
        self.redis: Optional[redis.Redis] = None
        self.pubsub = None
        self.is_connected = False
        self._handlers: Dict[str, Callable] = {}
        
        logger.info(f"📡 RedisPubSub configurado: {host}:{port}/{channel}")
    
    async def connect(self) -> bool:
        """Conecta ao Redis"""
        try:
            self.redis = redis.Redis(
                host=self.host,
                port=self.port,
                decode_responses=True,
                socket_connect_timeout=5
            )
            
            # Testar conexão
            await self.redis.ping()
            
            self.is_connected = True
            logger.info("✅ Conectado ao Redis para Pub/Sub")
            
            return True
            
        except Exception as e:
            logger.warning(f"⚠️ Não foi possível conectar ao Redis: {e}")
            self.is_connected = False
            return False
    
    async def disconnect(self):
        """Desconecta do Redis"""
        if self.redis:
            try:
                await self.redis.close()
            except:
                pass
        
        if self.pubsub:
            try:
                await self.pubsub.close()
            except:
                pass
        
        self.is_connected = False
        logger.info("🔌 Desconectado do Redis")
    
    async def publish(self, message: Dict[str, Any]) -> bool:
        """Publica uma mensagem no canal"""
        if not self.is_connected or not self.redis:
            logger.warning("⚠️ Redis não conectado, publicando localmente")
            # Fallback: processar localmente
            await self._process_local(message)
            return False
        
        try:
            msg_json = json.dumps(message, default=str)
            await self.redis.publish(self.channel, msg_json)
            logger.debug(f"📤 Mensagem publicada: {message.get('type', 'unknown')}")
            return True
            
        except Exception as e:
            logger.error(f"❌ Erro ao publicar: {e}")
            return False
    
    async def subscribe(self, handler: Callable):
        """Inscreve um handler para receber mensagens"""
        if not self.is_connected or not self.redis:
            logger.warning("⚠️ Redis não conectado, subscription ignorada")
            return
        
        try:
            self.pubsub = self.redis.pubsub()
            await self.pubsub.subscribe(self.channel)
            
            self._handlers['default'] = handler
            
            logger.info(f"✅ Inscrito no canal {self.channel}")
            
        except Exception as e:
            logger.error(f"❌ Erro ao subscrever: {e}")
    
    async def listen(self):
        """Escuta mensagens em loop"""
        if not self.pubsub:
            return
        
        logger.info("👂 Iniciando escuta do Redis Pub/Sub...")
        
        try:
            async for message in self.pubsub.listen():
                if message['type'] == 'message':
                    try:
                        data = json.loads(message['data'])
                        
                        for handler in self._handlers.values():
                            try:
                                await handler(data)
                            except Exception as e:
                                logger.error(f"❌ Erro no handler: {e}")
                                
                    except json.JSONDecodeError:
                        logger.warning(f"⚠️ Mensagem inválida: {message['data'][:100]}")
                        
        except Exception as e:
            logger.error(f"❌ Erro na escuta: {e}")
    
    async def _process_local(self, message: Dict[str, Any]):
        """Processa mensagem localmente quando Redis não está disponível"""
        for handler in self._handlers.values():
            try:
                await handler(message)
            except Exception as e:
                logger.error(f"❌ Erro no handler local: {e}")
    
    async def set(self, key: str, value: Any, expire: int = 300):
        """Define um valor no Redis (cache)"""
        if not self.is_connected or not self.redis:
            return False
        
        try:
            if isinstance(value, (dict, list)):
                value = json.dumps(value, default=str)
            
            await self.redis.set(key, value, ex=expire)
            return True
            
        except Exception as e:
            logger.error(f"❌ Erro ao definir chave: {e}")
            return False
    
    async def get(self, key: str) -> Optional[str]:
        """Obtém um valor do Redis"""
        if not self.is_connected or not self.redis:
            return None
        
        try:
            return await self.redis.get(key)
        except Exception as e:
            logger.error(f"❌ Erro ao obter chave: {e}")
            return None
    
    async def exists(self, key: str) -> bool:
        """Verifica se chave existe"""
        if not self.is_connected or not self.redis:
            return False
        
        try:
            return await self.redis.exists(key) > 0
        except Exception as e:
            return False