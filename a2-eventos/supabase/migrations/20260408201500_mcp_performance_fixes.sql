-- Script 2: MCP Performance Advisor Fixes

-- 1. Create missing indexes for Foreign Keys
-- Context: 'mensagem_templates' references 'eventos' (evento_id)
CREATE INDEX IF NOT EXISTS idx_mensagem_templates_evento_id ON public.mensagem_templates (evento_id);


-- 2. Query para o administrador otimizar funções de cache no RLS (InitPlan)
-- Executar no SQL Editor do Supabase para gerar os comandos ALTER POLICY.
-- Isso substitui auth.uid() puro por (select auth.uid())
/*
SELECT 
    'ALTER POLICY "' || policyname || '" ON ' || schemaname || '."' || tablename || '" USING (' || REPLACE(qual, 'auth.uid()', '(select auth.uid())') || ');'
FROM pg_policies
WHERE schemaname = 'public' 
  AND qual LIKE '%auth.uid()%' 
  AND qual NOT LIKE '%(select auth.uid())%';
*/

-- 3. Query para limpar índices não utilizados
-- Identificar os índices criados que não foram usados para reads, mas sofrem writes.
/*
SELECT
    schemaname || '.' || relname AS table_name,
    indexrelname AS index_name,
    idx_scan AS number_of_scans,
    pg_size_pretty(pg_relation_size(i.indexrelid)) AS index_size
FROM pg_stat_user_indexes i
JOIN pg_index USING (indexrelid)
WHERE idx_scan = 0
  AND indisunique IS FALSE
ORDER BY pg_relation_size(i.indexrelid) DESC;
*/
