-- ============================================
-- Migration: Atualizar system_webhooks para suportar múltiplos eventos
-- Execute no Supabase SQL Editor
-- ============================================

-- Adicionar coluna de eventos (array) se não existir
ALTER TABLE public.system_webhooks 
ADD COLUMN IF NOT EXISTS eventos VARCHAR(50)[] DEFAULT ARRAY['CHECKIN', 'CHECKOUT', 'NOVO_CADASTRO', 'PESSOA_BLOQUEADA']::varchar[];

-- Adicionar coluna de descrição
ALTER TABLE public.system_webhooks 
ADD COLUMN IF NOT EXISTS descricao VARCHAR(255);

-- Verificar estrutura
SELECT column_name, data_type, column_default
FROM information_schema.columns 
WHERE table_name = 'system_webhooks' AND table_schema = 'public'
ORDER BY ordinal_position;