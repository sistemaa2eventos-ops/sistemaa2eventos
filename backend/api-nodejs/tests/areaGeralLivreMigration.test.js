/**
 * Migration 20261119f_area_geral_livre.sql (área geral não controla entrada). Teste estático do arquivo SQL:
 * - nunca apaga nada (sem DROP TABLE/COLUMN/DATA, DELETE, TRUNCATE, ALTER ... DROP) fora dos comentários;
 * - BEGIN/COMMIT com lock_timeout de 3 s e guardas (RAISE EXCEPTION antes da alteração);
 * - a função mantém assinatura, HINT 'liberavel|instante', P0409, REVOKE/GRANT só para service_role;
 * - área geral (area_id nulo) não controla: o ramo IF v.area_id IS NULL define v_controla := false.
 * O banco não é consultado: nada é executado.
 */
const fs = require('fs');
const path = require('path');

const ARQUIVO = path.join(__dirname, '..', '..', '..', 'supabase', 'migrations', '20261119f_area_geral_livre.sql');

// Só o SQL executável: sem linhas de comentário (-- ...)
const sqlExecutavel = () => fs.readFileSync(ARQUIVO, 'utf8')
    .split('\n')
    .filter(l => !/^\s*--/.test(l))
    .join('\n');

describe('migration 20261119f_area_geral_livre.sql', () => {
    it('existe e está em BEGIN/COMMIT com lock_timeout de 3 s', () => {
        const sql = sqlExecutavel();
        expect(sql).toMatch(/^\s*BEGIN;/m);
        expect(sql).toMatch(/^\s*COMMIT;/m);
        expect(sql).toMatch(/SET LOCAL lock_timeout = '3s'/);
    });

    it('não apaga nada (sem DROP de tabela, coluna ou dados, DELETE, TRUNCATE)', () => {
        const sql = sqlExecutavel();
        expect(sql).not.toMatch(/\bDROP\s+(TABLE|COLUMN|SCHEMA|INDEX|FUNCTION)\b/i);
        expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
        expect(sql).not.toMatch(/\bTRUNCATE\b/i);
        expect(sql).not.toMatch(/\bUPDATE\s+public\./i);
        expect(sql).not.toMatch(/\bINSERT\s+INTO\s+public\.(?!logs_acesso)/i);
    });

    it('recusa rodar com guardas (RAISE EXCEPTION) antes de qualquer alteração', () => {
        const sql = sqlExecutavel();
        const guarda = sql.indexOf('DO $$');
        const altera = sql.indexOf('CREATE OR REPLACE FUNCTION');
        expect(guarda).toBeGreaterThan(-1);
        expect(altera).toBeGreaterThan(guarda);
        expect(sql.slice(guarda, altera)).toMatch(/RAISE EXCEPTION/);
        expect(sql).toMatch(/to_regprocedure\('public\.registrar_acesso_etapa\(jsonb\)'\)/);
        expect(sql).toMatch(/position\('controla_entrada'/);
    });

    it('mantém a assinatura, o P0409 e o HINT liberavel|instante da função', () => {
        const sql = sqlExecutavel();
        expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.registrar_acesso_etapa\(p_row jsonb\)\s+RETURNS uuid/);
        expect(sql).toMatch(/ERRCODE = 'P0409', HINT = v_hint/);
        expect(sql).toMatch(/v_hint := 'false\|'/);
        expect(sql).toMatch(/v_hint := 'true\|'/);
    });

    it('área geral não controla: area_id nulo define v_controla := false, e a área informada usa controla_entrada', () => {
        const sql = sqlExecutavel();
        expect(sql).toMatch(/IF v\.area_id IS NULL THEN\s+v_controla := false;\s+ELSE\s+SELECT ea\.controla_entrada INTO v_controla/);
        expect(sql).toMatch(/v_controla := COALESCE\(v_controla, true\);/);
    });

    it('REVOKE e GRANT só para service_role (igual à 20261119)', () => {
        const sql = sqlExecutavel();
        expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.registrar_acesso_etapa\(jsonb\) FROM PUBLIC, anon, authenticated;/);
        expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.registrar_acesso_etapa\(jsonb\) TO service_role;/);
        expect(sql).not.toMatch(/GRANT EXECUTE[^;]*TO (anon|authenticated|PUBLIC)\b/i);
    });

    it('tem bloco DESFAZER comentado (todas as linhas dele começam com --)', () => {
        const bruto = fs.readFileSync(ARQUIVO, 'utf8');
        const inicio = bruto.indexOf('DESFAZER');
        expect(inicio).toBeGreaterThan(-1);
        const bloco = bruto.slice(inicio).split('\n').slice(1).filter(l => l.trim() !== '');
        expect(bloco.length).toBeGreaterThan(0);
        expect(bloco.every(l => /^\s*--/.test(l))).toBe(true);
    });
});
