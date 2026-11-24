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

### Situação em 2026-11-17 (revisão de VPS, GitHub e Supabase dos últimos 10 dias)

- **Código:** 46 commits entre 10/11 e 12/11; nenhum commit depois de 5e6b336 (12/11 00:16). Local, origin e VPS no mesmo commit.
- **VPS:** /root/Projeto_A2_Eventos em 5e6b336; 6 containers healthy (gateway, admin_web, portal, api,
  api_intelbras há 5 dias; redis há 2 semanas); /health ok, banco conectado; disco 11% de 96 GB, RAM 1,3/7,8 GB.
  Nos logs dos últimos 5 dias não há erros, só avisos: agente "PC IA Facial do Evento" e "SERVIDOR A2" (IA central)
  caindo e voltando várias vezes por dia, e timeout em vigilancia_configurar (agente desligado).
- **Supabase:** as 7 migrations do período estão aplicadas (20261111_cameras_modos_gravacao, 20261111_pulseiras_fase_data,
  20261111c_sessao_cameras, 20261112_servidores_ia, 20261112b_operadores_eventos_permitidos,
  20261112c_pulseira_correcao_empresa, 20261112_arquitetura_ia_tres_modos). Eventos ativos: HISTÓRIAS CURITIBA (09/11),
  Evento de Teste (robôs), EVENTO GENÉRICO. Desde 07/11: 3 pessoas, 7 acessos, 1 evento e 1 empresa novos.
- **GitHub Actions:** o run 43096686493 (push de 053315f) está "queued" desde 11/11 e nunca rodou; o deploy foi feito
  pelo run manual 43098168407. Pode ser cancelado.
- **Pendências encontradas:**
  1. ~~O modo de IA "Central Remota / Fibra" (`direto_servidor`) só existe na tela~~ — RESOLVIDO no mesmo dia em
     f25ee11 (17/11 16:54): a nuvem envia as câmeras ao servidor central e o PC do evento não analisa nesse modo.
  2. Não verificados com pessoa real: quiosque bloqueado, câmera com IA vinculada à estação, 3 testes de pulseira.
  3. Local sem commit: scripts/ligar-ia-facial.ps1 apenas reformatado pelo editor (sem mudança de lógica) e scripts
     avulsos de diagnóstico (backend/api-nodejs/check_*/test_*/query_*, *.py, *.jpg na raiz), todos de abr–out/2026.

```
2026-11-24 - Deploy da4e092 (pulseira por lote, tipo de área, vigilância com CPF)
├─ Mudanças: pulseiraLote.js (outraPessoaNoLote, loteAtivoDaPulseira); bloqueioPorTipoArea para checkin/checkout;
│            type_pulseira_id como chave de lote; 8 testes novos (lote, áreas, watchlist, permissões);
│            checkAnyPermission() para testes multi-sessão; monitor/watchlist seguros por evento;
│            conteudoAjuda.js, useMonitor.js, Monitor.jsx atualizados; ia-servidor/package-lock.json
├─ Migrations: 20261119f_area_geral_livre.sql aplicada (tabela areas_tipo, 3 tipos padrão)
├─ Status: ✅ OK (GitHub Actions run 45425295015); painel 200, /api/ready 200, /api/checkin/stats/realtime 401 sem token
├─ Testes: backend 701 ✅ ; frontend build ✅ (Vite)
└─ Rollback: tag antes-deploy-20261124-pulseira-areas (da4e092)

2026-11-23 - Deploy f957895 (revisão de segurança, empresa/pessoa em vários eventos, relatórios, dependências)
├─ Mudanças: empresas limitadas ao evento (getById/update/delete/convite); admin não altera Admin Master;
│            /auth/users sem evento só vê o próprio perfil; LPR e Hikvision exigem token do dispositivo
│            (HIKVISION_PERMITIR_IP=true reativa por IP); sessão do operador usa o usuário logado; link público
│            mascara CPF/e-mail; fechar turno manual exige evento (antes fechava TODOS) + POST /eventos/:id/reset-manual;
│            /excel/import/pessoas, relatório diário (Cron) e seletor de áreas corrigidos; alias /api/pulseira removido;
│            /access/stats/realtime exige um módulo (dashboard/monitor/checkin/checkout/fiscalização);
│            buscarTodos com páginas em paralelo (150 mil registros: ~16-20 s → ~4-5 s); pagamento por CPF com a
│            pessoa em 2 eventos; express 4.22.3, uuid 11, mssql 12, react-router 7.18 (0 vulnerabilidades de produção)
├─ Migrations: 20261119g_tipo_area.sql (aplicada); 20261123_empresa_pessoa_varios_eventos.sql PENDENTE (usuária aplica)
├─ Status: ✅ OK (GitHub Actions run 45133849825); painel 200, /api/ready 200, rotas novas 401 sem login,
│          LPR sem token 401, Hikvision sem token 401, /api/pulseira 404
├─ Testes: backend 701 (estado do commit isolado: 566); navegador: login e redirecionamentos do React Router 7
└─ Rollback: tag antes-deploy-20261123-seguranca (f2f2b5d)
   Antes (mesmo dia): fd00f2c/f2f2b5d tipo de área + ficha no reconhecimento facial (rollback antes-deploy-20261123-tipo-area)

2026-11-19 - Deploy 09a7565 (Módulo de Produção v1.1 — tag producao-v1.1.0 + diagnóstico de voz na Central)
├─ Mudanças: ficha visual de materiais (até 6 fotos, assinatura visual HSV/bordas, cor, formato, composição e
│            palavras-chave IA); regras automáticas de ação no vídeo (contar entrada/saída, monitorar presença,
│            alertar divergência e saída indevida); rastreador real em vídeo gravado/câmera ao vivo com captura de
│            quadro-chave; PATCH /api/producao/materiais/:id e GET /api/producao/materiais/catalogo-visao
├─ Status: ✅ OK (GitHub Actions run 44635985641); /producao 200, /api/ready 200, /api/producao/materiais/catalogo-visao 401
├─ Versão: tag producao-v1.1.0 (09a7565)
└─ Rollback: tag antes-deploy-20261119-producao-v1.1 (181ce18)

2026-11-19 - Deploy d2a14f8 (Módulo de Produção v1 — tag producao-v1.0.0)
├─ Mudanças: módulo /producao (áreas, tarefas, plantas PDF/SVG/PNG com camadas e fases Montagem/Evento/Desmontagem,
│            Gantt, materiais, presença e relatórios PDF); portal isolado /portal-produtor (scrypt/JWT, sem conta NZT)
│            e modo celular PWA offline; + controle de reentrada por etapa e etiquetas no mesmo commit
├─ Migrations: 20261119b_modulo_producao.sql (23 tabelas, aplicada no Supabase)
├─ Status: ✅ OK (GitHub Actions run 44621979276); /producao e /portal-produtor 200, /api/ready 200, API /api/producao/* ativa
├─ Versão: tag producao-v1.0.0 (d2a14f8)
└─ Rollback: tag antes-deploy-20261119-producao-v1 (5a598dd)

2026-11-19 - Deploy 181ce18 (áudio da câmera na Central: faixas juntas no mesmo fluxo; botão Falar)
├─ Mudanças: central/central.js: vídeo e áudio num único MediaStream (antes uma faixa substituía a outra);
│            aviso "Sem som da câmera"; botão Falar (microfone do PC, sendrecv) com confirmação de alto-falante
├─ Agente: sem mudança de versão (a Central é lida do disco a cada pedido: basta recarregar a página)
├─ Status: ✅ OK (GitHub Actions run 44633085595); painel 200, API 401
├─ Testes: navegador com servidor simulado (botões e reconexão com áudio); som e alto-falante com câmera real NÃO testados
└─ Rollback: tag antes-deploy-20261119-audio (ed09115)

2026-11-19 - Deploy ed09115 (desligar o motor de IA pelo painel; tarefa NZT-IA-Facial sem administrador)
├─ Mudanças: scripts/ligar-ia-facial.ps1: tarefa com RunLevel Limited (antes Highest: motor elevado não era encerrável);
│            parar-motor confere e sai com código 2 se não encerrar; agent.js registra o erro
├─ Ação do usuário: 1x, como administrador, `ligar-ia-facial.bat instalar-tarefa`; depois reiniciar o PC
├─ Status: ✅ OK (GitHub Actions run 44630143285); painel 200
└─ Rollback: tag antes-deploy-20261119-motor-desligar (4b35545)

2026-11-19 - Deploy 4b35545 (giro e som na Central de Monitoramento; avisos do retransmissor)
├─ Mudanças: Central (agent-local/central): tela grande com setas/zoom/posições (POST /central/api/camera/:id/ptz)
│            e botão "Ouvir" (áudio via WebRTC; go2rtc converte o áudio do principal para Opus);
│            vigilância envia ptz {ip, porta} por câmera; video.js avisa "porta 1984 em uso por outro programa";
│            ligar-ia-facial.ps1 avisa go2rtc/agente estranho ou sem permissão de leitura
├─ Agente: 3.3.0 — PC do evento roda ligar-ia-facial.bat (sem "como administrador")
├─ Status: ✅ OK (GitHub Actions run 44628572846); painel 200, API 401
├─ Testes: agente 19 (3 novos); backend 632 (suíte completa verde); Central testada no navegador com servidor simulado
│          (setas, posições, áudio pede faixa de áudio). Som com câmera real NÃO testado.
└─ Rollback: tag antes-deploy-20261119-central-ptz (5a598dd)

2026-11-19 - Deploy 5a598dd (giro ONVIF, visão noturna)
├─ Mudanças: câmera com giro (cameras_ip.ptz_ativo/ptz_porta, porta ONVIF 2020); PainelGiro na tela grande do Monitor
│            (setas que seguem enquanto apertadas, zoom, velocidade, posições salvas); POST /api/cameras/:id/ptz;
│            GET /api/cameras/:id/ptz/presets; Diagnosticar confere o giro; selo "Visão noturna" (useVisaoNoturna.js)
├─ Migrations: 20261119e_cameras_ptz.sql aplicada pela usuária em 19/11 (antes do teste com a MC210, firmware 1.4.5)
├─ Agente: 3.2.0 (comando http aceita POST) — PC do evento precisa de ligar-ia-facial.bat
├─ Status: ✅ OK (GitHub Actions run 44619992829); painel 200, rotas novas 401 sem login
├─ Testes: 11 novos (onvif/ptz, sem câmera real); lint e build ok; setas testadas no navegador com API simulada
│          5 suítes de pulseira/permissão falham desde antes: dependem de checkAnyPermission em auth.js (trabalho sem commit)
└─ Rollback: tag antes-deploy-20261119-ptz (ccb4190)
   Pendente: Fase 3 (seguir pessoa automaticamente) e forçar dia/noite — aguardam teste com a MC210 real.

2026-11-19 - Deploy ccb4190 (manual de equipamentos dentro do painel)
├─ Mudanças: página /manual-equipamentos (índice, busca, imprimir), botão "Manual" em Dispositivos e Câmeras;
│            manual agora em frontend/web-admin/src/conteudo/MANUAL_EQUIPAMENTOS.md (docs/ só aponta para lá)
├─ Status: ✅ OK (GitHub Actions run 44605166946); /manual-equipamentos 200, página no bundle
└─ Rollback: tag antes-deploy-20261119-manual (803d31d)

2026-11-19 - Deploy 803d31d (chave da Central pelo painel)
├─ Mudanças: Agentes locais > Central: "Mostrar chave" e "Gerar nova chave" (derruba as entradas abertas);
│            POST /api/agentes/:id/central/chave (só admin, auditado, sem cache)
├─ Status: ✅ OK (GitHub Actions run 44602075902); painel 200, rota nova 401 sem login
└─ Rollback: tag antes-deploy-20261119-central-chave (3d7637c)

2026-11-19 - Deploy 3d7637c (Central: quem abre escolhido no painel)
├─ Mudanças: Agentes locais > botão "Central": só este PC / rede local / Tailscale, aplicado sem reiniciar,
│            gravado no PC (backend/agent-local/.central-acesso.json); .env antigo vale sem escolha no painel;
│            GET/PUT /api/agentes/:id/central (troca só admin, auditada)
├─ Agente: precisa de ligar-ia-facial.bat no PC do evento (agente antigo: botão desativado)
├─ Status: ✅ OK (GitHub Actions run 44589766281); painel 200, rota nova 401 sem login
├─ Testes: agente 15 (2 novos, troca real de servidor); backend 339; tela com API simulada
└─ Rollback: tag antes-deploy-20261119-central-acesso (de2b8df)

2026-11-19 - Deploy de2b8df (Diagnosticar câmera + Testar rede do evento)
├─ Mudanças: "Diagnosticar" da câmera (cameraDiagnostico.service.js: cadastro, PC do evento, retransmissor,
│            ping/porta, imagem, miniatura, IA, gravação) em Configurações > Câmeras e Gerenciar câmeras;
│            cartão "Testar rede do evento" em Dispositivos (POST /api/agentes/rede-testar, ping + até 10 portas)
├─ Agente: 3.1.0 com comando rede_testar — PC do evento precisa rodar ligar-ia-facial.bat; agente antigo
│          responde "versão antiga" no teste de rede (o resto do diagnóstico funciona)
├─ Status: ✅ OK (GitHub Actions run 44587748062); painel 200, rotas novas 401 sem login
├─ Testes: 339 do backend (11 novos); telas testadas no navegador com API simulada; sem câmera real
└─ Rollback: tag antes-deploy-20261119-diag-camera (43bf6ed)

2026-11-19 - Deploy 903c5f8 (empresa bloqueada nos leitores, endereço dos leitores no painel, esvaziar leitor)
├─ Mudanças: empresa com ativo=false suspende os funcionários nos leitores (gatilho na fila); cartão
│            "Endereço do servidor para os leitores" por evento + padrão (Config online em branco usa o salvo);
│            botão "Esvaziar leitor" (admin, fim do evento) — leitor esvaziado não recebe ninguém até um Sync
├─ Migrations: 20261119d_fila_sync_empresa.sql PENDENTE (usuária aplica; precisa da 20261119_fila_sync_leitores)
├─ Status: ✅ OK (GitHub Actions run 44553264913); painel 200, /api/pessoas 401, rota nova 401 sem login
├─ Testes: 325 do backend; tela testada no navegador com API simulada; NÃO testado com leitor real
└─ Rollback: tag antes-deploy-20261119-empresa-leitores (6511e4d)

2026-11-19 - Deploys do dia anterior a 903c5f8 (mesma sessão): 77aa7b6 Central de Monitoramento local,
│            c687206 IA no sub-stream, deb557a fila no banco para os leitores (20261119_fila_sync_leitores.sql),
│            0774798 bloqueado fica suspenso no leitor + docs/MANUAL_EQUIPAMENTOS.md,
│            6511e4d Diagnosticar leitor + modelos de câmera (20261119b_modelos_camera.sql). Migrations aplicadas.
└─ Rollback: tags antes-deploy-20261118-central, antes-deploy-20261119-fase1, -fila-leitores, -suspensao, -modelos

2026-11-12 - Deploy 5e6b336 (3 modos de IA do evento: local, híbrido e central remota)
├─ Mudanças: SeletorArquiteturaIa.jsx (cards com cenário, vantagens, requisitos e passos) na barra de câmeras do
│            evento; ia_onde aceita 'direto_servidor'; voltar para 'local' libera o evento no servidor central
├─ Migrations: 20261112_arquitetura_ia_tres_modos.sql (aplicada; conferido em 17/11)
├─ Status: ✅ OK (GitHub Actions run 43147230217)
├─ Atenção: 'direto_servidor' passou a funcionar em f25ee11 (17/11)
├─ Rollback: tag antes-deploy-20261111j (d5edb1f)
└─ Próximo: implementar o modo central remota de verdade ou esconder o card até lá

2026-11-12 - Deploy d5edb1f (tarefa agendada do motor de IA no Windows)
├─ Mudanças: ligar-ia-facial.ps1 com Register-ScheduledTask compatível e reserva via schtasks
├─ Status: ✅ OK (GitHub Actions run 43130199920); só script do PC do evento, nada muda na VPS
└─ Rollback: commit anterior 26732c8

2026-11-12 - Deploy 26732c8 (idiomas, SMTP e segredos só para admin_master)
├─ Mudanças: I18nextProvider na raiz, ConfigIdiomas com cards e troca automática de idioma (26732c8); teste de
│            SMTP aceita senha vazia e usa a gravada (a553e1d); senhas e tokens das configurações visíveis e
│            editáveis só pelo admin_master (c78234f)
├─ Status: ✅ OK (GitHub Actions run 43111691512)
└─ Rollback: tag antes-deploy-20261111i (c78234f) ou commit 19b5e23

2026-11-12 - Deploy 19b5e23 (configurações: segredos não voltam ao navegador)
├─ Mudanças: settings.controller não devolve segredos; telas de Câmeras, Comunicação, Cron e Webhooks salvam só o
│            campo alterado, pedem confirmação e mostram o erro
├─ Status: ✅ OK (GitHub Actions run 43109551454)
└─ Rollback: commit anterior 6ef973d

2026-11-12 - Deploy 6ef973d (idiomas + corrigir pulseira no check-in)
├─ Mudanças: motor de idiomas ligado (pt-BR, en, es, de) em dashboard, menu, operador e login (6ef973d);
│            AcoesPulseiraCheckin.jsx na tela de check-in: trocar número, desfazer lançamento errado, marcar
│            devolvida ou perdida (5db36d7)
├─ Status: ✅ OK (GitHub Actions run 43108453962)
└─ Rollback: tag antes-deploy-20261111h (94820d1)

2026-11-12 - Deploy 94820d1 (fiscalização: horário do check-in sem 3 h de diferença)
├─ Mudanças: Fiscalizacao.jsx lê o horário do check-in como UTC
├─ Status: ✅ OK (GitHub Actions run 43103212211)
└─ Rollback: commit anterior 053315f

2026-11-12 - Deploy 053315f (pulseiras: desfazer lançamento errado; empresa da época nos relatórios)
├─ Mudanças: RPC anular_ultimo_lancamento_pulseira (restaura a pulseira anterior com a mesma hora de entrada ou
│            desfaz perdida/devolvida); pulseira anulada não bloqueia o número; histórico de troca de empresa
│            (pessoa_empresa_historico) usado em acessos, vínculos e relatórios (ponto, resumo, fechamento, logs,
│            estatísticas); troca de lote tira as áreas exclusivas do lote antigo; credenciamento mostra erro ao gravar
├─ Migrations: 20261112c_pulseira_correcao_empresa.sql (aplicada pela usuária antes)
├─ Status: ✅ OK (run manual 43098168407, 15 min; o run de push 43096686493 ficou preso em "queued")
├─ Testes: turnosEmpresa.test.js novo
└─ Rollback: commit anterior 5aae9a1 (b71d30d)

2026-11-12 - Deploy b71d30d (editor de crachás: seleção por área, grupos, escala em bloco, arte como camada e grade visível)
├─ Mudanças: seleção por área arrastando o mouse (marquee), alças e botões de escala em bloco (-10%/+10%),
│            agrupamento com Ctrl+G/Ctrl+Shift+G e Z-Index contíguo, exclusão em lote com Delete, arte do
│            evento como camada com Z-Index real (trazer para frente, enviar para trás), filtro na impressão
│            física e modal de credenciamento para "Só referência", grade visível com 4 cores/intensidade,
│            e layout do editor reorganizado em 3 janelas padrão NZT
├─ Status: ✅ OK (GitHub Actions run 43091066819); /health 200, banco conectado, painel 200
├─ Testes: 6 testes unitários em camadas.test.mjs passaram; Jest do backend 15 suítes / 58 testes OK
├─ Rollback: tag antes-deploy-20261111-etiquetas-editor-v2 (1234b64)
└─ Próximo: testar fluxo completo com arte de cliente real e crachás pré-impressos no credenciamento

2026-11-12 - Deploy 8941cf5 (modo de tela: normal, tela cheia, quiosque bloqueado)
├─ Mudanças: Usuários > "Modo de tela"; quiosque bloqueado restringe à página escolhida e exige senha de
│            administrador ou supervisor para sair (POST /api/auth/quiosque/desbloquear, sem criar sessão);
│            o botão de sair do check-in respeita o bloqueio; Admin Master nunca fica restrito
├─ Status: ✅ OK (GitHub Actions run 43088982000); /health 200, banco conectado, painel 200, rota 400 sem dados
├─ Teste: NÃO verificado com operador real nesta sessão (fluxo de bloqueio e desbloqueio com senha)
├─ Rollback: tag antes-deploy-20261112f (f7394b7)
└─ Próximo: testar um operador em quiosque; depois, quiosque com bloqueio em Monitor e Câmeras já cobertos (página)

2026-11-12 - Deploy f7394b7 (página inicial escolhida por quem administra)
├─ Mudanças: Usuários > "Página inicial ao entrar" (vazio = primeira página permitida); a escolha só vale
│            se o usuário ainda tem acesso à página; sem migration
├─ Status: ✅ OK (GitHub Actions run 43087119496); /health 200, banco conectado, painel 200
├─ Rollback: tag antes-deploy-20261112e (c009bb4)
└─ Próximo: etapa 3 (quiosque com bloqueio em Check-in, Check-out, Monitor e Câmeras)

2026-11-12 - Deploy 40cdccd (acesso: operador só opera os eventos da lista; dashboard opcional)
├─ Mudanças: operador só troca entre eventos da sua lista (supervisor global mantém todos; admin inalterado);
│            dashboard deixa de ser obrigatório (padrão desligado para operador novo); página "/" sem
│            dashboard leva à primeira página permitida
├─ Migrations: 20261112b_operadores_eventos_permitidos.sql (aplicada pela usuária antes do deploy)
├─ Status: ✅ OK (GitHub Actions run 43084748734); /health 200, banco conectado, rota protegida 401
├─ Testes: 58 testes do backend passam (6 novos de permissão de evento)
├─ Rollback: tag antes-deploy-20261112d (2b853b7)
└─ Próximo: etapa 2 (página inicial escolhida por quem administra) e etapa 3 (quiosque com bloqueio)

2026-11-12 - Deploy 2b853b7 (motor de IA sob demanda + servidor de IA central)
├─ Mudanças: motor do PC do evento liga só com câmera em IA ou leitor com confirmação da IA
│            (interruptor do painel continua mandando); servidor de IA central em backend/ia-servidor
│            (ligar-servidor-ia.bat); escolha "Onde roda o reconhecimento" por evento
├─ Migrations: 20261112_servidores_ia.sql (aplicada pela usuária antes)
├─ Status: ✅ OK (GitHub Actions run 43057206758); /health 200, banco conectado
├─ Rollback: tag antes-deploy-20261112b (b7617ed)
└─ Próximo: PC do evento precisa do ligar-ia-facial.bat para pegar o agente novo; teste com câmera real

2026-11-11 - Deploy b43ba55 (pulseiras: janelas de uso, fase e devolução; crachás)
├─ Mudanças: lote de pulseira só vale na fase/data/horário do momento (novo loteSelecao.js; janela que vira
│            a noite); fora disso check-in e credenciamento respondem 403; "Marcar como Devolvida" no
│            credenciamento corrigido (rota /pulseiras/encerrar); lote com fase/horário sem a migration
│            responde 409 (sem gravar em silêncio); notas_auditoria saiu do link público da empresa;
│            ingresso de mídia do rate limiter com assinatura conferida; duplicidade sem maybeSingle;
│            editor visual de crachás (ConfigEtiquetas)
│            (o commit já estava no origin quando foi feita a revisão; a mensagem não descreve tudo)
├─ Migrations: 20261111_pulseiras_fase_data.sql (aplicada pela usuária depois do deploy, antes do teste)
├─ Status: ✅ OK (GitHub Actions run 43032376325, "Deploy Automático")
├─ Teste: NÃO verificado nesta sessão. painel.nzt.app.br/health devolve a página do painel e /api/health dá 404;
│          conferir "database connected" e as rotas de pulseira nos logs do container a2-eventos-api
├─ Rollback: tag antes-deploy-20261111g (1e1db48)
└─ Próximo: rodar os 3 testes de pulseira (janela, devolução, lotes sobrepostos) antes do evento

2026-11-11 - Deploy 8d56b76 (estação por câmera com IA, sem leitor)
├─ Mudanças: janela da estação (check-in/check-out) escolhe leitor (opcional) e/ou câmeras com IA;
│            sessoes_operador.camera_ids; câmera reconhece → conferência/saída na estação;
│            estação ativa filtrada pelo evento em foco (estação antiga de outro evento quebrava o vínculo)
│            (a parte principal saiu junto no commit c69702c da outra sessão, pulseiras)
├─ Migrations: 20261111c_sessao_cameras.sql (aplicada pela usuária antes)
├─ Status: ✅ OK (GitHub Actions run 43027395448)
├─ Teste: /health 200 (uptime 31 s), sessao/ativa 401 sem login; sem teste com câmera real
├─ Rollback: tag antes-deploy-20261111f (419a75a); antes de c69702c: antes-deploy-20261111e (1bb3314)
└─ Próximo: vincular Webcam PC Local na Baia 01 e testar com pessoa cadastrada

2026-11-11 - Deploy 3f75232 (câmeras com IA vinculadas à estação de check-in/check-out)
├─ Mudanças: câmera com IA reconhecida avisa as estações vinculadas (config.cameras_vinculadas
│            do dispositivo) pelo mesmo evento credenciamento_abrir do leitor; repete no máx. 1x/20 s
├─ Status: ✅ OK (GitHub Actions run 43021383533; "Deploy para VPS" não confirmado pelo log)
├─ Teste: /health 200 (uptime 42 s, banco conectado), rotas novas 401 sem login; sem teste com câmera real
├─ Rollback: tag antes-deploy-20261111c (7a83205)
└─ Próximo: testar com câmera IA + estação vinculada antes de usar em portaria

2026-11-11 - Deploy 29fd7f1 (webcam pelo retransmissor)
├─ Mudanças: webcam USB / OBS local fechado via go2rtc (H.264, teto ~0,9 Mbit/s); go2rtc chama
│            ffmpeg pelo PATH (caminho com espaço quebrava foto/reserva); fecha filhos ao parar
├─ Status: ✅ OK (GitHub Actions run 42978325639)
├─ Teste: /health 200 (uptime 42 s), rotas novas 401 sem login; webcam testada no PC local
├─ Rollback: tag antes-deploy-20261111b (bb678ec)
└─ Próximo: rodar ligar-ia-facial.bat no PC do evento para o agente pegar a versão nova

2026-11-11 - Deploy be7de3a (câmeras sob demanda)
├─ Mudanças: vídeo das câmeras via go2rtc no agente (sem motor de IA), IA por câmera
│            (só monitorar / ao assistir / 24 h), chave do motor por evento, gravação local
│            no PC do evento, leitor + confirmação 1:1 da IA, leitor como câmera; motor só em
│            127.0.0.1 com chave interna, biometria via API (sem service role no PC), ingresso
│            de vídeo de 2 min no lugar do token na URL
├─ Migrations: 20261111_cameras_modos_gravacao.sql PENDENTE (usuária aplica no Supabase;
│              código funciona sem ela; cria índice em pessoas → fora do horário de evento)
├─ Status: ✅ OK (GitHub Actions run 42974560986; 1ª tentativa SSH timeout, rerun ok)
├─ Teste: /health 200 (database connected), rotas novas 401 sem login, painel 200
├─ Rollback: tag antes-deploy-20261111 (d23719e)
└─ Próximo: aplicar migration; no PC do evento rodar ligar-ia-facial.bat (baixa go2rtc/ffmpeg
            com SHA-256 e reinicia motor e agente na versão nova)

2026-10-30 - Deploy 23ff24f (relatórios, etapas 1–5)
├─ Mudanças: Excel das abas, aba Ponto, diárias/fechamento por regra de remuneração,
│            histórico de pulseiras, Dashboard "operação de hoje" (fluxo, lotação, alertas)
├─ Migrations: regras de remuneração + 20261030_historico_pulseiras.sql (aplicadas antes)
├─ Status: ✅ OK (GitHub Actions run 41083746108, deploy.sh quick)
├─ Tempo: ~2min
├─ Teste: 6 containers healthy, rotas novas 401 sem login, dados reais lidos no container
├─ Rollback: tag antes-deploy-20261030 (859c57f) + imagens :859c57f na VPS
└─ Próximo: cadastrar regras de remuneração; conferir 2 leitores offline

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

**Última verificação:** 2026-11-17  
**Próxima revisão:** Quando adicionar novos serviços externos
