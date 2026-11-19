-- ============================================================================
-- Migration: 20261118_logs_entrada_etapa.sql
-- Objetivo: entrada única por etapa. Uma pessoa não tem duas ENTRADAS (tipo 'checkin') na mesma
--           etapa (fase do lote: montagem, evento, desmontagem, todas), no mesmo dia civil
--           (America/Sao_Paulo) e na mesma área (área vazia = portaria/geral).
--           O índice único garante a regra mesmo com duas leituras simultâneas (corrida).
--
-- Índices:
--   uq_logs_entrada_etapa_dia         → passagens reais (observacao <> 'CREDENCIAMENTO')
--   uq_logs_credenciamento_etapa_dia  → credenciamentos (entrega de pulseira, observacao = 'CREDENCIAMENTO')
--   Credenciamento não conta como passagem para os leitores (mesma regra do anti-passback),
--   por isso são dois índices.
--
-- Segurança de dados:
--   - NÃO apaga, NÃO altera e NÃO reescreve linhas existentes. Linhas antigas ficam com etapa e
--     dia_civil NULL e ficam fora dos índices.
--   - Se o CREATE UNIQUE INDEX encontrar duplicidade, falha e a transação inteira é desfeita
--     (nada é removido para "resolver"; a duplicidade precisa ser conferida à mão).
--   - Executar fora do horário de evento: o CREATE INDEX (sem CONCURRENTLY, para caber na transação)
--     bloqueia escritas em logs_acesso enquanto roda.
--
-- Código que depende disto: backend/api-nodejs/src/modules/checkin/services/entradaEtapa.js
--   (sem as colunas, o servidor grava como antes e avisa no log; a checagem fica desligada).
-- ============================================================================

BEGIN;

ALTER TABLE public.logs_acesso ADD COLUMN IF NOT EXISTS etapa VARCHAR(30);
ALTER TABLE public.logs_acesso ADD COLUMN IF NOT EXISTS dia_civil DATE;

COMMENT ON COLUMN public.logs_acesso.etapa IS 'Fase do lote que valia no acesso: todas, montagem, evento, desmontagem (showday gravado como evento)';
COMMENT ON COLUMN public.logs_acesso.dia_civil IS 'Dia civil local (America/Sao_Paulo) do acesso; created_at é UTC';

CREATE UNIQUE INDEX IF NOT EXISTS uq_logs_entrada_etapa_dia
  ON public.logs_acesso (
    evento_id,
    pessoa_id,
    etapa,
    dia_civil,
    (COALESCE(area_id, '00000000-0000-0000-0000-000000000000'::uuid))
  )
  WHERE tipo = 'checkin'
    AND etapa IS NOT NULL
    AND dia_civil IS NOT NULL
    AND observacao IS DISTINCT FROM 'CREDENCIAMENTO';

CREATE UNIQUE INDEX IF NOT EXISTS uq_logs_credenciamento_etapa_dia
  ON public.logs_acesso (
    evento_id,
    pessoa_id,
    etapa,
    dia_civil,
    (COALESCE(area_id, '00000000-0000-0000-0000-000000000000'::uuid))
  )
  WHERE tipo = 'checkin'
    AND etapa IS NOT NULL
    AND dia_civil IS NOT NULL
    AND observacao = 'CREDENCIAMENTO';

COMMIT;
