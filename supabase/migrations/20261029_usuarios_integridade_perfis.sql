-- ==============================================================================
-- MIGRATION: Integridade e índice único de e-mail na tabela perfis
-- Data: 2026-10-29
-- Idempotente e não destrutiva
-- ==============================================================================

-- 1. Normalizar e-mails existentes em perfis para minúsculas e sem espaços nas bordas
UPDATE public.perfis
SET email = LOWER(BTRIM(email))
WHERE email IS NOT NULL AND email <> LOWER(BTRIM(email));

-- 2. Índice único case-insensitive para evitar duplicidade de e-mail em perfis
CREATE UNIQUE INDEX IF NOT EXISTS idx_perfis_email_lower_unique
    ON public.perfis (LOWER(BTRIM(email)))
    WHERE email IS NOT NULL AND BTRIM(email) <> '';

