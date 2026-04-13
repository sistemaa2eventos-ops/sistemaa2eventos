# 🚀 GUIA DE DEPLOY - A2 EVENTOS

## Pré-Requisitos

1. **VPS com Docker e Docker Compose instalados**
2. **Domínio configurado** (ou use IP temporário)
3. **Supabase projeto** criado e configurado

---

## PARTE 1: CORREÇÕES NO SUPABASE

Execute os scripts abaixo no **SQL Editor** do Supabase Dashboard:

### 1.1 - Aplicar Políticas RLS Corrigidas
```sql
-- Arquivo: database/supabase/migrations/16_fix_rls_policies.sql
-- Copie e execute todo o conteúdo
```

### 1.2 - Corrigir Segurança (View + Leaked Password)
```sql
-- Arquivo: database/supabase/migrations/17_security_fixes.sql
-- Copie e execute todo o conteúdo
```

### 1.3 - Habilitar Leaked Password Protection
```
Settings → Authentication → Security → Enable "Check passwords against HaveIBeenPwned"
```

---

## PARTE 2: DEPLOY PARA VPS

### 2.1 - Conecte na VPS via SSH
```bash
ssh root@SEU_IP
```

### 2.2 - Crie o diretório do projeto
```bash
mkdir -p /home/nzt-painel/a2-eventos
cd /home/nzt-painel/a2-eventos
```

### 2.3 - Envie os arquivos do seu computador local
```powershell
# Do seu Windows, execute:
scp -r . root@SEU_IP:/home/nzt-painel/a2-eventos/
```

Ou use o script de deploy automático:
```powershell
.\deploy_nzt.ps1
```

### 2.4 - Configure as variáveis de ambiente
```bash
cd /home/nzt-painel/a2-eventos

# Edite o arquivo .env com suas credenciais
nano backend/api-nodejs/.env
```

### 2.5 - Inicie os containers
```bash
docker-compose up -d --build
```

### 2.6 - Verifique se tudo está rodando
```bash
docker-compose ps
docker-compose logs -f api
```

---

## PARTE 3: VERIFICAÇÃO

### Verificar Health da API
```bash
curl http://localhost:3001/health
```

### Verificar Frontend
- Painel Admin: http://localhost:5173
- Portal Cadastro: http://localhost:3002

### Verificar Logs
```bash
# API
docker-compose logs api

# Frontend
docker-compose logs admin-web
docker-compose logs cadastro-web
```

---

## URLs DO SISTEMA (após configurar DNS)

| Serviço | URL |
|---------|-----|
| Painel Admin | `https://painel.seudominio.com` |
| Portal Cadastro | `https://cadastro.seudominio.com` |
| API | `https://api.seudominio.com` |

---

## TROUBLESHOOTING

### Erro 500 na API
- Verifique as variáveis de ambiente no `.env`
- Execute as migrações do Supabase

### Frontend não carrega
- Verifique se o build foi gerado: `ls frontend/web-admin/dist`
- Rebuild: `cd frontend/web-admin && npm run build`

### Banco não conecta
- Verifique as credenciais do Supabase no `.env`
- Teste a conexão: `docker-compose exec api node -e "require('./src/config/supabase')"`

---

## COMANDOS ÚTEIS

```bash
# Reiniciar todos os serviços
docker-compose restart

# Ver status
docker-compose ps

# Ver logs específicos
docker-compose logs -f api

# Rebuild completo
docker-compose down && docker-compose up -d --build

# Limpar cache
docker system prune -f
```

---

## ESTRUTURA DO DOCKER COMPOSE

```
gateway (Nginx)        → Portas 80/443
  ├── admin-web        → Painel Admin (Nginx)
  ├── cadastro-web     → Portal Público (Next.js)
  └── api              → API Backend (Node.js)
       ├── redis       → Cache
       └── postgres_edge → Banco Local
```

---

## VARIÁVEIS DE AMBIENTE NECESSÁRIAS

### backend/api-nodejs/.env
```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_JWT_SECRET=...

PORT=3001
NODE_ENV=production
JWT_SECRET=sua_chave_aqui

REDIS_HOST=redis
REDIS_PORT=6379
USE_REDIS=true
```

---

## ✅ CHECKLIST DE DEPLOY

- [ ] Migrações do Supabase executadas
- [ ] Leaked password protection habilitado
- [ ] Variáveis de ambiente configuradas
- [ ] Docker compose iniciado
- [ ] Containers rodando (api, admin-web, cadastro-web, gateway, redis, postgres_edge)
- [ ] Health check passando
- [ ] Frontend acessível
- [ ] DNS configurado (se usar domínio)