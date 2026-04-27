# 👥 API de Operadores (Painel Administrativo)

## Visão Geral

API para gerenciar operadores do painel administrativo A2 Eventos com isolamento por evento (LGPD).

**Arquitetura:**
- ✅ Um `admin_master` único gerencia todo o sistema
- ✅ Todos os operadores têm nível `operador` (simplificado)
- ✅ Permissões são customizáveis **por evento**
- ✅ Isolamento total de dados por evento (LGPD-compliant)

---

## 1. Criar Novo Operador

**Endpoint:** `POST /api/auth/invite`

**Permissão Necessária:** `admin_master` (apenas)

### Request Body

```json
{
  "email": "operador@empresa.com.br",
  "nome_completo": "João Silva da Costa",
  "telefone": "(11) 98765-4321",
  "evento_id": "550e8400-e29b-41d4-a716-446655440000",
  "permissions": {
    "dashboard": true,
    "pessoas": true,
    "empresas": false,
    "auditoria_documentos": false,
    "monitoramento": true,
    "relatorios": true,
    "checkin": true,
    "checkout": true,
    "dispositivos": false,
    "usuarios": false
  }
}
```

### Campos

| Campo | Tipo | Obrigatório | Observação |
|-------|------|-------------|-----------|
| **email** | string | ✅ | Email válido, único no sistema |
| **nome_completo** | string | ✅ | Nome completo do operador |
| **telefone** | string | ❌ | Formato: (XX) 9XXXX-XXXX ou (XX) XXXX-XXXX |
| **evento_id** | UUID | ✅ | Evento onde o operador vai trabalhar |
| **permissions** | object | ❌ | Se omitido, usa padrão (tudo false, exceto dashboard) |

**Notas Importantes:**
- ❌ **CPF não é coletado** - É exclusivo de participantes (pessoas)
- ✅ **nivel_acesso sempre é "operador"** - Admin master é único e gerenciado centralmente
- ✅ **Permissões começam desligadas** - Admin master ativa conforme necessário

### Permissões Disponíveis

**Padrão ao criar (tudo false exceto dashboard):**
```json
{
  "dashboard": true,              // ← SEMPRE true
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
```

**Admin master ativa conforme necessário.** Exemplo de operador com mais permissões:
```json
{
  "dashboard": true,
  "empresas": true,              // ← Pode ver/editar empresas do evento
  "pessoas": true,               // ← Pode ver/editar pessoas do evento
  "auditoria_documentos": false,
  "monitoramento": true,
  "relatorios": true,
  "checkin": true,
  "checkout": true,
  "dispositivos": false,
  "usuarios": false
}
```

**Nota:** `dashboard` deve estar sempre como `true`. Outras permissões são opcionais.

### Response (201 Created)

```json
{
  "success": true,
  "message": "Convite enviado com sucesso. Aguarde aprovação do administrador.",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "operador@empresa.com.br",
    "nome_completo": "João Silva da Costa",
    "cpf": "123.456.789-10",
    "telefone": "(11) 98765-4321",
    "nivel_acesso": "operador",
    "status": "pendente",
    "evento_id": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

### Errors

| Status | Erro | Solução |
|--------|------|---------|
| 400 | Email, nome ou evento obrigatórios | Preencher campos obrigatórios |
| 400 | Email inválido | Verificar formato do email |
| 400 | CPF inválido | Verificar dígitos verificadores |
| 400 | Telefone inválido | Usar formato (XX) XXXXX-XXXX |
| 400 | Evento não encontrado | Verificar evento_id |
| 409 | Email já cadastrado | Usar email diferente |
| 409 | CPF já cadastrado | Usar CPF diferente |
| 403 | Apenas admin_master pode criar | Verificar permissões do usuário |

---

## 2. Listar Usuários

**Endpoint:** `GET /api/auth/users`

**Permissão Necessária:** Logado (admin_master vê todos, outros veem só seu evento)

### Query Parameters

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| **search** | string | Buscar por nome |

### Response (200 OK)

```json
{
  "success": true,
  "users": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "operador@empresa.com.br",
      "nome_completo": "João Silva da Costa",
      "cpf": "123.456.789-10",
      "telefone": "(11) 98765-4321",
      "nivel_acesso": "operador",
      "status": "pendente",
      "evento_id": "550e8400-e29b-41d4-a716-446655440000",
      "permissions": { /* ... */ },
      "created_at": "2026-04-27T10:30:00Z",
      "updated_at": "2026-04-27T10:30:00Z",
      "eventos": { "nome": "Evento Técnico 2026" }
    }
  ]
}
```

---

## 3. Atualizar Usuário

**Endpoint:** `PUT /api/auth/users/:id`

**Permissão Necessária:** admin_master OU ser o próprio usuário

### Request Body

```json
{
  "nome_completo": "João Silva Atualizado",
  "cpf": "123.456.789-10",
  "telefone": "(11) 98765-4321",
  "evento_id": "550e8400-e29b-41d4-a716-446655440000",
  "permissions": {
    "dashboard": true,
    "pessoas": true,
    "checkin": true,
    "checkout": true
  }
}
```

### Response (200 OK)

```json
{
  "success": true,
  "message": "Usuário atualizado com sucesso",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "nome_completo": "João Silva Atualizado",
    "cpf": "123.456.789-10",
    "telefone": "(11) 98765-4321",
    "updated_at": "2026-04-27T11:00:00Z"
  }
}
```

---

## 4. Aprovar Usuário

**Endpoint:** `POST /api/auth/approve/:userId`

**Permissão Necessária:** `admin_master`

### Request Body

```json
{
  "permissions": {
    "dashboard": true,
    "pessoas": true,
    "monitoramento": true
  },
  "evento_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

### Response (200 OK)

```json
{
  "success": true,
  "message": "Usuário aprovado com sucesso",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "ativo",
    "aprovado_por": "550e8400-e29b-41d4-a716-446655440000",
    "aprovado_em": "2026-04-27T11:05:00Z"
  }
}
```

---

## 5. Inativar/Ativar Usuário

**Endpoint:** `PATCH /api/auth/users/:userId/status`

**Permissão Necessária:** `admin_master`

### Request Body

```json
{
  "status": "inativo"
}
```

**Valores válidos:** `ativo`, `inativo`, `pendente`

### Response (200 OK)

```json
{
  "success": true,
  "message": "Usuário inativado com sucesso",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "inativo"
  }
}
```

---

## 6. Alterar Permissões

**Endpoint:** `PATCH /api/auth/users/:userId/permissions`

**Permissão Necessária:** `admin_master`

### Request Body

```json
{
  "permissions": {
    "dashboard": true,
    "pessoas": true,
    "empresas": true,
    "checkin": true,
    "checkout": true,
    "monitoramento": true,
    "relatorios": true,
    "auditoria_documentos": false,
    "dispositivos": false,
    "usuarios": false
  }
}
```

### Response (200 OK)

```json
{
  "success": true,
  "message": "Permissões atualizadas",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "permissions": { /* ... */ }
  }
}
```

---

## 7. Fluxo de Aprovação

```
1. Admin Master cria convite
   POST /api/auth/invite
   Status: pendente
   ↓
2. Email enviado para usuário com link reset-password
   ↓
3. Usuário clica link, define senha
   Status ainda: pendente
   ↓
4. Admin Master aprova
   POST /api/auth/approve/:userId
   Status: ativo
   ↓
5. Usuário pode fazer login
```

---

## 8. Validações

### Email
- ✅ Deve ser válido (conter @)
- ✅ Deve ser único (sem duplicatas)
- ✅ Normalizado para lowercase

### CPF
- ✅ Deve ser válido (dígitos verificadores corretos)
- ✅ Deve ser único (sem duplicatas)
- ✅ Aceita: "123.456.789-10" ou "12345678910"
- ✅ Rejeita CPFs conhecidos como inválidos (11111111111, etc)

### Telefone
- ✅ Formato: (XX) 9XXXX-XXXX (celular) ou (XX) XXXX-XXXX (fixo)
- ✅ Aceita caracteres especiais: números são extraídos
- ✅ Deve ter 10 ou 11 dígitos

### Permissões
- ✅ Dashboard deve ser sempre `true`
- ✅ Apenas chaves válidas permitidas
- ✅ Valores devem ser boolean

---

## 9. Auditoria

Toda ação é registrada:
- ✅ `created_by`: ID do usuário que criou
- ✅ `created_at`: Timestamp de criação
- ✅ `updated_at`: Timestamp da última atualização
- ✅ `aprovado_por`: ID do usuário que aprovou
- ✅ `aprovado_em`: Timestamp da aprovação

---

## 10. Exemplo Completo (cURL)

### Criar novo operador
```bash
curl -X POST https://painel.nzt.app.br/api/auth/invite \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "novo.operador@empresa.com",
    "nome_completo": "João da Silva",
    "telefone": "(11) 98765-4321",
    "evento_id": "550e8400-e29b-41d4-a716-446655440000",
    "permissions": {
      "dashboard": true,
      "pessoas": true,
      "monitoramento": true,
      "relatorios": true,
      "checkin": true,
      "checkout": false,
      "empresas": false,
      "auditoria_documentos": false,
      "dispositivos": false,
      "usuarios": false
    }
  }'
```

**Resposta (201 Created):**
```json
{
  "success": true,
  "message": "Operador criado com sucesso. Email de convite enviado. Aguarde que ele defina a senha e então aprove.",
  "user": {
    "id": "uuid...",
    "email": "novo.operador@empresa.com",
    "nome_completo": "João da Silva",
    "telefone": "(11) 98765-4321",
    "nivel_acesso": "operador",
    "status": "pendente",
    "permissions": { /* ... */ },
    "evento_id": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

### Listar operadores
```bash
curl -X GET "https://painel.nzt.app.br/api/auth/users?search=João" \
  -H "Authorization: Bearer $TOKEN"
```

### Aprovar operador (admin_master)
```bash
curl -X POST https://painel.nzt.app.br/api/auth/approve/550e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "permissions": {
      "dashboard": true,
      "pessoas": true,
      "checkin": true,
      "checkout": true,
      "relatorios": true
    }
  }'
```

### Atualizar permissões do operador (admin_master)
```bash
curl -X PATCH https://painel.nzt.app.br/api/auth/users/550e8400-e29b-41d4-a716-446655440000/permissions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "permissions": {
      "dashboard": true,
      "pessoas": true,
      "checkin": true,
      "checkout": true,
      "relatorios": true,
      "empresas": true,
      "auditoria_documentos": true,
      "monitoramento": true
    }
  }'
```
