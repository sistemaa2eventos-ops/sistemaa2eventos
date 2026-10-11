-- ============================================
-- A2 EVENTOS - VÍNCULO DE PULSEIRA
-- Data: 2026-09-14
-- Objetivo: Suportar o credenciamento vinculado à pulseira
-- ============================================

-- Adiciona a coluna para o número da pulseira
ALTER TABLE public.pessoas
ADD COLUMN IF NOT EXISTS numero_pulseira VARCHAR(50);

-- Adiciona a coluna referenciando o tipo (lote) de pulseira
ALTER TABLE public.pessoas
ADD COLUMN IF NOT EXISTS tipo_pulseira_id UUID REFERENCES public.evento_tipos_pulseira(id) ON DELETE SET NULL;

-- Garante que um número de pulseira seja único DENTRO de um mesmo tipo_pulseira num mesmo evento
CREATE UNIQUE INDEX IF NOT EXISTS idx_pessoas_pulseira_unica
ON public.pessoas(evento_id, tipo_pulseira_id, numero_pulseira)
WHERE numero_pulseira IS NOT NULL AND tipo_pulseira_id IS NOT NULL;

-- Índice secundário para buscas rápidas (checkout)
CREATE INDEX IF NOT EXISTS idx_pessoas_numero_pulseira
ON public.pessoas(numero_pulseira)
WHERE numero_pulseira IS NOT NULL;
