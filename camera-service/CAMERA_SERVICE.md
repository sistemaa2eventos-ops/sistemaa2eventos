# A2 Eventos - Camera Service
## Sistema de Rastreamento Facial em Tempo Real

---

## 1. Visão Geral

O **Camera Service** é um sistema de reconhecimento facial queprocessa streams de vídeo de câmeras IP ou webcams para detectare identificar pessoas em tempo real.

### Objetivo Principal
```
Câmera → Detectar Face → Gerar Embedding → Comparar no Banco → Lib/Bloq
```

### Casos de Uso
- Controle de acesso por reconhecimento facial
- Monitoramento de entrada/saída
- Identificação de pessoas em áreas restritas
- Integração com sistema de credenciamento existente

---

## 2. Arquitetura do Sistema

### 2.1 Componentes

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CAMERA-SERVICE                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────────┐  │
│  │   Câmera    │    │  Video     │    │   Frame Processor      │  │
│  │ (IP/Webcam)│───▶│ Server    │───▶│ (OpenCV + InsightFace) │  │
│  └─────────────┘    └─────────────┘    └─────────────────────────┘  │
│                                             │                        │
│                      ┌──────────────────────┴──────────────────┐   │
│                      │                                          │   │
│                      ▼                                          ▼   │
│              ┌──────────────────┐                 ┌───────────────┐│
│              │ Face Processor   │                 │ Plate Reader ││
│              │ (InsightFace)    │                 │ (EasyOCR)    ││
│              └────────┬─────────┘                 └───────▲──────┘│
│                       │                                  │         │
│                       ▼                                  │         │
│              ┌──────────────────────┐                 │         │
│              │ PostgreSQL Edge       │◀──────────────────┘         │
│              │ (pgvector)           │                             │
│              │ - pessoas table     │                             │
│              │ - face_encoding    │                             │
│              └──────────────────────┘                             │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Fluxo de Dados

```
FRAME CAPTURED
      │
      ▼
┌─────────────┐
│ OpenCV     │ ──▶ Decodifica stream RTSP/Webcam
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│ Face Detection  │ ──▶ InsightFace (Buffalo_L)
│ (Bounding Box) │ ──▶ 512D Embedding
└──────┬──────────┘
       │
       ▼
┌──────────────────┐
│ Vector Search    │ ──▶ PostgreSQL + pgvector
│ (Cosine Sim)     │ ──▶ 1 - distance = confidence
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Match Result     │
│ - ID            │
│ - Nome          │
│ - CPF           │
│ - Confidence   │
│ - Status        │
└──────────────────┘
```

---

## 3. Detecção Facial

### 3.1 InsightFace (Buffalo_L)

O sistema usa o modelo **Buffalo_L** do InsightFace paradesenvolver:

| Característica | Valor |
|--------------|-------|
| Embedding | 512 dimensões |
| Modelo | ArcFace/RetinaFace |
| Precisão | ~99.7% (LFW) |
| Tempo inferência | ~15ms CPU |

### 3.2 Processo de Detecção

```python
# Pseudocódigo
frame = captura_camera()

# Detectar faces
faces = insightface.detect(frame)

for face in faces:
    # Verificar tamanho mínimo (150px)
    if face.width < MIN_SIZE:
        continue
    
    # Verificar confiança mínima (65%)
    if face.confidence < CONFIDENCE_THRESHOLD:
        continue
    
    # Extrair embedding
    embedding = face.normed_embedding  # 512 valores
    
    # Buscar no banco
    match = buscar_similar(embedding)
```

### 3.3 Parâmetros de Detecção

| Parâmetro | Padrão | Descrição |
|----------|--------|-----------|
| FACE_TOLERANCE | 0.55 | Distância máxima (menor = mais rígido) |
| MIN_FACE_SIZE | 150 | Largura mínima da face em pixels |
| CONFIDENCE_THRESHOLD | 0.65 | Confiança mínima de detecção |
| FRAME_SKIP | 3 | Pular frames para performance |

---

## 4. Busca no Banco de Dados

### 4.1 PostgreSQL + pgvector

O sistema usa **pgvector** (extensão do PostgreSQL) para busca desimilaridade:

```sql
-- Busca por similaridade cosseno
SELECT 
    id, 
    nome_completo, 
    cpf,
    status_acesso,
    1 - (face_encoding <=> $embedding) as confidence
FROM pessoas
WHERE face_encoding IS NOT NULL
  AND status_acesso = 'ativo'
ORDER BY face_encoding <=> $embedding ASC
LIMIT 1;
```

### 4.2 Interpretação da Confiança

| Confiança | Significado | Ação |
|----------|-------------|------|
| > 90% | Muito forte | Liberação imediata |
| 75-90% | Forte | Liberação normal |
| 55-75% | Moderada | Liberação com alerta |
| < 55% | Fraca | Acesso negado |

---

## 5. Integração com Sistema A2

### 5.1 Tabela Pessoas

O sistema busca na tabela `pessoas` do **PostgreSQL Edge**:

| Coluna | Tipo | Descrição |
|-------|-----|-----------|
| id | UUID | ID único |
| nome_completo | текст | Nome completo |
| cpf | текст | CPF |
| face_encoding | vector(512) | Embedding facial |
| status_acesso | текст | ativo/pendente/bloqueado |

### 5.2 Fluxo de Integração

```
┌─────────────────────────────────────────────────────────────┐
│                    SISTEMA A2 EVENTOS                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────���─────────┐    ┌──────────────┐    ┌──────────────┐ │
│  │  Cadastro    │───▶│    AI        │───▶│ PostgreSQL   │ │
│  │  (foto)      │    │  Worker      │    │  Edge       │ │
│  │             │    │ (/extract)   │    │ (encoding)  │ │
│  └──────────────┘    └──────────────┘    └──────────────┘ │
│         │                                       │           │
│         │              ┌──────────────┐          │           │
│         └────────────▶│ Camera       │◀─────────┘           │
│                        Service                              │
│                        (leitura)                           │
│                        ┌──────────────┐                     │
│                        │ Match +      │                     │
│                        │ Liberação   │                     │
│                        └──────────────┘                     │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. Dados do Sistema A2

### 6.1 Credenciais PostgreSQL

```
PG_EDGE_HOST=postgres_edge
PG_EDGE_PORT=5432
PG_EDGE_USER=a2_edge_user
PG_EDGE_PASSWORD=a2_edge_password
PG_EDGE_DB=a2_edge_db
```

### 6.2 Credenciais Supabase

```
SUPABASE_URL=https://zznrgwytywgjsjqdjfxn.supabase.co
SUPABASE_SERVICE_KEY=${SUPABASE_SERVICE_KEY}
```

---

## 7. Endpoints da API

### 7.1 Camera Service

| Método | Endpoint | Descrição |
|--------|----------|----------|
| GET | `/health` | Status do serviço |
| GET | `/stats` | Estatísticas |
| POST | `/cameras/start?camera_id=xxx` | Iniciar câmera |
| POST | `/cameras/stop?camera_id=xxx` | Parar câmera |
| GET | `/stream/{camera_id}` | Stream de vídeo |
| GET | `/snapshot/{camera_id}` | Snapshot atual |
| POST | `/enroll/face` | Cadastrar face |

### 7.2 AI Worker (microservice-face)

| Método | Endpoint | Descrição |
|--------|----------|----------|
| GET | `/health` | Status |
| POST | `/api/extract` | Extrair embedding |

---

## 8. Casos de Uso Detalhados

### 8.1 Rastreamento em Tempo Real

```
1. Câmera captura frames continuamente
2. A cada 3 frames (FRAME_SKIP), processa um frame
3. InsightFace detecta faces no frame
4. Para cada face detectada:
   a. Gera embedding de 512 dimensões
   b. Busca no banco por similaridade
   c. Se confiança > 55%:
      - Registra log de acesso
      - Envia notificação
      - Libera catraca (se integrada)
   d. Se confiança < 55%:
      - Registra como desconhecido
      - Envia alerta de segurança
```

### 8.2 Cadastro de Nova Face

```
1. Usuário envia foto (via API ou interface)
2. Sistema valida que há exatamente uma face
3. InsightFace gera embedding
4. Embedding é salvo no banco:
   UPDATE pessoas 
   SET face_encoding = '[...512 valores...]'
   WHERE cpf = 'xxx';
```

### 8.3 Check-in por Câmera (futuro)

```
1. Câmera captura frame
2. Sistema detecta face e gera embedding
3. Busca no banco por similaridade
4. Se encontrado + confiança > 75%:
   - Registra check-in no banco
   - Envia notificação
   - Libera acesso
5. Senão:
   - Registra tentativa negada
   - Envia alerta
```

---

## 9. Instalação e Configuração

### 9.1 Variáveis de Ambiente

```bash
# Database
PG_EDGE_HOST=postgres_edge
PG_EDGE_PORT=5432
PG_EDGE_USER=a2_edge_user
PG_EDGE_PASSWORD=a2_edge_password
PG_EDGE_DB=a2_edge_db

# Redis
REDIS_HOST=redis
REDIS_PORT=6379

# Face Detection
FACE_TOLERANCE=0.55
MIN_FACE_SIZE=150
CONFIDENCE_THRESHOLD=0.65

# Cameras
CAMERA_1_NAME=Portaria Principal
CAMERA_1_RTSP=rtsp://admin:senha@192.168.1.100:554/stream
CAMERA_1_LOCATION=Entrada
CAMERA_1_TYPE=face
```

### 9.2 Docker

```bash
# Build
docker build -t camera-service .

# Run
docker run -d \
  --network a2-eventos_a2_net \
  -p 8000:8000 \
  --env-file .env \
  camera-service
```

---

## 10. Troubleshooting

### 10.1 Problemas Comuns

| Problema | Causa | Solução |
|---------|------|--------|
| 0 faces detectadas | Câmera sem foco/iluminação | Ajustar câmera |
| Baixa confiança | Face muito pequena | Aproximar câmera |
| Sem matches | Banco vazio | Cadastrar faces |
| Erro de conexão | PostgreSQL offline | Verificar rede Docker |

### 10.2 Verificação de Saúde

```bash
# Verificar se serviço está rodando
curl http://localhost:8000/health

# Verificar estatísticas
curl http://localhost:8000/stats

# Ver logs
docker logs camera-service --tail 50
```

---

## 11. Próximos Passos

### 11.1 Para Implementar

1. **Job de Processamento de Faces**
   - Criar script que varre fotos existentes
   - Usar AI Worker para gerar embeddings
   - Salvar no PostgreSQL Edge

2. **Integração com Catraca**
   - Adicionar output pararelé
   - Integrar com sistema de catraca existente

3. **AlertWorker**
   - Processar detecções em background
   - Enviar notificações

### 11.2 Docker Compose

O camera-service pode ser adicionado ao docker-compose.ymldo sistema A2:

```yaml
camera-service:
  image: camera-service
  ports:
    - "8000:8000"
  environment:
    - PG_EDGE_HOST=postgres_edge
    - REDIS_HOST=redis
  networks:
    - a2-eventos_a2_net
```

---

## 12. Resumo

O camera-service é uma solução independente que:

- ✅ Usa o mesmo banco de dados do sistema A2
- ✅ Não modifica nada no sistema existente
- ✅ Roda na mesma rede Docker
- ✅ Detecta e identifica faces em tempo real
- ✅ Busca por similaridade usando pgvector
- ✅ Pode integrar com catraca/sistema de acesso

**Próximo passo:** Implementar job de geração de face_encoding parasuas fotos existentes no banco.