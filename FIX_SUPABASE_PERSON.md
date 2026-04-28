# 🔧 Guia de Correção - Erros Supabase + Pessoa-Evento

## 📍 Problemas Identificados

### 1. Erro: "Failed to connect to Supabase" (EAI_AGAIN)
**Local:** API logs
**Causa:** DNS resolver não conseguindo acessar `zznrgwytywgjsjqdjfxn.supabase.co`
**Impacto:** API não consegue conectar ao banco de dados

### 2. Erro: "Pessoa não vinculada a este evento"
**Local:** QR Code generation
**Causa:** Pivot table `pessoa_evento_empresa` não tem registro da pessoa com status 'aprovado' ou 'pendente'
**Impacto:** Não consegue gerar QR code para check-in

---

## 🔍 PASSO 1: Diagnosticar o Problema Supabase

Primeiro, execute o script de diagnóstico:

```bash
bash DIAGNOSE.sh
```

**O que procurar na saída:**

```
❌ SUPABASE_URL não definida
  → Problema: .env não tem SUPABASE_URL

❌ DNS não funcionando
  → Problema: Container não consegue resolver domínios

❌ Supabase respondendo com timeout
  → Problema: Conectividade de rede cortada
```

---

## ✅ PASSO 2: Corrigir SUPABASE_URL no .env (VPS)

### 2.1 - Verificar .env atual

```bash
# VPS - SSH para a VPS
ssh user@seu-ip-vps

# Listar .env
cat .env | grep SUPABASE

# Esperado:
# SUPABASE_URL=https://zznrgwytywgjsjqdjfxn.supabase.co
# SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
# SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...
```

### 2.2 - Se SUPABASE_URL está VAZIO ou ERRADO

```bash
# VPS - Editar .env
nano .env

# Encontre esta linha:
SUPABASE_URL=

# Deve conter:
SUPABASE_URL=https://zznrgwytywgjsjqdjfxn.supabase.co

# Se estiver em branco, adicione a URL

# Salve: Ctrl+O → Enter → Ctrl+X
```

### 2.3 - Verificar que ficou correto

```bash
# VPS
grep "SUPABASE_URL" .env
# Deve mostrar a URL completa com https://

# Testar DNS do container
docker-compose exec a2_eventos_api ping -c 1 supabase.co
# Deve ter sucesso ou timeout (não "Name or service not known")
```

---

## 🐳 PASSO 3: Rebuildar Containers com Novas Variáveis

```bash
# VPS

# 1. Parar containers
docker-compose down

# 2. Limpar imagens antigas
docker image prune -af

# 3. Rebuild com --no-cache (garante que .env é lido)
docker-compose build --no-cache

# ⏳ ESPERE 10-15 minutos (compila Node.js)

# 4. Iniciar
docker-compose up -d

# 5. Esperar 20 segundos
sleep 20

# 6. Verificar logs de inicialização
docker logs a2_eventos_api --tail=50 | grep -i "supabase\|connection"
```

**O que você DEVE ver nos logs:**

```
✅ Supabase credentials loaded
✅ Successfully connected to Supabase
```

**Se ver:**

```
❌ SUPABASE_URL não definida no arquivo .env
```

→ Volta para PASSO 2.2 e verifica .env novamente

---

## 👤 PASSO 4: Corrigir "Pessoa não vinculada a este evento"

Esta é uma validação no código. Quando uma pessoa é criada, DEVE ter um registro na pivot table `pessoa_evento_empresa`.

### 4.1 - Entender o fluxo

```
1. Usuário cria pessoa via POST /api/pessoas
   ↓
2. Backend insere em `pessoas` table
   ↓
3. Backend insere em `pessoa_evento_empresa` (pivot) com status='pendente'
   ↓
4. Admin aprova pessoa via PUT /api/pessoas/:id/approve
   ↓
5. Pivot status muda para 'aprovado'
   ↓
6. Usuário consegue gerar QR code
```

### 4.2 - Verificar dados no banco

Acesse o Supabase Console e execute:

```sql
-- Ver todas as pessoas SEM pivot
SELECT p.id, p.nome_completo, p.evento_id 
FROM pessoas p
LEFT JOIN pessoa_evento_empresa pee ON p.id = pee.pessoa_id
WHERE pee.pessoa_id IS NULL
AND p.evento_id = 'seu-evento-id';

-- Ver todas as pivots para um evento
SELECT pessoa_id, empresa_id, status_aprovacao, atualizado_em 
FROM pessoa_evento_empresa
WHERE evento_id = 'seu-evento-id'
ORDER BY atualizado_em DESC
LIMIT 20;
```

### 4.3 - Se houver pessoas SEM pivot

Se encontrou pessoas orphanãs (sem pivot), precisa criar a relação:

```sql
-- Para uma pessoa específica
INSERT INTO pessoa_evento_empresa (pessoa_id, empresa_id, evento_id, status_aprovacao)
VALUES ('id-da-pessoa', 'id-da-empresa', 'id-do-evento', 'pendente');

-- Depois de inserir, o admin deve aprovar via UI
```

### 4.4 - Verificar se a aprovação funciona

1. Ir para o painel admin → Pessoas
2. Encontrar uma pessoa com status "Pendente"
3. Clicar "Aprovar"
4. Ir para o portal de check-in
5. Procurar a pessoa
6. Clicar "Gerar QR Code"

**Esperado:** QR code é gerado com sucesso

**Se erro "Pessoa não vinculada":**
- Verificar se a pivot foi criada com status='aprovado'
- Logs: `docker logs a2_eventos_api | grep -i "pessoa não vinculada"`

---

## 🔑 PASSO 5: Verificar Conectividade Completa

Depois de fazer os passos acima, execute:

```bash
# VPS

# 1. Verificar API está saudável
curl -s http://localhost:3001/health | jq .

# Esperado: { "status": "ok" }

# 2. Verificar Supabase está respondendo
curl -s http://localhost:3001/api/eventos \
  -H "Authorization: Bearer seu-token" | jq . | head -20

# 3. Ver logs de erro
bash QUICK_LOGS.sh all

# Se não houver mais "Failed to connect to Supabase"
# ou "Pessoa não vinculada" → Problema resolvido! ✅
```

---

## 📋 CHECKLIST DE VERIFICAÇÃO

- [ ] Executei `bash DIAGNOSE.sh` e analisei a saída
- [ ] Verifiquei que SUPABASE_URL está correto em .env (VPS)
- [ ] Fiz rebuild com `docker-compose build --no-cache`
- [ ] Verificar logs: `docker logs a2_eventos_api | grep -i supabase`
- [ ] Testar criar uma pessoa nova
- [ ] Testar aprovar a pessoa
- [ ] Testar gerar QR code
- [ ] Verificar `bash QUICK_LOGS.sh all` não mostra mais erros

---

## 🆘 Se ainda tiver problemas

### Erro persiste: "Failed to connect to Supabase"

```bash
# VPS - Verificar conectividade de REDE
ping -c 1 8.8.8.8              # Internet?
nslookup supabase.co           # DNS?
curl https://supabase.co -I    # Site acessível?

# Se não passar em um desses:
# - Contatar provedor VPS (Hostinger)
# - Verificar firewall/UFW

# Se passar em todos:
# - Verificar que SUPABASE_URL está 100% correto
# - Fazer nova build
```

### Erro persiste: "Pessoa não vinculada a este evento"

```bash
# 1. Verificar se pessoa foi criada
docker exec a2_eventos_api npm run shell  # Abre REPL Node

# Dentro do REPL:
const { supabase } = require('./src/config/supabase');
const { data } = await supabase.from('pessoas').select('*').limit(5);
console.log(data);

# 2. Procurar por uma pessoa criada recentemente
# 3. Copiar seu ID

# 4. Verificar pivot
const { data: piv } = await supabase.from('pessoa_evento_empresa').select('*').eq('pessoa_id', 'ID_COPIADO');
console.log(piv);

# Se piv é null ou vazio → Pivot não foi criada
# Solução: Re-criar a pessoa ou inserir pivot manualmente
```

---

## 📞 Contato & Suporte

Se nenhuma solução funcionar:

1. **Coletar informações:**
   ```bash
   # VPS
   docker logs a2_eventos_api > /tmp/api.log 2>&1
   docker logs a2_eventos_pg_edge > /tmp/db.log 2>&1
   
   # Enviar esses logs para análise
   ```

2. **Verificar status Supabase:**
   - https://status.supabase.io

3. **Contato:**
   - Email: suporte@nzt.app.br
   - Slack: #a2-eventos-issues

---

**Última atualização:** 2026-04-28
