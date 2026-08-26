# 🎥 Camera Service - Resumo Executivo da Integração

**Data:** 2026-04-27  
**Status:** ✅ **INTEGRAÇÃO COMPLETA**  
**Próximo:** Execute migrations no Supabase

---

## 📊 O que foi Implementado

### Componentes Integrados

```
✅ Camera Service (FastAPI Python)
   ├─ InsightFace Buffalo_L (512D embeddings)
   ├─ EasyOCR + YOLOv8 (leitura de placas)
   ├─ PostgreSQL Edge (pgvector busca)
   └─ Redis Pub/Sub (eventos em tempo real)

✅ Alert Worker (Python asyncio)
   ├─ Consome fila Redis
   ├─ Envia webhooks para A2 API
   ├─ Registra em Supabase Storage
   └─ SMS/Email (opcional - Twilio/SendGrid)

✅ A2 API Endpoints (Node.js Express)
   ├─ POST /api/camera/webhooks/detections
   ├─ GET /api/camera/detections
   ├─ GET /api/camera/detections/watchlist
   └─ Health check

✅ Nginx Gateway Routes
   ├─ /cameras/ → API Camera Service
   ├─ /stream/{id} → MJPEG video streams
   ├─ /ws/alerts → WebSocket tempo real
   └─ Suporta HTTPS via Cloudflare
```

---

## 🏗️ Arquitetura Integrada

```mermaid
graph TB
    subgraph "Fonte de Video"
        CAMERA["📷 Câmeras IP/Webcam"]
    end
    
    subgraph "A2 Eventos - Docker Compose"
        CS["🎬 Camera Service<br/>(FastAPI - :8000)"]
        AW["⚡ Alert Worker<br/>(Consumer)"]
        API["🔌 A2 API<br/>(Node.js - :3001)"]
        NGINX["🚀 Nginx Gateway<br/>(:80/:443)"]
        PG["📦 PostgreSQL Edge<br/>(pgvector)"]
        REDIS["📨 Redis<br/>(Pub/Sub)"]
    end
    
    subgraph "Armazenamento"
        SUPABASE["☁️ Supabase<br/>(Cloud)"]
    end
    
    subgraph "Frontend"
        ADMIN["📊 Admin Dashboard<br/>(React)"]
    end
    
    CAMERA -->|RTSP| CS
    CS -->|Detecção| REDIS
    REDIS -->|Consome| AW
    AW -->|Webhook| API
    CS -->|Busca Faces| PG
    AW -->|Registra| SUPABASE
    NGINX -->|Proxy| CS
    NGINX -->|Proxy| API
    API -->|WebSocket| ADMIN
    ADMIN -->|Consulta| API
```

---

## ✅ Checklist de Implementação

| Item | Status | Detalhes |
|:--|:--|:--|
| Mover camera-service | ✅ | Em `a2-eventos/backend/camera-service/` |
| Corrigir bugs | ✅ | postgres_edge.py:55 sintaxe SQL |
| Docker-compose | ✅ | 2 services + 1 volume |
| Nginx routes | ✅ | /cameras/, /stream/, /ws/alerts |
| API endpoints | ✅ | /api/camera/* + webhook |
| Migrations SQL | ✅ | 7 tabelas preparadas (não executadas) |
| Documentação | ✅ | Guias + troubleshooting |
| Variáveis env | ✅ | Template .env.cameras |

---

## 🚀 Próximos Passos (Para Você)

### 1️⃣ Executar Migrations (CRÍTICO)

```bash
# 1. Acesse Supabase Dashboard
https://supabase.io/dashboard

# 2. SQL Editor → Novo Query

# 3. Abra e copie:
cat a2-eventos/backend/camera-service/src/db/migrations.sql

# 4. Cole e execute (▶ RUN button)
# Resultado: 7 novas tabelas criadas
```

### 2️⃣ Configurar Câmeras

Edite: `a2-eventos/backend/camera-service/.env`

```bash
# Descomente e configure suas câmeras
CAMERA_1_NAME=Portaria Principal
CAMERA_1_RTSP=rtsp://admin:senha@192.168.1.100:554/stream
CAMERA_1_LOCATION=Entrada
CAMERA_1_TYPE=face
```

### 3️⃣ Build & Deploy

```bash
cd a2-eventos

# Reconstruir imagens do camera-service
docker compose build camera-service camera-alert-worker

# Iniciar tudo
docker compose up -d

# Verificar saúde
docker compose ps
curl http://localhost:8000/health
```

### 4️⃣ Testar Detecção

```bash
# Ver stream MJPEG (no navegador)
http://localhost/stream/camera_1

# Consultar detecções
curl http://localhost/api/camera/detections

# Ver watchlist
curl http://localhost/api/camera/detections/watchlist
```

---

## 📁 Arquivos Principais

### Core do Camera Service
- **[backend/camera-service/src/video_server.py](./a2-eventos/backend/camera-service/src/video_server.py)** — FastAPI principal
- **[backend/camera-service/src/services/face_processor.py](./a2-eventos/backend/camera-service/src/services/face_processor.py)** — InsightFace
- **[backend/camera-service/src/services/postgres_edge.py](./a2-eventos/backend/camera-service/src/services/postgres_edge.py)** — Busca pgvector
- **[backend/camera-service/src/alert_worker.py](./a2-eventos/backend/camera-service/src/alert_worker.py)** — Processamento de alertas

### Integração A2
- **[docker-compose.yml](./a2-eventos/docker-compose.yml)** — 2 novos services
- **[gateway/nginx.conf](./a2-eventos/gateway/nginx.conf)** — 3 novas rotas
- **[backend/api-nodejs/src/modules/camera/](./a2-eventos/backend/api-nodejs/src/modules/camera/)** — Webhook endpoints

### Banco de Dados
- **[backend/camera-service/src/db/migrations.sql](./a2-eventos/backend/camera-service/src/db/migrations.sql)** — SQL migrations
- **[backend/camera-service/SETUP_SUPABASE.md](./a2-eventos/backend/camera-service/SETUP_SUPABASE.md)** — Guide

### Documentação
- **[INTEGRACAO_CAMERA_SERVICE.md](./a2-eventos/INTEGRACAO_CAMERA_SERVICE.md)** — Guia completo
- **[CAMERA_SERVICE.md](./a2-eventos/backend/camera-service/CAMERA_SERVICE.md)** — Especificações técnicas

---

## 🔌 Endpoints Disponíveis

### Camera Service (Porta 8000)

| Endpoint | Tipo | Auth | Uso |
|:--|:--|:--|:--|
| `/health` | GET | ❌ | Verificar se está rodando |
| `/stats` | GET | ❌ | Ver câmeras e estatísticas |
| `/stream/{id}` | GET | ❌ | Stream MJPEG |
| `/snapshot/{id}` | GET | ❌ | Snapshot atual |
| `/cameras/start` | POST | ❌ | Iniciar câmera |
| `/cameras/stop` | POST | ❌ | Parar câmera |
| `/enroll/face` | POST | ❌ | Cadastrar embedding |
| `/watchlist/cpf` | POST | ❌ | Adicionar à watchlist |
| `/ws/alerts` | WS | ❌ | WebSocket alertas |

### A2 API (Porta 3001)

| Endpoint | Tipo | Auth | Uso |
|:--|:--|:--|:--|
| `/api/camera/webhooks/detections` | POST | 🔑 | Recebe webhook do camera-service |
| `/api/camera/detections` | GET | ✅ | Listar detecções |
| `/api/camera/detections/watchlist` | GET | ✅ | Listar watchlist |
| `/api/camera/health` | GET | ❌ | Status |

---

## 🎯 O que Acontece Após Setup

### 1. Câmera conecta ao Camera Service
```
Câmera IP → RTSP stream → FastAPI captura frames
```

### 2. Reconhecimento em tempo real
```
Frame → InsightFace (face) + YOLOv8 (placa) → pgvector search
```

### 3. Evento publicado
```
Detecção → Redis (canal "detections") → Alert Worker consome
```

### 4. Webhook enviado
```
Alert Worker → POST /api/camera/webhooks/detections → A2 API
```

### 5. Registro e notificação
```
A2 API → Supabase (camera_detections) + WebSocket → Dashboard em RT
```

---

## 🔒 Segurança

| Aspecto | Configuração |
|:--|:--|
| **Webhook** | Requer X-API-Key header |
| **RLS (Supabase)** | Policies para master/staff/service_role |
| **SSL/TLS** | Via Nginx + Cloudflare |
| **API Key** | Armazenada em .env (não no código) |
| **Credenciais Câmeras** | Em .env.cameras (não versionado) |

---

## 💾 Armazenamento

| Tipo | Localização | Persistência |
|:--|:--|:--|
| **Faces (embeddings)** | PostgreSQL Edge (pessoas.face_encoding) | ✅ Volume pg_edge_data |
| **Detecções (log)** | Supabase (camera_detections) | ✅ Cloud |
| **Snapshots** | Supabase Storage | ✅ Cloud |
| **Snapshots (temp)** | Docker volume camera_snapshots | ✅ Volume |
| **Modelos (InsightFace)** | Docker volume ai_models | ✅ Compartilhado |

---

## 📊 Performance

| Métrica | Configuração | Por quê |
|:--|:--|:--|
| **Frame Skip** | 3 | Processa 1 frame a cada 3 (face detection é pesada) |
| **Min Face Size** | 150px | Evita falsos positivos |
| **Memory (Camera)** | 2GB | InsightFace + OpenCV + YOLO |
| **Memory (Worker)** | 512MB | Processa eventos do Redis |
| **Start Period** | 90s | InsightFace demora carregar modelos |
| **HNSW Index** | pgvector | ~10ms para buscar 1M embeddings |

---

## 🚨 Troubleshooting Rápido

```bash
# Câmera não conecta
docker logs a2_eventos_camera | tail -50

# Nenhuma detecção
curl http://localhost:8000/stats

# Webhook não funciona
docker logs a2_eventos_camera_alerts | tail -50

# Testar endpoint
curl http://localhost:3001/api/camera/health

# Ver detecções no Supabase
# Dashboard → Table Editor → camera_detections
```

---

## 📚 Documentação Completa

Para detalhes completos, leia:

1. **[INTEGRACAO_CAMERA_SERVICE.md](./a2-eventos/INTEGRACAO_CAMERA_SERVICE.md)** ← Guia principal
2. **[SETUP_SUPABASE.md](./a2-eventos/backend/camera-service/SETUP_SUPABASE.md)** ← Como fazer migrations
3. **[CAMERA_SERVICE.md](./a2-eventos/backend/camera-service/CAMERA_SERVICE.md)** ← Especificações técnicas
4. **[DEPLOY_GUIDE.md](./a2-eventos/DEPLOY_GUIDE.md)** ← Deploy em produção

---

## ✨ Destaques da Implementação

✅ **Compartilhamento de Infra** — Usa Redis e PostgreSQL existentes (sem duplicação)  
✅ **Escalabilidade** — Alert Worker desacoplado não bloqueia captura  
✅ **Segurança** — RLS no Supabase, validação de API Key  
✅ **Performance** — Índices HNSW para busca ultrarrápida  
✅ **Flexibilidade** — Suporta múltiplas câmeras, tipos de detecção (face/plate/both)  
✅ **Observabilidade** — Logs estruturados, health checks, WebSocket alerts  

---

## 🎬 Estado Atual

| Componente | Status | Próximo |
|:--|:--|:--|
| Camera Service | ✅ Pronto | Executar migrations |
| Alert Worker | ✅ Pronto | Iniciar docker-compose |
| A2 API | ✅ Pronto | Testar webhook |
| Nginx | ✅ Pronto | Validar rotas |
| Supabase | ⏳ Pendente | Executar SQL |
| Docker Compose | ✅ Pronto | Build + up |

---

**Próximo comando:**

```bash
cd a2-eventos/backend/camera-service
cat src/db/migrations.sql  # Para copiar no Supabase SQL Editor
```

---

**Desenvolvido em:** 2026-04-27  
**Sistema:** A2 Eventos + Camera Service  
**Versão:** 1.0.0-alpha  

🚀 **Pronto para deploy!**
