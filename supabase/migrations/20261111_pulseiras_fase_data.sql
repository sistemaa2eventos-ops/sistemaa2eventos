-- ============================================================================
-- Migration: 20261111_pulseiras_fase_data.sql
-- Objetivo: Suportar fase do evento (montagem, evento, desmontagem, todas),
--           data específica e janela de horários (hora_inicio, hora_fim)
--           para lotes de pulseira, permitindo repetição de numeração e cores
--           entre etapas diferentes do evento (ex: montagem até 16h, show das 16h às 02h, desmontagem após 02h).
-- ============================================================================

ALTER TABLE public.evento_tipos_pulseira
  ADD COLUMN IF NOT EXISTS fase VARCHAR(30) DEFAULT 'todas',
  ADD COLUMN IF NOT EXISTS data_especifica DATE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS hora_inicio TIME DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS hora_fim TIME DEFAULT NULL;

COMMENT ON COLUMN public.evento_tipos_pulseira.fase IS 'Fase de validade da pulseira: todas, montagem, evento, desmontagem';
COMMENT ON COLUMN public.evento_tipos_pulseira.data_especifica IS 'Data específica (YYYY-MM-DD) opcional para pulseiras de uso diário único';
COMMENT ON COLUMN public.evento_tipos_pulseira.hora_inicio IS 'Horário inicial de uso permitido da pulseira (HH:MM:SS)';
COMMENT ON COLUMN public.evento_tipos_pulseira.hora_fim IS 'Horário final de uso permitido da pulseira (HH:MM:SS)';

CREATE INDEX IF NOT EXISTS idx_evento_tipos_pulseira_fase 
  ON public.evento_tipos_pulseira (evento_id, fase);
