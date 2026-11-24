-- Migration: 20261124_pulseiras_pendencia.sql
-- Objetivo: rastrear pulseiras não devolvidas de dias anteriores + motivo da não devolução

CREATE TABLE public.pulseiras_pendencia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pessoa_id UUID NOT NULL REFERENCES public.pessoas(id) ON DELETE CASCADE,
  evento_id UUID NOT NULL REFERENCES public.eventos(id) ON DELETE CASCADE,
  numero_pulseira INTEGER NOT NULL,
  data_checkin_anterior TIMESTAMPTZ NOT NULL,
  motivo_nao_devolucao TEXT,
  registrado_em TIMESTAMPTZ DEFAULT now(),
  registrado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Garante que não há duplicata do mesmo número/evento/pessoa/data
  UNIQUE(pessoa_id, evento_id, numero_pulseira, data_checkin_anterior),

  -- Indexar para queries rápidas
  CONSTRAINT chk_numero_positivo CHECK (numero_pulseira > 0)
);

CREATE INDEX idx_pulseiras_pendencia_evento ON public.pulseiras_pendencia(evento_id, registrado_em DESC);
CREATE INDEX idx_pulseiras_pendencia_pessoa ON public.pulseiras_pendencia(pessoa_id, evento_id);
CREATE INDEX idx_pulseiras_pendencia_numero ON public.pulseiras_pendencia(numero_pulseira, evento_id);

-- RLS: apenas admin_master e operadores do evento podem ver/criar
ALTER TABLE public.pulseiras_pendencia ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_master_all" ON public.pulseiras_pendencia
  FOR ALL USING (auth.jwt() ->> 'role' = 'authenticated' AND EXISTS (
    SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.nivel_acesso = 'admin_master'
  ));

CREATE POLICY "operador_evento" ON public.pulseiras_pendencia
  FOR ALL USING (auth.jwt() ->> 'role' = 'authenticated' AND EXISTS (
    SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.evento_id = evento_id
  ));
