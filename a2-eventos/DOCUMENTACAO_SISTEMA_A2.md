# Documentação Técnica - Sistema A2 Eventos

## 1. Visão Geral do Sistema

### 1.1 Arquitetura
- **Backend**: Node.js + Express (api-nodejs)
- **Frontend Admin**: React + Vite (web-admin)
- **Frontend Público**: Next.js 16 (public-web)
- **Banco de Dados**: PostgreSQL (Supabase)
- **Cache**: Redis
- **Storage**: Supabase Storage
- **WebSocket**: Socket.IO para tempo real

### 1.2 Dominios
| Domínio | Serviço |
|--------|---------|
| `painel.nzt.app.br` | Admin Web |
| `cadastro.nzt.app.br` | Portal Público |
| `api.nzt.app.br` | API Backend |
| `app.nzt.app.br` | Mobile App |

---

## 2. Sistema de Usuários

### 2.1 Tabelas Envolvidas
| Tabela | Descrição |
|--------|-----------|
| `auth.users` | Usuários Supabase Auth (email, password) |
| `perfis` | Metadados (nome, nível, evento_id) |

### 2.2 Campos da Tabela `perfis`
```sql
perfis (
  id              UUID PRIMARY KEY REFERENCES auth.users(id)
  evento_id        UUID REFERENCES eventos(id)
  nome_completo    VARCHAR(200) NOT NULL
  avatar_url      TEXT
  nivel_acesso    VARCHAR(20) DEFAULT 'operador'
  documento      VARCHAR(20)
  telefone      VARCHAR(20)
  ativo          BOOLEAN DEFAULT true
  created_at      TIMESTAMP
  updated_at     TIMESTAMP
)
```

### 2.3 Níveis de Acesso
| Nível | Descrição | Quem pode criar |
|-------|-----------|---------------|
| `master` | Soberania total - acesso a tudo | Apenas master |
| `admin` | Gestão do evento | Master, admin |
| `supervisor` | Monitoramento | Master, admin |
| `operador` | Operação básica | Master, admin, supervisor |

### 2.4 Fluxo de Criação de Usuário
```
1. Admin cria convite → POST /api/auth/invite
2. Supabase envia email com link
3. Usuário define senha via link
4. Login → Supabase Auth (signInWithPassword)
5. Usuário faz login → token JWT com role
```

### 2.5 Recuperação de Senha
Usa `supabase.auth.resetPasswordForEmail` com redirect para `/reset-password`

---

## 3. Sistema de Pessoas (Credenciamento)

### 3.1 Tabela de Pessoas
```sql
pessoas (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4()
  nome                  VARCHAR(200) NOT NULL
  nome_credencial       VARCHAR(100)
  cpf                  VARCHAR(14) UNIQUE
  passaporte            VARCHAR(30)
  email                VARCHAR(200)
  funcao               VARCHAR(100) DEFAULT 'Participante'
  tipo_pessoa          VARCHAR(30) DEFAULT 'colaborador'
  empresa_id           UUID REFERENCES empresas(id)
  evento_id            UUID REFERENCES eventos(id)
  nome_mae             VARCHAR(200)
  data_nascimento      DATE
  telefone            VARCHAR(20)
  documento           VARCHAR(30)
  dias_trabalho        JSONB DEFAULT '[]'
  foto_url            TEXT
  face_encoding       JSONB
  qr_code             TEXT UNIQUE
  numero_pulseira     VARCHAR(50)
  status_acesso       VARCHAR(30) DEFAULT 'pendente'
  tipo_fluxo          VARCHAR(30) DEFAULT 'checkin_checkout'
  trabalho_area_tecnica BOOLEAN DEFAULT false
  trabalho_altura     BOOLEAN DEFAULT false
  pagamento_validado   BOOLEAN DEFAULT false
  bloqueado           BOOLEAN DEFAULT false
  motivo_bloqueio      TEXT
  observacao          TEXT
  ativo               BOOLEAN DEFAULT true
  created_by          UUID REFERENCES auth.users(id)
  created_at          TIMESTAMP
  updated_at          TIMESTAMP
)
```

### 3.2 Tipos de Pessoa
| Tipo | Descrição |
|------|-----------|
| `colaborador` | Funcionário da empresa (padrão) |
| `terceiro` | Prestador de serviço/terceirizado |
| `vip` | VIP/Convidado especial |
| `imprensa` | Equipe de imprensa |
| `fornecedor` | Fornecedor |

### 3.3 Status de Acesso
| Status | Descrição |
|--------|----------|
| `pendente` | Aguardando aprovação |
| `autorizado` | Liberação liberada |
| `recusado` | Reprovado |
| `bloqueado` | Bloqueado |
| `verificacao` | Em verificação biométrica |
| `checkin_feito` | Já entrou no evento |
| `checkout_feito` | Já saiu do evento |

### 3.4 Fluxo de Cadastro Público
```
1. Admin cria empresa/convite com token
2. Empresa fornece link: https://cadastro.nzt.app.br/register/{token}
3. Funcionário acessa e preenche formulário
4. Sistema valida:
   - Aceite LGPD Obrigatório
   - CPF único no evento
   - Limite de vagas
   - Token não expirado
5. Upload foto (base64 → Supabase Storage)
6. Salva pessoa com status "pendente"
7. Gera QR Code único
8. Notifica empresa por email
```

---

## 4. Sistema de Check-in / Check-out

### 4.1 Métodos de Acesso
| Método | Descrição |
|--------|-----------|
| `qrcode` | Leitura de QR Code |
| `face` | Reconhecimento facial |
| `manual` | Digitação manual |
| `fast-track` | Acceso rápido (pré-aprovado) |

### 4.2 Rotas de API
```javascript
// Validação
POST /api/checkin/validate/qrcode
Body: { qrCode: "..." }

// Check-in
POST /api/checkin/qrcode
POST /api/checkin/barcode
POST /api/checkin/rfid
POST /api/checkin/manual

// Check-out
POST /api/checkout
POST /api/checkout/qrcode

// Consultas
GET /api/checkin/logs
GET /api/checkin/stats/realtime
GET /api/checkin/ultimo-checkin/:pessoa_id

// Admin
POST /api/checkin/expulsar/:pessoa_id
POST /api/checkin/vincular-pulseira-facial
GET /api/checkin/consultar-pulseira/:codigo

// Face
POST /api/checkin/face/process
```

### 4.3 Tabela de Logs de Acesso
```sql
logs_acesso (
  id              UUID PRIMARY KEY
  evento_id       UUID NOT NULL
  pessoa_id       UUID REFERENCES pessoas(id)
  tipo            VARCHAR(20) NOT NULL -- checkin | checkout | expulsão
  metodo          VARCHAR(20) NOT NULL -- qrcode | face | manual | fast-track
  dispositivo_id VARCHAR(100)
  localizacao     VARCHAR(200)
  foto_capturada  TEXT
  confianca       DECIMAL(5,2) -- Score de confiança facial
  created_by     UUID REFERENCES auth.users(id)
  created_at     TIMESTAMP
)
```

### 4.4 Validações de Acesso
| # | Regra | Descrição |
|---|-------|-----------|
| A-01 | Status autorizado | Bloqueia `pendente` (exceto manual) |
| A-02 | Biometria facial | Confiança >= 75 (ou config do evento) |
| A-03 | Cooldown | 15 min entre acessos |
| A-04 | Fase do evento | Verifica mont/show/desmont |
| A-05 | Dia de trabalho | Verifica se hoje está nos dias autorizados |
| A-06 | Empresa ativa | Bloqueia se empresa inativa |
| A-07 | Pessoa bloqueada | Bloqueia se `bloqueado = true` |
| A-08 | Capacidade | Bloqueia se capacidade excedida |
| A-09 | Cota empresa | Verifica limite por empresa |
| A-10 | Área/Zona | Verifica permissão de área |

### 4.5 Smart Access (Toggle)
- Se pessoa está **fora** → Check-in automático
- Se pessoa está **dentro** → Check-out automático

### 4.6 Configurações (system_settings)
```sql
system_settings (
  checkin_cooldown_min    INTEGER DEFAULT 15
  biometric_confidence  INTEGER DEFAULT 75
  allow_offhour_checkin  BOOLEAN DEFAULT false
  block_unauthorized_days BOOLEAN DEFAULT true
)
```

---

## 5. Empresas

### 5.1 Tabela de Empresas
```sql
empresas (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4()
  cnpj               VARCHAR(20) UNIQUE
  nome               VARCHAR(200) NOT NULL
  responsavel_legal VARCHAR(200)
  contato_nome      VARCHAR(200)
  contato_email     VARCHAR(200)
  contato_telefone  VARCHAR(20)
  evento_id         UUID REFERENCES eventos(id)
  responsavel_id    UUID REFERENCES auth.users(id)
  ativo             BOOLEAN DEFAULT true
  created_at        TIMESTAMP
  updated_at        TIMESTAMP
)
```

---

## 6. Eventos

### 6.1 Tabela de Eventos
```sql
eventos (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4()
  nome                  VARCHAR(200) NOT NULL
  slug                  VARCHAR(100) UNIQUE
  tipo                  VARCHAR(50) -- corporativo, show, workshop
  dt_inicio            DATE
  dt_fim               DATE
  capacidade          INTEGER
  local                VARCHAR(200)
  endereco            TEXT
  capacidade          INTEGER
  logo_url             TEXT
  banner_url          TEXT
  cor_primaria         VARCHAR(10)
  cor_secundaria       VARCHAR(10)
  politica_privacidade_url TEXT
  campos_obrigatorios JSONB
  ativo               BOOLEAN DEFAULT true
  created_at          TIMESTAMP
  updated_at          TIMESTAMP
)
```

---

## 7. Políticas de Permissão

### 7.1 Tabelas de Permissões
| Tabela | Descrição |
|--------|-----------|
| `sys_permissions` | Recursos do sistema |
| `sys_roles` | Papéis (master, admin, supervisor, operador) |
| `sys_role_permissions` | Vinculação role → permission (global) |
| `sys_event_role_permissions` | Permissões por evento |

### 7.2 Estrutura de Permissions
```sql
sys_permissions (
  id        UUID PRIMARY KEY
  recurso  VARCHAR(50) NOT NULL  -- ex: 'pessoas', 'eventos'
  acao     VARCHAR(20) NOT NULL  -- 'leitura', 'escrita', 'execucao'
  escopo   VARCHAR(20)         -- 'global' ou 'evento'
  nome_humanizado VARCHAR(100)
  recurso_frontend VARCHAR(100)
  menu_icon VARCHAR(50)
  menu_order INTEGER
  is_menu_item BOOLEAN DEFAULT false
)
```

---

## 8. Autenticação e Segurança

### 8.1 Stack de Autenticação
- **Provedor**: Supabase Auth
- **Método**: signInWithPassword (email + password)
- **JWT**: Supabase JWT com role no app_metadata

### 8.2 Middleware de Autenticação
```javascript
// Autenticação via JWT
authenticate = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '')
  const { data, error } = await supabase.auth.getUser(token)
  req.user = data.user
  req.user.role = data.user.app_metadata?.nivel_acesso
  next()
}

// Autorização por role
authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Acesso negado' })
    }
    next()
  }
}
```

### 8.3 Rate Limiting
- Auth: 5 tentativas / 15 min
- API: 1000 req / min

---

## 9. Fluxo de Dados

```
┌─────────────────────────────────────────────────────────────────────┐
│                    FLUXO COMPLETO                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                             │
│  AUTH (Usuários Sistema)                                        │
│  ├── Admin cria usuário (convite)                              │
│  ├── Supabase Auth envia email                                │
│  ├── Usuário define senha                                   │
│  └── Login → JWT com role                                  │
│                                                             │
│  EVENTOS                                                   │
│  ├── Admin cria evento                                     │
│  ├── Configura módulos (checkin, face, etc)                 │
│  └── Associa permissões                                     │
│                                                             │
│  EMPRESAS                                                  │
│  ���─��� Admin cria empresa                                     │
│  ├── Associa ao evento                                     │
│  └── Gera token de cadastro                               │
│                                                             │
│  PESSOAS (Credenciamento)                                   │
│  ├── Token empresa → Cria Pessoas (ficha limpa)          │
│  ├── Token pessoa → Atualiza/Preenche                     │
│  ├── Registra foto + documentos                            │
│  └── Admin aprova → authorized                            │
│                                                             │
│  CHECK-IN                                                  │
│  ├── Operador apresenta método                            │
│  ├── Sistema valida (status, fase, dia, capacidade)         │
│  ├── Registra log                                          │
│  ├── Atualiza status (presente/saiu)                     │
│  └── Emite WebSocket para realtime                        │
│                                                             │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 10. Variáveis de Ambiente

### 10.1 Backend (api-nodejs/.env)
```bash
# Supabase
SUPABASE_URL=https://zznrgwytywgjsjqdjfxn.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# Servidor
PORT=3001
NODE_ENV=production
JWT_SECRET=...

# Frontend
FRONTEND_URL=https://painel.nzt.app.br
PUBLIC_PORTAL_URL=https://cadastro.nzt.app.br

# Redis
REDIS_HOST=redis
REDIS_PORT=6379

# PostgreSQL Edge
PG_EDGE_HOST=postgres_edge
PG_EDGE_PORT=5432
```

### 10.2 Frontend Admin (web-admin/.env)
```bash
VITE_API_URL=https://api.nzt.app.br/api
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

### 10.3 Frontend Público (public-web/.env.production)
```bash
NEXT_PUBLIC_API_URL=https://api.nzt.app.br
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

---

## 11. Deploy

### 11.1 Docker Compose
```yaml
services:
  api:
    build: ./backend/api-nodejs
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      
  admin-web:
    build: ./frontend/web-admin
    ports:
      - "80:80"
      
  cadastro-web:
    build: ./frontend/public-web
    ports:
      - "3002:3000"
    environment:
      - NODE_ENV=production
      - NEXT_PUBLIC_API_URL=https://api.nzt.app.br

  gateway:
    image: nginx:alpine
    ports:
      - "443:443"
    volumes:
      - ./gateway/nginx.conf:/etc/nginx/nginx.conf
      
  redis:
    image: redis:alpine
    
  pg_edge:
    image: postgres:15
```

### 11.2 Nginx Gateway
Gerencia SSL e proxy reverso para os serviços.

---

## 12. Endpoints Principais

### 12.1 Autenticação
| Método | Rota | Descrição |
|--------|------|------------|
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/forgot-password` | Recuperação de senha |
| POST | `/api/auth/invite` | Criar convite |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/me` | Dados do usuário |

### 12.2 Pessoas
| Método | Rota | Descrição |
|--------|------|------------|
| GET | `/api/pessoas` | Lista pessoas |
| POST | `/api/pessoas` | Cria pessoa |
| PUT | `/api/pessoas/:id` | Atualiza pessoa |
| DELETE | `/api/pessoas/:id` | Remove pessoa |
| POST | `/api/pessoas/import` | Importa planilha |

### 12.3 Check-in
| Método | Rota | Descrição |
|--------|------|------------|
| POST | `/api/checkin/qrcode` | Check-in QR |
| POST | `/api/checkout` | Check-out |
| POST | `/api/checkin/face/process` | Reconhecimento facial |
| GET | `/api/checkin/stats/realtime` | Estatísticas |

### 12.4 Empresas
| Método | Rota | Descrição |
|--------|------|------------|
| GET | `/api/empresas` | Lista empresas |
| POST | `/api/empresas` | Cria empresa |
| PUT | `/api/empresas/:id` | Atualiza empresa |

### 12.5 Eventos
| Método | Rota | Descrição |
|--------|------|------------|
| GET | `/api/eventos` | Lista eventos |
| POST | `/api/eventos` | Cria evento |
| GET | `/api/eventos/:id/stats` | Estatísticas |

### 12.6 Público (Cadastro)
| Método | Rota | Descrição |
|--------|------|------------|
| GET | `/api/public/company/:token` | Dados da empresa |
| GET | `/api/public/person/:token` | Dados da pessoa |
| POST | `/api/public/register/:token` | Cadastra pessoa |

---

## 13. Segurança

### 13.1 Medidas Implementadas
- [x] Senhas hashadas com bcrypt (Supabase Auth)
- [x] JWT com expiração
- [x] Rate limiting
- [x] CORS controlado
- [x] Helmet.jsheaders
- [x] Row Level Security (RLS)
- [x] Auditoria de logs
- [x] LGPD consent logging

### 13.2 Cabeçalhos de Segurança (Helmet)
```
Content-Security-Policy: default-src 'self'
X-Frame-Options: SAMEORIGIN
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=15552000
```

---

## 14. WebSocket Events

```javascript
// Novo acesso
socket.emit('new_access', {
  id: logId,
  evento_id,
  pessoa_id,
  pessoa_nome,
  tipo_acesso: 'checkin' | 'checkout',
  area_id
});

// Alerta de watchlist
socket.emit('watchlist_alert', {
  pessoa: { id, nome, cpf, foto_url },
  watchlist: { tipo, motivo },
  tipo,
  area,
  terminal,
  hora
});

// Estatísticas em tempo real
socket.emit('stats_update', {
  presentes: 150,
  checkins: 200,
  checkouts: 50
});
```

---

## 15. Controles de Hardware

### 15.1 Catracas
- HTTP para abertura
-RFIDInput
- QR Code reader

### 15.2 Câmeras
- RTSP stream
- Detecção facial
- LPR (License Plate Recognition)

---

*Documento gerado automaticamente em 2026-04-15*