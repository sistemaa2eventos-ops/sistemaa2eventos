-- =====================================================
-- DIAGNÓSTICO: Estrutura da tabela PERFIS
-- =====================================================

-- 1. Ver todas as colunas de perfis
SELECT
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'perfis'
ORDER BY ordinal_position;

-- 2. Contar registros
SELECT COUNT(*) as total_registros FROM public.perfis;

-- 3. Ver um registro de exemplo
SELECT * FROM public.perfis LIMIT 1;
