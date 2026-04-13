# 🔌 Integração com Hardware - A2 Eventos

Este diretório contém toda a documentação, protocolos e configurações para integração do sistema A2 Eventos com equipamentos físicos de controle de acesso.

## 📋 Equipamentos Suportados

### Terminais Faciais
- **Bio-T Facial Terminal** - Protocolo TCP/IP na porta 37777
- **Intelbras FAC 3000** - Protocolo HTTP/HTTPS
- **Hikvision DS-K1T671** - Protocolo ISAPI

### Catracas
- **Henry Turbo** - API HTTP na porta 8080
- **Control ID** - Comandos TCP na porta 4370
- **HDL** - Protocolo proprietário via porta serial

### Câmeras IP
- **Intelbras** - RTSP na porta 554
- **Hikvision** - RTSP na porta 554
- **Dahua** - RTSP na porta 554

## 📂 Estrutura de Pastas
hardware-integration/
├── manuals/ # Manuais técnicos dos equipamentos
├── protocols/ # Especificações de protocolos
├── drivers/ # Drivers para desenvolvimento
├── nginx/ # Configurações de proxy
├── simulators/ # Simuladores para testes
├── .gitignore # Arquivos ignorados pelo Git
├── docker-compose.yml # Configuração Docker
└── README.md # Este arquivo



## 🔧 Protocolos de Comunicação

### TCP/IP (Terminais Bio-T)
- Porta: 37777
- Formato: Comandos binários
- Autenticação: Usuário/Senha em base64

### HTTP/HTTPS (Catracas e Terminais Modernos)
- Porta: 80/443/8080
- Formato: JSON/REST
- Autenticação: API Key ou JWT

### RTSP (Câmeras IP)
- Porta: 554
- Formato: Stream de vídeo H.264/H.265
- Autenticação: Digest

## 🚀 Configuração Rápida

### 1. Configurar Terminal Facial Bio-T

```bash
# Testar conexão TCP
nc -zv 192.168.1.100 37777

# Comando de liberação via Python
python3 -c "
import socket
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.connect(('192.168.1.100', 37777))
s.send(b'\\x01\\x03\\x00\\x00\\x00\\x01')
s.close()
"