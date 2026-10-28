-- ==============================================================================
-- MIGRATION: Opções de IA por câmera (Configurações > IA facial e câmeras)
-- Data: 2026-10-28
-- Idempotente: pode ser executada mais de uma vez. Não remove dados.
-- A configuração geral da IA (perfil e ajustes) fica em system_settings.config.ia_facial.
-- ==============================================================================

ALTER TABLE public.cameras_ip
    ADD COLUMN IF NOT EXISTS ia_ativa BOOLEAN NOT NULL DEFAULT TRUE,          -- reconhecimento facial nesta câmera
    ADD COLUMN IF NOT EXISTS vigilancia_ativa BOOLEAN NOT NULL DEFAULT TRUE,  -- IA 24 h, mesmo com o painel fechado
    ADD COLUMN IF NOT EXISTS prioridade SMALLINT NOT NULL DEFAULT 1,          -- 0 baixa · 1 normal · 2 alta · 3 crítica
    ADD COLUMN IF NOT EXISTS url_substream TEXT;                              -- vazio: deduzido do stream principal

ALTER TABLE public.cameras_ip DROP CONSTRAINT IF EXISTS cameras_ip_prioridade_check;
ALTER TABLE public.cameras_ip ADD CONSTRAINT cameras_ip_prioridade_check CHECK (prioridade BETWEEN 0 AND 3);
