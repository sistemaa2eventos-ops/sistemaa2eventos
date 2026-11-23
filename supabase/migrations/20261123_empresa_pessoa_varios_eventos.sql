-- ============================================================================
-- Migration: 20261123_empresa_pessoa_varios_eventos.sql
-- Objetivo: a MESMA empresa (CNPJ) e a MESMA pessoa (CPF) podem participar de VÁRIOS eventos.
--   Cada evento tem o seu cadastro; a unicidade passa a ser por evento:
--     empresas: (cnpj, evento_id)    pessoas: (evento_id, cpf)
--
-- Por que: o esquema inicial criou empresas.cnpj UNIQUE e pessoas.cpf UNIQUE (no banco inteiro).
--   Migrations antigas (20260416, 20260421) trocaram para "por evento", mas não há como garantir que
--   rodaram em todo banco. Esta migration confere e corrige, sem depender do histórico.
--
-- Segurança de dados:
--   - NÃO apaga linhas nem colunas. Só remove restrições/índices ÚNICOS de uma coluna só (cnpj ou cpf)
--     e cria os únicos por evento.
--   - Se já existir duplicata DENTRO de um mesmo evento, o índice daquela tabela NÃO é criado: a migration
--     avisa (RAISE NOTICE com a contagem) e segue. Nada é desfeito; corrigir a duplicata e rodar de novo.
--   - Idempotente: pode rodar mais de uma vez.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '3s';

-- 1. Remover restrições e índices ÚNICOS de coluna única (cnpj em empresas, cpf em pessoas)
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Restrições UNIQUE de uma coluna só
    FOR r IN
        SELECT con.conname, rel.relname
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE nsp.nspname = 'public'
          AND con.contype = 'u'
          AND array_length(con.conkey, 1) = 1
          AND (
               (rel.relname = 'empresas' AND con.conkey[1] = (SELECT attnum FROM pg_attribute WHERE attrelid = rel.oid AND attname = 'cnpj'))
            OR (rel.relname = 'pessoas'  AND con.conkey[1] = (SELECT attnum FROM pg_attribute WHERE attrelid = rel.oid AND attname = 'cpf'))
          )
    LOOP
        EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', r.relname, r.conname);
        RAISE NOTICE 'Removida restrição única global: %.%', r.relname, r.conname;
    END LOOP;

    -- Índices UNIQUE de uma coluna só (sem restrição associada)
    FOR r IN
        SELECT i.relname AS indice, t.relname AS tabela
        FROM pg_index x
        JOIN pg_class i ON i.oid = x.indexrelid
        JOIN pg_class t ON t.oid = x.indrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'public'
          AND x.indisunique AND NOT x.indisprimary
          AND x.indnatts = 1
          AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = x.indexrelid)
          AND (
               (t.relname = 'empresas' AND x.indkey[0] = (SELECT attnum FROM pg_attribute WHERE attrelid = t.oid AND attname = 'cnpj'))
            OR (t.relname = 'pessoas'  AND x.indkey[0] = (SELECT attnum FROM pg_attribute WHERE attrelid = t.oid AND attname = 'cpf'))
          )
    LOOP
        EXECUTE format('DROP INDEX IF EXISTS public.%I', r.indice);
        RAISE NOTICE 'Removido índice único global: %.%', r.tabela, r.indice;
    END LOOP;
END $$;

-- 2. Únicos por evento (só se não houver duplicata dentro de um mesmo evento)
DO $$
DECLARE
    dup INTEGER;
BEGIN
    -- empresas: (cnpj, evento_id)
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uq_empresas_cnpj_evento') THEN
        SELECT count(*) INTO dup FROM (
            SELECT cnpj, evento_id FROM public.empresas
            WHERE cnpj IS NOT NULL AND cnpj <> ''
            GROUP BY cnpj, evento_id HAVING count(*) > 1
        ) d;
        IF dup = 0 THEN
            CREATE UNIQUE INDEX uq_empresas_cnpj_evento ON public.empresas (cnpj, evento_id)
                WHERE cnpj IS NOT NULL AND cnpj <> '';
            RAISE NOTICE 'Criado uq_empresas_cnpj_evento';
        ELSE
            RAISE NOTICE 'ATENÇÃO: % CNPJ(s) repetido(s) dentro do mesmo evento. Índice por evento NÃO criado.', dup;
        END IF;
    END IF;

    -- pessoas: (evento_id, cpf) — a importação por Excel usa onConflict (cpf, evento_id)
    IF NOT EXISTS (
        SELECT 1 FROM pg_index x
        JOIN pg_class t ON t.oid = x.indrelid
        WHERE t.relname = 'pessoas' AND t.relnamespace = 'public'::regnamespace
          AND x.indisunique AND x.indnatts = 2 AND x.indpred IS NULL
          AND (SELECT array_agg(attname::text ORDER BY attname) FROM pg_attribute
               WHERE attrelid = t.oid AND attnum = ANY (x.indkey::int2[])) = ARRAY['cpf', 'evento_id']
    ) THEN
        SELECT count(*) INTO dup FROM (
            SELECT evento_id, cpf FROM public.pessoas
            WHERE cpf IS NOT NULL
            GROUP BY evento_id, cpf HAVING count(*) > 1
        ) d;
        IF dup = 0 THEN
            ALTER TABLE public.pessoas ADD CONSTRAINT pessoas_evento_cpf_key UNIQUE (evento_id, cpf);
            RAISE NOTICE 'Criado pessoas_evento_cpf_key';
        ELSE
            RAISE NOTICE 'ATENÇÃO: % CPF(s) repetido(s) dentro do mesmo evento. Único por evento NÃO criado.', dup;
        END IF;
    END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Conferência (rodar depois, opcional):
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid IN ('public.empresas'::regclass, 'public.pessoas'::regclass) AND contype = 'u';
-- SELECT indexname, indexdef FROM pg_indexes WHERE tablename IN ('empresas', 'pessoas') AND indexdef ILIKE '%unique%';
