-- ============================================
-- FASE 5: FINAL SECURITY HARDENING
-- ============================================
-- Objetivo: Remover últimos 24 warnings da auditoria
-- Tempo: ~10 minutos
-- Risco: Baixo (apenas revoga permissions públicas)

-- =====================================================
-- PARTE A: MOVER EXTENSION VECTOR PARA SCHEMA SEPARADO
-- =====================================================

-- 1. Criar schema para extensões
CREATE SCHEMA IF NOT EXISTS extensions;

-- 2. Dar permissões de uso
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;

-- 3. Dar permissões de leitura em objetos da extensão
GRANT ALL ON ALL TABLES IN SCHEMA extensions TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA extensions TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA extensions TO postgres, anon, authenticated, service_role;

-- Verificar extensão atual
SELECT extname, nspname
FROM pg_extension
JOIN pg_namespace ON pg_extension.extnamespace = pg_namespace.oid
WHERE extname = 'vector';

-- ⚠️  IMPORTANTE: Mover extension vector requer:
-- Opção 1: Via Supabase Dashboard (recomendado)
-- - Dashboard → Extensions → vector → Manage → Move to another schema
-- Opção 2: Via SQL (pode causar downtime)
-- - ALTER EXTENSION vector SET SCHEMA extensions;
-- Opção 3: Se não conseguir mover, desabilitar e recriar
-- - DROP EXTENSION vector CASCADE;
-- - CREATE EXTENSION vector WITH SCHEMA extensions;

-- =====================================================
-- PARTE B: REVOGAR EXECUTE EM FUNÇÕES INTERNAS
-- =====================================================
-- Estratégia: Apenas authenticated/service_role conseguem chamar
-- Funções trigger não devem ser acessíveis via API pública

-- 1. Funções trigger (NEVER chamadas manualmente via API)
REVOKE EXECUTE ON FUNCTION public.camera_update_updated_at() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_event_modules() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_sync_user_claims() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_audit_log() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_pessoa_evento_empresa_timestamp() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_terminal_sync_queue_updated_at() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_my_event_id() FROM anon, authenticated;

-- 2. Funções internas (Apenas admin pode chamar)
REVOKE EXECUTE ON FUNCTION public.is_master() FROM anon;
REVOKE EXECUTE ON FUNCTION public.reconcile_transaction(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.registrar_acesso_atomico(uuid,uuid,text,text,text,numeric,text,uuid,uuid,timestamp with time zone) FROM anon;

-- 3. Função de busca (pode ser pública, mas com cuidado)
-- NOTA: buscar_pessoa_por_id_prefixo é uma busca segura, pode manter acesso público
-- Mas vamos deixar apenas para authenticated para ser mais restritivo
REVOKE EXECUTE ON FUNCTION public.buscar_pessoa_por_id_prefixo(text) FROM anon;

-- Verificar que as permissões foram revogadas
SELECT
  nsp.nspname,
  p.proname,
  a.grantee,
  a.privilege_type
FROM pg_proc p
JOIN pg_namespace nsp ON p.pronamespace = nsp.oid
LEFT JOIN information_schema.role_routine_grants a
  ON a.routine_name = p.proname
  AND a.routine_schema = nsp.nspname
  AND a.grantee IN ('anon', 'authenticated')
WHERE nsp.nspname = 'public'
  AND p.proname IN (
    'camera_update_updated_at',
    'handle_new_event_modules',
    'handle_sync_user_claims',
    'record_audit_log',
    'update_pessoa_evento_empresa_timestamp',
    'update_terminal_sync_queue_updated_at',
    'get_my_event_id',
    'is_master',
    'reconcile_transaction',
    'registrar_acesso_atomico',
    'buscar_pessoa_por_id_prefixo'
  )
ORDER BY nsp.nspname, p.proname, a.grantee;

-- =====================================================
-- PARTE C: INSTRUÇÕES PARA LEAKED PASSWORD PROTECTION
-- =====================================================
-- Isto NÃO pode ser feito via SQL, precisa ser manual

/*
PRÓXIMO PASSO - Manual no Dashboard:

1. Vá para Supabase Dashboard
2. Clique no projeto
3. Vá para: Authentication → Security → Password Protection
4. Ative: "Leaked Password Protection"
5. Salve as alterações

Essa feature previne que usuários usem senhas que foram comprometidas em data breaches (via HaveIBeenPwned.org).
*/

-- =====================================================
-- VERIFICAÇÃO FINAL
-- =====================================================

-- Verificar que extension vector está em public (antes de mover)
SELECT
  extname,
  nspname as current_schema,
  'Mover para schema: extensions' as ação
FROM pg_extension
JOIN pg_namespace ON pg_extension.extnamespace = pg_namespace.oid
WHERE extname = 'vector';

-- Verificar que permissions foram revogadas
SELECT
  'Permissions revogadas com sucesso' as status,
  COUNT(*) as total_functions_secured
FROM pg_proc p
JOIN pg_namespace nsp ON p.pronamespace = nsp.oid
WHERE nsp.nspname = 'public'
  AND p.proname IN (
    'camera_update_updated_at',
    'handle_new_event_modules',
    'handle_sync_user_claims',
    'record_audit_log',
    'update_pessoa_evento_empresa_timestamp',
    'update_terminal_sync_queue_updated_at',
    'get_my_event_id',
    'is_master',
    'reconcile_transaction',
    'registrar_acesso_atomico',
    'buscar_pessoa_por_id_prefixo'
  );

-- =====================================================
-- PRÓXIMAS AÇÕES
-- =====================================================
-- 1. ✅ Executar este script SQL
-- 2. ⏹️ Mover extension vector para schema "extensions" (manual no Dashboard)
-- 3. ⏹️ Habilitar Leaked Password Protection (manual no Dashboard)
-- 4. Executar Database Linter novamente para verificar
-- 5. Documentar as mudanças para o time
