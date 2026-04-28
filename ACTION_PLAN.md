# ⚡ PLANO DE AÇÃO IMEDIATO - Corrigir Erros de Produção

**Data:** 2026-04-28  
**Status:** 🔴 2 Erros críticos encontrados  
**Tempo estimado:** 30-45 minutos

---

## 📍 Problemas

```
1. ❌ "Failed to connect to Supabase" (EAI_AGAIN)
   └─ Container não consegue resolver DNS do Supabase
   └─ Impacto: API não funciona em produção

2. ❌ "Pessoa não vinculada a este evento"
   └─ Pivot table (pessoa_evento_empresa) vazia ou sem registros
   └─ Impacto: Não consegue gerar QR code para check-in
```

---

## 🚀 AÇÃO 1: Verificar que o Código Está Pushado (5 min)

Execute **LOCALMENTE** (seu PC):

```bash
# 1. Verificar status do código local
bash VERIFY_DEPLOYMENT.sh

# Procure por:
# ✓ Todos commits estão sincronizados
# ✓ Sem mudanças não-commitadas
```

**Se houver mudanças não commitadas:**
```bash
git add .
git commit -m "fix: pending changes before deployment"
git push origin master
```

**Se disser "AÇÃO NECESSÁRIA":**
```bash
git push origin master
```

---

## 🚀 AÇÃO 2: Atualizar Código na VPS (10 min)

Execute na **VPS** via SSH:

```bash
# 1. Conectar na VPS
ssh user@seu-ip-vps

# 2. Entrar no diretório do projeto
cd /home/seu-user/Projetos/Projeto_A2_Eventos

# 3. Puxar últimas mudanças
git pull origin master

# Esperado:
# Updating 1427945..aac51e2
# Fast-forward
# ...
# 3 files changed, 667 insertions(+)
```

---

## 🔍 AÇÃO 3: Diagnosticar o Problema (5 min)

**Na VPS**, execute:

```bash
bash DIAGNOSE.sh

# Salvar saída em arquivo para análise
bash DIAGNOSE.sh > /tmp/diagnostico.txt 2>&1

# Procure na saída por:
# - "SUPABASE_URL" definida? (Deve estar em verde ✓)
# - "DNS funcionando"? (Deve estar em verde ✓)
# - "Supabase respondendo"? (Deve estar em verde ✓)
```

---

## 🔧 AÇÃO 4: Seguir Guia de Correção (20 min)

Dependendo do diagnóstico:

### Se problema é "SUPABASE_URL não definida":

```bash
# Na VPS
nano .env

# Procure pela linha SUPABASE_URL
# Adicione (ou corrija):
SUPABASE_URL=https://zznrgwytywgjsjqdjfxn.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Salve: Ctrl+O → Enter → Ctrl+X

# Depois fazer rebuild:
docker-compose down
docker-compose build --no-cache
docker-compose up -d

# Esperar 20 segundos
sleep 20

# Verificar logs:
docker logs a2_eventos_api --tail=50 | grep -i supabase
```

### Se problema é "DNS não funcionando":

```bash
# Na VPS - testar conectividade
ping -c 1 8.8.8.8
curl https://supabase.co

# Se não funcionar:
# - Contatar Hostinger
# - Verificar firewall/UFW
# - Verificar se tem internet na VPS
```

### Se tudo está correto no diagnóstico:

```bash
# Fazer rebuild completo mesmo assim (garante versão nova)
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

---

## ✅ AÇÃO 5: Verificar se Funcionou (5 min)

**Na VPS:**

```bash
# 1. Ver se API está saudável
curl -s http://localhost:3001/health | jq .

# Esperado:
# {
#   "status": "ok",
#   "database": "connected",
#   "timestamp": "2026-04-28T..."
# }

# 2. Monitorar logs em tempo real
bash QUICK_LOGS.sh all

# Procure por:
# ✗ Nenhuma mensagem "Failed to connect to Supabase"
# ✗ Nenhuma mensagem "Pessoa não vinculada"
```

---

## 🧪 AÇÃO 6: Testar os Fluxos (10 min)

### Testar Fluxo 1: Criar Operador

```bash
# No painel admin:
1. Ir para "Usuários"
2. Clicar "Novo Operador"
3. Preencher: nome, email, telefone
4. Clicar "Enviar Convite"

# Esperado:
# ✓ Sem erro 500
# ✓ Email chega (verificar Gmail)
# ✓ Log mostra: "📧 Convite de operador enviado"
```

### Testar Fluxo 2: Gerar QR Code

```bash
# No painel de check-in:
1. Ir para "Cadastro de Pessoas"
2. Criar uma nova pessoa
3. Ir para "Aprovações"
4. Aprovar a pessoa
5. Voltar para check-in
6. Procurar a pessoa e clicar "Gerar QR Code"

# Esperado:
# ✓ QR code é gerado
# ✗ Sem erro "Pessoa não vinculada a este evento"
```

---

## 📋 Resumo Rápido

| Passo | Comando | Local | Tempo |
|-------|---------|-------|-------|
| 1 | `bash VERIFY_DEPLOYMENT.sh` | Local | 5 min |
| 2 | `git pull origin master` | VPS | 2 min |
| 3 | `bash DIAGNOSE.sh` | VPS | 5 min |
| 4 | Seguir FIX_SUPABASE_PERSON.md | VPS | 20 min |
| 5 | `bash QUICK_LOGS.sh all` | VPS | 3 min |
| 6 | Testar na UI | Navegador | 10 min |

**Total: ~45 minutos**

---

## 📞 Se Ainda Tiver Erros

### Para erro Supabase:
```bash
# VPS
grep "SUPABASE_URL" .env
# Deve mostrar: https://zznrgwytywgjsjqdjfxn.supabase.co

docker logs a2_eventos_api | grep -i "supabase\|connection\|error"
```

### Para erro Pessoa-Evento:
```bash
# Na Supabase Console, executar:
SELECT COUNT(*) as total FROM pessoa_evento_empresa;

SELECT COUNT(*) as pendentes 
FROM pessoa_evento_empresa 
WHERE status_aprovacao = 'pendente';

SELECT COUNT(*) as aprovados 
FROM pessoa_evento_empresa 
WHERE status_aprovacao = 'aprovado';
```

Se os contadores estão muito baixos (0-5), há uma falha no processo de criação.

### Contato:
- 📧 Email: suporte@nzt.app.br
- 🔗 Docs: cat FIX_SUPABASE_PERSON.md
- 📊 Monitorar: bash MONITOR_ERROS.sh

---

**Próxima etapa:** Execute `bash VERIFY_DEPLOYMENT.sh` agora para começar! ✅
