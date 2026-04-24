# 🚀 PROTOCOLO PADRÃO DE DEPLOY — A2 Eventos

**Versão:** 2.0  
**Última Atualização:** 2026-04-23  
**Status:** Ativo em Produção

---

## 🎯 SKILLS DISPONÍVEIS

Este projeto possui **skills customizadas** no Claude que podem ser invocadas via slash commands. Use quando precisar:

```
/deploy              ← Protocolo COMPLETO de deploy (este arquivo)
/quick-deploy        ← Referência RÁPIDA (1 página)
/system-map          ← Mapa do SISTEMA (onde está cada coisa)
/checklist           ← Checklist PASSO-A-PASSO (para imprimir)
/troubleshoot        ← Guia de TROUBLESHOOTING (problemas comuns)
```

**Como usar:**
1. Quando estiver trabalhando no Claude Code
2. Digite: `/deploy` ou `/quick-deploy` ou outro comando
3. Claude retornará automaticamente o protocolo correspondente

---

## 📋 ÍNDICE

1. [Arquitetura Geral](#arquitetura-geral)
2. [Checklist Pré-Deploy](#checklist-pré-deploy)
3. [Processo de Atualização](#processo-de-atualização)
4. [Build & Deploy Docker](#build--deploy-docker)
5. [Verificação Pós-Deploy](#verificação-pós-deploy)
6. [Variáveis de Ambiente](#variáveis-de-ambiente)
7. [Serviços Externos](#serviços-externos)
8. [Troubleshooting](#troubleshooting)

---

## 🏗️ ARQUITETURA GERAL

```
┌─────────────────────────────────────────────────────────────────┐
│                        INTERNET / USUARIOS                       │
└────────────────────────────┬────────────────────────────────────┘
                             │
                  ┌──────────▼──────────┐
                  │   CLOUDFLARE DNS   │
                  │ painel.nzt.app.br  │
                  └──────────┬──────────┘
                             │ (Proxy HTTP/HTTPS)
                  ┌──────────▼──────────┐
                  │  HOSTINGER / VPS   │
                  │  (IP: X.X.X.X)     │
                  └──────────┬──────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        │         ┌──────────▼──────────┐         │
        │         │   NGINX Gateway     │         │
        │         │  (porta 80/443)     │         │
        │         │  /etc/nginx/        │         │
        │         └────────┬─────────────┘         │
        │                  │                       │
        │  ┌───────────────┼───────────────┐      │
        │  │               │               │      │
        │  ▼               ▼               ▼      │
        │ ┌──────┐    ┌──────┐       ┌──────┐    │
        │ │Backend│   │Fronte│       │Device│    │
        │ │3001   │   │3000  │       │Push  │    │
        │ └──┬───┘    └──┬───┘       └──┬───┘    │
        │    │          │               │        │
        │    └──────────┴───────────────┘        │
        │              │                         │
        └──────────────┼─────────────────────────┘
                       │
        ┌──────────────▼──────────────┐
        │  SUPABASE (PostgreSQL)      │
        │  + Auth + Storage           │
        │  https://supabase.io        │
        └─────────────────────────────┘
```

### **Componentes**

| Componente | Porta | Container | Acesso | Função |
|-----------|-------|-----------|--------|--------|
| **Nginx** | 80/443 | nginx | `painel.nzt.app.br` | Proxy reverso, SSL/TLS |
| **Backend API** | 3001 | a2-eventos-api | `localhost:3001` | Node.js/Express, Supabase |
| **Frontend Web** | 3000 | a2-eventos-web | `localhost:3000` | React, Material-UI |
| **Device Push** | 80 | (Backend) | `/api/intelbras/*` | Webhooks Intelbras/Hikvision |
| **Supabase** | 443 | (Cloud) | API Externa | PostgreSQL + Auth |

---

## ✅ CHECKLIST PRÉ-DEPLOY

**Execute em ordem, antes de fazer qualquer mudança:**

### **1. Verificar Ambiente Local**
```bash
# 1.1 - Verificar Docker
docker --version                    # Deve ser 20.10+
docker-compose --version            # Deve ser 1.29+

# 1.2 - Verificar Git
git status                          # Sem mudanças não-commitadas
git log --oneline -5                # Verificar commits recentes

# 1.3 - Verificar Node/npm (se compilar localmente)
node --version                      # v18+
npm --version                       # v8+
```

### **2. Verificar Supabase (Cloud)**
```bash
# 2.1 - Testar Conectividade
curl -s https://[project-id].supabase.co/rest/v1/system_settings \
  -H "apikey: YOUR_ANON_KEY" | jq '.data | length'
# Deve retornar um número (contagem de linhas)

# 2.2 - Verificar se as variáveis de ambiente estão corretas
echo $SUPABASE_URL
echo $SUPABASE_ANON_KEY
# Não deve estar vazio
```

### **3. Verificar Serviços Externos**
```bash
# 3.1 - Testar DNS (Cloudflare)
nslookup painel.nzt.app.br
# Deve resolver para o IP do Hostinger

# 3.2 - Testar HTTPS (Cloudflare)
curl -s -o /dev/null -w "%{http_code}" https://painel.nzt.app.br
# Deve retornar 200-404 (não 502/503)

# 3.3 - Testar acesso SSH Hostinger
ssh user@seu-ip-hostinger
# Deve conectar sem erros
```

### **4. Verificar Containers Atuais**
```bash
# 4.1 - Listar containers
docker ps -a

# 4.2 - Verificar se há containers parados
docker ps --filter "status=exited"

# 4.3 - Ver uso de espaço
docker system df
```

### **5. Backup do Estado Atual**
```bash
# 5.1 - Anotar versão atual
docker ps --format "{{.Names}}: {{.Image}}"

# 5.2 - Fazer backup do .env (se houver)
cp .env .env.backup.$(date +%Y%m%d_%H%M%S)

# 5.3 - Git log atual
git log --oneline -1 > deployment.log
```

---

## 🔄 PROCESSO DE ATUALIZAÇÃO

**Siga rigorosamente nesta ordem:**

### **Fase 1: Preparação (5 min)**

```bash
# 1. Confirmar que está na branch correta
git branch -v
# Deve estar em: * master ou main

# 2. Trazer últimas mudanças do remoto
git fetch origin

# 3. Ver o que vai ser deployado
git log --oneline origin/master..master
# Se vazio: já está atualizado
# Se há commits: eles vão subir

# 4. Verificar se há mudanças locais não-commitadas
git status
# Se houver, fazer commit ou stash:
git add .
git commit -m "Descrição da mudança"
```

### **Fase 2: Análise de Mudanças (3 min)**

```bash
# 1. Ver quais arquivos vão mudar
git diff --name-status origin/master..master

# 2. Se mudanças no docker-compose.yml ou .env.example:
git diff docker-compose.yml
git diff .env.example

# 3. Se mudanças no backend (api-nodejs):
git diff a2-eventos/backend/api-nodejs/src/

# 4. Se mudanças no frontend (web-admin):
git diff a2-eventos/frontend/web-admin/src/
```

### **Fase 3: Stop Seguro (2 min)**

```bash
# 1. Parar containers gracefully
docker-compose down

# 2. Esperar 5 segundos
sleep 5

# 3. Confirmar que pararam
docker ps
# Não deve listar nenhum container ativo

# 4. Limpar volumes dangling (opcional, cuidado!)
# docker volume prune -f  # ⚠️ SÓ SE TEM BACKUP DO DB
```

### **Fase 4: Atualizar Código (2 min)**

```bash
# 1. Puxar código do git
git pull origin master

# 2. Verificar se há dependências novas
# Backend
diff <(git show HEAD:a2-eventos/backend/api-nodejs/package.json) \
     a2-eventos/backend/api-nodejs/package.json

# Frontend
diff <(git show HEAD:a2-eventos/frontend/web-admin/package.json) \
     a2-eventos/frontend/web-admin/package.json
```

### **Fase 5: Preparar Variáveis (3 min)**

```bash
# 1. Verificar se .env.example mudou
git diff .env.example

# 2. Se mudou, atualizar .env com novos campos
# NÃO sobrescrever arquivo inteiro, apenas adicionar novos campos

# 3. Validar .env críticos:
grep "SUPABASE_URL" .env       # Não vazio
grep "SUPABASE_ANON_KEY" .env  # Não vazio
grep "API_URL" .env             # Deve conter seu domínio
grep "NODE_ENV" .env            # Deve ser "production"
```

---

## 🐳 BUILD & DEPLOY DOCKER

**Este é o coração do deploy. Execute exatamente assim:**

### **Passo 1: Limpeza Completa**

```bash
# 1. Parar tudo
docker-compose down

# 2. Remover imagens antigas (libera espaço)
docker image prune -af

# 3. Remover networks dangling
docker network prune -f

# 4. Verificar espaço livre
df -h
# Deve ter >5GB livres

# 5. Ver tamanho dos dados
du -sh .
du -sh a2-eventos/
```

### **Passo 2: Build Fresh**

```bash
# 1. Fazer build sem cache (garante versão nova)
docker-compose build --no-cache

# ⏳ ESPERE: 10-15 minutos
# Você verá:
#   Building a2-eventos-api...
#   Building a2-eventos-web...
#   Building nginx...
#
# Quando terminar, verá:
#   Successfully tagged a2-eventos-api:latest
#   Successfully tagged a2-eventos-web:latest

# 2. Verificar que as imagens foram criadas
docker images | grep a2-eventos
# Deve listar 3 imagens: api, web, nginx
```

### **Passo 3: Iniciar Serviços**

```bash
# 1. Subir em background
docker-compose up -d

# 2. Verificar status
docker-compose ps
# Status deve ser: "Up X seconds"

# 3. Esperar 15 segundos (tempo de inicialização)
sleep 15

# 4. Ver logs
docker-compose logs --tail=20
```

### **Passo 4: Verificar Saúde**

```bash
# 1. Backend respondendo
curl -s http://localhost:3001/health | jq .

# 2. Frontend respondendo
curl -s http://localhost:3000 | head -20

# 3. Nginx respondendo
curl -s http://localhost:80 | head -20

# 4. Ver logs detalhados
docker logs a2-eventos-api --tail=50
docker logs a2-eventos-web --tail=50
docker logs nginx --tail=50
```

---

## ✔️ VERIFICAÇÃO PÓS-DEPLOY

**Execute todos os testes nesta ordem:**

### **Nível 1: Containers & Conectividade**

```bash
# 1.1 - Todos containers rodando?
docker-compose ps
# Verificar: Status = Up, todos sem "Exit Code"

# 1.2 - Ports corretas?
netstat -tlnp | grep -E ':(80|443|3000|3001)'
# Deve listar 4 portas

# 1.3 - Networks conectadas?
docker network ls
docker network inspect a2-eventos_default
# Todos containers devem estar na rede
```

### **Nível 2: Serviços Internos**

```bash
# 2.1 - Backend Health
curl -s http://localhost:3001/health | jq .
# Esperado: { "status": "ok" }

# 2.2 - Frontend carregando
curl -s http://localhost:3000 | grep -q "DOCTYPE"
# Se retornar sucesso, frontend está ok

# 2.3 - Nginx como proxy
curl -s -I http://localhost/api/health
# Esperado: HTTP/1.1 200 OK
```

### **Nível 3: Conexões Externas**

```bash
# 3.1 - Supabase
curl -s https://[project-id].supabase.co/rest/v1/system_settings?limit=1 \
  -H "apikey: $SUPABASE_ANON_KEY" | jq '.data | length'
# Deve retornar um número

# 3.2 - DNS (Cloudflare)
nslookup painel.nzt.app.br
# Deve resolver

# 3.3 - HTTPS via Cloudflare
curl -s -I https://painel.nzt.app.br
# Esperado: HTTP/2 200 ou 301/302 (redirect)

# 3.4 - Latência
time curl -s https://painel.nzt.app.br/api/health | jq .
# Deve ser <2 segundos
```

### **Nível 4: Funcionalidades Críticas**

```bash
# 4.1 - Login (sem credenciais - deve retornar erro)
curl -s -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{}' | jq .
# Esperado: algum erro (não 500)

# 4.2 - Criar dispositivo (teste token)
curl -s -X POST http://localhost:3001/dispositivos/test-connection \
  -H "Content-Type: application/json" \
  -d '{"ip_address":"192.168.1.1","porta":80}' | jq .
# Esperado: { "success": false, "error": "..." }

# 4.3 - Supabase queries funcionando
curl -s http://localhost:3001/api/eventos \
  -H "Authorization: Bearer YOUR_TOKEN" | jq .
# Esperado: { "data": [...] } ou erro de auth (não 500)
```

### **Nível 5: Logs & Monitoramento**

```bash
# 5.1 - Ver últimas 100 linhas de cada container
echo "=== BACKEND ===" && docker logs a2-eventos-api --tail=100
echo "=== FRONTEND ===" && docker logs a2-eventos-web --tail=100
echo "=== NGINX ===" && docker logs nginx --tail=100

# 5.2 - Procurar por erros críticos
docker logs a2-eventos-api | grep -i "error\|failed\|critical"
docker logs a2-eventos-api | grep -i "connection refused"
docker logs a2-eventos-api | grep -i "timeout"

# 5.3 - Procurar por warnings
docker logs a2-eventos-api | grep -i "warn"

# 5.4 - Monitorar em tempo real
docker-compose logs -f --tail=20
# Pressione Ctrl+C para sair
```

### **Resultado Esperado**

```
✅ Todos containers em "Up" status
✅ curl http://localhost:3001/health = 200
✅ curl http://localhost:3000 = 200
✅ curl https://painel.nzt.app.br = 200/301
✅ curl Supabase API = 200
✅ Nenhum "error" nos logs
```

---

## 🔐 VARIÁVEIS DE AMBIENTE

**Arquivo:** `.env` (na raiz do projeto)

### **Obrigatórias - Supabase**

```bash
# Obtém em: https://supabase.io → Settings → API
SUPABASE_URL=https://[project-id].supabase.co
SUPABASE_ANON_KEY=eyJ...seu-token...

# Obtém em: https://supabase.io → Settings → Service Role Key
SUPABASE_SERVICE_ROLE_KEY=eyJ...service-role-token...
```

### **Obrigatórias - Domínio**

```bash
# Seu domínio (Cloudflare + Hostinger)
API_URL=https://painel.nzt.app.br
PUBLIC_API_HOST=painel.nzt.app.br
PUBLIC_API_PORT=443
SERVER_IP=painel.nzt.app.br
SERVER_PORT=443
```

### **Email - SMTP**

```bash
# Gmail (configure no painel depois)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_EMAIL=sistemaa2eventos@gmail.com
SMTP_USER=sistemaa2eventos@gmail.com
SMTP_PASS=<app-password-do-gmail>  # Gere em: myaccount.google.com → Security → App passwords
```

### **Node Environment**

```bash
NODE_ENV=production
PORT=3001
JWT_SECRET=sua-chave-secreta-aleatorios
LOG_LEVEL=info
```

### **Hardware/Intelbras**

```bash
INTELBRAS_DEFAULT_USER=admin
INTELBRAS_DEFAULT_PASS=admin123
HARDWARE_CALLBACK_PORT=443
```

---

## 🌐 SERVIÇOS EXTERNOS

### **1. Supabase (Banco de Dados)**

**Status:**
```bash
curl -s https://status.supabase.io/api/v2/components.json | \
  jq '.components[] | select(.name | contains("API")) | {name, status}'
```

**Verificações:**
- ✅ URL: https://[seu-projeto].supabase.co
- ✅ Auth habilitada
- ✅ Política RLS ativa
- ✅ Backup automático configurado
- ✅ API rates não atingidas

**Contato:** support@supabase.io

---

### **2. Cloudflare (DNS + CDN + SSL)**

**Verificações:**
```bash
# Verificar DNS
dig painel.nzt.app.br +short
# Deve retornar IP do Hostinger

# Verificar certificado SSL
openssl s_client -connect painel.nzt.app.br:443 -servername painel.nzt.app.br < /dev/null
# Issuer deve ser: Cloudflare Inc
```

**Configuração Necessária:**
- ✅ DNS A record → IP Hostinger
- ✅ SSL/TLS Mode: Full (não Flexible)
- ✅ Auto Https Rewrite: ON
- ✅ Always HTTPS: ON
- ✅ Cache: Bypass API routes

**Dashboard:** https://dash.cloudflare.com/

---

### **3. Hostinger (VPS)**

**Acesso:**
```bash
ssh -i ~/.ssh/id_rsa user@seu-ip-hostinger
# ou
ssh user@seu-ip-hostinger
# Senha: verificar no painel Hostinger
```

**Verificações:**
```bash
# Espaço em disco
df -h

# Uso de memória
free -h

# Processos
ps aux | grep docker

# Portas abertas
sudo netstat -tlnp

# UFW Firewall
sudo ufw status
```

**Configuração Necessária:**
- ✅ UFW libera: 22 (SSH), 80 (HTTP), 443 (HTTPS)
- ✅ Docker instalado
- ✅ Docker-compose instalado
- ✅ Espaço em disco: >20GB

**Dashboard:** https://hpanel.hostinger.com/

---

## 🆘 TROUBLESHOOTING

### **Erro 1: "Unable to connect to Docker daemon"**

```bash
# Solução: Iniciar Docker daemon
sudo systemctl start docker
# ou
sudo /Applications/Docker.app/Contents/MacOS/Docker &  # Mac
```

### **Erro 2: "Port 80 already in use"**

```bash
# Verificar o que está usando a porta
sudo lsof -i :80

# Liberar (matar processo)
sudo kill -9 <PID>

# ou mudar porta no docker-compose.yml
ports:
  - "8080:80"  # em vez de 80:80
```

### **Erro 3: "Cannot connect to Supabase"**

```bash
# Verificar credenciais
echo $SUPABASE_URL
echo $SUPABASE_ANON_KEY

# Testar conectividade
curl -s $SUPABASE_URL/rest/v1/ping

# Se tiver erro 401: atualizar SUPABASE_ANON_KEY no painel
# Se tiver erro 503: Supabase pode estar em manutenção
```

### **Erro 4: "502 Bad Gateway" no Nginx**

```bash
# Ver logs do Nginx
docker logs nginx --tail=50

# Verificar se backend está rodando
docker logs a2-eventos-api --tail=20
curl http://localhost:3001/health

# Reiniciar stack
docker-compose restart
```

### **Erro 5: "Timeout: Terminal não respondeu"**

```bash
# Aumentar timeout em device.controller.js
# Veja: linha 320, aumentar de 15000ms para 25000ms

# Ou verificar conectividade com dispositivo
ping 192.168.1.17
telnet 192.168.1.17 80
```

### **Erro 6: "Supabase URL or Anon Key missing"**

```bash
# Verificar .env
cat .env | grep SUPABASE

# Se vazio, adicionar (copiar de Supabase Dashboard)
# Reconstruir containers para aplicar
docker-compose build --no-cache && docker-compose up -d
```

### **Erro 7: "CORS error no frontend"**

```bash
# Verificar se API_URL está correto no frontend
# Arquivo: a2-eventos/frontend/web-admin/src/services/api.js

# Ou verificar CORS no backend
# Arquivo: a2-eventos/backend/api-nodejs/src/app.js

# Depois rebuildar frontend
docker-compose build a2-eventos-web --no-cache
docker-compose up -d
```

---

## 📊 REFERÊNCIA RÁPIDA

### **Comandos Mais Usados**

```bash
# Iniciar
docker-compose up -d

# Parar
docker-compose down

# Ver logs (tempo real)
docker-compose logs -f

# Rebuildar
docker-compose build --no-cache

# Executar comando em container
docker-compose exec a2-eventos-api npm test

# Ver status
docker-compose ps

# Limpar sistema
docker system prune -af
```

### **URLs Importantes**

| Serviço | URL | Notas |
|---------|-----|-------|
| Frontend | https://painel.nzt.app.br | Via Cloudflare |
| Backend | https://painel.nzt.app.br/api | Via Nginx proxy |
| Supabase | https://[project].supabase.co | Cloud |
| Intelbras | http://192.168.1.17 | Rede local |

### **Contatos & Suporte**

| Serviço | Contato |
|---------|---------|
| Supabase | support@supabase.io |
| Cloudflare | support@cloudflare.com |
| Hostinger | https://hpanel.hostinger.com/support |
| Intelbras | https://suporte.intelbras.com.br |

---

## 📝 HISTORICO DE DEPLOYMENTS

**Registre cada deploy aqui:**

```
2026-04-23 - Deploy #42
├─ Mudanças: Timeout dispositivo 5s→15s, debug logging
├─ Status: ✅ OK
├─ Tempo: 20min
├─ Teste: Intelbras online mode funcionando
└─ Próximo: Registrar face no terminal

2026-04-22 - Deploy #41
├─ Mudanças: Fix SMTP verify endpoint
├─ Status: ✅ OK
├─ Tempo: 15min
└─ Teste: SMTP Gmail testando com sucesso
```

---

**Última verificação:** 2026-04-23  
**Próxima revisão:** Quando adicionar novos serviços externos
