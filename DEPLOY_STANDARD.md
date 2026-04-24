# 🚀 DEPLOY STANDARDIZADO — A2 Eventos

**Versão:** 1.0  
**Última Atualização:** 2026-04-24  
**Status:** Ativo em Produção  
**Fonte Única da Verdade para Deploy**

---

## 📋 ÍNDICE

1. [Pré-Requisitos](#pré-requisitos)
2. [Checklist Pré-Deploy](#checklist-pré-deploy)
3. [Deploy Local (Desenvolvimento)](#deploy-local-desenvolvimento)
4. [Deploy Produção](#deploy-produção)
5. [Verificação Pós-Deploy](#verificação-pós-deploy)
6. [Troubleshooting](#troubleshooting)

---

## ✅ Pré-Requisitos

### Software
- Docker 20.10+
- Docker Compose 1.29+
- Git
- Node.js 20+ (opcional, para dev local)
- Bash ou zsh (Linux/Mac) ou Git Bash (Windows)

### Credenciais & Configuração
- `.env` arquivo configurado em `a2-eventos/` com:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `API_URL` (produção)
  - Demais variáveis em `.env.example`

### Infraestrutura (Produção)
- VPS Hostinger ou equivalente
- Domínio apontando para o IP via Cloudflare
- Certificado SSL (Let's Encrypt ou Cloudflare Origin CA)

---

## ✅ Checklist Pré-Deploy

**Execute em ordem, NÃO pule etapas:**

```bash
# 1. Verificar ferramentas
docker --version          # v20.10+
docker-compose --version  # v1.29+
git --version
bash --version

# 2. Verificar Git
git status                # Deve estar limpo ou commits feitos
git log --oneline -3      # Ver últimos commits

# 3. Verificar .env
cd a2-eventos
ls -la .env                    # Arquivo deve existir
grep "SUPABASE_URL" .env      # Não vazio
grep "SUPABASE_ANON_KEY" .env # Não vazio

# 4. Verificar espaço em disco
df -h /                   # Deve ter >10GB livres

# 5. Docker pronto
docker ps                 # Nenhum container deve estar rodando (ou apenas outros projetos)
```

---

## 🏠 Deploy Local (Desenvolvimento)

**Uso:** Testar localmente antes de subir para produção.

```bash
cd a2-eventos

# 1. Trazer containers (sem cache = versão nova)
docker-compose build --no-cache

# 2. Subir em background
docker-compose up -d

# 3. Esperar inicialização (15 segundos)
sleep 15

# 4. Verificar saúde
docker-compose ps              # Todos em "Up"
curl http://localhost:3001/health | jq .  # Backend OK
curl http://localhost:80/ | head          # Gateway OK

# 5. Ver logs se houver erro
docker-compose logs -f --tail=50
```

**Para parar:**
```bash
docker-compose down
```

---

## 🌐 Deploy Produção

**Use SEMPRE o script único:** `./deploy.sh`

Este script segue o padrão exato e lida com Supabase, SSL, e healthchecks.

```bash
# Opcoes disponiveis:
./deploy.sh full      # Full: pre-check → stop → clean → update → build → start → verify
./deploy.sh quick     # Quick: build + start + verify (sem limpeza)
./deploy.sh check     # Check: apenas verificacoes (sem mudancas)
./deploy.sh logs      # Logs: ver em tempo real
./deploy.sh stop      # Stop: parar containers

# Uso padrao (recomendado):
./deploy.sh full
```

**O que o script faz:**

1. **Pré-Verifica:** Docker, git, .env, espaço em disco
2. **Para containers** com segurança
3. **Limpa** imagens/networks dangling (opcional)
4. **Atualiza Git** para latest master
5. **Build** docker-compose sem cache
6. **Inicia** containers em order (dependências respeitadas)
7. **Verifica:** health endpoints, Supabase, logs

---

## ✔️ Verificação Pós-Deploy

**Automatizado pelo deploy.sh, mas pode rodar manual:**

```bash
# 1. Containers rodando
docker-compose ps
# Esperado: Todos em "Up X seconds"

# 2. Health checks
curl http://localhost:3001/health | jq .
curl http://localhost:80/health

# 3. Logs limpos (nenhum Error)
docker-compose logs | grep -i error | head -5
# Esperado: (vazio ou warnings apenas)

# 4. Conectividade Supabase (no container)
docker exec a2_eventos_api \
  curl -s https://[project].supabase.co/rest/v1/ping

# 5. Verificar Redis cache
docker exec a2_eventos_redis redis-cli ping
# Esperado: PONG
```

---

## 🆘 Troubleshooting

### "Port 80/443 already in use"
```bash
# Verificar o que esta usando
sudo lsof -i :80
sudo lsof -i :443

# Matar processo (cuidado!)
sudo kill -9 <PID>

# OU: mudar porta em docker-compose.yml
# ports:
#   - "8080:80"  # em vez de 80:80
```

### "Cannot connect to Docker daemon"
```bash
# Iniciar Docker
sudo systemctl start docker    # Linux
open -a Docker                 # Mac
# Windows: abrir Docker Desktop
```

### "ECONNREFUSED" no backend ou Supabase
```bash
# Verificar se env vars estao carregadas
docker exec a2_eventos_api env | grep SUPABASE
# Se vazio: .env nao foi lido

# Solucao: rebuild
docker-compose build --no-cache
docker-compose down && docker-compose up -d
```

### "502 Bad Gateway" no Nginx
```bash
# 1. Verificar backend esta rodando
docker logs a2_eventos_api --tail=20

# 2. Verificar conexao do gateway para backend
docker exec a2_eventos_gateway curl http://api:3001/health

# 3. Se problema persistir: restart gateway
docker-compose restart gateway
```

### "Timeout" em dispositivos Intelbras
```bash
# Aumentar timeout em docker-compose.yml ou controller
# Ver: a2-eventos/backend/api-nodejs/src/modules/devices/intelbras.controller.js
# Linha ~320: timeoutMs: 15000  # pode aumentar para 25000

# Depois rebuild:
docker-compose build api && docker-compose up -d api
```

---

## 📁 Estrutura Padrão de Deploy

```
a2-eventos/
├── docker-compose.yml          ← UNICO arquivo de orquestracao
├── .env                        ← Variaveis de ambiente (nao em git)
├── gateway/
│   ├── Dockerfile
│   ├── nginx.conf              ← Config unica do Nginx
│   └── entrypoint.sh
├── backend/
│   └── api-nodejs/
│       ├── Dockerfile
│       ├── package.json
│       └── src/
├── frontend/
│   ├── web-admin/              ← Admin SPA
│   │   └── Dockerfile
│   └── public-web/             ← Portal publico
│       └── Dockerfile
└── scripts/
    ├── rebuild-frontend.sh     ← Rebuild util
    └── backup_supabase.sh      ← Backup util

../deploy.sh                    ← UNICO script de deploy (raiz do projeto)
```

---

## 🔐 Variáveis de Ambiente (. env)

**Copie de `.env.example` e preencha:**

```bash
# Supabase
SUPABASE_URL=https://[project-id].supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Producao
NODE_ENV=production
API_URL=https://painel.nzt.app.br
VITE_API_URL=https://api.nzt.app.br/api
VITE_SUPABASE_URL=https://[project-id].supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...

# Timezone
TZ=America/Sao_Paulo
```

**NUNCA commite .env no git** — ja esta em `.gitignore`

---

## 📊 Referência Rápida

| Acao | Comando |
|---|---|
| Subir containers | `./deploy.sh quick` |
| Subir com limpeza completa | `./deploy.sh full` |
| Parar containers | `./deploy.sh stop` |
| Ver logs em tempo real | `./deploy.sh logs` |
| Restart um container | `docker-compose restart [nome]` |
| Acessar shell do container | `docker exec -it [container] sh` |
| Limpar tudo (CUIDADO!) | `docker system prune -af` |

---

## ✨ Notas Importantes

- **Fonte Unica:** Este arquivo e a documentacao oficial. Ignore arquivos antigos de deploy.
- **docker-compose.yml:** E o **unico** arquivo de orquestracao para producao. Sem alternativas.
- **deploy.sh:** E o **unico** script para subir containers. Sem alternativas.
- **Dependencias:** Postgres, Redis, API, Gateway sao iniciados em ordem automaticamente.
- **Saude:** Cada container tem healthcheck — docker-compose respeita.

---

**Ultima verificacao:** 2026-04-24 — Sistema em estado consistente e documentado.
