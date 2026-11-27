-- APLICADA em 27/11/2026 via Supabase MCP após validação das consultas S6 e S7.
--
-- Correção P1: pessoas.cpf com pontuação (registros legados) quebra a deduplicação e as buscas por CPF.
-- Este script grava só os dígitos. Antes de alterar, confere se isso criaria duplicidade em (evento_id, cpf):
-- se criar, aborta com RAISE EXCEPTION e não altera nenhuma linha.

DO $$
DECLARE
    qtd_conflitos integer;
BEGIN
    SELECT count(*) INTO qtd_conflitos
    FROM (
        SELECT evento_id, regexp_replace(cpf, '[^0-9]', '', 'g') AS cpf_digitos
        FROM public.pessoas
        WHERE cpf IS NOT NULL
        GROUP BY evento_id, regexp_replace(cpf, '[^0-9]', '', 'g')
        HAVING count(*) > 1
    ) AS conflitos;

    IF qtd_conflitos > 0 THEN
        RAISE EXCEPTION 'Normalização de CPF cancelada: % grupo(s) ficariam com o mesmo CPF no mesmo evento. Nada foi alterado. Resolva os duplicados (docs/auditoria/consultas_verificacao_evento.sql, S7) e rode de novo.', qtd_conflitos;
    END IF;

    UPDATE public.pessoas
    SET cpf = regexp_replace(cpf, '[^0-9]', '', 'g')
    WHERE cpf ~ '[^0-9]';
END $$;
