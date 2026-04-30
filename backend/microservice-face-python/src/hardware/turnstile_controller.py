import logging
import time
from typing import Optional

logger = logging.getLogger(__name__)

class TurnstileController:
    def __init__(self, config=None):
        """
        config: Dict mapping camera_id to device config
        Example: 
        {
          'cam_1': {'mode': 'gpio', 'pin': 18},
          'cam_2': {'mode': 'http', 'ip': '192.168.1.50', 'port': 80}
        }
        """
        self.devices = config or {}
        self.last_actions = {}
        self.gpio_initialized = False
        
        # Verificar se algum dispositivo usa GPIO
        uses_gpio = any(d.get('mode') == 'gpio' for d in self.devices.values())
        
        if uses_gpio:
            try:
                import RPi.GPIO as GPIO
                self.GPIO = GPIO
                GPIO.setmode(GPIO.BCM)
                for cam_id, d in self.devices.items():
                    if d.get('mode') == 'gpio' and d.get('pin'):
                        GPIO.setup(d['pin'], GPIO.OUT)
                        GPIO.output(d['pin'], GPIO.LOW)
                        logger.info(f"✅ GPIO {cam_id} inicializado no pino {d['pin']}")
                self.gpio_initialized = True
            except ImportError:
                logger.error("❌ RPi.GPIO não disponível")
                self.gpio_initialized = False
    
    def open(self, device_id: str) -> bool:
        device = self.devices.get(device_id)
        if not device:
            # Fallback para o primeiro dispositivo se device_id não for explícito
            if self.devices:
                device_id = list(self.devices.keys())[0]
                device = self.devices[device_id]
            else:
                logger.warning(f"⚠️ Dispositivo {device_id} não configurado para acionamento")
                return False

        mode = device.get('mode')
        try:
            if mode == 'gpio' and self.gpio_initialized:
                pin = device.get('pin')
                self.GPIO.output(pin, self.GPIO.HIGH)
                time.sleep(1)
                self.GPIO.output(pin, self.GPIO.LOW)
                logger.info(f"🔓 Catraca {device_id} acionada via GPIO (Pino {pin})")
                self.last_actions[device_id] = "gpio_open"
                return True
            elif mode == 'http' and device.get('ip'):
                import requests
                ip = device.get('ip')
                port = device.get('port', 80)
                url = f"http://{ip}:{port}/api/open"
                headers = {'X-API-Key': device.get('api_key', '')}
                response = requests.post(url, headers=headers, timeout=2)
                if response.status_code == 200:
                    logger.info(f"🔓 Catraca {device_id} acionada via HTTP: {ip}")
                    self.last_actions[device_id] = "http_open"
                    return True
                else:
                    logger.error(f"❌ Erro na catraca {device_id}: {response.status_code}")
                    return False
            else:
                logger.warning(f"⚠️ Método de acionamento inválido para {device_id}")
                return False
        except Exception as e:
            logger.error(f"❌ Erro ao abrir catraca {device_id}: {e}")
            return False
    
    def get_status(self) -> dict:
        return {
            'devices': list(self.devices.keys()),
            'last_actions': self.last_actions,
            'gpio_status': 'ready' if self.gpio_initialized else 'unavailable'
        }