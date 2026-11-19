-- ============================================================================
-- Migration: 20261119_controle_entrada_portao.sql
-- Objetivo: área que CONTROLA ENTRADA (portão). Regra decidida pela operação:
--
--   Área com controla_entrada = true (default, e sempre a área geral, area_id nulo):
--     - entrada (checkin) com etapa/dia: bloqueada se a pessoa está DENTRO (último registro de passagem
--       da etapa/dia/área é checkin) → HINT 'false|<instante>' (liberável = false);
--     - entrada depois de SAÍDA (último registro é checkout): bloqueada, a menos que exista liberação
--       em liberacoes_reentrada para a pessoa/etapa/dia/área com criado_em posterior a essa saída
--       → HINT 'true|<instante>' (liberável = true);
--     - sem nenhum registro anterior na etapa/dia/área: entrada livre.
--   Área com controla_entrada = false: nada é bloqueado; entrada e saída quantas vezes precisar.
--   Saída (checkout): só insere, como antes.
--   CREDENCIAMENTO NÃO TEM REGRA PRÓPRIA: é entrada/saída comum. Conta como passagem, entra na regra de
--   entrada única, na reentrada com liberação e nas contagens. Quem chama grava tipo 'checkin' comum (sem
--   observacao 'CREDENCIAMENTO'). Por isso esta migration também não considera a observacao: qualquer
--   checkin/checkout com etapa é passagem.
--
-- Formato do erro P0409 (ERRCODE 'P0409', mensagem fixa). A HINT é 'liberavel|instante':
--   'false|2026-11-19T17:05:00Z'  → pessoa ainda dentro desde 17:05 UTC (liberável = false)
--   'true|2026-11-19T17:05:00Z'   → saiu às 17:05 UTC sem liberação (liberável = true)
--   O instante é o created_at (UTC, formato ISO com 'Z') do último registro de passagem.
--   A migration 20261118b (corpo antigo, HINT sem o prefixo) ainda funciona: o backend lê HINT sem
--   prefixo como "dentro".
--
-- Liberação: linha em public.liberacoes_reentrada gravada pelo painel (POST /api/checkin/liberar-reentrada).
-- Vale só para a pessoa, área, etapa e dia civil informados e só para saídas ANTERIORES a ela.
--
-- O que esta migration faz:
--   1. Guarda: confere tabelas e colunas usadas. Se faltar alguma, recusa rodar (RAISE EXCEPTION) e a
--      transação é desfeita. Não "conserta" nada sozinha.
--   2. ALTER TABLE evento_areas ADD COLUMN controla_entrada BOOLEAN NOT NULL DEFAULT true
--      (áreas existentes ficam com true: mesmo comportamento de hoje).
--   3. CREATE TABLE liberacoes_reentrada (+ índice, RLS ligada, sem acesso para anon/authenticated).
--   4. CREATE OR REPLACE FUNCTION registrar_acesso_etapa(jsonb) com a regra acima. Substitui a versão da
--      20261118b (que NÃO é alterada; só a função é trocada). Mesma assinatura, mesmo GRANT/REVOKE.
--      A regra de entrada única vale para todo checkin com etapa, inclusive credenciamento.
--   5. DROP INDEX IF EXISTS uq_logs_credenciamento_etapa_dia (criado pela 20261118, já aplicada). Sem marcador
--      'CREDENCIAMENTO' gravado, esse índice não tem mais função. Índice não guarda dado: linhas ficam como estão.
--
-- Segurança de dados:
--   - NÃO apaga linhas, NÃO apaga colunas, NÃO altera dados existentes. Só ADD COLUMN, CREATE TABLE,
--     CREATE INDEX, DROP INDEX IF EXISTS (só o índice de credenciamento, item 5) e CREATE OR REPLACE FUNCTION.
--   - Tudo em BEGIN/COMMIT com lock_timeout de 3 s: se não conseguir o bloqueio do ALTER em 3 s, nada
--     muda; rodar de novo fora do pico.
--   - Idempotente: pode rodar mais de uma vez.
--
-- Código que depende disto:
--   backend/api-nodejs/src/modules/checkin/services/entradaEtapa.js (regra e mensagens)
--   backend/api-nodejs/src/modules/checkin/services/validation.service.js (passo 4b)
--   backend/api-nodejs/src/modules/checkin/services/database.service.js (HINT → 409)
--   backend/api-nodejs/src/modules/checkin/liberacaoReentrada.controller.js (rota de liberação)
--   backend/api-nodejs/src/modules/system/config.controller.js (controla_entrada nas áreas)
--
-- Efeito enquanto esta migration NÃO estiver aplicada: o backend lê a coluna controla_entrada como true
--   (todas as áreas controladas, como hoje). Sem a tabela liberacoes_reentrada, a regra de "saiu sem
--   liberação" fica DESLIGADA (aviso no log) e só "dentro" bloqueia, como antes. A rota de liberação
--   responde erro enquanto a tabela não existir.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '3s';

-- ----------------------------------------------------------------------------
-- 0. Guarda: tabelas e colunas usadas têm que existir. Nada é alterado se faltar algo.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_faltando text[];
BEGIN
    IF to_regclass('public.evento_areas') IS NULL THEN
        RAISE EXCEPTION 'Migration 20261119_controle_entrada_portao recusada: tabela public.evento_areas não existe. Nada foi alterado.';
    END IF;
    IF to_regclass('public.logs_acesso') IS NULL THEN
        RAISE EXCEPTION 'Migration 20261119_controle_entrada_portao recusada: tabela public.logs_acesso não existe. Nada foi alterado.';
    END IF;

    SELECT array_agg(c.coluna ORDER BY c.coluna) INTO v_faltando
      FROM unnest(ARRAY[
          'id', 'evento_id', 'pessoa_id', 'tipo', 'area_id', 'observacao', 'created_at', 'etapa', 'dia_civil'
      ]) AS c(coluna)
     WHERE NOT EXISTS (
          SELECT 1 FROM information_schema.columns i
           WHERE i.table_schema = 'public' AND i.table_name = 'logs_acesso' AND i.column_name = c.coluna
      );
    IF v_faltando IS NOT NULL THEN
        RAISE EXCEPTION 'Migration 20261119_controle_entrada_portao recusada: colunas ausentes em public.logs_acesso: %. Aplique antes 20261118_logs_entrada_etapa.sql. Nada foi alterado.', v_faltando;
    END IF;

    SELECT array_agg(c.coluna ORDER BY c.coluna) INTO v_faltando
      FROM unnest(ARRAY['id', 'evento_id']) AS c(coluna)
     WHERE NOT EXISTS (
          SELECT 1 FROM information_schema.columns i
           WHERE i.table_schema = 'public' AND i.table_name = 'evento_areas' AND i.column_name = c.coluna
      );
    IF v_faltando IS NOT NULL THEN
        RAISE EXCEPTION 'Migration 20261119_controle_entrada_portao recusada: colunas ausentes em public.evento_areas: %. Nada foi alterado.', v_faltando;
    END IF;

    -- Se a tabela de liberações já existir (rodada anterior), confere as colunas que a função usa
    IF to_regclass('public.liberacoes_reentrada') IS NOT NULL THEN
        SELECT array_agg(c.coluna ORDER BY c.coluna) INTO v_faltando
          FROM unnest(ARRAY['evento_id', 'pessoa_id', 'area_id', 'etapa', 'dia_civil', 'criado_em']) AS c(coluna)
         WHERE NOT EXISTS (
              SELECT 1 FROM information_schema.columns i
               WHERE i.table_schema = 'public' AND i.table_name = 'liberacoes_reentrada' AND i.column_name = c.coluna
          );
        IF v_faltando IS NOT NULL THEN
            RAISE EXCEPTION 'Migration 20261119_controle_entrada_portao recusada: public.liberacoes_reentrada existe mas faltam colunas: %. Nada foi alterado.', v_faltando;
        END IF;
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 1. Área que controla entrada (portão). Default true: áreas existentes continuam controladas.
-- ----------------------------------------------------------------------------
ALTER TABLE public.evento_areas ADD COLUMN IF NOT EXISTS controla_entrada BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.evento_areas.controla_entrada IS
    'true = área de portão: entrada bloqueada enquanto dentro e após saída sem liberação do controlador. false = nada bloqueado.';

-- ----------------------------------------------------------------------------
-- 2. Liberações de reentrada (registro de quem liberou e quando)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.liberacoes_reentrada (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    evento_id   UUID        NOT NULL,
    pessoa_id   UUID        NOT NULL,
    area_id     UUID        NULL,            -- NULL = área geral
    etapa       VARCHAR(30) NOT NULL,
    dia_civil   DATE        NOT NULL,        -- dia civil local (America/Sao_Paulo)
    liberado_por UUID       NULL,            -- usuário do painel que liberou
    criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS liberacoes_reentrada_evento_pessoa_etapa_dia
    ON public.liberacoes_reentrada (evento_id, pessoa_id, etapa, dia_civil);

-- Só o servidor (service_role) lê e grava; nenhum acesso pelo navegador (mesmo padrão da fila_sync_leitores)
ALTER TABLE public.liberacoes_reentrada ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.liberacoes_reentrada FROM anon, authenticated;

COMMENT ON TABLE public.liberacoes_reentrada IS
    'Liberação do controlador para uma nova entrada numa área de portão, depois de uma saída. Não é apagada pelo sistema.';

-- ----------------------------------------------------------------------------
-- 3. Função de gravação com a regra de portão (substitui a da 20261118b)
--    SECURITY INVOKER: roda com os privilégios de quem chama (o backend usa o cliente de serviço).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_acesso_etapa(p_row jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v public.logs_acesso;
    v_controla boolean := true;
    v_ultimo_id uuid;
    v_ultimo_tipo text;
    v_ultimo_em timestamp;                -- created_at da linha (UTC sem fuso)
    v_liberada boolean;
    v_hint text;
    v_id uuid;
BEGIN
    v := jsonb_populate_record(NULL::public.logs_acesso, p_row);

    -- Entrada com etapa: vale também para credenciamento (passagem comum, sem regra própria)
    IF v.tipo = 'checkin'
       AND v.etapa IS NOT NULL
       AND v.dia_civil IS NOT NULL THEN

        -- Serializa leituras simultâneas da mesma pessoa/etapa/dia/área (bloqueio de transação, liberado no COMMIT).
        PERFORM pg_advisory_xact_lock(hashtext(concat_ws('|',
            v.evento_id::text, v.pessoa_id::text, v.etapa, v.dia_civil::text,
            COALESCE(v.area_id::text, 'geral'))));

        -- Área geral (nulo) sempre controla. Área que não se acha também controla (comportamento antigo).
        IF v.area_id IS NOT NULL THEN
            SELECT ea.controla_entrada INTO v_controla
              FROM public.evento_areas ea
             WHERE ea.id = v.area_id;
            v_controla := COALESCE(v_controla, true);
        END IF;

        IF v_controla THEN
            -- Último registro de passagem (checkin/checkout) da pessoa nesta etapa/dia/área, excluindo o próprio id
            -- (reenvio do mesmo id não bloqueia: cai na chave primária e o backend trata como já gravado).
            SELECT l.id, l.tipo, l.created_at
              INTO v_ultimo_id, v_ultimo_tipo, v_ultimo_em
              FROM public.logs_acesso l
             WHERE l.evento_id = v.evento_id
               AND l.pessoa_id = v.pessoa_id
               AND l.etapa = v.etapa
               AND l.dia_civil = v.dia_civil
               AND l.area_id IS NOT DISTINCT FROM v.area_id
               AND l.tipo IN ('checkin', 'checkout')
               AND l.id IS DISTINCT FROM v.id
             ORDER BY l.created_at DESC, l.id DESC
             LIMIT 1;

            IF v_ultimo_tipo = 'checkin' THEN
                -- Pessoa ainda dentro: não tem liberação que resolva
                v_hint := 'false|' || to_char(v_ultimo_em, 'YYYY-MM-DD"T"HH24:MI:SS') || 'Z';
                RAISE EXCEPTION 'Pessoa já está dentro nesta etapa, área e dia'
                    USING ERRCODE = 'P0409', HINT = v_hint;
            ELSIF v_ultimo_tipo = 'checkout' THEN
                -- Saiu: precisa de liberação posterior à saída
                SELECT EXISTS (
                    SELECT 1
                      FROM public.liberacoes_reentrada r
                     WHERE r.evento_id = v.evento_id
                       AND r.pessoa_id = v.pessoa_id
                       AND r.etapa = v.etapa
                       AND r.dia_civil = v.dia_civil
                       AND r.area_id IS NOT DISTINCT FROM v.area_id
                       AND (r.criado_em AT TIME ZONE 'UTC') > v_ultimo_em
                ) INTO v_liberada;

                IF NOT v_liberada THEN
                    v_hint := 'true|' || to_char(v_ultimo_em, 'YYYY-MM-DD"T"HH24:MI:SS') || 'Z';
                    RAISE EXCEPTION 'Saída sem liberação de reentrada nesta etapa, área e dia'
                        USING ERRCODE = 'P0409', HINT = v_hint;
                END IF;
            END IF;
        END IF;
    END IF;

    INSERT INTO public.logs_acesso (
        id, evento_id, pessoa_id, tipo, metodo, dispositivo_id, confianca, foto_capturada,
        area_id, numero_pulseira, observacao, created_at, created_by, etapa, dia_civil
    ) VALUES (
        COALESCE(v.id, gen_random_uuid()),
        v.evento_id, v.pessoa_id, v.tipo, v.metodo, v.dispositivo_id, v.confianca, v.foto_capturada,
        v.area_id, v.numero_pulseira, v.observacao,
        COALESCE(v.created_at, (now() AT TIME ZONE 'UTC')),   -- logs_acesso.created_at é UTC sem fuso
        v.created_by, v.etapa, v.dia_civil
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

-- Só o servidor (service_role) chama a função
REVOKE EXECUTE ON FUNCTION public.registrar_acesso_etapa(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_acesso_etapa(jsonb) TO service_role;

COMMENT ON FUNCTION public.registrar_acesso_etapa(jsonb) IS
    'Grava passagem em logs_acesso. Entrada (checkin) com etapa, inclusive credenciamento: P0409 se a pessoa estiver dentro, ou se saiu e não há liberação posterior, em área que controla entrada (evento_areas.controla_entrada). HINT = liberavel|instante. Saída e linha sem etapa só inserem.';

-- ----------------------------------------------------------------------------
-- 5. Sai o índice de credenciamento (20261118). Ele só valia para linhas com observacao 'CREDENCIAMENTO',
--    que o código não grava mais: credenciamento é checkin comum e segue a regra de entrada única da função.
--    DROP INDEX não apaga linhas nem dados; só o índice. IF EXISTS: pode rodar mais de uma vez.
-- ----------------------------------------------------------------------------
DROP INDEX IF EXISTS public.uq_logs_credenciamento_etapa_dia;

-- Recarrega o cache de esquema do PostgREST (entregue no COMMIT)
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ==============================================================================
-- DESFAZER (rodar fora do pico). Volta à regra anterior (só "dentro" bloqueia, em todas as áreas).
-- Não apaga a coluna controla_entrada nem a tabela liberacoes_reentrada: apagar seria perder o registro
-- das liberações. Elas ficam sem efeito. Também não apaga linhas: só recria o índice de credenciamento
-- (item 5), que volta a exigir um credenciamento por etapa/dia/área para as linhas com observacao 'CREDENCIAMENTO'.
-- Se já existirem duas dessas linhas na mesma chave, a recriação falha e nada muda (rodar a consulta de
-- duplicidade antes, se for preciso).
--
-- BEGIN;
-- SET LOCAL lock_timeout = '3s';
-- -- Copiar o CREATE OR REPLACE FUNCTION public.registrar_acesso_etapa(p_row jsonb) do arquivo
-- -- supabase/migrations/20261118b_entrada_aberta.sql (corpo antigo) e rodar aqui, seguido de:
-- -- REVOKE EXECUTE ON FUNCTION public.registrar_acesso_etapa(jsonb) FROM PUBLIC, anon, authenticated;
-- -- GRANT EXECUTE ON FUNCTION public.registrar_acesso_etapa(jsonb) TO service_role;
-- CREATE UNIQUE INDEX IF NOT EXISTS uq_logs_credenciamento_etapa_dia
--   ON public.logs_acesso (
--     evento_id, pessoa_id, etapa, dia_civil,
--     (COALESCE(area_id, '00000000-0000-0000-0000-000000000000'::uuid))
--   )
--   WHERE tipo = 'checkin' AND etapa IS NOT NULL AND dia_civil IS NOT NULL AND observacao = 'CREDENCIAMENTO';
-- NOTIFY pgrst, 'reload schema';
-- COMMIT;
--
-- Depois de desfazer, o backend continua funcionando: ele lê HINT sem o prefixo "liberavel|" como "dentro".
-- Desfazer o banco não basta para voltar ao código antigo: o código novo não grava mais o marcador.
-- ==============================================================================
