-- =====================================================================
-- Remoção de índices DUPLICADOS (schema public) — 2026-10-11
--
-- Índice duplicado = mesma tabela, mesmas colunas/expressões, mesma ordem
-- (ASC/DESC), mesmo filtro (WHERE), mesmo tipo (btree/gin...) e mesma
-- unicidade. Ele não acelera nenhuma consulta e deixa cada INSERT/UPDATE
-- mais lento (o banco atualiza todas as cópias).
--
-- Regras de segurança:
--   * de cada grupo de duplicatas, sempre UM índice é mantido;
--   * índices ligados a constraint (PRIMARY KEY, UNIQUE, EXCLUDE) nunca são removidos;
--   * idempotente: rodar de novo não remove mais nada.
--
-- PASSO 1 (opcional): rode só o SELECT abaixo para ver o que será removido.
-- PASSO 2: rode o bloco DO $$ ... $$.
-- =====================================================================

-- PASSO 1 — Prévia (somente leitura)
WITH idx AS (
    SELECT
        n.nspname AS esquema,
        t.relname AS tabela,
        c.relname AS indice,
        pg_get_indexdef(i.indexrelid) AS definicao,
        concat_ws('|', i.indrelid::text, i.indkey::text, i.indclass::text, i.indcollation::text,
                  i.indoption::text, coalesce(pg_get_expr(i.indexprs, i.indrelid), ''),
                  coalesce(pg_get_expr(i.indpred, i.indrelid), ''), am.amname, i.indisunique::text) AS assinatura,
        EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conindid = i.indexrelid) AS de_constraint
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
    JOIN pg_class t ON t.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_am am ON am.oid = c.relam
    WHERE n.nspname = 'public'
),
grupos AS (
    SELECT *,
           row_number() OVER (PARTITION BY assinatura ORDER BY de_constraint DESC, indice) AS ordem,
           first_value(indice) OVER (PARTITION BY assinatura ORDER BY de_constraint DESC, indice) AS mantido
    FROM idx
)
SELECT tabela, indice AS sera_removido, mantido AS fica_no_lugar, definicao
FROM grupos
WHERE ordem > 1 AND NOT de_constraint
ORDER BY tabela, indice;

-- PASSO 2 — Remoção
DO $$
DECLARE
    r record;
    total int := 0;
BEGIN
    FOR r IN
        WITH idx AS (
            SELECT
                n.nspname AS esquema,
                c.relname AS indice,
                concat_ws('|', i.indrelid::text, i.indkey::text, i.indclass::text, i.indcollation::text,
                          i.indoption::text, coalesce(pg_get_expr(i.indexprs, i.indrelid), ''),
                          coalesce(pg_get_expr(i.indpred, i.indrelid), ''), am.amname, i.indisunique::text) AS assinatura,
                EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conindid = i.indexrelid) AS de_constraint
            FROM pg_index i
            JOIN pg_class c ON c.oid = i.indexrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
            JOIN pg_am am ON am.oid = c.relam
            WHERE n.nspname = 'public'
        ),
        grupos AS (
            SELECT *, row_number() OVER (PARTITION BY assinatura ORDER BY de_constraint DESC, indice) AS ordem
            FROM idx
        )
        SELECT esquema, indice FROM grupos WHERE ordem > 1 AND NOT de_constraint
    LOOP
        RAISE NOTICE 'Removendo índice duplicado: %.%', r.esquema, r.indice;
        EXECUTE format('DROP INDEX IF EXISTS %I.%I', r.esquema, r.indice);
        total := total + 1;
    END LOOP;
    RAISE NOTICE 'Índices duplicados removidos: %', total;
END $$;
