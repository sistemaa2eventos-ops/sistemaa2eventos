-- Migration: 20261124_documento_liberacoes.sql
-- Objetivo: rastrear liberações diárias de pessoas com documentação pendente

CREATE TABLE public.documento_liberacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pessoa_id UUID NOT NULL REFERENCES public.pessoas(id) ON DELETE CASCADE,
  evento_id UUID NOT NULL REFERENCES public.eventos(id) ON DELETE CASCADE,
  data_liberacao DATE NOT NULL,
  motivo TEXT,
  liberado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  liberado_em TIMESTAMPTZ DEFAULT now(),

  -- Garante que não há duplicata do mesmo evento/pessoa/data
  UNIQUE(pessoa_id, evento_id, data_liberacao),

  CONSTRAINT chk_data_liberacao_positiva CHECK (data_liberacao >= CURRENT_DATE)
);

CREATE INDEX idx_documento_liberacoes_evento ON public.documento_liberacoes(evento_id, data_liberacao DESC);
CREATE INDEX idx_documento_liberacoes_pessoa ON public.documento_liberacoes(pessoa_id, evento_id);
CREATE INDEX idx_documento_liberacoes_data ON public.documento_liberacoes(data_liberacao);

-- RLS: apenas admin_master e operadores do evento podem ver/criar
ALTER TABLE public.documento_liberacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_master_all" ON public.documento_liberacoes
  FOR ALL USING (auth.jwt() ->> 'role' = 'authenticated' AND EXISTS (
    SELECT 1 FROM public.perfis p WHERE p.id = auth.uid() AND p.nivel_acesso = 'admin_master'
  ));

CREATE POLICY "operador_evento" ON public.documento_liberacoes
  FOR ALL USING (auth.jwt() ->> 'role' = 'authenticated' AND EXISTS (
    SELECT 1 FROM public.perfis p
    WHERE p.id = auth.uid() AND p.evento_id = documento_liberacoes.evento_id
  ));
