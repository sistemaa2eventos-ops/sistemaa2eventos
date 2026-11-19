-- ============================================================================
-- Migration: 20261118b_entrada_aberta.sql
-- Objetivo: trocar "uma entrada por etapa no dia" por "não entrar de novo enquanto estiver DENTRO".
--
-- Regra (decidida pela operação, opção B):
--   Uma pessoa só fica bloqueada de entrar de novo na mesma etapa (etapa do lote), no mesmo dia civil
--   (America/Sao_Paulo) e na mesma área, se ainda estiver DENTRO: o último registro de passagem
--   (tipo 'checkin' ou 'checkout') daquela etapa/dia/área é uma entrada. Saída seguida de nova entrada
--   é permitida (almoço, volta). Credenciamento (observacao = 'CREDENCIAMENTO') não entra nessa conta:
--   continua com o índice uq_logs_credenciamento_etapa_dia (um credenciamento por etapa/dia/área).
--
-- O que esta migration faz:
--   1. Remove o índice uq_logs_entrada_etapa_dia (criado em 20261118). Ele bloqueava qualquer segunda
--      entrada no dia, inclusive depois de uma saída, o que não é a regra. Só remove índice: nenhuma
--      linha é apagada ou alterada.
--   2. Cria a função public.registrar_acesso_etapa(p_row jsonb) RETURNS uuid, que o backend chama para
--      gravar passagens com etapa (entrada e saída):
--        - entrada (tipo 'checkin', com etapa/dia_civil, sem credenciamento): pega um bloqueio consultivo
--          de transação (pg_advisory_xact_lock) pela chave pessoa+evento+etapa+dia+área, para que duas
--          leituras simultâneas da mesma pessoa passem uma de cada vez; depois lê o último registro de
--          passagem dessa etapa/dia/área. Se for uma entrada, levanta P0409 (a dica traz o instante da
--          entrada em UTC, formato ISO, sem fuso no texto além do 'Z').
--        - saída, credenciamento ou linha sem etapa: não consulta nada; só insere.
--      A função não altera linhas existentes. Ela ignora a própria linha de mesmo id (reenvio): nesse
--      caso o INSERT cai na chave primária (23505 de logs_acesso_pkey) e o backend trata como já gravado.
--   3. Confere antes de tudo que as colunas usadas existem. Se faltar alguma, a migration recusa rodar
--      (RAISE EXCEPTION) e a transação é desfeita. Não "conserta" nada sozinha.
--
-- Segurança de dados:
--   - NÃO apaga linhas, NÃO apaga colunas, NÃO altera dados. Só DROP de índice e CREATE de função.
--   - Tudo em BEGIN/COMMIT com lock_timeout de 3 s: se não conseguir o bloqueio do DROP INDEX em 3 s,
--     nada muda; rodar de novo fora do pico.
--   - Depende de 20261118_logs_entrada_etapa.sql já aplicada (colunas etapa/dia_civil). A guarda abaixo
--     recusa rodar sem ela.
--
-- Efeito enquanto esta migration NÃO estiver aplicada: o backend chama a função, recebe "não existe"
--   (PGRST202 / 42883), cai no insert direto e o índice antigo continua bloqueando reentrada. A entrada
--   normal (primeira do dia) continua funcionando.
--
-- Caminhos de gravação que NÃO passam pela função (e portanto não têm a checagem de reentrada):
--   - fila de retentativa (CloudSyncWorker, queue.service) e insert direto de fallback no backend;
--   - cron de fechamento de turno e turnoAnterior (checkouts sem etapa, que nem fecham a janela).
--   Antes desta migration, o índice cobria esses caminhos. Depois dela, a garantia de banco vale só
--   para passagens gravadas via registrar_acesso_etapa. Ver o relatório de entrega.
--
-- Código que depende disto:
--   backend/api-nodejs/src/modules/checkin/services/database.service.js (registerAccessTransaction)
--   backend/api-nodejs/src/modules/checkin/services/entradaEtapa.js
--   backend/api-nodejs/src/modules/checkin/services/validation.service.js (passo 4b)
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '3s';

-- ----------------------------------------------------------------------------
-- 0. Guarda: a 20261118 tem que estar aplicada e todas as colunas usadas têm que existir
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_faltando text[];
BEGIN
    SELECT array_agg(c.coluna ORDER BY c.coluna) INTO v_faltando
      FROM unnest(ARRAY[
          'id', 'evento_id', 'pessoa_id', 'tipo', 'metodo', 'dispositivo_id', 'confianca',
          'foto_capturada', 'area_id', 'numero_pulseira', 'observacao', 'created_at', 'created_by',
          'etapa', 'dia_civil'
      ]) AS c(coluna)
     WHERE NOT EXISTS (
          SELECT 1 FROM information_schema.columns i
           WHERE i.table_schema = 'public' AND i.table_name = 'logs_acesso' AND i.column_name = c.coluna
      );

    IF v_faltando IS NOT NULL THEN
        RAISE EXCEPTION 'Migration 20261118b recusada: colunas ausentes em public.logs_acesso: %. Aplique antes 20261118_logs_entrada_etapa.sql e confira o esquema. Nada foi alterado.', v_faltando;
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 1. Sai o índice que bloqueava reentrada depois de saída (o de credenciamento fica)
-- ----------------------------------------------------------------------------
DROP INDEX IF EXISTS public.uq_logs_entrada_etapa_dia;

-- ----------------------------------------------------------------------------
-- 2. Função de gravação com checagem "está dentro?"
--    SECURITY INVOKER: roda com os privilégios de quem chama (o backend usa o cliente de serviço).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_acesso_etapa(p_row jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    -- jsonb_populate_record converte cada chave do JSON para o tipo da coluna
    v public.logs_acesso;
    v_ultimo_id uuid;
    v_ultimo_tipo text;
    v_ultimo_em timestamp;
    v_id uuid;
BEGIN
    v := jsonb_populate_record(NULL::public.logs_acesso, p_row);

    IF v.tipo = 'checkin'
       AND v.etapa IS NOT NULL
       AND v.dia_civil IS NOT NULL
       AND v.observacao IS DISTINCT FROM 'CREDENCIAMENTO' THEN

        -- Serializa leituras simultâneas da mesma pessoa/etapa/dia/área. O bloqueio é de transação:
        -- é liberado no COMMIT da própria chamada. Depois de obtê-lo, o SELECT abaixo (READ COMMITTED,
        -- snapshot novo por instrução) enxerga a entrada que a outra chamada acabou de gravar.
        PERFORM pg_advisory_xact_lock(hashtext(concat_ws('|',
            v.evento_id::text, v.pessoa_id::text, v.etapa, v.dia_civil::text,
            COALESCE(v.area_id::text, 'geral'))));

        SELECT l.id, l.tipo, l.created_at
          INTO v_ultimo_id, v_ultimo_tipo, v_ultimo_em
          FROM public.logs_acesso l
         WHERE l.evento_id = v.evento_id
           AND l.pessoa_id = v.pessoa_id
           AND l.etapa = v.etapa
           AND l.dia_civil = v.dia_civil
           AND l.area_id IS NOT DISTINCT FROM v.area_id
           AND l.tipo IN ('checkin', 'checkout')
           AND l.observacao IS DISTINCT FROM 'CREDENCIAMENTO'
           AND l.id IS DISTINCT FROM v.id      -- reenvio do mesmo id: cai na chave primária, não aqui
         ORDER BY l.created_at DESC, l.id DESC
         LIMIT 1;

        IF v_ultimo_tipo = 'checkin' THEN
            RAISE EXCEPTION 'Pessoa já está dentro nesta etapa, área e dia'
                USING ERRCODE = 'P0409',
                      HINT = to_char(v_ultimo_em, 'YYYY-MM-DD"T"HH24:MI:SS') || 'Z';
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

-- Só o servidor (service_role) chama a função. Sem isso, PUBLIC/anon/authenticated poderiam chamá-la via /rest/v1/rpc.
REVOKE EXECUTE ON FUNCTION public.registrar_acesso_etapa(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_acesso_etapa(jsonb) TO service_role;

COMMENT ON FUNCTION public.registrar_acesso_etapa(jsonb) IS
    'Grava passagem em logs_acesso. Entrada (checkin) com etapa é recusada (P0409) se a pessoa estiver dentro: último registro de passagem da etapa/dia/área é entrada. Saída, credenciamento e linha sem etapa só inserem.';

-- Recarrega o cache de esquema do PostgREST (entregue no COMMIT). Sem isso, a função nova pode
-- demorar a aparecer para a API; enquanto isso o backend cai no insert direto, sem checagem.
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ==============================================================================
-- DESFAZER (copiar para o SQL Editor e rodar fora do pico; volta à regra anterior: uma entrada por
-- etapa/dia/área, mesmo depois de saída). Só funciona se NÃO houver reentrada gravada: rodar a
-- conferência primeiro. Se a conferência devolver linhas, a recriação do índice falha e nada muda.
--
-- Conferência:
-- SELECT evento_id, pessoa_id, etapa, dia_civil, area_id, count(*)
--   FROM public.logs_acesso
--  WHERE tipo = 'checkin' AND etapa IS NOT NULL AND dia_civil IS NOT NULL
--    AND observacao IS DISTINCT FROM 'CREDENCIAMENTO'
--  GROUP BY 1, 2, 3, 4, 5 HAVING count(*) > 1;
--
-- BEGIN;
-- SET LOCAL lock_timeout = '3s';
-- DROP FUNCTION IF EXISTS public.registrar_acesso_etapa(jsonb);
-- CREATE UNIQUE INDEX IF NOT EXISTS uq_logs_entrada_etapa_dia
--   ON public.logs_acesso (
--     evento_id, pessoa_id, etapa, dia_civil,
--     (COALESCE(area_id, '00000000-0000-0000-0000-000000000000'::uuid))
--   )
--   WHERE tipo = 'checkin' AND etapa IS NOT NULL AND dia_civil IS NOT NULL
--     AND observacao IS DISTINCT FROM 'CREDENCIAMENTO';
-- COMMIT;
--
-- Depois de desfazer, o backend cai sozinho no insert direto (ver database.service.js) e o índice
-- volta a bloquear reentrada. Não é preciso mudar código.
-- ==============================================================================
