# 📋 Checklist de Migrações Supabase — A2 Eventos

**Status Atual:** 2026-04-24  
**Responsável:** Verificação de segurança

---

## 🔍 Migrações Críticas de Segurança

### 1. **search_path em Funções Públicas** ✅ PRONTO
**Arquivo:** `20260414_security_complete_fix.sql` (Fase 2, linhas 48-63)  
**O que faz:**  
- Corrige TODAS as funções públicas para definir `search_path = public`
- Evita SQL injection via function path manipulation
- Resolve warning do Database Linter

**Quando executar:** ⚠️ CRÍTICO - Execute agora!

```sql
-- Copie APENAS a Fase 2 da migration 20260414_security_complete_fix.sql
-- e execute no Supabase SQL Editor
```

---

### 2. **RLS (Row Level Security) Policies** ✅ PRONTO
**Arquivo:** `20260414_security_complete_fix.sql` (Fase 3, linhas 66-296)  
**O que faz:**  
- Cria políticas RLS para TODAS as 27+ tabelas
- Implementa três roles: `master`, `admin`/`supervisor`/`operador`, `service_role`
- Remove políticas inseguras "allow_all"

**Políticas cobertas:**
- ✅ eventos, pessoas, empresas
- ✅ logs_acesso, logs_acesso_veiculos
- ✅ dispositivos_acesso, pessoa_documentos, empresa_documentos
- ✅ quotas_diarias, biometria_pessoa, historico_bloqueios
- ✅ monitor_watchlist, veiculos
- ✅ system_settings, system_api_keys, system_webhooks
- ✅ audit_logs, webhook_events
- ✅ + 12 outras tabelas

**Quando executar:** ⚠️ CRÍTICO - Execute agora!

---

### 3. **View SECURITY INVOKER** ✅ PRONTO
**Arquivo:** `20260414_security_complete_fix.sql` (Fase 1, linhas 11-27)  
**O que faz:**  
- Recria `view_documentos_pendentes` com SECURITY INVOKER (não DEFINER)
- Garante que view respeita RLS do usuário que a consulta

**Quando executar:** ⚠️ CRÍTICO - Execute agora!

---

## 🧪 Verificação e Auditoria

### Script de Auditoria
**Arquivo:** `20260424_verify_security_audit.sql`

**Seções testadas:**
1. ✅ Funções VOLATILE sem search_path configurado
2. ✅ Tabelas com RLS habilitado
3. ✅ Políticas inseguras "allow_all" (devem ser zero)
4. ✅ Roles e metadata correta
5. ✅ Views com SECURITY DEFINER (devem ser zero)
6. ✅ Resumo executivo de segurança

**Como usar:**
```bash
# 1. Abra Supabase → SQL Editor
# 2. Cole conteúdo de 20260424_verify_security_audit.sql
# 3. Execute todas as queries
# 4. Verifique os resultados esperados
```

---

## 📋 Ordem de Execução Recomendada

```
1. Executar 20260414_security_complete_fix.sql
   └─ Fase 1: View SECURITY INVOKER
   └─ Fase 2: search_path em funções
   └─ Fase 3: RLS policies

2. Executar 20260424_verify_security_audit.sql
   └─ Verificar se tudo funcionou

3. Se houver falhas:
   └─ Correções específicas (contact admin)

4. Proceeder para Git Cleanup (depois)
```

---

## ⚡ Migrações Recentes (Já Executadas?)

| Migration | Data | O que faz | Status |
|-----------|------|----------|--------|
| 20260408_lgpd_v2.sql | 08/04 | LGPD compliance | ✅ |
| 20260408_performance_indices.sql | 08/04 | Foreign key indexes | ✅ |
| 20260412_fix_rls_policies.sql | 12/04 | RLS fixes iniciais | ✅ |
| 20260414_security_audit_fix.sql | 14/04 | Primeira tentativa | ⚠️ Parcial |
| 20260414_security_complete_fix.sql | 14/04 | **Versão COMPLETA** | 🔴 Pendente |
| 20260421_agent_tokens.sql | 21/04 | Agent local auth | ✅ |
| 20260421_cpf_constraint_by_event.sql | 21/04 | CPF único por evento | ✅ |

---

## 🎯 Próximos Passos

### Passo 1: Executar Security Migration
1. Abra [Supabase Dashboard](https://app.supabase.com/)
2. Vá para: SQL Editor → New Query
3. Cole: `20260414_security_complete_fix.sql`
4. Execute

**Tempo estimado:** 2-3 minutos

### Passo 2: Auditar Resultados
1. Execute: `20260424_verify_security_audit.sql`
2. Verifique 6 seções de resultados
3. Confirme: Zero `allow_all`, RLS habilitado, search_path correto

**Tempo estimado:** 1 minuto

### Passo 3: Git Cleanup
1. Remover `.env` do histórico Git
2. Force push (após confirmação de chaves revogadas)
3. Criar `.env.local` com novos secrets

**Tempo estimado:** 5-10 minutos

---

## 📞 Troubleshooting

**Erro: "Duplicate policy"**
```sql
-- Solução: Policies já existem
-- Execute a migration mesmo assim (usa DROP IF EXISTS)
-- Ou: DROP POLICY IF EXISTS <nome> ON <tabela>; THEN retry
```

**Erro: "Function <name> does not exist"**
```sql
-- Solução: Sua versão do Supabase é muito antiga
-- Contact Supabase support ou upgrade projeto
```

**Erro: "Permission denied for schema public"**
```sql
-- Solução: Usar role `service_role` (chave de service no Supabase)
-- Não usar chave anon
```

---

## ✅ Checklist Final

- [ ] Execute 20260414_security_complete_fix.sql (Fase 1)
- [ ] Execute 20260414_security_complete_fix.sql (Fase 2)
- [ ] Execute 20260414_security_complete_fix.sql (Fase 3)
- [ ] Execute 20260424_verify_security_audit.sql
- [ ] Verifique SEÇÃO 3: Zero resultados
- [ ] Verifique SEÇÃO 5: Zero "SECURITY DEFINER"
- [ ] Verifique SEÇÃO 6: Resumo com números altos
- [ ] Commit: `feat(supabase): complete security audit and RLS enforcement`
- [ ] Próximo: Git cleanup

---

**Última atualização:** 2026-04-24  
**Próxima revisão:** Quando mergear do Supabase para git
