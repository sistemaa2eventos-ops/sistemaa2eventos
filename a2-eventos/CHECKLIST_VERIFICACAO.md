# ✅ Checklist de Verificação - Deploy VPS

## 📋 Pré-Deploy (Local)

- [x] API reconstruída localmente
- [x] Arquivos modificados:
  - [x] auth.controller.js (removido CPF, simplificado)
  - [x] validators.js (níveis de acesso simplificados)
  - [x] USUARIO_API.md (documentação atualizada)
  - [x] 20260427_remove_cpf_from_perfis.sql (migração criada)

---

## 🚀 Deploy na VPS (Você executa)

### **Passo 1: Conectar à VPS**
```bash
ssh root@187.127.9.59
cd /root/a2-eventos
```

### **Passo 2: Executar Script de Deploy**
```bash
bash DEPLOY_VPS.sh
```

**O que o script faz:**
- ✅ Git pull origin master
- ✅ Rebuild docker image (--no-cache)
- ✅ Reinicia container API
- ✅ Testa health endpoint
- ✅ Mostra logs

---

## 🔍 Verificações Manuais na VPS

### **Após o deploy, execute na VPS:**

#### 1️⃣ Verificar arquivos alterados
```bash
git log --oneline -5
git diff HEAD~1 HEAD --name-only | grep -E "auth|validators|USUARIO_API"
```

**Esperado:**
```
✅ backend/api-nodejs/src/modules/auth/auth.controller.js
✅ backend/api-nodejs/src/utils/validators.js
✅ backend/api-nodejs/USUARIO_API.md
```

#### 2️⃣ Verificar Docker
```bash
docker-compose ps
docker logs a2_eventos_api --tail=30
```

**Esperado:**
```
a2_eventos_api    Status: Up X seconds
a2_eventos_api    Health: healthy
Logs sem erros críticos
```

#### 3️⃣ Testar Health Endpoint
```bash
curl -s http://localhost:3001/health | jq .
```

**Resposta esperada:**
```json
{
  "status": "ok",
  "checks": {
    "api_express": "ok",
    "database": "connected"
  },
  "uptime": 123,
  "version": "1.0.0"
}
```

#### 4️⃣ Testar Endpoint de Invite (Sem CPF)
```bash
TOKEN="seu-admin-master-token-aqui"

curl -X POST http://localhost:3001/api/auth/invite \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teste@empresa.com",
    "nome_completo": "Usuário Teste",
    "telefone": "(11) 98765-4321",
    "evento_id": "seu-evento-id-aqui",
    "permissions": {
      "dashboard": true,
      "pessoas": true,
      "checkin": true
    }
  }'
```

**Resposta esperada (201):**
```json
{
  "success": true,
  "message": "Operador criado com sucesso...",
  "user": {
    "email": "teste@empresa.com",
    "nome_completo": "Usuário Teste",
    "nivel_acesso": "operador",
    "status": "pendente"
  }
}
```

⚠️ **IMPORTANTE:** Não deve aparecer `cpf` na resposta!

---

## 🌐 Verificações no Navegador

### **1. Verificar HTTPS**
```
https://painel.nzt.app.br
```
- [ ] Página carrega sem erro SSL
- [ ] Sem aviso de certificado inválido
- [ ] Pode fazer login

### **2. Verificar Painel de Usuários**
```
https://painel.nzt.app.br/usuarios
```
- [ ] Página carrega
- [ ] Mostra lista de operadores
- [ ] Botão "Novo Operador" visível

### **3. Criar Novo Operador (Frontend)**
- [ ] Preencher: Email, Nome, Telefone, Evento
- [ ] ❌ Campo CPF NÃO deve aparecer
- [ ] Enviar formulário
- [ ] Mensagem de sucesso

---

## ⚡ Testes Rápidos (cURL na VPS)

### **Teste 1: Validar Email**
```bash
curl -X POST http://localhost:3001/api/auth/invite \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "invalido-sem-arroba",
    "nome_completo": "Teste",
    "evento_id": "evt_123"
  }'
```

**Esperado:** `400 Bad Request` - "Email inválido"

### **Teste 2: Validar Telefone**
```bash
curl -X POST http://localhost:3001/api/auth/invite \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teste@empresa.com",
    "nome_completo": "Teste",
    "telefone": "123",
    "evento_id": "evt_123"
  }'
```

**Esperado:** `400 Bad Request` - "Telefone inválido"

### **Teste 3: Verificar Isolamento de Evento**
```bash
# Operador do evento A tenta acessar evento B
curl -X GET "http://localhost:3001/api/pessoas?evento_id=evento_b" \
  -H "Authorization: Bearer token_operador_evento_a"
```

**Esperado:** `403 Forbidden` ou `400 Bad Request`

---

## 📊 Checklist de Segurança LGPD

- [ ] CPF não aparece em perfis de operadores
- [ ] Operadores vinculados ao evento não conseguem acessar outro evento
- [ ] Admin master pode ver todos os eventos
- [ ] Permissões começam desligadas
- [ ] Operadores não podem alterar próprias permissões

---

## 🆘 Troubleshooting

### **Se a API não inicia:**
```bash
docker-compose down api
docker images | grep a2-eventos
docker-compose build --no-cache api
docker-compose up -d api
docker logs a2_eventos_api
```

### **Se há erro de conexão com banco:**
```bash
docker-compose ps | grep pg_edge
docker logs a2_eventos_pg_edge
```

### **Se há erro de permissão:**
```bash
# Verificar RLS policies
docker exec a2_eventos_pg_edge psql -U a2_edge_user -d a2_edge_db -c "\dp public.perfis"
```

### **Se precisa resetar (cuidado!):**
```bash
# Backup primeiro!
docker-compose down
docker system prune -f
git pull origin master
docker-compose build --no-cache
docker-compose up -d
```

---

## ✅ Checklist Final

- [ ] Git pull concluído sem erros
- [ ] Docker build concluído com sucesso
- [ ] Container API inicia e fica healthy
- [ ] Health endpoint responde `"status": "ok"`
- [ ] Invite endpoint cria operador (sem CPF)
- [ ] Email no convite é validado
- [ ] Telefone no convite é validado
- [ ] Operadores não veem dados de outros eventos
- [ ] Frontend mostra novo formulário (sem CPF)
- [ ] Permissões começam desligadas

---

## 📞 Contato / Suporte

Se algo não funcionar:
1. Verifique os logs: `docker logs a2_eventos_api`
2. Verifique connectividade do BD: `docker logs a2_eventos_pg_edge`
3. Teste endpoint manualmente com curl
4. Volte git para versão anterior se necessário: `git revert HEAD`

---

**Status:** Pronto para Deploy ✅
**Data:** 2026-04-27
**Versão:** 1.0.0 (Simplificação de Operadores)
