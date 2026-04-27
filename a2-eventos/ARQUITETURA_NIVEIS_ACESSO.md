# 🔐 Arquitetura de Níveis de Acesso & Permissões por Evento

## 1. Status Atual do Sistema

### **Níveis de Acesso Existentes**

```sql
CHECK (nivel_acesso IN ('admin_master', 'operador'))
```

**Atualmente:**
- ✅ `admin_master` → Acesso irrestrito a todos os eventos
- ✅ `operador` → Vinculado a um evento específico (imutável)
- ❌ `admin`, `supervisor`, `viewer` → Legado, não são mais usados

### **Isolamento por Evento (Multi-Tenancy)**

O sistema implementa isolamento via:

1. **JWT Imutável** (auth.js:140-149)
   ```javascript
   // Operadores NÃO podem trocar evento via header
   // evento_id vem do JWT, não do cliente
   const tenantId = _safe(req.user.evento_id);
   
   if (userRole === 'admin_master') {
       // Admin master pode usar x-evento-id no header
       req.tenantId = req.headers['x-evento-id'] || req.user.evento_id;
   } else {
       // Operadores ficam presos ao evento_id do JWT
       req.tenantId = req.user.evento_id; // ← IMUTÁVEL
   }
   ```

2. **Row Level Security (RLS)** no Supabase
   ```sql
   -- Exemplo: Política para tabela pessoas
   CREATE POLICY "operadores_veem_seu_evento"
   ON pessoas
   FOR SELECT
   USING (
       evento_id = (SELECT evento_id FROM perfis WHERE id = auth.uid())
   );
   ```

3. **Validação no Backend**
   ```javascript
   // Verificar que evento_id do usuário == evento_id do recurso
   if (req.tenantId !== resourceEventoId) {
       throw new Error('Acesso negado: recurso pertence a outro evento');
   }
   ```

---

## 2. Sua Arquitetura Proposta ✅

```
┌─────────────────────────────────────────────────────────────┐
│                    ADMIN MASTER (1)                         │
│  - Gerencia sistema completo                                │
│  - Cria novos operadores                                    │
│  - Aprova operadores                                        │
│  - Alterações emergenciais                                  │
└─────────────────────────────────────────────────────────────┘
                            ↓
        ┌──────────────────────────────────────┐
        │        ESTRUTURA POR EVENTO          │
        └──────────────────────────────────────┘
        
EVENTO A                          EVENTO B
├── Operador 1                    ├── Operador 1 (outro)
│   ├── Permissão: pessoas        │   ├── Permissão: empresas
│   ├── Permissão: checkin        │   ├── Permissão: checkin
│   └── Permissão: relatorios     │   └── Permissão: relatorios
│
├── Operador 2                    ├── Operador 2 (outro)
│   ├── Permissão: empresas       │   ├── Permissão: pessoas
│   └── Permissão: checkout       │   └── Permissão: auditoria
│
├── Empresa A                     ├── Empresa B
│   ├── João Silva (CPF xxx)      │   ├── Maria Costa (CPF yyy)
│   └── Ana Costa (CPF yyy)       │   └── Pedro Silva (CPF zzz)
│
└── Check-in/Checkout isolados    └── Check-in/Checkout isolados
```

---

## 3. Implementação: Remover CPF de Perfis

### **Passo 1: Migração no Supabase**

```sql
-- Remover CPF da tabela perfis
ALTER TABLE public.perfis DROP COLUMN IF EXISTS cpf CASCADE;

-- Comentar a mudança
COMMENT ON TABLE public.perfis IS 'Perfis de operadores do painel. CPF é exclusivo de participantes (pessoas).';
```

### **Passo 2: Atualizar Validadores**

```javascript
// Em validators.js - REMOVER validateCPF de operadores
// Manter apenas para pessoas

// CRIAR novo validador para operadores
function validateOperatorData(email, nome, telefone) {
    // Email + Nome + Evento = ID único do operador
    // CPF não é mais necessário
}
```

### **Passo 3: Atualizar auth.controller.js**

```javascript
async invite(req, res) {
    const { 
        email, 
        nome_completo, 
        telefone,      // ← Manter
        evento_id,
        // ❌ cpf,      // ← REMOVER
        nivel_acesso = 'operador',
        permissions 
    } = req.body;

    // ... resto do código
}
```

---

## 4. Permissões por Evento (Detalhado)

### **Estrutura Atual de Permissões**

```javascript
const permissions = {
    dashboard: true,              // Sempre true
    
    // Gerenciamento
    empresas: boolean,            // Ver/editar empresas do evento
    pessoas: boolean,             // Ver/editar participantes
    usuarios: boolean,            // Ver/editar outros operadores
    
    // Operações
    checkin: boolean,             // Fazer check-in
    checkout: boolean,            // Fazer check-out
    monitoramento: boolean,       // Ver dashboard/analytics
    relatorios: boolean,          // Gerar relatórios
    
    // Segurança
    auditoria_documentos: boolean, // Ver/aprovar documentos
    dispositivos: boolean          // Gerenciar terminais
}
```

### **Exemplo: Definição por Evento**

**Evento Técnico 2026:**

| Operador | Empresas | Pessoas | Checkin | Checkout | Relatórios | Auditoria |
|----------|----------|---------|---------|----------|------------|-----------|
| João (Gerente) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Maria (Portaria) | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Pedro (RH) | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ |

**Evento Palestra 2026:**

| Operador | Empresas | Pessoas | Checkin | Checkout | Relatórios | Auditoria |
|----------|----------|---------|---------|----------|------------|-----------|
| João (Mesmo) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Ana (Portaria) | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |

**Note:** João aparece em 2 eventos, mas com contexto isolado em cada um.

---

## 5. Como o Isolamento é Garantido

### **Cenário: João tenta acessar dados do Evento B**

```
1. João faz login no Evento A
   JWT contém: {
       id: "uuid_joao",
       evento_id: "evento_a",
       nivel_acesso: "operador",
       permissions: { pessoas: true, checkin: true }
   }

2. João tenta: GET /api/pessoas?evento_id=evento_b
   
3. Middleware verifica:
   if (req.user.evento_id !== evento_b) {
       throw 'Acesso negado'
   }
   
4. RLS do Supabase também bloqueia:
   SELECT * FROM pessoas 
   WHERE evento_id = (SELECT evento_id FROM perfis WHERE id = auth.uid())
   -- Retorna 0 registros para evento_b
   
5. Resultado: ❌ Acesso Negado
```

---

## 6. LGPD: Como é Garantida

### **Isolamento de Dados**

```
Evento A
├── Dados de Pessoas
├── Dados de Empresas
├── Logs de Checkin/Checkout
└── Documentos (RG, CPF, etc)

Evento B
├── Dados de Pessoas (DIFERENTES)
├── Dados de Empresas (DIFERENTES)
├── Logs de Checkin/Checkout (DIFERENTES)
└── Documentos (DIFERENTES)

// Nenhum operador consegue:
// ❌ Ver dados de outro evento
// ❌ Copiar CPF de outro evento
// ❌ Acessar logs de outro evento
// ❌ Exportar dados de outro evento
```

### **Direito ao Esquecimento**

```sql
-- Deletar pessoa de um evento (LGPD)
DELETE FROM pessoas
WHERE evento_id = $1 AND id = $2;

-- Automático limpa:
-- - Logs de acesso
-- - Documentos
-- - Face encodings
-- - QR codes
-- Mas mantém outros eventos intactos!
```

---

## 7. Simplificação Proposta: Níveis de Acesso

### **REMOVER (Legado)**
```javascript
❌ 'master'
❌ 'admin'  
❌ 'supervisor'
❌ 'viewer'
```

### **MANTER (Apenas)**
```javascript
✅ 'admin_master'  → Controlado centralmente
✅ 'operador'      → Padrão para todos em eventos
```

### **Simplificar Validadores.js**

```javascript
function getDefaultPermissions(nivel_acesso) {
    if (nivel_acesso === 'admin_master') {
        return {
            // Todas true - admin master vê tudo
            dashboard: true,
            empresas: true,
            pessoas: true,
            // ...
        };
    }
    
    if (nivel_acesso === 'operador') {
        return {
            // Padrão: apenas visualização
            dashboard: true,
            empresas: false,
            pessoas: false,
            // Admin deve customizar por caso de uso
        };
    }
    
    throw new Error(`Nível inválido: ${nivel_acesso}`);
}
```

---

## 8. Estrutura de Permissões Revisada

### **Simplificar: Remover Níveis, Focar em Permissões**

```javascript
// ANTES (complexo):
async invite(req, res) {
    const { nivel_acesso = 'operador' } = req.body;
    // admin_master, admin, supervisor, operador, viewer ← confuso
    const permissions = getDefaultPermissions(nivel_acesso);
}

// DEPOIS (simples):
async invite(req, res) {
    // Sempre 'operador'
    const nivel_acesso = 'operador';
    
    // Permissões são customizáveis POR EVENTO
    const permissions = req.body.permissions || {
        dashboard: true,
        pessoas: false,
        checkin: true,
        // ... (admin master escolhe)
    };
}
```

---

## 9. Fluxo de Criação de Novo Operador

```
Admin Master acessa painel administrativo
        ↓
Clica em "Novo Operador"
        ↓
Preenche:
- Email: operador@empresa.com
- Nome: João Silva
- Telefone: (11) 98765-4321
- Evento: "Evento Técnico 2026"
        ↓
Seleciona Permissões para ESTE evento:
✅ Dashboard
✅ Checkin
✅ Relatórios
❌ Pessoas
❌ Empresas
        ↓
Sistema cria:
{
    "email": "operador@empresa.com",
    "nome_completo": "João Silva",
    "telefone": "11987654321",
    "evento_id": "evt_123",
    "nivel_acesso": "operador",  ← SEMPRE operador
    "permissions": {
        "dashboard": true,
        "checkin": true,
        "relatorios": true,
        "pessoas": false,
        "empresas": false
    }
}
        ↓
Email enviado → Operador define senha → Aprova admin master → ✅ ATIVO
```

---

## 10. Checklist de Implementação

### **Fase 1: Remover CPF de Operadores** ⏳
- [ ] Criar migração SQL (remover coluna CPF de perfis)
- [ ] Atualizar validators.js (remover validateCPF de operadores)
- [ ] Atualizar auth.controller.js (remover cpf de invite)
- [ ] Atualizar tests

### **Fase 2: Simplificar Níveis de Acesso** ⏳
- [ ] Atualizar CHECK constraint (apenas admin_master, operador)
- [ ] Simplificar getDefaultPermissions()
- [ ] Atualizar documentação
- [ ] Remover código legado (admin, supervisor, viewer)

### **Fase 3: Validar Isolamento LGPD** ⏳
- [ ] Testar RLS policies
- [ ] Testar isolamento de JWT
- [ ] Testar direito ao esquecimento
- [ ] Documentar políticas de privacidade

---

## 11. Perguntas para Refinamento

1. **Permissões padrão?** Qual deve ser a permissão padrão quando um operador é criado?
   - Tudo desligado? → Admin master ativa conforme precisa
   - Básico ligado? → Somente o mínimo (dashboard + monitoramento)

2. **Mudar permissões após criação?** Operadores podem alterar suas próprias permissões?
   - Sim: Mais flexível, menos controle
   - Não: Mais seguro, admin master controla tudo

3. **Migração de dados?** Há operadores existentes com CPF?
   - Sim: Precisa migração de dados
   - Não: Implementação direta

4. **Auditoria de permissões?** Registrar quando permissões são alteradas?
   - Sim: Adicionar logs (LGPD friendly)
   - Não: Menos overhead, menos rastreabilidade

---

**Status:** Pronto para implementação ✅
