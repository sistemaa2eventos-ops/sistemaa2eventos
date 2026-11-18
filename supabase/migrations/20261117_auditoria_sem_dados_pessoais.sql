-- ==============================================================================
-- MIGRATION: Auditoria de pessoas sem dados pessoais
-- Data: 2026-11-17
-- Idempotente. NÃO apaga nem altera dados (nenhuma linha de audit_logs é tocada).
--
-- Problema: os gatilhos de auditoria de public.pessoas copiam a linha inteira (CPF, e-mail, telefone,
-- documento, foto, vetor facial...) para audit_logs. Depois da anonimização (LGPD), o dado pessoal
-- continuava na trilha.
--
-- Há dois sistemas de gatilho no repositório, e qualquer um deles pode estar ativo em pessoas:
--   * trg_audit_pessoas → record_audit_log()        (database/supabase/migrations/12_audit_trail_triggers.sql)
--     grava old_data / new_data. A mesma função audita pessoa_documentos, eventos,
--     pessoa_evento_empresa e perfis.
--   * tr_audit_pessoas  → fn_audit_log_trigger()    (supabase/migrations/20260408_lgpd_v2.sql)
--     grava detalhes = { old, new }. A mesma função audita transacoes_financeiras e perfis.
--
-- Para não mudar a auditoria das outras tabelas, as duas funções compartilhadas NÃO são alteradas.
-- Esta migration cria duas funções novas, só para pessoas (mesma lógica das originais, sem as colunas
-- pessoais), e repassa para elas apenas os gatilhos de pessoas QUE JÁ EXISTEM. Nenhum gatilho novo é
-- criado: se um dos dois não existir no banco, continua sem existir.
--
-- Colunas retiradas de old_data/new_data/detalhes (só da tabela pessoas):
--   cpf, email, telefone, documento, passaporte, nome_mae, data_nascimento, foto_url, face_encoding,
--   documento_foto, qr_code
-- O resto da linha continua igual. Para não perder o rastro, a trilha ganha a lista dos NOMES das
-- colunas pessoais que mudaram ("_campos_pessoais_alterados"), nunca os valores.
-- A decisão de gravar ou não continua igual à original: update que só mexe em coluna pessoal
-- também gera registro (com os dados pessoais retirados).
--
-- Fora do escopo (não feito aqui):
--   * linhas antigas de audit_logs que já têm CPF/foto: limpá-las apaga dados de auditoria e o
--     PostgREST bloqueia UPDATE/DELETE em audit_logs; precisa de decisão e migration própria;
--   * nome_completo e nome_credencial continuam na trilha (não estavam na lista pedida).
--
-- COMO APLICAR: SQL Editor do Supabase → colar este arquivo inteiro → Run, FORA DO PICO de acessos.
-- Tudo roda numa transação com lock_timeout de 3 s: trocar gatilho exige um bloqueio curto em
-- pessoas, e o check-in não pode ficar parado esperando. Se der erro de timeout ("canceling
-- statement due to lock timeout"), nada foi aplicado: é só rodar de novo (um pouco depois).
--
-- SECURITY DEFINER / INVOKER: as funções novas seguem as originais do repositório —
-- record_audit_log_pessoas é SECURITY DEFINER (como record_audit_log) e fn_audit_log_trigger_pessoas
-- é SECURITY INVOKER (como fn_audit_log_trigger). Antes de aplicar, confira se o banco está igual:
--   select proname, prosecdef from pg_proc
--    where proname in ('record_audit_log', 'fn_audit_log_trigger');
--   → esperado: record_audit_log = true, fn_audit_log_trigger = false. Se algum vier diferente, troque
--     SECURITY DEFINER/INVOKER na função nova correspondente antes de rodar.
-- CONFERIR DEPOIS:
--   select tgname, tgfoid::regproc from pg_trigger
--    where tgrelid = 'public.pessoas'::regclass and not tgisinternal and tgname in ('trg_audit_pessoas','tr_audit_pessoas');
--   → os que existirem devem apontar para record_audit_log_pessoas / fn_audit_log_trigger_pessoas.
-- COMO DESFAZER: ver o bloco "DESFAZER" no fim do arquivo.
-- ==============================================================================

BEGIN;
SET LOCAL lock_timeout = '3s';

-- 1. Retira as colunas pessoais de um JSON de linha de pessoas
CREATE OR REPLACE FUNCTION public.fn_pessoa_sem_dados_pessoais(p_linha JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
    SELECT CASE WHEN p_linha IS NULL THEN NULL ELSE p_linha - ARRAY[
        'cpf', 'email', 'telefone', 'documento', 'passaporte', 'nome_mae', 'data_nascimento',
        'foto_url', 'face_encoding', 'documento_foto', 'qr_code'
    ] END;
$$;

-- 2. Nomes das colunas pessoais que mudaram entre OLD e NEW (só nomes, nunca valores)
CREATE OR REPLACE FUNCTION public.fn_pessoa_campos_pessoais_alterados(p_old JSONB, p_new JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
    SELECT COALESCE(jsonb_agg(c ORDER BY c), '[]'::jsonb)
      FROM unnest(ARRAY[
        'cpf', 'email', 'telefone', 'documento', 'passaporte', 'nome_mae', 'data_nascimento',
        'foto_url', 'face_encoding', 'documento_foto', 'qr_code'
      ]) AS c
     WHERE (p_old -> c) IS DISTINCT FROM (p_new -> c);
$$;

-- 3. Versão de record_audit_log() só para pessoas (mesma lógica de 12_audit_trail_triggers.sql)
CREATE OR REPLACE FUNCTION public.record_audit_log_pessoas()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_old_full JSONB := NULL;
    v_new_full JSONB := NULL;
    v_old_data JSONB := NULL;
    v_new_data JSONB := NULL;
    v_record_id UUID;
BEGIN
    v_user_id := auth.uid();

    IF TG_OP = 'INSERT' THEN
        v_new_full := row_to_json(NEW)::JSONB;
        v_record_id := NEW.id;
    ELSIF TG_OP = 'UPDATE' THEN
        v_old_full := row_to_json(OLD)::JSONB;
        v_new_full := row_to_json(NEW)::JSONB;
        v_record_id := NEW.id;
        -- Mesmo critério da original: update sem mudança real não gera registro
        IF v_old_full = v_new_full THEN
            RETURN NEW;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        v_old_full := row_to_json(OLD)::JSONB;
        v_record_id := OLD.id;
    END IF;

    v_old_data := public.fn_pessoa_sem_dados_pessoais(v_old_full);
    v_new_data := public.fn_pessoa_sem_dados_pessoais(v_new_full);
    IF TG_OP = 'UPDATE' THEN
        v_new_data := v_new_data || jsonb_build_object(
            '_campos_pessoais_alterados', public.fn_pessoa_campos_pessoais_alterados(v_old_full, v_new_full));
    END IF;

    INSERT INTO public.audit_logs (tabela_nome, acao, registro_id, old_data, new_data, changed_by)
    VALUES (TG_TABLE_NAME, TG_OP, v_record_id, v_old_data, v_new_data, v_user_id);

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

-- 4. Versão de fn_audit_log_trigger() só para pessoas (mesma lógica de 20260408_lgpd_v2.sql)
CREATE OR REPLACE FUNCTION public.fn_audit_log_trigger_pessoas()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_user_role TEXT;
    v_evento_id UUID;
    v_detalhes JSONB;
    v_old JSONB;
    v_new JSONB;
BEGIN
    BEGIN
        v_user_id := current_setting('app.current_user_id', true)::UUID;
        v_user_role := current_setting('app.current_user_role', true);
    EXCEPTION WHEN OTHERS THEN
        v_user_id := NULL;
        v_user_role := 'system';
    END;

    IF (TG_OP = 'DELETE') THEN
        v_evento_id := OLD.evento_id;
    ELSE
        v_evento_id := NEW.evento_id;
    END IF;

    IF (TG_OP = 'INSERT') THEN
        v_detalhes := jsonb_build_object('new', public.fn_pessoa_sem_dados_pessoais(to_jsonb(NEW)));
    ELSIF (TG_OP = 'UPDATE') THEN
        v_old := to_jsonb(OLD);
        v_new := to_jsonb(NEW);
        v_detalhes := jsonb_build_object(
            'old', public.fn_pessoa_sem_dados_pessoais(v_old),
            'new', public.fn_pessoa_sem_dados_pessoais(v_new),
            '_campos_pessoais_alterados', public.fn_pessoa_campos_pessoais_alterados(v_old, v_new));
    ELSIF (TG_OP = 'DELETE') THEN
        v_detalhes := jsonb_build_object('old', public.fn_pessoa_sem_dados_pessoais(to_jsonb(OLD)));
    END IF;

    INSERT INTO public.audit_logs (
        evento_id, user_id, nivel_acesso, acao, recurso, recurso_id, detalhes, ip_origem, created_at
    ) VALUES (
        COALESCE(v_evento_id, '00000000-0000-0000-0000-000000000000'),
        v_user_id,
        v_user_role,
        TG_OP,
        TG_TABLE_NAME::TEXT,
        CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
        v_detalhes,
        NULL,
        NOW()
    );

    IF (TG_OP = 'DELETE') THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

-- 5. Repassa só os gatilhos de pessoas que já existem (não cria gatilho novo)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_trigger
                WHERE tgrelid = 'public.pessoas'::regclass AND tgname = 'trg_audit_pessoas' AND NOT tgisinternal) THEN
        DROP TRIGGER trg_audit_pessoas ON public.pessoas;
        CREATE TRIGGER trg_audit_pessoas
            AFTER INSERT OR UPDATE OR DELETE ON public.pessoas
            FOR EACH ROW EXECUTE FUNCTION public.record_audit_log_pessoas();
        RAISE NOTICE 'trg_audit_pessoas agora usa record_audit_log_pessoas()';
    ELSE
        RAISE NOTICE 'trg_audit_pessoas não existe: nada a trocar';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_trigger
                WHERE tgrelid = 'public.pessoas'::regclass AND tgname = 'tr_audit_pessoas' AND NOT tgisinternal) THEN
        DROP TRIGGER tr_audit_pessoas ON public.pessoas;
        CREATE TRIGGER tr_audit_pessoas
            AFTER INSERT OR UPDATE OR DELETE ON public.pessoas
            FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger_pessoas();
        RAISE NOTICE 'tr_audit_pessoas agora usa fn_audit_log_trigger_pessoas()';
    ELSE
        RAISE NOTICE 'tr_audit_pessoas não existe: nada a trocar';
    END IF;
END $$;

COMMIT;

-- ==============================================================================
-- DESFAZER (copiar para o SQL Editor e rodar fora do pico; volta exatamente ao estado anterior).
-- Só recria os gatilhos que existirem; as funções originais nunca foram alteradas.
-- Se der timeout de bloqueio, nada foi desfeito: rodar de novo.
--
-- BEGIN;
-- SET LOCAL lock_timeout = '3s';
-- DO $$
-- BEGIN
--     IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.pessoas'::regclass AND tgname = 'trg_audit_pessoas' AND NOT tgisinternal) THEN
--         DROP TRIGGER trg_audit_pessoas ON public.pessoas;
--         CREATE TRIGGER trg_audit_pessoas AFTER INSERT OR UPDATE OR DELETE ON public.pessoas
--             FOR EACH ROW EXECUTE FUNCTION public.record_audit_log();
--     END IF;
--     IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.pessoas'::regclass AND tgname = 'tr_audit_pessoas' AND NOT tgisinternal) THEN
--         DROP TRIGGER tr_audit_pessoas ON public.pessoas;
--         CREATE TRIGGER tr_audit_pessoas AFTER INSERT OR UPDATE OR DELETE ON public.pessoas
--             FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();
--     END IF;
-- END $$;
-- DROP FUNCTION IF EXISTS public.record_audit_log_pessoas();
-- DROP FUNCTION IF EXISTS public.fn_audit_log_trigger_pessoas();
-- DROP FUNCTION IF EXISTS public.fn_pessoa_campos_pessoais_alterados(JSONB, JSONB);
-- DROP FUNCTION IF EXISTS public.fn_pessoa_sem_dados_pessoais(JSONB);
-- COMMIT;
-- ==============================================================================
