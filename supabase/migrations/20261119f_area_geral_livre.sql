-- ============================================================================
-- Migration: 20261119f_area_geral_livre.sql
-- Objetivo: a ÁREA GERAL (area_id nulo, "Todas as áreas (global)") NÃO controla entrada.
--
-- Decisão da operação (19/11/2026): sem liberação, a pessoa pode sair e voltar na área geral quantas
-- vezes quiser. Só áreas com evento_areas.controla_entrada = true (portão) seguem com a regra de
-- entrada única por etapa/dia e de reentrada com liberação do controlador.
--
-- Regra desta função (registrar_acesso_etapa) depois desta migration:
--   - área geral (area_id nulo): NÃO controla → insere livre (nenhuma checagem);
--   - área com controla_entrada = true: controlada (dentro → P0409 'false|...'; saiu sem liberação →
--     P0409 'true|...'; sem registro anterior → livre), igual à 20261119;
--   - área com controla_entrada = false: livre;
--   - área informada que não se acha na tabela: controlada (comportamento antigo, igual à 20261119).
--   Saída (checkout) e linha sem etapa/dia: só insere, como antes.
--
-- Esta migration SUBSTITUI só o corpo da função public.registrar_acesso_etapa(jsonb) criada pela
-- 20261119_controle_entrada_portao.sql. Mesma assinatura, mesmo REVOKE/GRANT (só service_role), mesmo
-- bloqueio consultivo (pg_advisory_xact_lock), mesmo P0409 com HINT 'liberavel|instante'.
--
-- O que esta migration faz:
--   1. Guardas: confere que a 20261119_controle_entrada_portao e a função dela estão aplicadas
--      (tabelas, colunas e a função com o trecho controla_entrada). Se faltar algo, RAISE EXCEPTION e a
--      transação é desfeita. Não "conserta" nada sozinha.
--   2. CREATE OR REPLACE FUNCTION public.registrar_acesso_etapa(jsonb) com a mudança da área geral.
--   3. REVOKE/GRANT da função (igual à 20261119) e NOTIFY pgrst para recarregar o cache.
--
-- Segurança de dados:
--   - NÃO apaga linhas, NÃO apaga colunas, NÃO apaga tabelas, NÃO altera dados. Só CREATE OR REPLACE FUNCTION
--     (o corpo da função) e REVOKE/GRANT da própria função.
--   - Tudo em BEGIN/COMMIT com lock_timeout de 3 s: se não conseguir o bloqueio em 3 s, nada muda; rodar de
--     novo fora do pico.
--   - Idempotente: pode rodar mais de uma vez.
--
-- Efeito para registros já gravados: nenhum. Saídas e entradas antigas continuam como estão; só as
-- próximas gravações na área geral deixam de ser checadas. Um bloqueio que existia na área geral
-- (ex.: entrada após saída sem liberação) deixa de valer a partir daqui.
--
-- Código que depende disto:
--   backend/api-nodejs/src/modules/checkin/services/entradaEtapa.js (areaControlaEntrada(null) = false,
--     bloqueioDeEntrada sai cedo para área geral)
--   backend/api-nodejs/src/modules/checkin/services/validation.service.js (passo 4b, comentário)
--
-- Antes de rodar: confirme que a 20261119_controle_entrada_portao.sql já está aplicada no Supabase
-- (a guarda 0 recusa se não estiver). Não é preciso tirar o backend do ar: o código novo e o antigo
-- funcionam com esta função (o HINT e o P0409 não mudam).
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '3s';

-- ----------------------------------------------------------------------------
-- 0. Guarda: a 20261119 tem que estar aplicada. Nada é alterado se faltar algo.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_faltando text[];
    v_def text;
BEGIN
    IF to_regclass('public.evento_areas') IS NULL THEN
        RAISE EXCEPTION 'Migration 20261119f_area_geral_livre recusada: tabela public.evento_areas não existe. Nada foi alterado.';
    END IF;
    IF to_regclass('public.logs_acesso') IS NULL THEN
        RAISE EXCEPTION 'Migration 20261119f_area_geral_livre recusada: tabela public.logs_acesso não existe. Nada foi alterado.';
    END IF;
    IF to_regclass('public.liberacoes_reentrada') IS NULL THEN
        RAISE EXCEPTION 'Migration 20261119f_area_geral_livre recusada: tabela public.liberacoes_reentrada não existe. Aplique antes 20261119_controle_entrada_portao.sql. Nada foi alterado.';
    END IF;

    SELECT array_agg(c.coluna ORDER BY c.coluna) INTO v_faltando
      FROM unnest(ARRAY['id', 'evento_id', 'controla_entrada']) AS c(coluna)
     WHERE NOT EXISTS (
          SELECT 1 FROM information_schema.columns i
           WHERE i.table_schema = 'public' AND i.table_name = 'evento_areas' AND i.column_name = c.coluna
      );
    IF v_faltando IS NOT NULL THEN
        RAISE EXCEPTION 'Migration 20261119f_area_geral_livre recusada: colunas ausentes em public.evento_areas: %. Aplique antes 20261119_controle_entrada_portao.sql. Nada foi alterado.', v_faltando;
    END IF;

    SELECT array_agg(c.coluna ORDER BY c.coluna) INTO v_faltando
      FROM unnest(ARRAY[
          'id', 'evento_id', 'pessoa_id', 'tipo', 'area_id', 'observacao', 'created_at', 'etapa', 'dia_civil',
          'metodo', 'dispositivo_id', 'confianca', 'foto_capturada', 'numero_pulseira', 'created_by'
      ]) AS c(coluna)
     WHERE NOT EXISTS (
          SELECT 1 FROM information_schema.columns i
           WHERE i.table_schema = 'public' AND i.table_name = 'logs_acesso' AND i.column_name = c.coluna
      );
    IF v_faltando IS NOT NULL THEN
        RAISE EXCEPTION 'Migration 20261119f_area_geral_livre recusada: colunas ausentes em public.logs_acesso: %. Nada foi alterado.', v_faltando;
    END IF;

    SELECT array_agg(c.coluna ORDER BY c.coluna) INTO v_faltando
      FROM unnest(ARRAY['evento_id', 'pessoa_id', 'area_id', 'etapa', 'dia_civil', 'criado_em']) AS c(coluna)
     WHERE NOT EXISTS (
          SELECT 1 FROM information_schema.columns i
           WHERE i.table_schema = 'public' AND i.table_name = 'liberacoes_reentrada' AND i.column_name = c.coluna
      );
    IF v_faltando IS NOT NULL THEN
        RAISE EXCEPTION 'Migration 20261119f_area_geral_livre recusada: public.liberacoes_reentrada sem colunas: %. Nada foi alterado.', v_faltando;
    END IF;

    -- A função tem que existir e ser a versão da 20261119 (com controle por evento_areas.controla_entrada).
    -- Se for a da 20261118b, a 20261119 não foi aplicada: recusa, para não voltar a regra antiga por engano.
    IF to_regprocedure('public.registrar_acesso_etapa(jsonb)') IS NULL THEN
        RAISE EXCEPTION 'Migration 20261119f_area_geral_livre recusada: função public.registrar_acesso_etapa(jsonb) não existe. Aplique antes 20261119_controle_entrada_portao.sql. Nada foi alterado.';
    END IF;
    SELECT pg_get_functiondef(to_regprocedure('public.registrar_acesso_etapa(jsonb)')) INTO v_def;
    IF v_def IS NULL OR position('controla_entrada' IN v_def) = 0 THEN
        RAISE EXCEPTION 'Migration 20261119f_area_geral_livre recusada: a função registrar_acesso_etapa não é a versão da 20261119 (sem controla_entrada). Aplique antes 20261119_controle_entrada_portao.sql. Nada foi alterado.';
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 1. Função de gravação: área geral é livre (não controla). Corpo igual à 20261119, exceto o bloco
--    de controle de área (marcado com ALTERADO abaixo).
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

        -- ALTERADO (20261119f): área geral (area_id nulo) é LIVRE: não controla entrada.
        -- Área informada: controla_entrada da área. Área que não se acha também controla (comportamento antigo).
        IF v.area_id IS NULL THEN
            v_controla := false;
        ELSE
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

-- Só o servidor (service_role) chama a função (mesmo REVOKE/GRANT da 20261119)
REVOKE EXECUTE ON FUNCTION public.registrar_acesso_etapa(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_acesso_etapa(jsonb) TO service_role;

COMMENT ON FUNCTION public.registrar_acesso_etapa(jsonb) IS
    'Grava passagem em logs_acesso. Entrada (checkin) com etapa, inclusive credenciamento: P0409 se a pessoa estiver dentro, ou se saiu e não há liberação posterior, em área que controla entrada (evento_areas.controla_entrada = true). Área geral (área nula) é livre. HINT = liberavel|instante. Saída e linha sem etapa só inserem.';

-- Recarrega o cache de esquema do PostgREST (entregue no COMMIT)
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ==============================================================================
-- DESFAZER (rodar fora do pico). Volta à regra da 20261119: área geral controlada.
-- Não há perda de dados: a função é recriada inteira e nenhuma linha é tocada.
-- Copie o corpo abaixo (sem os "-- ") e rode, seguido do REVOKE/GRANT e do NOTIFY.
--
-- BEGIN;
-- SET LOCAL lock_timeout = '3s';
-- CREATE OR REPLACE FUNCTION public.registrar_acesso_etapa(p_row jsonb)
-- RETURNS uuid
-- LANGUAGE plpgsql
-- SECURITY INVOKER
-- SET search_path = public
-- AS $$
-- DECLARE
--     v public.logs_acesso;
--     v_controla boolean := true;
--     v_ultimo_id uuid;
--     v_ultimo_tipo text;
--     v_ultimo_em timestamp;
--     v_liberada boolean;
--     v_hint text;
--     v_id uuid;
-- BEGIN
--     v := jsonb_populate_record(NULL::public.logs_acesso, p_row);
--     IF v.tipo = 'checkin' AND v.etapa IS NOT NULL AND v.dia_civil IS NOT NULL THEN
--         PERFORM pg_advisory_xact_lock(hashtext(concat_ws('|',
--             v.evento_id::text, v.pessoa_id::text, v.etapa, v.dia_civil::text,
--             COALESCE(v.area_id::text, 'geral'))));
--         IF v.area_id IS NOT NULL THEN
--             SELECT ea.controla_entrada INTO v_controla FROM public.evento_areas ea WHERE ea.id = v.area_id;
--             v_controla := COALESCE(v_controla, true);
--         END IF;
--         IF v_controla THEN
--             SELECT l.id, l.tipo, l.created_at INTO v_ultimo_id, v_ultimo_tipo, v_ultimo_em
--               FROM public.logs_acesso l
--              WHERE l.evento_id = v.evento_id AND l.pessoa_id = v.pessoa_id AND l.etapa = v.etapa
--                AND l.dia_civil = v.dia_civil AND l.area_id IS NOT DISTINCT FROM v.area_id
--                AND l.tipo IN ('checkin', 'checkout') AND l.id IS DISTINCT FROM v.id
--              ORDER BY l.created_at DESC, l.id DESC LIMIT 1;
--             IF v_ultimo_tipo = 'checkin' THEN
--                 v_hint := 'false|' || to_char(v_ultimo_em, 'YYYY-MM-DD"T"HH24:MI:SS') || 'Z';
--                 RAISE EXCEPTION 'Pessoa já está dentro nesta etapa, área e dia' USING ERRCODE = 'P0409', HINT = v_hint;
--             ELSIF v_ultimo_tipo = 'checkout' THEN
--                 SELECT EXISTS (
--                     SELECT 1 FROM public.liberacoes_reentrada r
--                      WHERE r.evento_id = v.evento_id AND r.pessoa_id = v.pessoa_id AND r.etapa = v.etapa
--                        AND r.dia_civil = v.dia_civil AND r.area_id IS NOT DISTINCT FROM v.area_id
--                        AND (r.criado_em AT TIME ZONE 'UTC') > v_ultimo_em
--                 ) INTO v_liberada;
--                 IF NOT v_liberada THEN
--                     v_hint := 'true|' || to_char(v_ultimo_em, 'YYYY-MM-DD"T"HH24:MI:SS') || 'Z';
--                     RAISE EXCEPTION 'Saída sem liberação de reentrada nesta etapa, área e dia' USING ERRCODE = 'P0409', HINT = v_hint;
--                 END IF;
--             END IF;
--         END IF;
--     END IF;
--     INSERT INTO public.logs_acesso (
--         id, evento_id, pessoa_id, tipo, metodo, dispositivo_id, confianca, foto_capturada,
--         area_id, numero_pulseira, observacao, created_at, created_by, etapa, dia_civil
--     ) VALUES (
--         COALESCE(v.id, gen_random_uuid()), v.evento_id, v.pessoa_id, v.tipo, v.metodo, v.dispositivo_id,
--         v.confianca, v.foto_capturada, v.area_id, v.numero_pulseira, v.observacao,
--         COALESCE(v.created_at, (now() AT TIME ZONE 'UTC')), v.created_by, v.etapa, v.dia_civil
--     ) RETURNING id INTO v_id;
--     RETURN v_id;
-- END;
-- $$;
-- REVOKE EXECUTE ON FUNCTION public.registrar_acesso_etapa(jsonb) FROM PUBLIC, anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.registrar_acesso_etapa(jsonb) TO service_role;
-- NOTIFY pgrst, 'reload schema';
-- COMMIT;
--
-- O DESFAZER acima replica a versão da 20261119 (sem os comentários). Se a 20261119 tiver sido
-- alterada depois, copie a função dela em vez desta.
-- ==============================================================================
