-- ============================================================================
-- Migration: 20261119g_tipo_area.sql
-- Objetivo: cada área tem um TIPO de operação:
--   checkin_checkout : entrada e saída de pulseira livres (padrão)
--   liberacao_acesso : portão (entrada única por etapa/dia, reentrada com liberação)
--   monitoramento    : só vigilância; não registra entrada nem saída
--
-- Segurança de dados:
--   - Só ADD COLUMN IF NOT EXISTS, backfill da coluna nova e CHECK. NÃO apaga nada.
--   - Backfill coerente com o comportamento atual: áreas com controla_entrada = true viram liberacao_acesso;
--     as demais viram checkin_checkout. Nenhuma regra de acesso muda por causa desta migration.
--   - Idempotente (pode rodar mais de uma vez).
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '3s';

ALTER TABLE public.evento_areas
    ADD COLUMN IF NOT EXISTS tipo_area TEXT NOT NULL DEFAULT 'checkin_checkout';

-- Backfill só das linhas ainda no padrão (a coluna acabou de nascer, então isto cobre todas)
UPDATE public.evento_areas
   SET tipo_area = CASE WHEN controla_entrada IS TRUE THEN 'liberacao_acesso' ELSE 'checkin_checkout' END
 WHERE tipo_area = 'checkin_checkout'
   AND controla_entrada IS TRUE;

-- CHECK nomeado para ficar idempotente
ALTER TABLE public.evento_areas DROP CONSTRAINT IF EXISTS evento_areas_tipo_area_check;
ALTER TABLE public.evento_areas
    ADD CONSTRAINT evento_areas_tipo_area_check
    CHECK (tipo_area IN ('checkin_checkout', 'liberacao_acesso', 'monitoramento'));

COMMIT;

NOTIFY pgrst, 'reload schema';
