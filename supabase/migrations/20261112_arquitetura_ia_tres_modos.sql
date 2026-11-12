-- ==============================================================================
-- MIGRATION: Arquitetura de IA do Evento — 3 Modos Operacionais
-- Data: 2026-11-12
-- Idempotente. Não remove dados.
--
-- Permite os 3 modos de operação:
--   1. 'local'            → Servidor no Evento (PC com GPU dedicado na rede local do evento, 100% offline)
--   2. 'auto'             → Híbrido Inteligente (Notebook no evento acha rostos, Servidor Central diz quem é, reserva local)
--   3. 'direto_servidor'  → Central Remota (Câmeras IP transmitem direto pela internet para o Servidor Central de IA)
-- ==============================================================================

DO $$
BEGIN
    IF to_regclass('public.cameras_evento_config') IS NOT NULL THEN
        ALTER TABLE public.cameras_evento_config ADD COLUMN IF NOT EXISTS ia_onde TEXT NOT NULL DEFAULT 'local';
        ALTER TABLE public.cameras_evento_config DROP CONSTRAINT IF EXISTS cameras_evento_config_ia_onde_check;
        ALTER TABLE public.cameras_evento_config ADD CONSTRAINT cameras_evento_config_ia_onde_check
            CHECK (ia_onde IN ('local', 'auto', 'direto_servidor'));
    END IF;
END $$;
