-- ============================================
-- MIGRATION: Fix colunas faltantes em logs_acesso
-- Data: 2026-04-16
-- Audit ref: C-07 — campos inseridos pelo código mas inexistentes no schema
-- ============================================

-- 1. numero_pulseira: identificador físico da pulseira usada no check-in
ALTER TABLE public.logs_acesso
    ADD COLUMN IF NOT EXISTS numero_pulseira VARCHAR(50);

-- 2. status_log: resultado do acesso (autorizado, confianca_baixa, negado, etc.)
ALTER TABLE public.logs_acesso
    ADD COLUMN IF NOT EXISTS status_log VARCHAR(30) DEFAULT 'autorizado';

-- 3. terminal_id: FK para terminal facial/catraca que originou o acesso
ALTER TABLE public.logs_acesso
    ADD COLUMN IF NOT EXISTS terminal_id UUID;

-- 4. Adicionar FK para terminais_faciais (se a tabela já existir)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'terminais_faciais'
    ) THEN
        ALTER TABLE public.logs_acesso
            DROP CONSTRAINT IF EXISTS logs_acesso_terminal_id_fkey;
        ALTER TABLE public.logs_acesso
            ADD CONSTRAINT logs_acesso_terminal_id_fkey
            FOREIGN KEY (terminal_id) REFERENCES public.terminais_faciais(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 5. sync_id: ID de sincronização para registros offline
ALTER TABLE public.logs_acesso
    ADD COLUMN IF NOT EXISTS sync_id UUID;

-- 6. observacao: campo livre para notas (bypass de cota, erros de hardware, etc.)
ALTER TABLE public.logs_acesso
    ADD COLUMN IF NOT EXISTS observacao TEXT;

-- 7. confianca: nível de confiança do reconhecimento facial (0-100)
ALTER TABLE public.logs_acesso
    ADD COLUMN IF NOT EXISTS confianca SMALLINT;

-- 8. foto_capturada: URL da foto capturada pelo terminal
ALTER TABLE public.logs_acesso
    ADD COLUMN IF NOT EXISTS foto_capturada TEXT;

-- ============================================
-- VERIFICAÇÃO
-- ============================================
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'logs_acesso' AND table_schema = 'public'
ORDER BY ordinal_position;
