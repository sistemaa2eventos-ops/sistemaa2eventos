"""
A2 EVENTOS - WORKER DE ALERTAS
Consome eventos do Redis e processa notificações

Este worker deve rodar como processo separado (docker-compose)
"""

import os
import sys
import asyncio
import json
import httpx
from datetime import datetime
from pathlib import Path

# Adicionar src ao path
sys.path.insert(0, str(Path(__file__).parent.parent))

from loguru import logger
from dotenv import load_dotenv

load_dotenv()

# Configuração de logging
log_path = Path("logs")
log_path.mkdir(exist_ok=True)
logger.remove()
logger.add(
    sys.stdout,
    format="<green>{time:HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan> - <level>{message}</level>",
    level=os.getenv("LOG_LEVEL", "INFO")
)
logger.add(
    "logs/alert_worker_{time:YYYY-MM-DD}.log",
    rotation="00:00",
    retention="7 days",
    level="DEBUG"
)

# Configurações
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
REDIS_CHANNEL = os.getenv("REDIS_CHANNEL", "detections")
A2_API_URL = os.getenv("A2_API_URL", "http://localhost:3001")
A2_API_KEY = os.getenv("A2_API_KEY", "")
STORAGE_BUCKET = os.getenv("STORAGE_BUCKET", "camera-snapshots")

# Notificações (opcionais)
TWILIO_SID = os.getenv("TWILIO_SID", "")
TWILIO_TOKEN = os.getenv("TWILIO_TOKEN", "")
TWILIO_FROM = os.getenv("TWILIO_FROM", "")
ALERT_EMAIL = os.getenv("ALERT_EMAIL", "")
SENDGRID_API_KEY = os.getenv("SENDGRID_API_KEY", "")


class AlertWorker:
    """Worker que processa alertas de detecção"""
    
    def __init__(self):
        self.redis = None
        self.pubsub = None
        self.running = False
        self.stats = {
            'messages_processed': 0,
            'webhooks_sent': 0,
            'sms_sent': 0,
            'emails_sent': 0,
            'errors': 0
        }
    
    async def start(self):
        """Inicia o worker"""
        logger.info("🚀 Iniciando Alert Worker...")
        
        # Conectar ao Redis
        try:
            import redis
            self.redis = redis.Redis(
                host=REDIS_HOST,
                port=REDIS_PORT,
                decode_responses=True
            )
            self.redis.ping()
            logger.info(f"✅ Conectado ao Redis: {REDIS_HOST}:{REDIS_PORT}")
        except Exception as e:
            logger.error(f"❌ Falha ao conectar Redis: {e}")
            return
        
        self.running = True
        await self._listen()
    
    async def stop(self):
        """Para o worker"""
        logger.info("⏹️ Parando Alert Worker...")
        self.running = False
        
        if self.redis:
            try:
                self.redis.close()
            except:
                pass
    
    async def _listen(self):
        """Escuta mensagens do Redis"""
        try:
            pubsub = self.redis.pubsub()
            pubsub.subscribe(REDIS_CHANNEL)
            logger.info(f"👂 Escultando canal: {REDIS_CHANNEL}")
            
            while self.running:
                message = pubsub.get_message(timeout=1.0)
                
                if message and message['type'] == 'message':
                    try:
                        data = json.loads(message['data'])
                        await self._process_alert(data)
                        self.stats['messages_processed'] += 1
                    except json.JSONDecodeError:
                        logger.warning(f"⚠️ Mensagem inválida: {message['data'][:100]}")
                    except Exception as e:
                        logger.error(f"❌ Erro ao processar mensagem: {e}")
                        self.stats['errors'] += 1
                
                # Mostrar stats a cada 100 mensagens
                if self.stats['messages_processed'] % 100 == 0 and self.stats['messages_processed'] > 0:
                    logger.info(f"📊 Stats: {self.stats}")
                
                await asyncio.sleep(0.1)
                
        except Exception as e:
            logger.error(f"❌ Erro na escuta: {e}")
    
    async def _process_alert(self, data: dict):
        """Processa um alerta de detecção"""
        tipo = data.get('type', 'unknown')
        camera_id = data.get('camera_id', 'unknown')
        
        logger.info(f"📨 Processando alerta: {tipo} de {camera_id}")
        
        # 1. Upload do snapshot para Storage
        snapshot_url = await self._upload_snapshot(data)
        
        # 2. Registrar no banco
        await self._save_detection(data, snapshot_url)
        
        # 3. Enviar webhook para A2
        await self._send_webhook(data, snapshot_url)
        
        # 4. Se watchlist, enviar notificações extras
        if data.get('is_watchlist') or data.get('match', {}).get('is_watchlist'):
            await self._send_watchlist_alert(data, snapshot_url)
    
    async def _upload_snapshot(self, data: dict) -> str:
        """Faz upload do snapshot para o Supabase Storage"""
        local_path = data.get('snapshot_path')
        
        if not local_path or not os.path.exists(local_path):
            return ""
        
        try:
            with open(local_path, 'rb') as f:
                file_content = f.read()
            
            filename = f"sdetections/{datetime.now().strftime('%Y%m%d')}/{os.path.basename(local_path)}"
            
            url = f"{SUPABASE_URL}/storage/v1/object/{STORAGE_BUCKET}/{filename}"
            
            headers = {
                'apikey': SUPABASE_SERVICE_KEY,
                'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}',
                'Content-Type': 'image/jpeg',
                'x-upsert': 'true'
            }
            
            async with httpx.AsyncClient(timeout=60) as client:
                response = await client.post(url, headers=headers, content=file_content)
                
                if response.status_code in [200, 201]:
                    public_url = f"{SUPABASE_URL}/storage/v1/object/public/{STORAGE_BUCKET}/{filename}"
                    logger.info(f"📤 Snapshot enviado: {public_url}")
                    return public_url
                else:
                    logger.error(f"❌ Erro upload: {response.status_code}")
                    return ""
                    
        except Exception as e:
            logger.error(f"❌ Erro ao fazer upload: {e}")
            return ""
    
    async def _save_detection(self, data: dict, snapshot_url: str):
        """Salva detecção no banco"""
        try:
            from services.supabase_client import SupabaseClient
            
            supabase = SupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
            
            match = data.get('match', {})
            
            await supabase.insert_detection(
                camera_id=data.get('camera_id'),
                tipo=data.get('type'),
                cpf=match.get('cpf'),
                nome=match.get('nome'),
                placa=data.get('plate'),
                camera_name=data.get('camera_name'),
                location=data.get('location'),
                confidence=data.get('confidence', 0),
                snapshot_url=snapshot_url,
                is_watchlist=data.get('is_watchlist') or match.get('is_watchlist', False),
                is_authorized=match.get('autorizado', True),
                metadata={
                    'distance': match.get('distance'),
                    'quality_score': match.get('quality_score')
                }
            )
            
            logger.info(f"💾 Detecção salva no banco")
            
        except Exception as e:
            logger.error(f"❌ Erro ao salvar detecção: {e}")
    
    async def _send_webhook(self, data: dict, snapshot_url: str):
        """Envia webhook para o sistema A2"""
        if not A2_API_URL:
            return
        
        try:
            payload = {
                'tipo': data.get('type'),
                'camera_id': data.get('camera_id'),
                'camera_name': data.get('camera_name'),
                'location': data.get('location'),
                'cpf': data.get('match', {}).get('cpf'),
                'nome': data.get('match', {}).get('nome'),
                'plate': data.get('plate'),
                'confidence': data.get('confidence', 0),
                'snapshot_url': snapshot_url,
                'is_watchlist': data.get('is_watchlist') or data.get('match', {}).get('is_watchlist', False),
                'is_authorized': data.get('match', {}).get('autorizado', True),
                'timestamp': datetime.now().isoformat()
            }
            
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(
                    f"{A2_API_URL}/api/detections",
                    json=payload,
                    headers={
                        "X-API-Key": A2_API_KEY,
                        "Content-Type": "application/json"
                    }
                )
                
                if response.status_code in [200, 201, 202]:
                    logger.info(f"📤 Webhook enviado: {response.status_code}")
                    self.stats['webhooks_sent'] += 1
                else:
                    logger.warning(f"⚠️ Webhook retornou: {response.status_code}")
                    
        except Exception as e:
            logger.error(f"❌ Erro ao enviar webhook: {e}")
    
    async def _send_watchlist_alert(self, data: dict, snapshot_url: str):
        """Envia alertas extras para watchlist"""
        match = data.get('match', {})
        
        logger.warning(f"🚨 ALERTA WATCHLIST: {match.get('cpf') or data.get('plate')} - {match.get('watchlist_motivo') or 'motivo não definido'}")
        
        # Enviar SMS (se configurado)
        if TWILIO_SID and TWILIO_TOKEN and TWILIO_FROM:
            await self._send_sms(data, snapshot_url)
        
        # Enviar Email (se configurado)
        if SENDGRID_API_KEY and ALERT_EMAIL:
            await self._send_email(data, snapshot_url)
    
    async def _send_sms(self, data: dict, snapshot_url: str):
        """Envia SMS via Twilio"""
        try:
            from twilio.rest import Client
            
            client = Client(TWILIO_SID, TWILIO_TOKEN)
            
            nome = data.get('match', {}).get('nome', 'Desconhecido')
            cpf = data.get('match', {}).get('cpf', '')
            camera = data.get('camera_name', data.get('camera_id', ''))
            
            message = client.messages.create(
                body=f"🚨 ALERTA: {nome} ({cpf[-4:]}) detectado em {camera}",
                from_=TWILIO_FROM,
                to=os.getenv("ALERT_PHONE", "")
            )
            
            logger.info(f"📱 SMS enviado: {message.sid}")
            self.stats['sms_sent'] += 1
            
        except Exception as e:
            logger.error(f"❌ Erro ao enviar SMS: {e}")
    
    async def _send_email(self, data: dict, snapshot_url: str):
        """Envia email via SendGrid"""
        try:
            from sendgrid import SendGridAPIClient
            from sendgrid.helpers.mail import Mail
            
            match = data.get('match', {})
            
            email = Mail(
                from_email=os.getenv("FROM_EMAIL", "alertas@a2eventos.com.br"),
                to_emails=ALERT_EMAIL,
                subject=f"🚨 ALERTA WATCHLIST - {match.get('nome', 'Desconhecido')}",
                html_content=f"""
                    <h2>Alerta de Watchlist</h2>
                    <p><strong>Nome:</strong> {match.get('nome')}</p>
                    <p><strong>CPF:</strong> {match.get('cpf')}</p>
                    <p><strong>Câmera:</strong> {data.get('camera_name')}</p>
                    <p><strong>Local:</strong> {data.get('location')}</p>
                    <p><strong>Motivo:</strong> {match.get('watchlist_motivo') or 'Não definido'}</p>
                    <p><strong>Confiança:</strong> {data.get('confidence', 0):.2%}</p>
                    <p><strong>Horário:</strong> {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}</p>
                    {f'<p><img src="{snapshot_url}" width="400"/></p>' if snapshot_url else ''}
                """
            )
            
            sg = SendGridAPIClient(SENDGRID_API_KEY)
            response = sg.send(email)
            
            logger.info(f"📧 Email enviado: {response.status_code}")
            self.stats['emails_sent'] += 1
            
        except Exception as e:
            logger.error(f"❌ Erro ao enviar email: {e}")


async def main():
    """Ponto de entrada"""
    worker = AlertWorker()
    
    # Graceful shutdown
    import signal
    
    def signal_handler(sig, frame):
        logger.info(f"Recebido sinal {sig}")
        asyncio.create_task(worker.stop())
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    try:
        await worker.start()
    except KeyboardInterrupt:
        await worker.stop()
    finally:
        logger.info(f"📊 Estatísticas finais: {worker.stats}")


if __name__ == "__main__":
    asyncio.run(main())