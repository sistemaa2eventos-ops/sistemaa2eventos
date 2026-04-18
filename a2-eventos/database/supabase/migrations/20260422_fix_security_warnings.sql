-- ========================================================================================
-- MIGRATION: Corrigir Avisos de Segurança do Database Linter
-- Data: 2026-04-22
-- Descrição: Resolve issues de search_path mutable em funções
-- ========================================================================================

-- 🔒 FIX #1: Function Search Path Mutable
-- Corrige a função update_terminal_sync_queue_updated_at

DROP FUNCTION IF EXISTS public.update_terminal_sync_queue_updated_at CASCADE;

CREATE OR REPLACE FUNCTION public.update_terminal_sync_queue_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
SECURITY DEFINER
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Recriar o trigger se existir
DROP TRIGGER IF EXISTS update_terminal_sync_queue_updated_at_trigger ON terminal_sync_queue;

CREATE TRIGGER update_terminal_sync_queue_updated_at_trigger
BEFORE UPDATE ON terminal_sync_queue
FOR EACH ROW
EXECUTE FUNCTION public.update_terminal_sync_queue_updated_at();

-- ✅ Sucesso
SELECT '✅ Segurança de funções corrigida!' AS resultado;
