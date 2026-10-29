-- ==============================================================================
-- MIGRATION: Desempenho do banco (auditoria out/2026 — fase 3)
-- Data: 2026-10-29
--
-- Rodar inteira no SQL Editor do Supabase. Idempotente: pode rodar de novo sem efeito.
-- Não apaga dados. No fim mostra um resumo do que mudou.
--
--   1. Índices para as consultas do check-in, leitores e estatísticas
--   2. Remove índices redundantes (cobertos por outro índice que começa com as
--      mesmas colunas) — o banco segue usando o índice maior; só deixa de manter
--      duas cópias a cada gravação
--   3. RLS: auth.uid()/auth.jwt() calculados 1x por consulta, não 1x por linha
--      (padrão recomendado pelo Supabase); remove a policy "service_access",
--      inútil porque o service_role já ignora RLS
--   4. Desliga o gatilho do contador inscritos_count (nada no sistema lê esse
--      número e o gatilho travava a linha do evento a cada pessoa cadastrada)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Índices novos
--    Cada um só é criado se ainda não houver índice que comece pelas mesmas
--    colunas (as migrations antigas criaram alguns com outros nomes).
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.criar_indice_se_faltar(nome text, tabela text, colunas text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    -- só os nomes das colunas (ASC/DESC não importam: o btree lê nos dois sentidos)
    alvo text[] := string_to_array(replace(regexp_replace(colunas, '\s+(DESC|ASC)', '', 'gi'), ' ', ''), ',');
BEGIN
    IF to_regclass('public.' || tabela) IS NULL THEN RETURN; END IF;
    IF EXISTS (
        SELECT 1 FROM pg_index i
        WHERE i.indrelid = ('public.' || tabela)::regclass
          AND i.indpred IS NULL AND i.indexprs IS NULL
          AND (SELECT array_agg(a.attname::text ORDER BY k.ord)
               FROM unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)
               JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
               WHERE k.ord <= cardinality(alvo)) = alvo
    ) THEN RETURN; END IF;
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (%s)', nome, tabela, colunas);
END $$;

-- Último acesso da pessoa (toggle entrada/saída e anti-passback, toda passagem)
SELECT pg_temp.criar_indice_se_faltar('idx_logs_pessoa_evento_created', 'logs_acesso', 'pessoa_id, evento_id, created_at DESC');
-- Contagens do dia por tipo e por área (lotação, painel)
SELECT pg_temp.criar_indice_se_faltar('idx_logs_evento_tipo_created', 'logs_acesso', 'evento_id, tipo, created_at');
SELECT pg_temp.criar_indice_se_faltar('idx_logs_evento_area_created', 'logs_acesso', 'evento_id, area_id, created_at');

-- Busca de pessoa por pulseira, QR e CPF (leitor, credenciamento, portal)
SELECT pg_temp.criar_indice_se_faltar('idx_pessoas_evento_pulseira', 'pessoas', 'evento_id, numero_pulseira');
SELECT pg_temp.criar_indice_se_faltar('idx_pessoas_evento_status', 'pessoas', 'evento_id, status_acesso');
SELECT pg_temp.criar_indice_se_faltar('idx_pessoas_qr_code', 'pessoas', 'qr_code');
SELECT pg_temp.criar_indice_se_faltar('idx_pessoas_cpf', 'pessoas', 'cpf');

-- Leitor identificado por token/IP a cada push
SELECT pg_temp.criar_indice_se_faltar('idx_dispositivos_control_token', 'dispositivos_acesso', 'control_token');
SELECT pg_temp.criar_indice_se_faltar('idx_dispositivos_ip', 'dispositivos_acesso', 'ip_address');
SELECT pg_temp.criar_indice_se_faltar('idx_dispositivos_evento', 'dispositivos_acesso', 'evento_id');

-- Fila de sincronização com os leitores (lida a cada minuto)
SELECT pg_temp.criar_indice_se_faltar('idx_terminal_queue_status_created', 'terminal_sync_queue', 'status, created_at');
SELECT pg_temp.criar_indice_se_faltar('idx_terminal_queue_dispositivo', 'terminal_sync_queue', 'dispositivo_id');

-- Sessão do operador vinculada ao leitor (push de credenciamento)
SELECT pg_temp.criar_indice_se_faltar('idx_sessoes_operador_dispositivo', 'sessoes_operador', 'dispositivo_id, ativo');

-- Permissões de área e cota (validação de cada entrada)
SELECT pg_temp.criar_indice_se_faltar('idx_pulseira_areas_pulseira_area', 'pulseira_areas_permitidas', 'pulseira_id, area_id');
SELECT pg_temp.criar_indice_se_faltar('idx_pee_pessoa_evento_status', 'pessoa_evento_empresa', 'pessoa_id, evento_id, status_aprovacao');
SELECT pg_temp.criar_indice_se_faltar('idx_quotas_evento_data', 'quotas_diarias', 'evento_id, data');
SELECT pg_temp.criar_indice_se_faltar('idx_watchlist_cpf', 'watchlist', 'cpf');

-- ------------------------------------------------------------------------------
-- 2. Índices redundantes
--    Remove um índice comum (não único, sem WHERE, sem expressão) quando outro
--    índice btree da mesma tabela começa exatamente com as mesmas colunas, na
--    mesma ordem e com as mesmas opções. Entre dois idênticos, fica o mais antigo.
-- ------------------------------------------------------------------------------
CREATE TEMP TABLE IF NOT EXISTS _fase3_resumo (item text, detalhe text);
TRUNCATE _fase3_resumo;

DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        WITH idx AS (
            SELECT i.indexrelid, i.indrelid, i.indisunique, i.indisprimary,
                   string_to_array(i.indkey::text, ' ')      AS cols,
                   string_to_array(i.indclass::text, ' ')    AS classes,
                   string_to_array(i.indoption::text, ' ')   AS opcoes,
                   string_to_array(i.indcollation::text, ' ') AS collations,
                   (i.indpred IS NULL AND i.indexprs IS NULL) AS simples,
                   i.indisvalid
            FROM pg_index i
            JOIN pg_class c ON c.oid = i.indexrelid
            JOIN pg_am am ON am.oid = c.relam AND am.amname = 'btree'
            JOIN pg_class t ON t.oid = i.indrelid
            JOIN pg_namespace n ON n.oid = t.relnamespace AND n.nspname = 'public'
        )
        SELECT DISTINCT ON (a.indexrelid)
               a.indexrelid::regclass::text AS redundante, b.indexrelid::regclass::text AS coberto_por
        FROM idx a
        JOIN idx b ON b.indrelid = a.indrelid AND b.indexrelid <> a.indexrelid
        WHERE a.simples AND b.simples AND b.indisvalid
          AND NOT a.indisunique AND NOT a.indisprimary
          AND NOT EXISTS (SELECT 1 FROM pg_constraint pc WHERE pc.conindid = a.indexrelid)
          AND cardinality(b.cols) >= cardinality(a.cols)
          AND b.cols[1:cardinality(a.cols)]       = a.cols
          AND b.classes[1:cardinality(a.cols)]    = a.classes
          AND b.opcoes[1:cardinality(a.cols)]     = a.opcoes
          AND b.collations[1:cardinality(a.cols)] = a.collations
          -- idênticos: só o mais novo sai (o outro, mais antigo, fica)
          AND (cardinality(b.cols) > cardinality(a.cols) OR b.indisunique OR b.indexrelid < a.indexrelid)
        ORDER BY a.indexrelid, cardinality(b.cols) DESC
    LOOP
        EXECUTE format('DROP INDEX IF EXISTS %s', r.redundante);
        INSERT INTO _fase3_resumo VALUES ('índice removido', r.redundante || ' (coberto por ' || r.coberto_por || ')');
    END LOOP;
END $$;

-- ------------------------------------------------------------------------------
-- 3. RLS
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    p record;
    nova_using text;
    nova_check text;
    -- envolve auth.uid()/auth.jwt()/auth.role() em (select ...), sem envolver de novo
    padrao constant text := '(?<!SELECT )auth\.(uid|jwt|role)\(\)';
BEGIN
    -- 3a. "service_access": o service_role do Supabase já ignora RLS; a policy só
    --     custava uma verificação a mais em toda linha lida pelos outros papéis
    FOR p IN
        SELECT schemaname, tablename, policyname FROM pg_policies
        WHERE schemaname = 'public' AND policyname = 'service_access'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
        INSERT INTO _fase3_resumo VALUES ('policy removida', p.tablename || '.' || p.policyname);
    END LOOP;

    -- 3b. Mesma regra, avaliada 1x por consulta em vez de 1x por linha
    FOR p IN
        SELECT schemaname, tablename, policyname, qual, with_check FROM pg_policies
        WHERE schemaname = 'public'
          AND (qual ~ padrao OR with_check ~ padrao)
    LOOP
        nova_using := CASE WHEN p.qual IS NULL THEN NULL
                           ELSE regexp_replace(p.qual, padrao, '(select auth.\1())', 'g') END;
        nova_check := CASE WHEN p.with_check IS NULL THEN NULL
                           ELSE regexp_replace(p.with_check, padrao, '(select auth.\1())', 'g') END;
        EXECUTE format('ALTER POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename)
             || CASE WHEN nova_using IS NOT NULL THEN format(' USING (%s)', nova_using) ELSE '' END
             || CASE WHEN nova_check IS NOT NULL THEN format(' WITH CHECK (%s)', nova_check) ELSE '' END;
        INSERT INTO _fase3_resumo VALUES ('policy otimizada', p.tablename || '.' || p.policyname);
    END LOOP;
END $$;

-- ------------------------------------------------------------------------------
-- 4. Gatilho do contador sem uso
--    (a função e a coluna ficam; para religar: CREATE TRIGGER tr_update_inscritos_count
--     AFTER INSERT OR DELETE ON public.pessoas FOR EACH ROW
--     EXECUTE FUNCTION public.fn_update_inscritos_count();)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_update_inscritos_count'
               AND tgrelid = 'public.pessoas'::regclass) THEN
        DROP TRIGGER tr_update_inscritos_count ON public.pessoas;
        INSERT INTO _fase3_resumo VALUES ('gatilho removido', 'pessoas.tr_update_inscritos_count');
    END IF;
END $$;

ANALYZE public.logs_acesso;
ANALYZE public.pessoas;

-- ------------------------------------------------------------------------------
-- Resumo (é o resultado que aparece no SQL Editor)
-- ------------------------------------------------------------------------------
SELECT item, detalhe FROM _fase3_resumo
UNION ALL
SELECT 'policies ainda por linha',
       count(*)::text FROM pg_policies
       WHERE schemaname = 'public'
         AND (qual ~ '(?<!SELECT )auth\.(uid|jwt|role)\(\)' OR with_check ~ '(?<!SELECT )auth\.(uid|jwt|role)\(\)')
UNION ALL
SELECT 'índices em logs_acesso/pessoas', string_agg(indexname, ', ' ORDER BY indexname)
       FROM pg_indexes WHERE schemaname = 'public' AND tablename IN ('logs_acesso', 'pessoas');
