# 🎥 Integração Camera-Service no A2 Eventos

**Status:** ✅ **CONCLUÍDO**  
**Data:** 2026-04-27  
**Versão:** 1.0.0

---

## 📋 O que foi Feito

### ✅ Ações Completadas

| # | Ação | Status | Arquivo |
|:--|:--|:--|:--|
| 1 | Mover camera-service para `a2-eventos/backend/camera-service` | ✅ | [backend/camera-service/](./backend/camera-service/) |
| 2 | Corrigir bug sintaxe em `postgres_edge.py:55` | ✅ | [src/services/postgres_edge.py:55](./backend/camera-service/src/services/postgres_edge.py#L55) |
| 3 | Adicionar `camera-service` + `camera-alert-worker` ao docker-compose.yml | ✅ | [docker-compose.yml:164-244](./docker-compose.yml#L164-L244) |
| 4 | Adicionar rotas no nginx.conf (`/cameras/`, `/stream/`, `/ws/alerts`) | ✅ | [gateway/nginx.conf:128-173](./gateway/nginx.conf#L128-L173) |
| 5 | Adicionar volume `camera_snapshots` | ✅ | [docker-compose.yml:206](./docker-compose.yml#L206) |
| 6 | Criar template `.env.cameras` | ✅ | [backend/camera-service/.env](./backend/camera-service/.env) |
| 7 | Criar endpoints `/api/camera/webhooks/detections` | ✅ | [backend/api-nodejs/src/modules/camera/](./backend/api-nodejs/src/modules/camera/) |
| 8 | Criar guia Supabase migrations | ✅ | [backend/camera-service/SETUP_SUPABASE.md](./backend/camera-service/SETUP_SUPABASE.md) |

---

## 🚀 Próximos Passos

### Passo 1: Executar Migrations no Supabase

**⚠️ CRÍTICO: Faça isso ANTES de iniciar os containers**

1. Abra https://supabase.io/dashboard
2. Selecione projeto **A2 Eventos**
3. Clique em **SQL Editor**
4. Abra [backend/camera-service/src/db/migrations.sql](./backend/camera-service/src/db/migrations.sql)
5. Copie **TODO** o conteúdo e cole no Supabase
6. Clique em **▶ RUN**

**Resultado esperado:** 7 novas tabelas criadas com prefixo `camera_`

📖 Detalhes: [backend/camera-service/SETUP_SUPABASE.md](./backend/camera-service/SETUP_SUPABASE.md)

### Passo 2: Configurar Câmeras

Edite [backend/camera-service/.env](./backend/camera-service/.env) e adicione suas câmeras:

```bash
# Exemplo: Câmera IP
CAMERA_1_NAME=Portaria
CAMERA_1_RTSP=rtsp://admin:senha@192.168.1.100:554/stream
CAMERA_1_LOCATION=Entrada
CAMERA_1_TYPE=face

# Exemplo: Webcam USB
CAMERA_2_NAME=Sala
CAMERA_2_RTSP=0
CAMERA_2_TYPE=both
```

### Passo 3: Construir e Iniciar

```bash
cd a2-eventos

# Reconstruir imagens (especialmente camera-service)
docker compose build camera-service camera-alert-worker

# Iniciar todos os serviços
docker compose up -d

# Verificar saúde
docker compose ps
curl http://localhost:8000/health
```

### Passo 4: Testar Integração

```bash
# 1. Verificar se camera-service está saudável
curl http://localhost:8000/health
# Resposta esperada:
# {"status":"healthy","service":"camera-module","version":"1.0.0","cameras_active":1}

# 2. Ver estatísticas das câmeras
curl http://localhost:8000/stats

# 3. Acessar stream MJPEG
# No navegador: http://localhost:8000/stream/camera_1

# 4. Ver detecções registradas
curl http://localhost:3001/api/camera/detections
```

---

## 📊 Arquitetura Final

```
┌─────────────────────────────────────────────────────────┐
│           Docker Compose - a2-eventos                   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────┐   ┌─────────────┐   ┌──────────────┐    │
│  │ Nginx    │   │ Admin Web   │   │ Cadastro Web │    │
│  │ :80/:443 │   │ (React)     │   │ (Next.js)    │    │
│  └────┬─────┘   └─────────────┘   └──────────────┘    │
│       │                                                │
│       ├─ /api/     → API :3001                        │
│       ├─ /cameras/ → Camera Service :8000    ← NOVO   │
│       ├─ /stream/  → Camera Service :8000    ← NOVO   │
│       └─ /ws/      → Camera Service :8000    ← NOVO   │
│                                                         │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────┐   │
│  │ API      │  │ Camera       │  │ Alert Worker   │   │
│  │ Node.js  │  │ Service      │  │ (Python)       │   │
│  │ :3001    │  │ FastAPI      │  │                │   │
│  │          │  │ :8000        │  │                │   │
│  └────┬─────┘  └───────┬──────┘  └────────┬───────┘   │
│       │                │                  │            │
│       └────────┬───────┴──────────────────┘            │
│                │                                      │
│       ┌────────▼────────┐    ┌────────────────┐       │
│       │ PostgreSQL Edge │    │ Redis (Pub/Sub)│       │
│       │ (pgvector)      │    │                │       │
│       └─────────────────┘    └────────────────┘       │
│                                                         │
└─────────────────────────────────────────────────────────┘
         │
         ▼
    ┌──────────────┐
    │ Supabase     │
    │ (Cloud)      │
    └──────────────┘
```

---

## 🔌 Endpoints da API

### Camera Service (FastAPI) — Porta 8000

| Método | Path | Autenticação | Descrição |
|:--|:--|:--|:--|
| GET | `/health` | ❌ | Health check do serviço |
| GET | `/stats` | ❌ | Estatísticas de câmeras |
| POST | `/cameras/start?camera_id=xxx` | ❌ | Iniciar câmera |
| POST | `/cameras/stop?camera_id=xxx` | ❌ | Parar câmera |
| GET | `/stream/{camera_id}` | ❌ | Stream MJPEG |
| GET | `/snapshot/{camera_id}` | ❌ | Snapshot atual |
| POST | `/enroll/face` | ❌ | Cadastrar embedding facial |
| POST | `/enroll/plate` | ❌ | Cadastrar placa |
| POST | `/watchlist/cpf` | ❌ | Adicionar CPF à watchlist |
| POST | `/watchlist/plate` | ❌ | Adicionar placa à watchlist |
| DELETE | `/watchlist/cpf/{cpf}` | ❌ | Remover CPF da watchlist |
| GET | `/detections` | ❌ | Listar detecções |
| WS | `/ws/alerts` | ❌ | WebSocket de alertas em tempo real |

### A2 API (Node.js) — Porta 3001

| Método | Path | Autenticação | Descrição |
|:--|:--|:--|:--|
| POST | `/api/camera/webhooks/detections` | 🔑 API Key | Webhook do camera-service |
| GET | `/api/camera/detections` | ✅ | Listar detecções |
| GET | `/api/camera/detections/watchlist` | ✅ | Listar apenas watchlist |
| GET | `/api/camera/health` | ❌ | Health check |

---

## 🔐 Variáveis de Ambiente

### No `.env` do a2-eventos (compartilhado):

```bash
# Supabase (obrigatório)
SUPABASE_URL=https://zznrgwytywgjsjqdjfxn.supabase.co
SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}

# API Key do sistema
A2_API_KEY=a2eventos_sync_2026

# PostgreSQL Edge (compartilhado)
PG_EDGE_USER=a2_edge_user
PG_EDGE_PASSWORD=a2_edge_password
PG_EDGE_DB=a2_edge_db
```

### No `.env` do camera-service (câmeras específicas):

```bash
# Configure suas câmeras aqui
CAMERA_1_NAME=Portaria
CAMERA_1_RTSP=rtsp://admin:senha@192.168.1.100:554/stream
CAMERA_1_LOCATION=Entrada
CAMERA_1_TYPE=face
```

---

## 📱 Fluxo de Detecção

```
┌─────────────┐
│  Câmera IP  │
└──────┬──────┘
       │ (RTSP stream)
       ▼
┌────────────────────────────────────────┐
│   Camera Service                        │
│   ├─ Captura frames                    │
│   ├─ InsightFace detecta faces         │
│   ├─ EasyOCR lê placas                 │
│   └─ pgvector busca por similaridade   │
└──────┬─────────────────────────────────┘
       │ (detecção encontrada)
       ▼
┌────────────────────────────────────────┐
│   Redis Pub/Sub                        │
│   (canal: "detections")                │
└──────┬─────────────────────────────────┘
       │
       ├─→ ┌──────────────────────┐
       │   │ Alert Worker         │
       │   │ (envia webhooks)     │
       │   └──────────────────────┘
       │
       └─→ ┌──────────────────────┐
           │ Camera Service       │
           │ (WebSocket clients)  │
           └──────────────────────┘
                    │
                    ▼
           ┌──────────────────────┐
           │  A2 API              │
           │  /api/camera/webhooks│
           │  /detections         │
           └──────────────────────┘
                    │
                    ▼
           ┌──────────────────────┐
           │  Admin Web           │
           │  (Dashboard em RT)   │
           └──────────────────────┘
```

---

## 🐛 Troubleshooting

### Camera-service não inicia

```bash
# Ver logs
docker logs a2_eventos_camera --tail 50

# Verificar dependências
docker compose ps | grep camera

# Testar PostgreSQL
psql -h postgres_edge -U a2_edge_user -d a2_edge_db -c "SELECT version();"
```

### Nenhuma câmera conecta

1. Verificar `.env.cameras` — está preenchido?
2. Verificar URL RTSP — acessa de outro cliente?
3. Ver logs: `docker logs a2_eventos_camera | grep "❌"`

### Faces não são detectadas

1. InsightFace carregado? Ver: `curl http://localhost:8000/health`
2. Faces muito pequenas? MIN_FACE_SIZE = 150px
3. Iluminação ruim? Ajustar câmera

### Webhook não chega na API

1. Verificar se camera-alert-worker está rodando: `docker ps | grep alert`
2. Ver logs: `docker logs a2_eventos_camera_alerts`
3. Testar manualmente:

```bash
curl -X POST http://localhost:3001/api/camera/webhooks/detections \
  -H "X-API-Key: a2eventos_sync_2026" \
  -H "Content-Type: application/json" \
  -d '{
    "tipo": "face",
    "camera_id": "cam1",
    "cpf": "12345678901",
    "confidence": 0.95
  }'
```

---

## 📚 Documentação Relacionada

- [Camera Service README](./backend/camera-service/CAMERA_SERVICE.md)
- [Supabase Setup Guide](./backend/camera-service/SETUP_SUPABASE.md)
- [Docker Compose](./docker-compose.yml)
- [Nginx Configuration](./gateway/nginx.conf)
- [A2 Eventos Main README](./README.md)

---

## 🎯 Checklist Final

Antes de fazer deploy em produção:

- [ ] Migrations executadas no Supabase
- [ ] `.env.cameras` configurado com todas as câmeras
- [ ] `docker compose up -d` iniciado com sucesso
- [ ] `curl http://localhost:8000/health` retorna 200
- [ ] Pelo menos 1 câmera conectada
- [ ] Webhook testado manualmente
- [ ] Detecção registrada no Supabase (`camera_detections`)
- [ ] Dashboard (admin-web) mostrando alertas em tempo real

---

## 📞 Suporte

Se encontrar problemas:

1. Verificar [Troubleshooting](#-troubleshooting)
2. Ver [SETUP_SUPABASE.md](./backend/camera-service/SETUP_SUPABASE.md)
3. Verificar logs: `docker logs a2_eventos_camera --tail 100`

---

**Desenvolvido com ❤️ em 2026-04-27**  
**Última revisão:** 2026-04-27
