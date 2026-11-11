-- ============================================================================
-- Migration: 20261111_pulseiras_fase_data.sql
-- Objetivo: Suportar fase do evento (montagem, evento, desmontagem, todas) e
--           data específica para lotes de pulseira, permitindo repetição de
--           numeração e cores entre etapas diferentes do evento.
-- ============================================================================

ALTER TABLE public.evento_tipos_pulseira
  ADD COLUMN IF NOT EXISTS fase VARCHAR(30) DEFAULT 'todas',
  ADD COLUMN IF NOT EXISTS data_especifica DATE DEFAULT NULL;

COMMENT ON COLUMN public.evento_tipos_pulseira.fase IS 'Fase de validade da pulseira: todas, montagem, evento, desmontagem';
COMMENT ON COLUMN public.evento_tipos_pulseira.data_especifica IS 'Data específica (YYYY-MM-DD) opcional para pulseiras de uso diário único';

CREATE INDEX IF NOT EXISTS idx_evento_tipos_pulseira_fase 
  ON public.evento_tipos_pulseira (evento_id, fase);

