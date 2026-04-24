-- ========================================================================================
-- AUDITORIA DE SEGURANÇA - A2 EVENTOS
-- Verificar se todas as correções foram aplicadas
-- Execute no Supabase SQL Editor
-- ========================================================================================

-- ========================================================================================
-- SEÇÃO 1: VERIFICAR SEARCH_PATH (Migration 20260422)
-- ========================================================================================

\echo '=== AUDITORIA: SEARCH_PATH EM FUNÇÕES PÚBLICAS ==='

-- Listar funções MUTABLE (problema)
SELECT
    p.proname AS funcao,
    p.provolatile AS volatilidade,
    pg_get_functiondef(p.oid) AS definicao_completa
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
    AND p.provolatile = 'v' -- VOLATILE
    AND p.proname NOT LIKE 'pg_%'
    AND p.proname NOT LIKE 'ts_%'
ORDER BY p.proname;

-- Contar funções com search_path correto
SELECT
    COUNT(*) AS funcoes_com_search_path_correto,
    COUNT(CASE WHEN proconfig IS NOT NULL THEN 1 END) AS funcoes_com_config
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
    AND p.proname NOT LIKE 'pg_%'
    AND p.proname NOT LIKE 'ts_%';

-- ========================================================================================
-- SEÇÃO 2: VERIFICAR RLS POLICIES (Migration 20260414)
-- ========================================================================================

\echo '=== AUDITORIA: ROW LEVEL SECURITY POLICIES ==='

-- Tabelas COM RLS habilitado
SELECT
    tablename,
    COUNT(*) as total_policies
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;

-- Tabelas SEM RLS (problema)
SELECT
    schemaname,
    tablename
FROM pg_tables
WHERE schemaname = 'public'
    AND rowsecurity = false
    AND tablename NOT LIKE 'pg_%'
ORDER BY tablename;

-- ========================================================================================
-- SEÇÃO 3: VERIFICAR POLÍTICAS "ALLOW_ALL" (Devem estar removidas)
-- ========================================================================================

\echo '=== AUDITORIA: POLÍTICAS INSEGURAS "ALLOW_ALL" ==='

SELECT
    tablename,
    policyname,
    qual as condicao
FROM pg_policies
WHERE schemaname = 'public'
    AND policyname = 'allow_all';

-- Se a query acima retorna resultados, há problemas!

-- ========================================================================================
-- SEÇÃO 4: VERIFICAR ROLES (master, admin, supervisor, operador)
-- ========================================================================================

\echo '=== AUDITORIA: ROLES E METADATA ==='

-- Verificar estructura de auth metadata em policies
SELECT
    tablename,
    policyname,
    qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname
LIMIT 5;

-- ========================================================================================
-- SEÇÃO 5: VERIFICAR VIEWS E SECURITY DEFINER
-- ========================================================================================

\echo '=== AUDITORIA: SECURITY INVOKER vs SECURITY DEFINER ==='

SELECT
    schemaname,
    viewname,
    view_definition
FROM information_schema.views
WHERE schemaname = 'public'
    AND (definition LIKE '%SECURITY DEFINER%' OR definition LIKE '%SECURITY INVOKER%')
ORDER BY viewname;

-- ========================================================================================
-- SEÇÃO 6: RESUMO EXECUTIVO
-- ========================================================================================

\echo '=== RESUMO EXECUTIVO DE SEGURANÇA ==='

SELECT
    'Tabelas com RLS' AS item,
    COUNT(*)::TEXT AS valor
FROM pg_tables
WHERE schemaname = 'public' AND rowsecurity = true

UNION ALL

SELECT
    'Total de Políticas RLS',
    COUNT(*)::TEXT
FROM pg_policies
WHERE schemaname = 'public'

UNION ALL

SELECT
    'Funções Públicas',
    COUNT(*)::TEXT
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
    AND p.proname NOT LIKE 'pg_%'
    AND p.proname NOT LIKE 'ts_%'

UNION ALL

SELECT
    'Policies INSEGURAS (allow_all)',
    COUNT(*)::TEXT
FROM pg_policies
WHERE schemaname = 'public' AND policyname = 'allow_all';

-- ========================================================================================
-- INSTRUÇÕES DE USO
-- ========================================================================================

/*
COMO USAR:
1. Abra o Supabase SQL Editor
2. Cole TODO o conteúdo deste arquivo
3. Execute
4. Analise os resultados em cada SEÇÃO

ESPERADO (se tudo está OK):
✅ SEÇÃO 1: Nenhuma função VOLATILE sem search_path configurado
✅ SEÇÃO 2: Muitas políticas RLS distribuídas entre as tabelas
✅ SEÇÃO 3: Zero resultados (não deve haver 'allow_all')
✅ SEÇÃO 5: Nenhuma view com 'SECURITY DEFINER'
✅ SEÇÃO 6: Números altos de tabelas com RLS e políticas

PROBLEMA DETECTADO:
❌ Se houver resultados em SEÇÃO 3, executar:
   - Remover todas as políticas 'allow_all'
   - Executar a migration 20260414_security_complete_fix.sql

❌ Se SEÇÃO 1 mostrar funções VOLATILE sem config:
   - Executar a migration 20260414_security_complete_fix.sql (Fase 2)
*/
