-- ==============================================================================
-- MIGRATION: Servidores de IA centrais (fora da rede do evento)
-- Data: 2026-11-12
-- Idempotente. Não remove dados.
--
-- Um servidor de IA (ex.: PC com placa de vídeo na casa/escritório) se conecta À NUVEM, saindo da
-- rede dele (nenhuma porta aberta), e reconhece os rostos recortados enviados pelos PCs dos eventos.
-- O token do servidor é mostrado uma vez; aqui fica só o hash (SHA-256).
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.servidores_ia (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_por UUID,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    ultimo_contato TIMESTAMPTZ,
    ultimo_ip TEXT,
    info JSONB                         -- placa de vídeo, versão, capacidades (enviado ao conectar)
);

-- Sem políticas: só o servidor da API (service role) lê e grava
ALTER TABLE public.servidores_ia ENABLE ROW LEVEL SECURITY;

-- Onde roda o reconhecimento facial de cada evento
--   local  → no PC do evento (como hoje)
--   auto   → no servidor central; se nenhum responder, no PC do evento (reserva)
-- Depende da tabela cameras_evento_config (migration 20261111_cameras_modos_gravacao.sql).
DO $$
BEGIN
    IF to_regclass('public.cameras_evento_config') IS NULL THEN
        RAISE NOTICE 'cameras_evento_config não existe: aplique antes a 20261111_cameras_modos_gravacao.sql e rode esta de novo';
        RETURN;
    END IF;
    ALTER TABLE public.cameras_evento_config ADD COLUMN IF NOT EXISTS ia_onde TEXT NOT NULL DEFAULT 'local';
    ALTER TABLE public.cameras_evento_config DROP CONSTRAINT IF EXISTS cameras_evento_config_ia_onde_check;
    ALTER TABLE public.cameras_evento_config ADD CONSTRAINT cameras_evento_config_ia_onde_check
        CHECK (ia_onde IN ('local', 'auto'));
END $$;
