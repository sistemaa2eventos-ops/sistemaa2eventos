-- ============================================================================
-- Migration: 20260501_checkin_area_control.sql
-- Purpose: Adequar logs_acesso para controle de acesso por área,
--          expandir CHECK constraints de metodo/tipo, e adicionar
--          índices para relatório de ponto.
-- Root cause: Sistema usava status_acesso global (campo único em pessoas)
--             que impedia múltiplos check-ins/checkouts por área.
-- SAFETY: Remove ALL check constraints on metodo/tipo columns (by querying
--         pg_constraint) to handle auto-generated constraint names.
-- ============================================================================

-- ============================================
-- PASSO 1: Adicionar area_id em logs_acesso
-- ============================================
ALTER TABLE public.logs_acesso
    ADD COLUMN IF NOT EXISTS area_id UUID REFERENCES public.evento_areas(id) ON DELETE SET NULL;

-- ============================================
-- PASSO 2: Dropar TODAS as CHECK constraints da coluna 'tipo'
-- (Postgres pode gerar nomes automáticos como logs_acesso_tipo_check,
--  logs_acesso_tipo_check1, etc.)
-- ============================================
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT con.conname
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE rel.relname = 'logs_acesso'
          AND nsp.nspname = 'public'
          AND con.contype = 'c'  -- CHECK constraint
          AND pg_get_constraintdef(con.oid) ILIKE '%tipo%'
    LOOP
        EXECUTE format('ALTER TABLE public.logs_acesso DROP CONSTRAINT IF EXISTS %I', r.conname);
        RAISE NOTICE 'Dropped constraint: %', r.conname;
    END LOOP;
END $$;

-- Agora adicionar constraint expandida para 'tipo'
ALTER TABLE public.logs_acesso
    ADD CONSTRAINT logs_acesso_tipo_check
    CHECK (tipo IN ('checkin', 'checkout', 'expulsao', 'negado', 'erro_hardware'));

-- ============================================
-- PASSO 3: Dropar TODAS as CHECK constraints da coluna 'metodo'
-- ============================================
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT con.conname
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE rel.relname = 'logs_acesso'
          AND nsp.nspname = 'public'
          AND con.contype = 'c'
          AND pg_get_constraintdef(con.oid) ILIKE '%metodo%'
    LOOP
        EXECUTE format('ALTER TABLE public.logs_acesso DROP CONSTRAINT IF EXISTS %I', r.conname);
        RAISE NOTICE 'Dropped constraint: %', r.conname;
    END LOOP;
END $$;

-- Normalizar dados existentes ANTES de criar a nova constraint
-- Garante que não existam valores órfãos que violem a nova constraint
UPDATE public.logs_acesso SET metodo = 'facial'   WHERE metodo = 'face';
UPDATE public.logs_acesso SET metodo = 'manual'    WHERE metodo = 'fast-track';
UPDATE public.logs_acesso SET metodo = 'pulseira'  WHERE metodo = 'rfid';
-- Qualquer outro valor desconhecido → manual (segurança)
UPDATE public.logs_acesso SET metodo = 'manual'
    WHERE metodo NOT IN ('manual', 'qrcode', 'barcode', 'facial', 'pulseira');

-- Agora adicionar constraint expandida para 'metodo'
ALTER TABLE public.logs_acesso
    ADD CONSTRAINT logs_acesso_metodo_check
    CHECK (metodo IN ('manual', 'qrcode', 'barcode', 'facial', 'pulseira'));

-- ============================================
-- PASSO 4: Índices para relatório de ponto
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
-- ============================================
ALTER TABLE public.pessoas
    ADD COLUMN IF NOT EXISTS tipo_pulseira_id UUID REFERENCES public.evento_tipos_pulseira(id) ON DELETE SET NULL;

-- ============================================
-- PASSO 6: Garantir coluna alerta_duplicidade em evento_tipos_pulseira
-- ============================================
ALTER TABLE public.evento_tipos_pulseira
    ADD COLUMN IF NOT EXISTS alerta_duplicidade BOOLEAN DEFAULT true;

-- ============================================
-- VERIFICAÇÃO FINAL
-- ============================================
DO $$
DECLARE
    bad_metodo INTEGER;
    bad_tipo INTEGER;
BEGIN
    SELECT COUNT(*) INTO bad_metodo FROM public.logs_acesso
        WHERE metodo NOT IN ('manual', 'qrcode', 'barcode', 'facial', 'pulseira');
    SELECT COUNT(*) INTO bad_tipo FROM public.logs_acesso
        WHERE tipo NOT IN ('checkin', 'checkout', 'expulsao', 'negado', 'erro_hardware');

    IF bad_metodo > 0 THEN
        RAISE EXCEPTION 'ABORT: % rows com metodo inválido', bad_metodo;
    END IF;
    IF bad_tipo > 0 THEN
        RAISE EXCEPTION 'ABORT: % rows com tipo inválido', bad_tipo;
    END IF;

    RAISE NOTICE 'Migration OK — 0 violations found';
END $$;

-- Listar constraints finais para auditoria
SELECT con.conname, pg_get_constraintdef(con.oid)
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
WHERE rel.relname = 'logs_acesso'
  AND nsp.nspname = 'public'
  AND con.contype = 'c'
ORDER BY con.conname;
