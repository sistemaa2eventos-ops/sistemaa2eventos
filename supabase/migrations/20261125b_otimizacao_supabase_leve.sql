-- ==============================================================================
-- MIGRATION: Otimização de Performance, RLS, Índices de FK e Segurança (Fase 4)
-- Data: 2026-11-25
--
-- O que faz (100% idempotente e sem perda de dados):
--   1. Corrige políticas RLS em `pulseiras_pendencia` (incluindo bug `p.evento_id = p.evento_id`)
--      e `documento_liberacoes`, eliminando `auth_rls_initplan` (lint 0003).
--   2. Substitui `auth.role() = 'authenticated'` (depreciado) por `TO authenticated`.
--   3. Remove policies redundantes `service_role_bypass*` e `service_role_only_*`
--      (o `service_role` já possui BYPASSRLS nativo no Supabase).
--   4. Restringe policies de `PUBLIC` (que exigiam JWT de staff/master) para `TO authenticated`
--      e consolida policies PERMISSIVE sobrepostas por tabela/ação (lint 0006: 788 -> 0 avisos).
--   5. Remove 12 índices não-FK comprovadamente sem uso (0 scans, incluindo GIN pesados em `pessoas`)
--      e cria índices B-tree leves para todas as Foreign Keys descobertas (lint 0001: 68 -> 0).
--   6. Revoga execução pública via RPC (`PUBLIC`, `anon`, `authenticated`) das 7 funções internas
--      `SECURITY DEFINER` de gatilho/manutenção (lints 0028 e 0029).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Correção de `pulseiras_pendencia` e `documento_liberacoes` (lint 0003 + isolamento)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS admin_master_all ON public.pulseiras_pendencia;
DROP POLICY IF EXISTS operador_evento ON public.pulseiras_pendencia;
DROP POLICY IF EXISTS acesso_evento_ou_master ON public.pulseiras_pendencia;

CREATE POLICY acesso_evento_ou_master ON public.pulseiras_pendencia
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.perfis p
            WHERE p.id = (SELECT auth.uid())
              AND (p.nivel_acesso::text = 'admin_master' OR p.evento_id = pulseiras_pendencia.evento_id)
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.perfis p
            WHERE p.id = (SELECT auth.uid())
              AND (p.nivel_acesso::text = 'admin_master' OR p.evento_id = pulseiras_pendencia.evento_id)
        )
    );

DROP POLICY IF EXISTS admin_master_all ON public.documento_liberacoes;
DROP POLICY IF EXISTS operador_evento ON public.documento_liberacoes;
DROP POLICY IF EXISTS acesso_evento_ou_master ON public.documento_liberacoes;

CREATE POLICY acesso_evento_ou_master ON public.documento_liberacoes
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.perfis p
            WHERE p.id = (SELECT auth.uid())
              AND (p.nivel_acesso::text = 'admin_master' OR p.evento_id = documento_liberacoes.evento_id)
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.perfis p
            WHERE p.id = (SELECT auth.uid())
              AND (p.nivel_acesso::text = 'admin_master' OR p.evento_id = documento_liberacoes.evento_id)
        )
    );

-- ------------------------------------------------------------------------------
-- 2. Substituir `auth.role() = 'authenticated'` por cláusula `TO authenticated`
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF to_regclass('public.relatorios_diarios_fechados') IS NOT NULL THEN
        DROP POLICY IF EXISTS authenticated_relatorios_diarios_insert ON public.relatorios_diarios_fechados;
        CREATE POLICY authenticated_relatorios_diarios_insert ON public.relatorios_diarios_fechados
            FOR INSERT TO authenticated WITH CHECK (true);

        DROP POLICY IF EXISTS authenticated_relatorios_diarios_select ON public.relatorios_diarios_fechados;
        CREATE POLICY authenticated_relatorios_diarios_select ON public.relatorios_diarios_fechados
            FOR SELECT TO authenticated USING (true);
    END IF;

    IF to_regclass('public.sessoes_operador') IS NOT NULL THEN
        DROP POLICY IF EXISTS operadores_ver_sessoes_evento ON public.sessoes_operador;
        CREATE POLICY operadores_ver_sessoes_evento ON public.sessoes_operador
            FOR SELECT TO authenticated USING (true);
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 3. Remover policies inúteis de `service_role` (`service_role` já ignora RLS)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    p record;
BEGIN
    FOR p IN
        SELECT tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND (policyname LIKE 'service_role_bypass%' OR policyname LIKE 'service_role_only_%')
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, p.tablename);
    END LOOP;
END $$;

-- ------------------------------------------------------------------------------
-- 4. Restringir `PUBLIC` -> `authenticated` e consolidar policies PERMISSIVE sobrepostas
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    p record;
    t record;
    act text;
    cnt_sel int; cnt_ins int; cnt_upd int; cnt_del int;
    u_sel text;  u_upd text;  u_del text;
    c_ins text;  c_upd text;
BEGIN
    -- 4a. Trocar policies em `PUBLIC` para `TO authenticated` (evita avaliar JWT em chamadas anon)
    FOR p IN
        SELECT tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND permissive = 'PERMISSIVE'
          AND roles = ARRAY['public'::name]
    LOOP
        EXECUTE format('ALTER POLICY %I ON public.%I TO authenticated', p.policyname, p.tablename);
    END LOOP;

    -- 4b. Consolidar tabelas que ainda possuem >1 policy PERMISSIVE para a mesma ação em `authenticated`
    FOR t IN
        SELECT DISTINCT tablename
        FROM (
            SELECT tablename, a.acao
            FROM pg_policies pol
            CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) AS a(acao)
            WHERE pol.schemaname = 'public'
              AND pol.permissive = 'PERMISSIVE'
              AND ('authenticated'::name = ANY(pol.roles) OR 'public'::name = ANY(pol.roles))
              AND (pol.cmd = 'ALL' OR pol.cmd = a.acao)
            GROUP BY tablename, a.acao
            HAVING count(*) > 1
        ) dup
        ORDER BY tablename
    LOOP
        -- Calcula expressão equivalente (OR lógico) para cada uma das 4 ações
        -- SELECT
        SELECT count(*),
               CASE
                   WHEN bool_or(qual IS NULL OR btrim(qual) = 'true') THEN 'true'
                   ELSE string_agg('(' || qual || ')', ' OR ')
               END
        INTO cnt_sel, u_sel
        FROM (
            SELECT DISTINCT qual
            FROM pg_policies
            WHERE schemaname = 'public' AND tablename = t.tablename AND permissive = 'PERMISSIVE'
              AND ('authenticated'::name = ANY(roles) OR 'public'::name = ANY(roles))
              AND cmd IN ('ALL', 'SELECT')
        ) s;

        -- INSERT
        SELECT count(*),
               CASE
                   WHEN bool_or(eff_check IS NULL OR btrim(eff_check) = 'true') THEN 'true'
                   ELSE string_agg('(' || eff_check || ')', ' OR ')
               END
        INTO cnt_ins, c_ins
        FROM (
            SELECT DISTINCT COALESCE(with_check, CASE WHEN cmd = 'ALL' THEN qual ELSE NULL END) AS eff_check
            FROM pg_policies
            WHERE schemaname = 'public' AND tablename = t.tablename AND permissive = 'PERMISSIVE'
              AND ('authenticated'::name = ANY(roles) OR 'public'::name = ANY(roles))
              AND cmd IN ('ALL', 'INSERT')
        ) s;

        -- UPDATE
        SELECT count(*),
               CASE
                   WHEN bool_or(qual IS NULL OR btrim(qual) = 'true') THEN 'true'
                   ELSE string_agg('(' || qual || ')', ' OR ')
               END,
               CASE
                   WHEN bool_or(eff_check IS NULL OR btrim(eff_check) = 'true') THEN 'true'
                   ELSE string_agg('(' || eff_check || ')', ' OR ')
               END
        INTO cnt_upd, u_upd, c_upd
        FROM (
            SELECT DISTINCT qual, COALESCE(with_check, qual) AS eff_check
            FROM pg_policies
            WHERE schemaname = 'public' AND tablename = t.tablename AND permissive = 'PERMISSIVE'
              AND ('authenticated'::name = ANY(roles) OR 'public'::name = ANY(roles))
              AND cmd IN ('ALL', 'UPDATE')
        ) s;

        -- DELETE
        SELECT count(*),
               CASE
                   WHEN bool_or(qual IS NULL OR btrim(qual) = 'true') THEN 'true'
                   ELSE string_agg('(' || qual || ')', ' OR ')
               END
        INTO cnt_del, u_del
        FROM (
            SELECT DISTINCT qual
            FROM pg_policies
            WHERE schemaname = 'public' AND tablename = t.tablename AND permissive = 'PERMISSIVE'
              AND ('authenticated'::name = ANY(roles) OR 'public'::name = ANY(roles))
              AND cmd IN ('ALL', 'DELETE')
        ) s;

        -- Remove as policies antigas de `authenticated` na tabela
        FOR p IN
            SELECT policyname
            FROM pg_policies
            WHERE schemaname = 'public' AND tablename = t.tablename AND permissive = 'PERMISSIVE'
              AND ('authenticated'::name = ANY(roles) OR 'public'::name = ANY(roles))
        LOOP
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t.tablename);
        END LOOP;

        -- Recria 1 policy única (FOR ALL se idêntica nas 4 ações, ou 1 por ação)
        IF cnt_sel > 0 AND cnt_ins > 0 AND cnt_upd > 0 AND cnt_del > 0
           AND u_sel = u_upd AND u_sel = u_del AND u_sel = c_ins AND u_sel = c_upd THEN
            EXECUTE format(
                'CREATE POLICY rls_unified_all ON public.%I FOR ALL TO authenticated USING (%s) WITH CHECK (%s)',
                t.tablename, u_sel, c_ins
            );
        ELSE
            IF cnt_sel > 0 THEN
                EXECUTE format('CREATE POLICY rls_unified_select ON public.%I FOR SELECT TO authenticated USING (%s)', t.tablename, u_sel);
            END IF;
            IF cnt_ins > 0 THEN
                EXECUTE format('CREATE POLICY rls_unified_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)', t.tablename, c_ins);
            END IF;
            IF cnt_upd > 0 THEN
                EXECUTE format('CREATE POLICY rls_unified_update ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', t.tablename, u_upd, c_upd);
            END IF;
            IF cnt_del > 0 THEN
                EXECUTE format('CREATE POLICY rls_unified_delete ON public.%I FOR DELETE TO authenticated USING (%s)', t.tablename, u_del);
            END IF;
        END IF;
    END LOOP;
END $$;

-- ------------------------------------------------------------------------------
-- 5. Remover índices não-FK sem uso (0 scans) e criar índices de Foreign Keys faltantes
-- ------------------------------------------------------------------------------
DROP INDEX IF EXISTS public.idx_pessoas_dias_trabalho;
DROP INDEX IF EXISTS public.idx_pessoas_areas_autorizadas;
DROP INDEX IF EXISTS public.idx_audit_logs_changed_at;
DROP INDEX IF EXISTS public.idx_audit_logs_dispositivo_id;
DROP INDEX IF EXISTS public.idx_dispositivos_acesso_status;
DROP INDEX IF EXISTS public.idx_dispositivos_acesso_localizacao;
DROP INDEX IF EXISTS public.idx_evento_tipos_pulseira_evento_id;
DROP INDEX IF EXISTS public.idx_tsq_status_pendente;
DROP INDEX IF EXISTS public.idx_logs_veiculos_metodo;
DROP INDEX IF EXISTS public.idx_transacoes_status;
DROP INDEX IF EXISTS public.idx_watchlist_contatos_ativo;
DROP INDEX IF EXISTS public.idx_biometria_pessoa_sincronizado_em;

-- Índice parcial alinhado com a query real de `terminal_sync_queue` (status IN ('pendente','erro') AND attempt_count < 5)
CREATE INDEX IF NOT EXISTS idx_tsq_fila_ativa
    ON public.terminal_sync_queue (created_at ASC)
    WHERE (status::text = ANY (ARRAY['pendente'::text, 'erro'::text]) AND attempt_count < 5);

-- Cobrir todas as Foreign Keys em `public` que ainda não possuem índice com as mesmas colunas iniciais
DO $$
DECLARE
    fk record;
    idx_nome text;
BEGIN
    FOR fk IN
        SELECT
            c.conname,
            t.relname AS tabela,
            c.conrelid,
            c.conkey,
            (
                SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY k.ord)
                FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
                JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
            ) AS colunas_sql,
            (
                SELECT string_agg(a.attname, '_' ORDER BY k.ord)
                FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
                JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
            ) AS colunas_slug
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE c.contype = 'f'
          AND n.nspname = 'public'
          AND NOT EXISTS (
              SELECT 1
              FROM pg_index i
              JOIN pg_class ic ON ic.oid = i.indexrelid
              JOIN pg_am am ON am.oid = ic.relam AND am.amname = 'btree'
              WHERE i.indrelid = c.conrelid
                AND i.indisvalid
                AND i.indpred IS NULL
                AND i.indexprs IS NULL
                AND (i.indkey::smallint[])[0:cardinality(c.conkey)-1] = c.conkey
          )
    LOOP
        idx_nome := 'idx_fk_' || fk.tabela || '_' || fk.colunas_slug;
        IF length(idx_nome) > 63 THEN
            idx_nome := left(idx_nome, 56) || '_' || substr(md5(idx_nome), 1, 6);
        END IF;
        EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (%s)', idx_nome, fk.tabela, fk.colunas_sql);
    END LOOP;
END $$;

-- ------------------------------------------------------------------------------
-- 6. Revogar execução pública (anon / authenticated) de funções internas SECURITY DEFINER
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    fn record;
BEGIN
    FOR fn IN
        SELECT p.oid::regprocedure::text AS assinatura
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.prosecdef = true
          AND p.proname IN (
              'empresa_do_acesso',
              'empresa_do_registro',
              'empresa_do_vinculo',
              'record_audit_log_pessoas',
              'registrar_troca_empresa',
              'registrar_vinculo_pulseira',
              'revogar_documentos_vencidos'
          )
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn.assinatura);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO postgres, service_role', fn.assinatura);
    END LOOP;
END $$;

-- ------------------------------------------------------------------------------
-- 7. Atualizar estatísticas do otimizador nas tabelas de maior tráfego
-- ------------------------------------------------------------------------------
ANALYZE public.eventos;
ANALYZE public.pessoas;
ANALYZE public.logs_acesso;
ANALYZE public.dispositivos_acesso;
ANALYZE public.audit_logs;
ANALYZE public.terminal_sync_queue;
ANALYZE public.fila_sync_leitores;
