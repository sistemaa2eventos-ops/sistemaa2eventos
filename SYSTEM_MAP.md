# 🗺️ MAPA COMPLETO DO SISTEMA — A2 Eventos

**Data:** 2026-04-23  
**Versão:** 1.0  

---

## 📍 LOCALIZAÇÃO DOS ARQUIVOS CRÍTICOS

```
c:\Projetos\Projeto_A2_Eventos\
├── 📋 CLAUDE.md                           ← PROTOCOLO COMPLETO (leia primeiro)
├── 📋 DEPLOY_CHECKLIST.md                 ← CHECKLIST PARA IMPRIMIR
├── 📋 QUICK_REFERENCE.txt                 ← 1 PÁGINA RÁPIDA
├── 📋 SYSTEM_MAP.md                       ← VOCÊ ESTÁ AQUI
├── 🚀 deploy.sh                           ← SCRIPT DE DEPLOY AUTOMÁTICO
├── 📝 docker-compose.yml                  ← COMPOSIÇÃO DE CONTAINERS
├── 📝 .env                                ← VARIÁVEIS DE AMBIENTE (SECRETO)
├── 📝 .env.example                        ← TEMPLATE DO .env
│
├── a2-eventos/
│   ├── backend/
│   │   └── api-nodejs/
│   │       ├── src/
│   │       │   ├── app.js                 ← ENTRADA DA APP
│   │       │   ├── middleware/
│   │       │   │   ├── auth.js            ← AUTENTICAÇÃO & RBAC
│   │       │   │   ├── eventMiddleware.js ← CONTEXTO DE EVENTO
│   │       │   │   └── ...
│   │       │   ├── config/
│   │       │   │   ├── supabase.js        ← CONEXÃO SUPABASE
│   │       │   │   └── ...
│   │       │   ├── modules/
│   │       │   │   ├── devices/           ← 🎯 MÓDULO INTELBRAS
│   │       │   │   │   ├── device.controller.js
│   │       │   │   │   ├── device.routes.js
│   │       │   │   │   ├── intelbras.controller.js
│   │       │   │   │   ├── intelbras.routes.js
│   │       │   │   │   ├── intelbras.service.js
│   │       │   │   │   └── adapters/
│   │       │   │   ├── system/            ← 🎯 MÓDULO SETTINGS (SMTP)
│   │       │   │   │   ├── settings.controller.js
│   │       │   │   │   ├── settings.routes.js
│   │       │   │   │   ├── public.routes.js
│   │       │   │   │   ├── metrics.controller.js
│   │       │   │   │   └── ...
│   │       │   │   ├── checkin/
│   │       │   │   ├── events/
│   │       │   │   └── ...
│   │       │   ├── services/
│   │       │   │   ├── emailService.js    ← EMAIL/SMTP
│   │       │   │   ├── logger.js          ← LOGGING
│   │       │   │   └── ...
│   │       │   └── ...
│   │       ├── Dockerfile                 ← BUILD BACKEND
│   │       ├── package.json               ← DEPS BACKEND
│   │       └── ...
│   │
│   ├── frontend/
│   │   └── web-admin/
│   │       ├── src/
│   │       │   ├── pages/
│   │       │   │   └── config/
│   │       │   │       ├── DispositivosPage.jsx   ← 🎯 FORM DISPOSITIVOS
│   │       │   │       ├── ConfigComunicacao.jsx  ← 🎯 SMTP/EMAIL
│   │       │   │       └── ...
│   │       │   ├── components/
│   │       │   │   ├── config/
│   │       │   │   │   └── DeviceListPanel.jsx
│   │       │   │   └── ...
│   │       │   ├── services/
│   │       │   │   ├── api.js             ← AXIOS CONFIG (base URL)
│   │       │   │   └── ...
│   │       │   └── ...
│   │       ├── Dockerfile                 ← BUILD FRONTEND
│   │       ├── package.json               ← DEPS FRONTEND
│   │       └── ...
│   │
│   └── gateway/
│       ├── nginx.conf                     ← 🎯 CONFIGURAÇÃO NGINX
│       └── Dockerfile
│
├── memory/                                 ← AUTO-MEMORY (conversas prévias)
│   ├── MEMORY.md
│   ├── audit_progress.md
│   ├── smtp_verification_fix.md
│   └── intelbras_token_config.md
│
└── ...

```

---

## 🌐 LOCALIZAÇÕES NA INTERNET

### **Domínio & DNS**

```
Domínio: painel.nzt.app.br
├─ Registrador: Hostinger
├─ DNS: Cloudflare
└─ IP VPS: [Seu IP Hostinger]

Roteamento:
  1. Usuário acessa: painel.nzt.app.br
  2. Cloudflare resolve para: IP do Hostinger
  3. Nginx escuta em: 80/443
  4. Nginx roteia para: 
     - Backend (3001)
     - Frontend (3000)
```

### **Hosts & Serviços**

| Host | IP/URL | Porta | Função |
|------|--------|-------|--------|
| **Hostinger VPS** | `[seu-ip]` | 22 (SSH) | Hospedagem principal |
| **Nginx** | localhost | 80/443 | Proxy reverso (Cloudflare) |
| **Backend** | localhost | 3001 | API Node.js |
| **Frontend** | localhost | 3000 | React admin panel |
| **Supabase** | https://[proj].supabase.co | 443 | PostgreSQL + Auth |
| **Cloudflare** | painel.nzt.app.br | 443 | DNS + SSL/TLS proxy |
| **Intelbras** | 192.168.1.17 | 80 | Terminal facial (rede local) |

---

## 🔐 SENHAS & CREDENCIAIS

⚠️ **NUNCA COMPARTILHAR ESTES DADOS**

```
Intelbras Terminal:
  URL: http://192.168.1.17
  Usuário: admin
  Senha: admin123

Gmail SMTP:
  Email: sistemaa2eventos@gmail.com
  Senha: sugxuzjwcoytlhtp (App Password)
  Host: smtp.gmail.com:587

Supabase:
  URL: https://[seu-projeto].supabase.co
  Anon Key: eyJ... (em .env)
  Service Key: eyJ... (em .env)

Hostinger SSH:
  Host: seu-ip-hostinger
  User: root ou seu-usuario
  Auth: Senha ou chave SSH
```

📝 **Armazenar em local seguro (1Password, Bitwarden, etc)**

---

## 🔌 PORTA & FIREWALL (Hostinger)

```
UFW Rules necessárias:

  sudo ufw allow 22/tcp     # SSH
  sudo ufw allow 80/tcp     # HTTP
  sudo ufw allow 443/tcp    # HTTPS
  sudo ufw allow 3001/tcp   # Backend (interno apenas)
  sudo ufw allow 3000/tcp   # Frontend (interno apenas)

Para Intelbras (rede local):
  5432/tcp  ← PostgreSQL (se remoto)
  3001/tcp  ← Backend (se acessar de fora)
```

---

## 🐳 CONTAINERS & VOLUMES

```
Containers:
  ✓ a2-eventos-api        (Node.js API, porta 3001)
  ✓ a2-eventos-web        (React frontend, porta 3000)
  ✓ nginx                 (Proxy reverso, porta 80/443)

Volumes (persistência):
  ✓ /var/lib/postgresql   (Supabase storage, remoto)
  ✓ /var/log              (Nginx logs, container)

Networks:
  ✓ a2-eventos_default    (Conecta api + web + nginx)
```

Ver:
```bash
docker volume ls
docker network ls
docker ps -a
```

---

## 📊 VARIÁVEIS DE AMBIENTE (.env)

```bash
# CRÍTICAS (não funciona sem estas)
SUPABASE_URL=https://[projeto-id].supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Domínio
API_URL=https://painel.nzt.app.br
PUBLIC_API_HOST=painel.nzt.app.br
PUBLIC_API_PORT=443
SERVER_IP=painel.nzt.app.br

# Node
NODE_ENV=production
PORT=3001
JWT_SECRET=[sua-chave-secreta]

# SMTP (se usar sistema de email)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=sistemaa2eventos@gmail.com
SMTP_PASS=[app-password]
SMTP_EMAIL=sistemaa2eventos@gmail.com

# Hardware
INTELBRAS_DEFAULT_USER=admin
INTELBRAS_DEFAULT_PASS=admin123
HARDWARE_CALLBACK_PORT=443
```

Ler com: `cat .env | grep [VARNAME]`

---

## 🔄 FLUXO DE DADOS — INTELBRAS

```
Pessoa entra na frente do Intelbras (IP: 192.168.1.17)
            ↓
       Captura face
            ↓
    Envia para servidor (via token):
    POST /api/intelbras/online?token=0b111a60-2886-4f65-8c82-316b53097dcc
            ↓
    Nginx recebe em: painel.nzt.app.br
            ↓
    Roteia para Backend (3001)
            ↓
    Intelbras Controller processa:
      1. Identifica dispositivo (pelo control_token)
      2. Busca pessoa (CPF ou UUID)
      3. Verifica status_acesso no Supabase
      4. Abre relé se autorizado
      5. Registra log
            ↓
    Resposta: {"auth":"true/false", "message":"..."}
            ↓
    Intelbras recebe e controla relé/tela
```

---

## 🔍 ROUTES IMPORTANTES

### **Público (sem auth)**

```
POST   /api/settings/verify-smtp          ← Testar SMTP
POST   /api/intelbras/online?token=XXX    ← Modo Online do Intelbras
POST   /api/intelbras/events?token=XXX    ← Push de eventos
GET    /api/intelbras/keepalive?token=XXX ← Heartbeat
GET    /api/intelbras/ping                ← Diagnóstico
```

### **Autenticado (requer token JWT)**

```
GET    /api/dispositivos                  ← Listar dispositivos
POST   /api/dispositivos                  ← Criar dispositivo
POST   /api/dispositivos/test-connection  ← Testar conexão
PUT    /api/dispositivos/:id               ← Atualizar dispositivo
DELETE /api/dispositivos/:id               ← Deletar dispositivo
GET    /api/dispositivos/:id/snapshot      ← Foto câmera
POST   /api/dispositivos/:id/sync          ← Sincronizar faces
POST   /api/dispositivos/:id/configure-push ← Config online mode

GET    /api/settings                      ← Obter configurações globais
PUT    /api/settings                      ← Atualizar configurações
POST   /api/settings/test-email           ← Testar email
```

---

## 📈 MONITORAMENTO & LOGS

```bash
# Ver logs em tempo real
docker-compose logs -f

# Ver logs específicos
docker logs a2-eventos-api --tail=100
docker logs a2-eventos-web --tail=100
docker logs nginx --tail=100

# Procurar erros
docker logs a2-eventos-api | grep -i "error\|fail\|crash"

# Arquivo de log (se houver persistência)
cat /var/log/app.log
cat /var/log/nginx/access.log
```

---

## 🔄 CICLO DE UMA ALTERAÇÃO

```
1. DESENVOLVIMENTO
   ├─ Editar arquivo (ex: intelbras.controller.js)
   ├─ Testar localmente (npm run dev)
   └─ Git commit

2. GIT
   ├─ git add .
   ├─ git commit -m "Descrição"
   └─ git push origin master

3. CI/CD (manual - você executa)
   ├─ SSH no Hostinger
   ├─ git pull origin master
   └─ ./deploy.sh full

4. BUILD
   ├─ docker-compose build --no-cache
   └─ Compila Node.js, React, Nginx

5. DEPLOY
   ├─ docker-compose up -d
   └─ Containers iniciam

6. VERIFICAÇÃO
   ├─ curl http://localhost:3001/health
   ├─ curl http://localhost:3000
   └─ docker-compose logs --tail=50

7. PRODUÇÃO
   ├─ Usuários acessam painel.nzt.app.br
   ├─ Intelbras conecta e funciona
   └─ Monitor logs por 1h
```

---

## ⚠️ COISAS QUE PODEM QUEBRAR

| Coisa | Se quebrar | Sintoma | Solução |
|-------|------------|---------|---------|
| `.env` | Var faltando | 503, "undefined" | Verificar .env |
| `docker-compose.yml` | Sintaxe errada | Build falha | Ver syntax |
| Supabase | Down/migração | Backend 503 | Esperar ou rollback |
| Cloudflare | DNS wrong | Não resolve | Verificar A record |
| Hostinger SSH | Sem acesso | Não consegue fazer deploy | Verificar SSH key |
| Nginx config | Sintaxe | 502 Bad Gateway | Verificar nginx.conf |
| Intelbras | Token errado | "ID não identificado" | Copiar token correto |
| SMTP | Credenciais | Erro email | Gerar App Password novo |

---

## 📱 CHECKLIST DIÁRIO (5 min)

```bash
# Todos os dias:
docker-compose ps                    # Todos Up?
curl http://localhost:3001/health    # Backend OK?
curl http://localhost:3000           # Frontend OK?
docker logs app --tail=20 | grep error # Erros?

# Se tudo verde:
✅ Sistema está OK
```

---

## 📞 SUPORTE RÁPIDO

| Problema | Comando |
|----------|---------|
| Quer ver status? | `docker ps` |
| Quer ver logs? | `docker logs app -f` |
| Quer parar? | `docker-compose down` |
| Quer iniciar? | `docker-compose up -d` |
| Quer rebuildar? | `./deploy.sh full` |
| Quer testar backend? | `curl http://localhost:3001` |
| Quer testar Supabase? | `curl -s $SUPABASE_URL/rest/v1/ping` |
| Quer SSH no Hostinger? | `ssh root@[seu-ip]` |

---

**Arquivo Versão 1.0**  
**Atualizado:** 2026-04-23  
**Próximas atualizações:** Quando adicionar novos serviços
