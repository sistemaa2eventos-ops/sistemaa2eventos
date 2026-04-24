# 🔐 Status de Segurança Supabase — A2 Eventos

**Última verificação:** 2026-04-24  
**Responsável:** Security Audit

---

## 📊 Resumo Executivo

```
┌─────────────────────────────────────────────────────────┐
│                  SECURITY STATUS REPORT                  │
├─────────────────────────────────────────────────────────┤
│                                                           │
│ 🔴 CRÍTICO (Execução Pendente):                          │
│   └─ Search Path em Funções Públicas (Migration 20260414)
│   └─ RLS Policies Completas (Migration 20260414)        │
│   └─ View SECURITY INVOKER Fix (Migration 20260414)     │
│                                                           │
│ ✅ CONCLUÍDO (Código pronto):                            │
│   ├─ Docker: Runtime config injection (web-admin)       │
│   ├─ Gateway: X-Forwarded-Proto standardization         │
│   ├─ Gateway: Certificate handling improvements         │
│   └─ Scripts de auditoria criados                       │
│                                                           │
│ 🟡 PENDENTE (Próxima etapa):                             │
│   ├─ Git cleanup (remover .env do histórico)            │
│   └─ Deploy e testes completos                          │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

---

## 🎯 Migrações Identificadas

### ✅ Já Implementadas (Git tracked)

| # | Migration | Data | Escopo | Status |
|---|-----------|------|--------|--------|
| 1 | `20260408201000_mcp_security_fixes.sql` | 08/04 | Correcções iniciais | ✅ |
| 2 | `20260408201500_mcp_performance_fixes.sql` | 08/04 | Performance | ✅ |
| 3 | `20260408_lgpd_v2.sql` | 08/04 | LGPD compliance | ✅ |
| 4 | `20260408_performance_indices.sql` | 08/04 | Índices FK | ✅ |
| 5 | `20260412_fix_rls_policies.sql` | 12/04 | RLS iniciais | ✅ |
| 6 | `20260414_check_user.sql` | 14/04 | User check function | ✅ |
| 7 | `20260414_fix_audit_logs.sql` | 14/04 | Audit logs | ✅ |
| 8 | `20260414_security_audit_fix.sql` | 14/04 | Segurança (v1) | ⚠️ Parcial |
| 9 | `20260414_security_complete_fix.sql` | 14/04 | **Segurança COMPLETA** | 🔴 **EXECUTAR AGORA** |
| 10 | `20260421_agent_tokens.sql` | 21/04 | Agent auth | ✅ |
| 11 | `20260421_cpf_constraint_by_event.sql` | 21/04 | CPF constraint | ✅ |
| 12 | `20260421_fix_view_documentos_nome_completo.sql` | 21/04 | View fix | ✅ |

---

## 🔍 O que a Migration 20260414_security_complete_fix.sql Faz

### Fase 1: View Security (SECURITY INVOKER)
```sql
-- ✅ view_documentos_pendentes
-- Muda de SECURITY DEFINER para SECURITY INVOKER
-- Impacto: View agora respeita RLS do usuário consultante
```

### Fase 2: Search Path em Funções
```sql
-- 🎯 FIX para TODO funções públicas
-- ALTER FUNCTION public.<name> SET search_path = public;
-- 
-- Por que? Evita SQL injection via path manipulation
-- Exemplo: CREATE FUNCTION public.func() SET search_path=malicious;
-- 
-- Mutable warning: ✅ Resolvido
-- Variável config: ✅ Adicionada
```

**Funções afetadas (estimado 40+):**
```
- update_terminal_sync_queue_updated_at
- get_user_profile
- check_person_access
- validate_access_rules
- get_pessoa_detalhes
- process_*
- trigger_*
- ... (e mais)
```

### Fase 3: RLS Policies Completas
```
Tabelas cobertas: 27+

Tiers de acesso:
├─ master           (controle total)
├─ admin/supervisor/operador  (controle por evento)
└─ service_role     (backend API)

Padrão aplicado a:
├─ Tabelas principais: eventos, pessoas, empresas
├─ Tabelas secundárias: documentos, dispositivos, acesso
├─ Tabelas de config: system_settings, webhooks
└─ Tabelas de auditoria: audit_logs, logs_acesso
```

---

## 📋 Tabelas com RLS Configuradas

```
✅ Tabelas Primárias (6):
   eventos, pessoas, empresas, logs_acesso, logs_acesso_veiculos, perfis

✅ Tabelas Secundárias (8):
   pessoa_documentos, empresa_documentos, dispositivos_acesso,
   quotas_diarias, biometria_pessoa, historico_bloqueios,
   veiculos, monitor_watchlist

✅ Tabelas de Config (8):
   pessoa_evento_empresa, evento_areas, evento_tipos_pulseira,
   pulseira_areas_permitidas, evento_etiqueta_layouts,
   system_settings, system_api_keys, system_webhooks

✅ Tabelas de Auditoria (2):
   audit_logs, webhook_events

✅ Outras (3+):
   api_keys, backups_acesso_diario, cameras_ip, ...
```

---

## 🚀 Como Executar

### Opção 1: Via Supabase Dashboard (Recomendado)
```
1. Vá para: https://app.supabase.com/
2. Selecione seu projeto A2 Eventos
3. Abra: SQL Editor → New query
4. Cole: a2-eventos/supabase/migrations/20260414_security_complete_fix.sql
5. Clique: Execute
6. Verifique: Resultado no final (✅ Segurança corrigida!)
```

**Tempo:** ~2-3 minutos  
**Reversibilidade:** ✅ Totalmente reversível (DROP POLICY IF EXISTS)

### Opção 2: Via CLI Supabase
```bash
cd a2-eventos/
supabase migration up

# Ou manualmente:
psql postgresql://user:pass@db.supabase.co:5432/postgres \
  -f supabase/migrations/20260414_security_complete_fix.sql
```

---

## ✅ Verificação Pós-Execução

Execute o script de auditoria:
```
20260424_verify_security_audit.sql
```

### Esperado (se sucesso):
```
SEÇÃO 1 (Search Path):
  ✅ Nenhuma função VOLATILE sem config

SEÇÃO 2 (RLS):
  ✅ 27+ políticas distribuídas

SEÇÃO 3 (Allow All):
  ✅ 0 resultados (não deve haver inseguras)

SEÇÃO 5 (Security Definer):
  ✅ 0 resultados (views devem ser INVOKER)

SEÇÃO 6 (Resumo):
  ✅ Números altos (25+ tabelas com RLS, 80+ políticas)
```

---

## 🎯 Checklist de Execução

```
PRÉ-EXECUÇÃO:
  ☐ Backup do banco de dados (Supabase faz automaticamente)
  ☐ Ler migration completa (está in this file)
  ☐ Confirmar ambiente (production vs staging)

EXECUÇÃO:
  ☐ Login no Supabase com credenciais corretas
  ☐ Abrir SQL Editor
  ☐ Cole migration: 20260414_security_complete_fix.sql
  ☐ Executar

PÓS-EXECUÇÃO:
  ☐ Executar auditoria: 20260424_verify_security_audit.sql
  ☐ Verificar todos os 6 testes passaram
  ☐ Anotar timestamp da execução
  ☐ Testar aplicação (login, acesso a dados)
  ☐ Revisar logs de erro (Supabase → Logs)

COMMIT:
  ☐ Criar commit git: "feat(supabase): execute security audit migration 20260414"
  ☐ Include: Log de execução e resultado da auditoria
```

---

## 📞 Suporte

**Dúvidas?**
- Arquivo: `SUPABASE_MIGRATIONS_CHECKLIST.md`
- Troubleshooting: Seção de erros comuns

**Problema na execução?**
- Reverta: `DROP POLICY` manualmente
- Ou: Contacte Supabase support

---

## 📈 Timeline

```
2026-04-08: Migrações iniciais (lgpd, performance)
2026-04-12: Primeiras RLS policies
2026-04-14: Segurança (versão incompleta)
2026-04-14: Segurança COMPLETA (pronta para executar)
2026-04-21: Agent tokens e constraints
2026-04-24: ← HOJE
           ├─ Git security fixes (config injection)
           ├─ Gateway improvements
           ├─ Supabase audit script criado
           └─ PRÓXIMO: Executar 20260414_security_complete_fix.sql
2026-04-24+: Git cleanup (remover .env)
2026-04-25: Deploy e testes finais
```

---

**Status:** 🟡 EM PROGRESSO  
**Próximo:** Executar migration no Supabase  
**Responsável:** User  
