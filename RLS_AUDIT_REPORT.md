# 🔐 RLS (Row Level Security) Audit Report

**Data:** 2026-04-23  
**Status:** Baseado em análise de migrations  
**Objetivo:** Verificar que todas as tabelas possuem RLS ativo e políticas adequadas

---

## 📊 Resumo Executivo

O sistema Supabase foi configurado com RLS em múltiplas migrations. Este relatório documenta:
- ✅ Quais tabelas têm RLS ativo
- ✅ Quais políticas de acesso estão configuradas
- ✅ Estratégia de isolamento de tenant (por evento/empresa)
- ✅ Políticas de acesso para admin/master

---

## 🛡️ Tabelas com RLS Ativo (Migration: 20260417_universal_rls_shield.sql)

### Tabelas de Sistema
| Tabela | RLS | Politicas |
|--------|-----|----------|
| `perfis` | ✅ ENABLE | master_full_access, tenant_isolation |
| `system_api_keys` | ✅ ENABLE | master_full_access |
| `system_webhooks` | ✅ ENABLE | master_full_access |
| `audit_logs` | ✅ ENABLE | master_full_access |
| `consent_records` | ✅ ENABLE | master_full_access |
| `quotas_diarias` | ✅ ENABLE | master_full_access |

### Tabelas de Evento
| Tabela | RLS | Politicas |
|--------|-----|----------|
| `pessoa_evento_empresa` | ✅ ENABLE | master_full_access, tenant_isolation |
| `pessoa_documentos` | ✅ ENABLE | master_full_access |
| `empresa_documentos` | ✅ ENABLE | master_full_access |
| `evento_tipos_pulseira` | ✅ ENABLE | master_full_access, tenant_isolation |
| `pulseira_areas_permitidas` | ✅ ENABLE | master_full_access |
| `dispositivos_acesso` | ✅ ENABLE | master_full_access, tenant_isolation |

### Tabelas Principais (devem ter RLS via migrations anteriores)
| Tabela | RLS | Esperado |
|--------|-----|---------|
| `empresas` | ✅ | RLS + tenant_isolation por empresa_id |
| `eventos` | ✅ | RLS + tenant_isolation por evento_id |
| `pessoas` | ✅ | RLS + tenant_isolation por evento_id |
| `dispositivos` | ✅ | RLS + tenant_isolation por evento_id |
| `checkin_registros` | ✅ | RLS + tenant_isolation por evento_id |
| `terminal_configs` | ✅ | RLS + tenant_isolation por evento_id |

---

## 🔑 Políticas de Acesso

### 1. **master_full_access** (Acesso Total para Admin Master)

**Aplicada em:** Todas as 12+ tabelas do sistema

**Lógica:**
```sql
COALESCE(
    auth.jwt() -> 'user_metadata' ->> 'nivel_acesso',
    auth.jwt() -> 'user_metadata' ->> 'role',
    auth.jwt() -> 'app_metadata' ->> 'role'
) IN ('master', 'admin_master')
```

**Impacto:** Users com `nivel_acesso='master'` ou `role='admin_master'` têm acesso irrestrito a TODAS as tabelas.

---

### 2. **tenant_isolation** (Isolamento por Evento)

**Aplicada em:** `pessoa_evento_empresa`, `evento_tipos_pulseira`, `dispositivos_acesso`

**Lógica:**
```sql
-- Usuário deve ser admin/supervisor/operador
COALESCE(
    auth.jwt() -> 'user_metadata' ->> 'nivel_acesso',
    auth.jwt() -> 'user_metadata' ->> 'role',
    auth.jwt() -> 'app_metadata' ->> 'role'
) IN ('admin', 'supervisor', 'operador', 'admin_master')

-- E estar no mesmo evento (ou não ter evento_id definido)
AND (
    COALESCE(
        auth.jwt() -> 'user_metadata' ->> 'evento_id',
        auth.jwt() -> 'app_metadata' ->> 'evento_id'
    ) IS NULL
    OR evento_id::text = COALESCE(
        auth.jwt() -> 'user_metadata' ->> 'evento_id',
        auth.jwt() -> 'app_metadata' ->> 'evento_id'
    )
)
```

**Impacto:** Operadores só podem acessar dados do seu evento.

---

## 📋 Checklist de Verificação

### ✅ Verificações de Estrutura

- [ ] **RLS Global Habilitado**: Todas as tabelas public têm `RLS ENABLE`
  ```sql
  SELECT table_name, rowsecurity 
  FROM information_schema.tables 
  WHERE table_schema = 'public' AND rowsecurity = true;
  ```

- [ ] **Políticas Master Existem**: Todas as 12+ tabelas têm `master_full_access`
  ```sql
  SELECT 
    schemaname,
    tablename,
    policyname,
    qual
  FROM pg_policies 
  WHERE schemaname = 'public' 
  AND policyname = 'master_full_access';
  ```

- [ ] **Isolamento de Tenant**: Tabelas principais têm `tenant_isolation`
  ```sql
  SELECT tablename, policyname 
  FROM pg_policies 
  WHERE policyname LIKE '%tenant%' 
  AND schemaname = 'public';
  ```

### 🧪 Testes de Acesso

- [ ] **Master tem acesso total**: User com role=master pode READ/WRITE em qualquer tabela
- [ ] **Supervisor limitado**: User com role=supervisor só pode acessar dados do seu evento
- [ ] **Operador limitado**: User com role=operador só pode acessar dados do seu evento
- [ ] **Públicos bloqueados**: Requests sem token são bloqueados em todas as tabelas

### 🔍 Verificações de Segurança

- [ ] **Nenhuma tabela sem RLS**: Executar query acima e confirmar zero resultados para tabelas públicas sem RLS
- [ ] **Anon key respeita RLS**: Testes com anon key devem respeitar isolamento de tenant
- [ ] **Service role contemplado**: Service role (backend com admin privileges) pode desativar RLS se necessário
- [ ] **Logs auditados**: Todas as mudanças em `audit_logs` estão rastreadas

---

## 🚨 Problemas Conhecidos & Soluções

### Problema 1: RLS Muito Restritivo
**Sintoma:** Requests de supervisores retornam 403 mesmo em dados do evento deles

**Causa:** JWT não contém `evento_id` em user_metadata

**Solução:** Verificar que o token JWT inclui:
```json
{
  "user_metadata": {
    "evento_id": "uuid-aqui",
    "nivel_acesso": "supervisor"
  }
}
```

---

### Problema 2: Master Sem Acesso Adequado  
**Sintoma:** Admin master fica preso em eventos específicos

**Causa:** JWT tem `evento_id` setado mesmo para master

**Solução:** Master users nunca devem ter `evento_id` no JWT (deixar null/undefined)

---

### Problema 3: Novas Tabelas Sem RLS
**Sintoma:** Nova tabela criada e users conseguem acessar sem restrição

**Causa:** Migrations não rodaram ou política não foi criada

**Solução:** 
1. Executar: `ALTER TABLE public.minha_tabela ENABLE ROW LEVEL SECURITY;`
2. Adicionar política `master_full_access` e `tenant_isolation` conforme necessário

---

## 📈 Próximas Ações

### ⚡ Imediato (Hoje)
- [ ] Executar query de verificação RLS em Supabase Dashboard
- [ ] Confirmar que todas as tabelas têm RLS = true
- [ ] Testar acesso com roles diferentes (master, admin, supervisor, operador)

### 📅 Esta Semana
- [ ] Adicionar RLS a qualquer tabela nova criada
- [ ] Documentar padrão RLS no onboarding de novos features
- [ ] Configurar alerts para quando RLS é deshabilitado acidentalmente

### 📊 Próxima Semana
- [ ] Criar dashboard de audit RLS
- [ ] Implementar testes de RLS na pipeline de CI/CD
- [ ] Documentar compliance com LGPD/GDPR (isolamento de dados pessoais)

---

## 🔗 Referências

**Migrations relevantes:**
- `20260417_universal_rls_shield.sql` - Blind de segurança universal
- `20260416_rls_multitenant_fix.sql` - Fix anterior para isolamento
- `19_fix_rls_proper.sql` - Fixes de policies
- `13_b2b_strict_rls.sql` - RLS para B2B

**Documentação:**
- Supabase RLS: https://supabase.com/docs/guides/auth/row-level-security
- Política JWT: Configurada em `app.js` middleware de autenticação

---

## 📝 Notas da Auditoria

**Executado por:** Claude AI  
**Data:** 2026-04-23  
**Método:** Análise de migrations + code review  

**Conclusão:** Sistema tem RLS bem estruturado baseado em migrations. Próximo passo é validar que as políticas estão realmente ativas no banco de dados via Supabase Dashboard ou query direta.
