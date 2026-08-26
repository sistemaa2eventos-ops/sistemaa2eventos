-- ============================================
-- FASE 2: IMPORTANTE - Próxima Semana
-- ============================================
-- Tempo: ~30 minutos
-- Risco: Médio (testar antes em staging)

-- 1️⃣  ADICIONAR search_path EM TODAS AS FUNÇÕES SECURITY DEFINER
-- =====================================================
-- Este script encontra e exibe todas as funções que precisam de search_path

-- Listar funções SECURITY DEFINER que faltam search_path
SELECT
  r.routine_name,
  r.routine_schema,
  CASE
    WHEN r.routine_definition LIKE '%SET search_path%' THEN 'JÁ TEM search_path ✅'
    ELSE 'PRECISA ADICIONAR search_path ⚠️'
  END as status,
  r.routine_definition
FROM information_schema.routines r
WHERE r.routine_schema = 'public'
  AND r.routine_definition LIKE '%SECURITY DEFINER%'
  AND r.routine_definition NOT LIKE '%SET search_path%'
ORDER BY r.routine_name;

-- Exemplo de como corrigir (adapte para cada função):
-- CREATE OR REPLACE FUNCTION public.seu_funcao()
-- RETURNS ... AS $$
-- BEGIN
--   -- seu código
-- END;
-- $$ LANGUAGE plpgsql SECURITY DEFINER
-- SET search_path = public;

-- 2️⃣  ADICIONAR VALIDAÇÕES EM FUNÇÕES PÚBLICAS SENSÍVEIS
-- =====================================================

-- A. registrar_acesso_atomico - VALIDAR AUTENTICAÇÃO
-- Adicione no início da função:
/*
IF auth.uid() IS NULL THEN
  RAISE EXCEPTION 'Autenticação necessária para registrar acesso';
END IF;
*/

-- B. reconcile_transaction - VALIDAR ROLE
-- Adicione no início da função:
/*
IF (SELECT role FROM public.perfis WHERE user_id = auth.uid()) NOT IN ('master', 'admin') THEN
  RAISE EXCEPTION 'Apenas admin pode reconciliar transações';
END IF;
*/

-- C. buscar_pessoa_por_id_prefixo - MUDAR PARA SECURITY INVOKER
-- Se for uma busca pública, pode ser SECURITY INVOKER:
/*
CREATE OR REPLACE FUNCTION public.buscar_pessoa_por_id_prefixo(prefixo text)
RETURNS TABLE(...) AS $$
BEGIN
  -- seu código
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;
*/

-- 3️⃣  HABILITAR LEAKED PASSWORD PROTECTION
-- =====================================================
-- ⚠️  Isso deve ser feito no Dashboard do Supabase, não via SQL
-- Mas você pode verificar se está habilitado executando:

SELECT
  'Auth' as sistema,
  'Leaked Password Protection' as feature,
  'Verificar em: Dashboard → Authentication → Security' as como_habilitar,
  'Ativa' as status_esperado;

-- 4️⃣  PREPARAR PARA MOVER EXTENSÃO vector
-- =====================================================

-- Criar schema separado para extensões
CREATE SCHEMA IF NOT EXISTS extensions;

-- Dar permissões
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;

-- ⚠️  ATENÇÃO: Mover a extensão vector requer:
-- 1. Backup do banco
-- 2. Contato com Supabase support (pode não ser possível via SQL direto)
-- 3. Alternativa: desabilitar a extensão e recriar em novo schema

-- Verificar status atual
SELECT extname, extversion, nspname
FROM pg_extension
JOIN pg_namespace ON pg_extension.extnamespace = pg_namespace.oid
WHERE extname = 'vector';

-- 5️⃣  REVISAR E DOCUMENTAR FUNÇÕES WEBHOOK vs RPC
-- =====================================================

-- Funções que PODEM ser webhooks (não precisam estar em public RPC):
SELECT
  'handle_new_event_modules' as funcao,
  'Verificar se é acionada por webhook ou chamada direto' as acao
UNION ALL
SELECT 'handle_sync_user_claims', 'Webhook ou RPC?'
UNION ALL
SELECT 'update_terminal_sync_queue_updated_at', 'Webhook ou RPC?'
UNION ALL
SELECT 'record_audit_log', 'Sistema ou RPC?'
UNION ALL
SELECT 'is_master', 'Helper interno ou exposto?';

-- Se for WEBHOOK (acionada por evento externo):
-- → Use API KEY específica, não RPC pública
-- → Remova do schema public ou revogue EXECUTE do anon

-- Se for RPC (chamada do frontend/app):
-- → Mantenha em public mas com validações
-- → Adicione: IF auth.uid() IS NULL THEN RAISE...

-- =====================================================
-- CHECKLIST DE IMPLEMENTAÇÃO
-- =====================================================
-- [ ] Revisar cada função SECURITY DEFINER listada
-- [ ] Adicionar search_path em todas
-- [ ] Adicionar validações em funções sensíveis
-- [ ] Testar em staging antes de aplicar em produção
-- [ ] Habilitar Leaked Password Protection no Dashboard
-- [ ] Decidir destino da extensão vector
-- [ ] Documentar quais funções são webhook vs RPC

-- =====================================================
-- PRÓXIMO PASSO
-- =====================================================
-- Após implementar FASE 2:
-- 1. Executar testes completos no staging
-- 2. Monitorar logs por 24h em produção
-- 3. Agendar FASE 3 (limpeza) para quando tiver downtime
