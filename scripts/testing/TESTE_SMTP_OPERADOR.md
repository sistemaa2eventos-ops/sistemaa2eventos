# 🧪 TESTE: SMTP Customizado para Convite de Operadores

## Status: ✅ PRONTO PARA TESTE

Todos os componentes foram verificados e estão funcionando:
- ✅ Método `sendOperatorInvite()` implementado
- ✅ Fluxo integrado em `auth.controller.invite()`
- ✅ Rota POST `/api/auth/invite` registrada
- ✅ SMTP configurado (Gmail)
- ✅ Usando `createUser()` em vez de `inviteUserByEmail()`
- ✅ Link gerado via `generateLink()`

---

## 📋 Teste 1: Criar Operador via API

### Setup
1. Ter o backend rodando (`docker-compose up`)
2. Ter um admin_master autenticado (token válido)
3. ID válido de um evento

### Execução

```bash
# 1. Obter token de admin_master
ADMIN_TOKEN="seu-token-aqui"
EVENTO_ID="uuid-do-evento"

# 2. Fazer requisição POST
curl -X POST https://painel.nzt.app.br/api/auth/invite \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "novo.operador@gmail.com",
    "nome_completo": "Novo Operador Teste",
    "evento_id": "'$EVENTO_ID'",
    "telefone": "(11) 99999-9999",
    "permissions": {
      "dashboard": true,
      "empresas": false,
      "pessoas": false,
      "auditoria_documentos": false,
      "monitoramento": false,
      "relatorios": false,
      "checkin": false,
      "checkout": false,
      "dispositivos": false,
      "usuarios": false
    }
  }'
```

### Resultado Esperado
```json
{
  "success": true,
  "message": "Operador criado com sucesso. Email de convite enviado. Aguarde que ele defina a senha e então aprove.",
  "user": {
    "id": "uuid-do-novo-usuario",
    "email": "novo.operador@gmail.com",
    "nome_completo": "Novo Operador Teste",
    "telefone": "(11) 99999-9999",
    "nivel_acesso": "operador",
    "status": "pendente",
    "evento_id": "uuid-do-evento"
  }
}
```

---

## 📧 Teste 2: Verificar Email Recebido

### Ação
1. Abrir Gmail em `novo.operador@gmail.com`
2. Procurar por email de "A2 Eventos"

### Verificações
- [ ] Email chegou em ~2-5 segundos
- [ ] Subject: "Você foi convidado para acessar o Painel A2 Eventos"
- [ ] Template tem branding A2 Eventos (logo azul #00D4FF, fundo #050B18)
- [ ] Link: começa com `https://painel.nzt.app.br/reset-password`
- [ ] Mensagem menciona expiração de 24 horas
- [ ] Footer com "© 2026 A2 Eventos | suporte@nzt.app.br"

### Exemplo de Link
```
https://painel.nzt.app.br/reset-password?token=eyJ...&type=invite&email=novo.operador@gmail.com
```

---

## 🔐 Teste 3: Operador Ativa a Conta

### Ação
1. Operador clica no link do email
2. Sistema redireciona para `/reset-password`
3. Operador preenche nova senha

### Verificações
- [ ] Página carrega corretamente
- [ ] Email pré-preenchido no formulário
- [ ] Senha é validada (mínimo 8 caracteres, complexidade)
- [ ] Após envio: "Senha definida com sucesso"
- [ ] Perfil do operador continua com status `pendente` (ainda não aprovado)

### Código para Verificar
```sql
SELECT id, email, status FROM perfis WHERE email = 'novo.operador@gmail.com';
-- Esperado: status = 'pendente'
```

---

## ✅ Teste 4: Admin Aprova Operador

### Setup
```bash
ADMIN_TOKEN="seu-token-aqui"
NOVO_USER_ID="id-retornado-no-teste-1"
EVENTO_ID="uuid-do-evento"
```

### Execução
```bash
curl -X PUT https://painel.nzt.app.br/api/auth/users/$NOVO_USER_ID/approve \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "evento_id": "'$EVENTO_ID'"
  }'
```

### Resultado Esperado
```json
{
  "success": true,
  "message": "Usuário aprovado com sucesso",
  "user": {
    "id": "uuid-do-novo-usuario",
    "email": "novo.operador@gmail.com",
    "status": "ativo",
    "aprovado_em": "2026-04-28T14:30:00.000Z",
    "nivel_acesso": "operador"
  }
}
```

### Verificar no Banco
```sql
SELECT id, email, status, aprovado_em FROM perfis WHERE email = 'novo.operador@gmail.com';
-- Esperado: status = 'ativo', aprovado_em = não nulo
```

---

## 🔑 Teste 5: Operador Faz Login

### Ação
1. Ir para: `https://painel.nzt.app.br`
2. Fazer login com:
   - Email: `novo.operador@gmail.com`
   - Senha: (a senha que definiu no Teste 3)

### Verificações
- [ ] Login bem-sucedido
- [ ] Dashboard carrega
- [ ] Perfil mostra dados corretos (nome, email, evento)
- [ ] Permissões refletem o que foi configurado

### Teste via API
```bash
curl -X POST https://painel.nzt.app.br/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "novo.operador@gmail.com",
    "password": "sua-senha-aqui"
  }'
```

---

## 📊 Teste 6: Monitorar Logs

### Ver logs do SMTP em tempo real
```bash
docker-compose logs -f a2-eventos-api | grep -i "operador\|invite\|email"
```

### Esperado na primeira criação
```
📧 [Operator Invite] Convite enviado para: novo.operador@gmail.com
✅ Operador criado: novo.operador@gmail.com (evento: uuid, status: pendente)
```

### Esperado na aprovação
```
✅ Usuário aprovado com sucesso
```

---

## ⚠️ Troubleshooting

### Problema 1: Email não chega
**Solução:**
1. Verificar logs: `docker logs a2-eventos-api | grep "Operator Invite"`
2. Verificar SMTP_PASS no `.env` (app password, não senha da conta)
3. Gmail pode ter 2FA habilitado - precisa de app password
4. Verificar em "Spam" do Gmail

### Problema 2: Link de reset-password não funciona
**Solução:**
1. Verificar que `FRONTEND_URL` está configurado em `.env`
2. O link deve começar com `https://painel.nzt.app.br`
3. Verificar se há redirect de DNS/CDN alterando a URL

### Problema 3: Operador clica link mas não consegue definir senha
**Solução:**
1. Verificar que o email foi confirmado (email_confirm: false no createUser)
2. Token pode ter expirado (Supabase expira em 24h)
3. Verificar logs de Supabase Auth

### Problema 4: Erro 403 ao criar operador
**Solução:**
1. Token não é de admin_master (verificar nivel_acesso no JWT)
2. Middleware de autenticação pode estar rejeitando o token
3. Verificar que o endpoint está em `/api/auth/invite` (POST)

---

## ✨ Resultado Final

Se todos os testes passarem:

✅ Operadores podem ser criados sem limite de rate
✅ Emails são enviados via SMTP Gmail customizado
✅ Fluxo de ativação + aprovação funciona
✅ Login de operadores funciona
✅ Sistema está pronto para produção

---

## 📝 Checklist de Conclusão

- [ ] Teste 1: Criar operador via API (sucesso 201)
- [ ] Teste 2: Email chega com template correto
- [ ] Teste 3: Operador define senha (status ainda pendente)
- [ ] Teste 4: Admin aprova (status muda para ativo)
- [ ] Teste 5: Operador consegue fazer login
- [ ] Teste 6: Logs mostram operações corretas
- [ ] Nenhum erro 500 ou 502 nos testes

---

**Última atualização:** 2026-04-28  
**Status:** Pronto para teste de e2e  
**Próximo passo:** Executar testes acima e reportar resultados
