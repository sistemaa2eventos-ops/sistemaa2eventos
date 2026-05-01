-- ============================================================================
-- Migration: 20260501_webhooks_api_keys_fixes.sql
-- Purpose: Fix system_api_keys schema + add webhook status tracking columns
-- ============================================================================

-- Fase 1A: Adicionar created_by em system_api_keys (ausência causava 500 ao gerar chave)
ALTER TABLE public.system_api_keys
    ADD COLUMN IF NOT EXISTS created_by VARCHAR(255);

-- Fase 4A: Adicionar colunas de rastreamento de status em system_webhooks
ALTER TABLE public.system_webhooks
    ADD COLUMN IF NOT EXISTS last_dispatch_at  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_status_code  INTEGER,
    ADD COLUMN IF NOT EXISTS failure_count     INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_error        TEXT,
    ADD COLUMN IF NOT EXISTS descricao         VARCHAR(255);
