-- ============================================
-- A2 Eventos - Restauração de RPCs Críticos
-- Execute diretamente no painel SQL do Supabase
-- ============================================

-- Dropar TODAS as versões existentes dinamicamente (resolve erro 42725)
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT oid::regprocedure::text AS func_signature
        FROM pg_proc
        WHERE proname = 'registrar_acesso_atomico'
          AND pronamespace = 'public'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_signature || ' CASCADE';
        RAISE NOTICE 'Dropped: %', r.func_signature;
    END LOOP;
END;
$$;
-- Previne Race Conditions e insere log + atualiza status em uma única transação.
CREATE OR REPLACE FUNCTION public.registrar_acesso_atomico(
    p_evento_id UUID,
    p_pessoa_id UUID,
    p_tipo TEXT,
    p_metodo TEXT,
    p_dispositivo_id TEXT DEFAULT NULL,
    p_confianca NUMERIC DEFAULT NULL,
    p_foto_capturada TEXT DEFAULT NULL,
    p_created_by UUID DEFAULT NULL,
    p_sync_id UUID DEFAULT NULL,
    p_data_hora TIMESTAMPTZ DEFAULT NOW()
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_log_id UUID := gen_random_uuid();
    v_new_status TEXT;
    v_existing_log UUID;
    v_result JSON;
BEGIN
    -- Idempotência: Se sync_id já existe, retorna sem duplicar
    IF p_sync_id IS NOT NULL THEN
        SELECT id INTO v_existing_log
        FROM logs_acesso
        WHERE sync_id = p_sync_id
        LIMIT 1;

        IF v_existing_log IS NOT NULL THEN
            RETURN json_build_object(
                'success', true,
                'already_done', true,
                'log_id', v_existing_log
            );
        END IF;
    END IF;

    -- Determinar novo status
    IF p_tipo = 'checkin' THEN
        v_new_status := 'checkin_feito';
    ELSIF p_tipo = 'checkout' THEN
        v_new_status := 'checkout_feito';
    ELSE
        v_new_status := p_tipo; -- 'negado', 'expulsao', etc.
    END IF;

    -- Inserir log de acesso
    INSERT INTO logs_acesso (id, evento_id, pessoa_id, tipo, metodo, dispositivo_id, confianca, foto_capturada, created_by, sync_id, created_at)
    VALUES (v_log_id, p_evento_id, p_pessoa_id, p_tipo, p_metodo, p_dispositivo_id, p_confianca, p_foto_capturada, p_created_by, p_sync_id, p_data_hora);

    -- Atualizar status da pessoa (apenas para checkin/checkout)
    IF p_tipo IN ('checkin', 'checkout') THEN
        UPDATE pessoas
        SET status_acesso = v_new_status,
            updated_at = NOW()
        WHERE id = p_pessoa_id;
    END IF;

    v_result := json_build_object(
        'success', true,
        'log_id', v_log_id,
        'new_status', v_new_status
    );

    RETURN v_result;

EXCEPTION WHEN unique_violation THEN
    -- Se houver violação de unicidade (sync_id duplicado), retorna idempotente
    RETURN json_build_object(
        'success', true,
        'already_done', true,
        'log_id', v_log_id
    );
END;
$$;

-- Garante que a função é acessível pelo service_role
GRANT EXECUTE ON FUNCTION public.registrar_acesso_atomico TO service_role;
GRANT EXECUTE ON FUNCTION public.registrar_acesso_atomico TO authenticated;
