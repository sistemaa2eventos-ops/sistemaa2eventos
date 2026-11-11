-- ==============================================================================
-- MIGRATION: Estação do operador identificada por câmeras com IA (além do leitor facial)
-- Data: 2026-11-11
-- Idempotente. Não remove dados.
--
-- A estação (Baia 01, Guichê A...) de check-in/check-out pode ter um leitor facial, câmeras com IA
-- ou os dois. Quando uma das câmeras reconhece alguém, a estação abre a conferência (check-in) ou
-- dá a saída (check-out), como já faz com o leitor.
-- ==============================================================================

ALTER TABLE public.sessoes_operador ALTER COLUMN dispositivo_id DROP NOT NULL;
ALTER TABLE public.sessoes_operador ADD COLUMN IF NOT EXISTS camera_ids UUID[] NOT NULL DEFAULT '{}';

-- Toda estação precisa de pelo menos uma fonte de identificação
ALTER TABLE public.sessoes_operador DROP CONSTRAINT IF EXISTS sessoes_operador_tem_fonte;
ALTER TABLE public.sessoes_operador ADD CONSTRAINT sessoes_operador_tem_fonte
    CHECK (dispositivo_id IS NOT NULL OR cardinality(camera_ids) > 0);

-- Achar rápido a estação ativa de uma câmera
CREATE INDEX IF NOT EXISTS idx_sessao_camera_ids ON public.sessoes_operador USING gin (camera_ids) WHERE (ativo = true);

COMMENT ON COLUMN public.sessoes_operador.camera_ids IS 'Câmeras com IA que identificam a pessoa nesta estação (abre a conferência no check-in, dá a saída no check-out)';
