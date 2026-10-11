-- ============================================
-- MIGRATION: Corrigir defaults de fases de acesso
-- Data: 2026-04-23
-- Problema: Participantes criados com fase_montagem/showday/desmontagem = false
--           são bloqueados silenciosamente pelo sistema de validação de fases.
-- Solução: Alterar default para TRUE e corrigir registros existentes.
-- ============================================

-- 1. Alterar defaults da coluna
ALTER TABLE public.pessoas ALTER COLUMN fase_montagem SET DEFAULT true;
ALTER TABLE public.pessoas ALTER COLUMN fase_showday SET DEFAULT true;
ALTER TABLE public.pessoas ALTER COLUMN fase_desmontagem SET DEFAULT true;

-- 2. Corrigir participantes existentes que nunca tiveram as fases configuradas
UPDATE public.pessoas 
SET fase_montagem = true, fase_showday = true, fase_desmontagem = true
WHERE fase_montagem = false AND fase_showday = false AND fase_desmontagem = false;
