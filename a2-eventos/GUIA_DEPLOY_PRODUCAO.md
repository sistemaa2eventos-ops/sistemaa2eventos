# 🚀 GUIA COMPLETO DE DEPLOY EM PRODUÇÃO
**A2 Eventos — Sistema de Controle de Acesso Biométrico**

---

## 📌 PRÉ-REQUISITOS

### Hardware Mínimo
- **CPU**: 4 cores
- **RAM**: 8GB
- **Disco**: 50GB SSD
- **Conexão**: 100Mbps

### Software Obrigatório
- **Docker**: v29+ (testado em 29.3.1)
- **Docker Compose**: v2+
- **Git**: v2.40+
- **OpenSSL**: (incluído em Linux/Mac, instalado no Docker)

### Contas e Serviços
- ✅ **Supabase**: Projeto ativo com JWT secret
- ✅ **Cloudflare**: Conta com domínio apontado
- ✅ **Gmail**: Conta com App Password para SMTP
- ✅ **Servidor**: VPS ou máquina física com Docker

---

## 🔧 PASSO 1: Preparar o Servidor

### 1.1 Instalar Docker (Linux)
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y docker.io docker-compose
sudo usermod -aG docker $USER
newgrp docker

# Verificar
docker --version
docker-compose --version
```

### 1.2 Instalar Docker (Windows/Mac)
- Baixar: https://www.docker.com/products/docker-desktop
- Instalar e iniciar Docker Desktop
- Verificar: `docker ps`

### 1.3 Clonar o Repositório
```bash
git clone https://github.com/sistemaa2eventos-ops/sistemaa2eventos.git
cd sistemaa2eventos/a2-eventos
```

---

## 🔐 PASSO 2: Configurar Secrets e Certificados

### 2.1 Obter Certificados SSL (Cloudflare)
```bash
# Acesse: https://dash.cloudflare.com/
# Domínio → SSL/TLS → Origin Server → Create Certificate

# Copiar para servidor
mkdir -p backend/api-nodejs/src/certs
# Salvar como:
# - origin.pem (certificate)
# - origin.key (private key)

# Verificar permissões
chmod 600 backend/api-nodejs/src/certs/*
ls -la backend/api-nodejs/src/certs/
```

### 2.2 Criar .env.local (Secrets)
```bash
# Não commit este arquivo!
# Recomendado: usar variáveis de ambiente em produção

cat > .env.local << 'EOF'
# Secrets — NÃO COMMITTAR
JWT_SECRET=seu_jwt_secret_256bits_aleatorio
INTERNAL_API_KEY=seu_api_key_aleatorio
SMTP_PASS=seu_gmail_app_password

# Supabase (obrigatory)
SUPABASE_URL=https://zznrgwytywgjsjqdjfxn.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
EOF

chmod 600 .env.local
```

### 2.3 Gerar JWT Secret (se não tiver)
```bash
# Gerar string aleatória de 256 bits
openssl rand -base64 32
# Resultado: use como JWT_SECRET
```

---

## 🌐 PASSO 3: Configurar DNS

### 3.1 Apontar Domínios para o Servidor
```
No provedor de domínio (Cloudflare, GoDaddy, etc):

painel.nzt.app.br    → <SEU_IP_SERVIDOR>  (A record)
api.nzt.app.br       → <SEU_IP_SERVIDOR>  (A record)
cadastro.nzt.app.br  → <SEU_IP_SERVIDOR>  (A record)
```

### 3.2 Verificar DNS (aguardar propagação)
```bash
# Pode levar até 24h
nslookup painel.nzt.app.br
# Deve retornar seu IP
```

---

## 📦 PASSO 4: Fazer Build das Imagens Docker

### 4.1 Build Completo
```bash
cd /caminho/para/a2-eventos

# Build de todas as imagens
docker-compose build

# Ou build específico
docker-compose build api
docker-compose build gateway
docker-compose build admin-web
```

### 4.2 Verificar Build
```bash
docker images | grep a2-eventos
# Deve listar:
# - a2-eventos-api
# - a2-eventos-gateway
# - a2-eventos-admin-web
# - a2-eventos-cadastro-web
# - a2-eventos-ai_worker
```

---

## 🚀 PASSO 5: Iniciar os Serviços

### 5.1 Subir os Containers
```bash
# Iniciar em background
docker-compose up -d

# Acompanhar logs em tempo real
docker-compose logs -f
```

### 5.2 Aguardar Health Checks
```bash
# Verificar status
docker-compose ps

# Deve mostrar:
# STATUS: Up (healthy) para todos

# Ou acompanhar health checks
watch -n 5 'docker-compose ps'
```

### 5.3 Teste de Conectividade
```bash
# Aguardar 30-60 segundos para startup completo

# Testar cada serviço
curl http://localhost:3001/health
# Esperado: {"status":"ok"}

curl https://painel.nzt.app.br/
# Esperado: HTML do painel (pode ter warning SSL em primeiro acesso)

curl https://api.nzt.app.br/health
# Esperado: {"status":"ok"}
```

---

## ✅ PASSO 6: Validar Deployment

### 6.1 Checklist de Health
```bash
# Todos os containers rodando?
docker-compose ps
# Status esperado: Up (healthy)

# APIs respondendo?
curl -v https://painel.nzt.app.br 2>&1 | grep "< HTTP"
curl -v https://api.nzt.app.br/health 2>&1 | grep "< HTTP"

# Redis conectado?
docker exec a2_eventos_api redis-cli -h redis ping
# Resposta: PONG

# PostgreSQL conectado?
docker logs a2_eventos_postgres_edge 2>&1 | grep "ready to accept"

# Nginx gateway OK?
docker exec a2_eventos_gateway nginx -t
# Resposta: successful
```

### 6.2 Teste de Funcionalidade
```bash
# 1. Acessar painel
https://painel.nzt.app.br
# Esperado: Tela de login

# 2. Fazer login (credenciais de teste)
# Email: admin@test.com
# Senha: (conforme definido em .env)

# 3. Acessar portal de cadastro
https://cadastro.nzt.app.br
# Esperado: Formulário de cadastro

# 4. Testar API directly
curl -H "Authorization: Bearer <SEU_JWT>" \
  https://api.nzt.app.br/api/eventos
# Esperado: JSON com lista de eventos
```

---

## 📊 PASSO 7: Monitoramento e Logs

### 7.1 Ver Logs de um Serviço
```bash
# API
docker-compose logs -f api

# Gateway
docker-compose logs -f gateway

# Frontend
docker-compose logs -f admin-web

# Python AI Worker
docker-compose logs -f ai_worker

# Últimas 100 linhas
docker-compose logs --tail 100 api
```

### 7.2 Verificar Uso de Recursos
```bash
# CPU, Memória, I/O
docker stats

# Ou monitore um container específico
docker stats a2_eventos_api
```

### 7.3 Backup do Banco de Dados
```bash
# Dump do PostgreSQL
docker exec a2_eventos_postgres_edge pg_dump -U a2_edge_user -d a2_edge_db > backup_$(date +%Y%m%d_%H%M%S).sql

# Backup do Redis
docker exec a2_eventos_redis redis-cli BGSAVE
docker exec a2_eventos_redis redis-cli LASTSAVE
```

---

## 🔄 PASSO 8: Atualizar Código em Produção

### 8.1 Puil Nova Versão
```bash
git pull origin master

# Rebuild de imagens afetadas
docker-compose build --no-cache api
docker-compose build --no-cache admin-web

# Restart dos containers
docker-compose up -d

# Verificar rollout
docker-compose logs -f api
```

### 8.2 Rollback (Se Necessário)
```bash
# Ver versão anterior
git log --oneline | head -5

# Reverter para commit anterior
git checkout <commit-hash>

# Rebuild e restart
docker-compose build
docker-compose up -d
```

---

## 🆘 TROUBLESHOOTING

### Problema: "Connection refused"
```bash
# Causa: Gateway não está pronto
# Solução:
docker-compose logs gateway
docker-compose restart gateway

# Aguardar 10s e tentar novamente
sleep 10 && curl https://painel.nzt.app.br/
```

### Problema: "502 Bad Gateway"
```bash
# Causa: API backend não respondendo
# Solução:
docker-compose logs api
docker-compose restart api

# Verificar health endpoint
curl http://localhost:3001/health
```

### Problema: "SSL certificate problem"
```bash
# Causa: Certificados não encontrados
# Solução:
ls -la backend/api-nodejs/src/certs/
# Deve ter: origin.pem e origin.key

# Se faltarem, gateway gera auto-assinados (fallback)
docker logs a2_eventos_gateway | grep -i certificate
```

### Problema: "Out of memory"
```bash
# Causa: Container sem limite de RAM
# Solução: Aumentar limite no docker-compose.yml
# ou reduzir batch size em .env

# Verificar
docker stats a2_eventos_ai_worker
# Se > 2GB, aumentar swap ou reduzir limite

# Reiniciar worker
docker-compose restart ai_worker
```

### Problema: "Database connection timeout"
```bash
# Causa: PostgreSQL não pronto
# Solução:
docker-compose logs postgres_edge | grep "ready to accept"

# Reiniciar
docker-compose down postgres_edge
docker-compose up -d postgres_edge
docker-compose restart api
```

---

## 🔒 PASSO 9: Hardening de Segurança (DEPOIS DO DEPLOY)

### 9.1 Adicionar HSTS Header
```nginx
# gateway/nginx.conf, na seção http {}
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
```

### 9.2 Adicionar Rate Limiting
```nginx
# gateway/nginx.conf, na seção http {}
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;

# Depois na seção server {} para /api/
location /api/ {
    limit_req zone=api burst=20 nodelay;
    # ... resto do config
}
```

### 9.3 Adicionar CSP Header
```nginx
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';" always;
```

### 9.4 Restart Gateway
```bash
docker-compose build gateway
docker-compose up -d gateway
```

---

## 📈 PASSO 10: Monitoramento Contínuo

### 10.1 Setup Alertas (Opcional)
```bash
# Monitorar container crashes
watch -n 30 'docker-compose ps | grep -v "Up (healthy)"'

# Monitorar disco cheio
df -h / | tail -1

# Monitorar logs de erro
docker-compose logs --tail 1000 2>&1 | grep -i error | tail -20
```

### 10.2 Backup Automático
```bash
# Cron job para backup diário (às 2am)
0 2 * * * docker exec a2_eventos_postgres_edge pg_dump -U a2_edge_user -d a2_edge_db > /backups/db_$(date +\%Y\%m\%d).sql
```

### 10.3 Logs Centralizados (Recomendado)
```bash
# Integrar com ELK Stack, Datadog, New Relic, etc
# Ou simples: Enviar logs para arquivo externo

# Ver logs de todos os containers
docker-compose logs --timestamps --follow
```

---

## 🎊 SUCESSO!

Se chegou aqui, seu sistema A2 Eventos está:

✅ **RODANDO EM PRODUÇÃO**
✅ **ACESSÍVEL VIA HTTPS**
✅ **COM TODOS OS SERVIÇOS SAUDÁVEIS**
✅ **PRONTO PARA RECEBER USUÁRIOS**

---

## 📞 SUPPORT RÁPIDO

### Reiniciar Tudo
```bash
docker-compose down
docker-compose up -d
docker-compose logs -f
```

### Limpar Dados (CUIDADO!)
```bash
docker-compose down -v  # Remove volumes também
docker-compose up -d    # Recria banco vazio
```

### Ver Todos os Logs
```bash
docker-compose logs --timestamps --all
```

---

## 📚 Referências
- Docker Docs: https://docs.docker.com/compose/
- Nginx Docs: https://nginx.org/en/docs/
- Supabase Docs: https://supabase.com/docs
- Cloudflare SSL: https://developers.cloudflare.com/ssl/

---

**Versão:** 1.0  
**Data:** 16 de Abril de 2026  
**Status:** Production Ready
