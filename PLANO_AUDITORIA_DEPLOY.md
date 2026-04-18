# 🚨 PLANO DE AÇÃO PRÉ-DEPLOY - Auditoria Completa

**Status Geral:** ❌ NÃO PRONTO PARA PRODUÇÃO  
**Data:** 18 de Abril de 2026  
**Problemas Identificados:** 17 (4 Críticos, 8 Altos, 5 Médios)

---

## 🔴 FASE 1: CRÍTICO (HOJE - NÃO DEPLOY ATÉ CONCLUIR)

### ❌ CRÍTICO #1: Chaves Supabase Comprometidas

**Problema:** As seguintes credenciais estão expostas no repositório Git:
- Supabase ANON_KEY
- Supabase SERVICE_ROLE_KEY  
- Supabase JWT_SECRET
- Email SMTP credentials
- JWT_SECRET da aplicação
- SQL Server credentials
- Hardware admin credentials

**Risco:** Qualquer pessoa com acesso ao repo pode:
- Acessar todos os dados do Supabase
- Fazer requisições como usuário anônimo
- Enviar emails falsificados
- Acessar SQL Server diretamente
- Controlar dispositivos Intelbras

### ✅ Solução (IMEDIATO):

**Passo 1: Revogar Chaves no Supabase**
```
1. Acesse: https://supabase.com/dashboard
2. Selecione projeto: zznrgwytywgjsjqdjfxn
3. Settings → API Keys
4. Clique em 🗑️ para cada key existente
5. Aguarde ~5 minutos para propagação
```

**Passo 2: Gerar Novas Chaves**
```
No painel Supabase:
- API Keys → Gerar nova ANON_KEY
- API Keys → Gerar nova SERVICE_ROLE_KEY
- Copiar JWT_SECRET renovado
```

**Passo 3: Mudar Senha Gmail**
```
https://myaccount.google.com/security
- Buscar "App Passwords"
- Revogar a senha para "sistem aa2eventos"
- Gerar nova senha de app
```

**Passo 4: Regenerar Secrets da Aplicação**
```bash
# Gerar novos secrets (execute localmente ou use OpenSSL)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Passo 5: Remover .env do Git History**
```bash
# Opção A: BFG (RECOMENDADO - mais seguro e rápido)
brew install bfg  # macOS
# ou: apt-get install bfg  # Linux
# ou: choco install bfg  # Windows

git clone --mirror https://github.com/seu-usuario/repo.git repo.git
cd repo.git
bfg --delete-files '.env*' --force

cd ..
git clone repo.git repo-clean
cd repo-clean
git reflog expire --expire=now --all
git gc --prune=now --aggressive
git push --force

# Opção B: git filter-branch (se BFG não disponível)
git filter-branch --tree-filter 'rm -f .env .env.*.local' -- --all
git push --force --all
```

**Passo 6: Verificar .gitignore ✅ (JÁ FEITO)**
```
✅ .gitignore atualizado com:
   - .env, .env.local, .env.*.local
   - *.pem, *.key, *.p8, *.p12, *.pfx
   - secrets/, private/, credentials.json
```

---

### ❌ CRÍTICO #2: Variáveis de Ambiente Não Definidas

**Problema:** Production não tem `.env` e não pode iniciar sem variáveis obrigatórias

### ✅ Solução:

**Para cada ambiente (Development, Staging, Production):**

```bash
# 1. Criar .env SEGURO (NUNCA fazer commit)
SUPABASE_URL=sua-url-nova
SUPABASE_ANON_KEY=sua-anon-key-nova
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key-nova
SUPABASE_JWT_SECRET=seu-jwt-secret-novo

PORT=3001
NODE_ENV=production

# URLs por ambiente
API_URL=https://api.seu-dominio.com  # ou http://localhost:3001 para dev
FRONTEND_URL=https://painel.seu-dominio.com  # ou http://localhost:5173 para dev
PUBLIC_PORTAL_URL=https://cadastro.seu-dominio.com  # ou http://localhost:3000 para dev

# Email
SMTP_HOST=smtp.gmail.com
SMTP_USER=seu-email@gmail.com
SMTP_PASS=sua-nova-senha-app

# Novos Secrets
JWT_SECRET=novo-secret-aleatorio-32-bytes
INTERNAL_API_KEY=novo-internal-api-key-aleatorio

# Hardware
HARDWARE_PUSH_TOKEN=novo-token-seguro
```

**2. Usar Environment Management:**

```bash
# Opção A: GitHub Secrets (para CI/CD)
# Repo → Settings → Secrets and variables → Actions
# Adicionar cada SECRET

# Opção B: AWS Systems Manager Parameter Store / Secret Manager
# Opção C: HashiCorp Vault
# Opção D: Docker Secrets (Docker Swarm)
# Opção E: Kubernetes Secrets (k8s)
```

**3. Atualizar Docker-Compose:**
```yaml
# docker-compose.yml - NÃO colocar secrets aqui!
api:
  environment:
    - SUPABASE_URL=${SUPABASE_URL}
    - SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
    - API_URL=${API_URL:-http://localhost:3001}
    # etc...
```

---

### ❌ CRÍTICO #3: nginx.conf Referencia Domínios Hardcoded

**Problema:** `painel.nzt.app.br`, `cadastro.nzt.app.br`, `api.nzt.app.br` hardcoded

### ✅ Solução (EM PROGRESSO):

**Arquivo:** `/a2-eventos/gateway/nginx.conf`

```nginx
# ANTES:
server_name painel.nzt.app.br;

# DEPOIS (Usar variáveis de ambiente Docker):
server_name ${FRONTEND_DOMAIN};

# No docker-compose:
gateway:
  environment:
    - FRONTEND_DOMAIN=${FRONTEND_DOMAIN:-painel.local}
    - PORTAL_DOMAIN=${PORTAL_DOMAIN:-cadastro.local}
    - API_DOMAIN=${API_DOMAIN:-api.local}
```

---

### ❌ CRÍTICO #4: Certificados SSL/TLS

**Problema:** nginx.conf referencia `/etc/nginx/certs/origin.pem`

### ✅ Solução:

```bash
# Opção A: Let's Encrypt + Certbot (RECOMENDADO)
docker run -it --rm \
  -v /etc/letsencrypt:/etc/letsencrypt \
  certbot/certbot certonly --standalone \
  -d painel.seu-dominio.com \
  -d api.seu-dominio.com \
  -d cadastro.seu-dominio.com

# Opção B: Gerar auto-signed (desenvolvimento apenas)
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout origin.key -out origin.pem -days 365

# Montar em Docker:
volumes:
  - /etc/letsencrypt/live/seu-dominio.com:/etc/nginx/certs:ro
```

---

## 🟠 FASE 2: ALTO (Fazer antes de deploy, mas menos urgente que Críticos)

### ALTO #1: Migration 17 - VIEW com Aliases ✅ (CORRIGIDO)

**Status:** ✅ Validado - Não necessita ação

---

### ALTO #2: Índices em Foreign Keys ✅ (PRONTO)

**Status:** ✅ Migration 20260421 criada e pronta para executar

**Ação:**
```sql
-- Executar no Supabase SQL Editor:
-- Copie todo o conteúdo de:
-- a2-eventos/database/supabase/migrations/20260421_add_foreign_key_indexes.sql
```

**Impacto:** Melhora de performance em JOINs (especialmente importante com 100K+ registros)

---

### ALTO #3: Validação de Fase em Check-in

**Problema:** Apenas reconhecimento facial valida `verificarFaseEvento()`. QR Code/Barcode/Manual não validam.

**Arquivo:** `src/modules/checkin/checkin.controller.js`

**Solução:**
```javascript
// Adicionar em TODAS as rotas (facial, qr, barcode, manual):
const fasePermitida = await verificarFaseEvento(evento_id, 'ENTRADA');
if (!fasePermitida) {
    return res.status(403).json({ 
        error: 'Fase do evento não permite entradas no momento' 
    });
}
```

---

### ALTO #4: Validar RLS Policies Supabase

**Problema:** RLS policies podem ser permissivas demais

**Ação:**
```sql
-- Execute no Supabase SQL Editor para auditoria:
SELECT table_name, policy_name, definition 
FROM pg_policies 
WHERE schemaname = 'public' 
ORDER BY table_name;

-- Verifique que cada policy tem evento_id = auth.uid() ou similar
```

---

### ALTO #5: React Versioning

**Problema:** web-admin usa React 18.2.0, public-web usa 19.2.3

**Opção A:** Manter ambas (se testadas)
**Opção B:** Padronizar em 18.2.0 (mais estável)  
**Opção C:** Atualizar ambas para 19.2.3 (com testes)

---

## 🟡 FASE 3: MÉDIO (Próxima Sprint)

### MÉDIO #1: ESLint Rules

**Arquivo:** `.eslintrc.cjs`

```javascript
// Mudar de 'off' para 'error':
'no-unused-vars': 'error',
'no-undef': 'error',
'react/jsx-key': 'error'  // Novo
```

---

### MÉDIO #2: Face Recognition Dependencies

**Problema:** Python microservice tem dependências pesadas

**Ação:** Testar build em container antes de deploy:
```bash
cd a2-eventos/backend/microservice-face-python
docker build -t face-recognition:latest .
docker run --rm face-recognition:latest python -c "import insightface; print('OK')"
```

---

### MÉDIO #3: Hardcoded URLs Removidas ✅ (COMPLETO)

**Status:** ✅ Corrigidos:
- ✅ cors.js
- ✅ intelbras.routes.js  
- ✅ settings.controller.js

**Restantes:**
- Verificar: empresa.controller.js
- Verificar: pessoa.service.js  
- Verificar: portal/empresa.routes.js
- Verificar: public.controller.js

---

## 📋 CHECKLIST PRÉ-DEPLOY

### Segurança
- [ ] Revogar TODAS as chaves Supabase antigas
- [ ] Gerar novas chaves Supabase
- [ ] Mudar senha Gmail `sistemaa2eventos@gmail.com`
- [ ] Regenerar JWT_SECRET
- [ ] Regenerar INTERNAL_API_KEY
- [ ] Remover .env do Git history (BFG ou filter-branch)
- [ ] Validar .gitignore tem padrões de secrets
- [ ] Revisar nginx.conf para domínios hardcoded

### Banco de Dados
- [ ] Executar migration 20260421 (índices)
- [ ] Auditar RLS policies
- [ ] Testar backups do Supabase
- [ ] Validar replicação de dados (se houver)

### Código
- [ ] Corrigir validação de fase em check-in QR/Barcode
- [ ] Confirmar todas as URLs usam variáveis de ambiente
- [ ] Validar builds Frontend (npm run build)
- [ ] Validar testes unitários (npm test)

### Configuração
- [ ] Criar .env para cada ambiente (NÃO fazer commit)
- [ ] Testar docker-compose em staging
- [ ] Validar variáveis de ambiente estão definidas
- [ ] Testar nginx config
- [ ] Preparar certificados SSL (Let's Encrypt)

### Deployment
- [ ] Health check endpoints funcionam
- [ ] API responde em produção
- [ ] Frontend carrega sem erros
- [ ] Database conecta corretamente
- [ ] Logs são capturados

---

## 🚀 PRÓXIMOS PASSOS

1. **HOJE:**
   - [ ] Revogar chaves Supabase
   - [ ] Regenerar secrets
   - [ ] Limpar Git history de .env

2. **AMANHÃ:**
   - [ ] Executar migration 20260421
   - [ ] Validar fase em check-in
   - [ ] Testar em staging

3. **PRÓXIMA SEMANA:**
   - [ ] Deploy para produção
   - [ ] Monitorar logs
   - [ ] Validar performance

---

## 📞 Contato de Suporte

- **Supabase Support:** https://supabase.com/support
- **Docker Docs:** https://docs.docker.com/
- **Let's Encrypt:** https://letsencrypt.org/
- **GitHub Security:** https://github.com/settings/security

---

**Relatório Gerado:** 2026-04-18  
**Status:** 🔴 Aguardando ação em CRÍTICOS  
**Próxima Revisão:** Após implementar CRÍTICOS
