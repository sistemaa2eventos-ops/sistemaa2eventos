-- ============================================================================
-- Migration: 20260501_checkin_area_control.sql
-- Purpose: Adequar logs_acesso para controle de acesso por área,
--          expandir CHECK constraints de metodo/tipo, e adicionar
--          índices para relatório de ponto.
-- Root cause: Sistema usava status_acesso global (campo único em pessoas)
--             que impedia múltiplos check-ins/checkouts por área.
-- ============================================================================

-- ============================================
-- PASSO 1: Adicionar area_id em logs_acesso
-- ============================================
ALTER TABLE public.logs_acesso
    ADD COLUMN IF NOT EXISTS area_id UUID REFERENCES public.evento_areas(id) ON DELETE SET NULL;

-- ============================================
-- PASSO 2: Expandir CHECK constraint de 'tipo'
-- O código já insere 'negado' e 'erro_hardware', mas a constraint original
-- só aceita (checkin, checkout, expulsao).
-- ============================================
ALTER TABLE public.logs_acesso DROP CONSTRAINT IF EXISTS logs_acesso_tipo_check;
ALTER TABLE public.logs_acesso
    ADD CONSTRAINT logs_acesso_tipo_check
    CHECK (tipo IN ('checkin', 'checkout', 'expulsao', 'negado', 'erro_hardware'));

-- ============================================
-- PASSO 3: Expandir CHECK constraint de 'metodo'
-- A migration 20260415 restringiu a (facial, pulseira).
-- Operação real exige: manual, qrcode, barcode, facial, pulseira.
-- ============================================
ALTER TABLE public.logs_acesso DROP CONSTRAINT IF EXISTS logs_acesso_metodo_check;
ALTER TABLE public.logs_acesso
    ADD CONSTRAINT logs_acesso_metodo_check
    CHECK (metodo IN ('manual', 'qrcode', 'barcode', 'facial', 'pulseira'));

-- ============================================
-- PASSO 4: Índices para relatório de ponto
-- Otimiza queries: "todas entradas/saídas de pessoa X na área Y no dia Z"
-- ============================================
CREATE INDEX IF NOT EXISTS idx_logs_ponto
    ON public.logs_acesso(pessoa_id, evento_id, area_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_logs_area
    ON public.logs_acesso(area_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_logs_pulseira
    ON public.logs_acesso(numero_pulseira)
    WHERE numero_pulseira IS NOT NULL;

-- ============================================
-- PASSO 5: Garantir coluna tipo_pulseira_id em pessoas
-- Vincula a pessoa ao tipo de pulseira (para resolução de áreas)
-- ============================================
ALTER TABLE public.pessoas
    ADD COLUMN IF NOT EXISTS tipo_pulseira_id UUID REFERENCES public.evento_tipos_pulseira(id) ON DELETE SET NULL;

-- ============================================
-- PASSO 6: Adicionar alerta_duplicidade em evento_tipos_pulseira
-- (pode já existir via outra migration, IF NOT EXISTS garante)
-- ============================================
ALTER TABLE public.evento_tipos_pulseira
    ADD COLUMN IF NOT EXISTS alerta_duplicidade BOOLEAN DEFAULT true;

-- ============================================
-- VERIFICAÇÃO
-- ============================================
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'logs_acesso' AND table_schema = 'public'
ORDER BY ordinal_position;
