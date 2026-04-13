-- ========================================================================================
-- SCRIPT DE BLINDAGEM DE SEGURANÇA (RPC ATÔMICO)
-- ========================================================================================

-- 1. CORREÇÃO DA CONSTRAINT DE AUDITORIA (DE funcionario_id PARA pessoa_id)
DO $$
BEGIN
    -- Remove a constraint antiga se existir (com nome errado ou na tabela antiga)
    ALTER TABLE IF EXISTS logs_acesso DROP CONSTRAINT IF EXISTS prevent_duplication_race_condition;
    
    -- Cria a nova com os nomes de colunas corretos
    ALTER TABLE logs_acesso
    ADD CONSTRAINT prevent_duplication_race_condition
    EXCLUDE USING GIST (
        pessoa_id WITH =,
        tipo WITH =,
        EXTRACT(EPOCH FROM created_at) WITH =
    ) WHERE (tipo IN ('checkin', 'checkout'));
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Constraint GIST já aplicada ou erro de extensão btree_gist.';
END $$;

-- 2. FUNÇÃO RPC PARA REGISTRO ATÔMICO (ESTRATÉGIA DE RED TEAM)
-- Esta função encapsula Select -> Lock -> Insert -> Update em uma única transação de banco.
CREATE OR REPLACE FUNCTION registrar_acesso_atomico(
    p_pessoa_id UUID,
    p_evento_id UUID,
    p_tipo VARCHAR,
    p_metodo VARCHAR,
    p_dispositivo_id VARCHAR,
    p_created_by UUID,
    p_sync_id UUID DEFAULT NULL,
    p_offline_timestamp TIMESTAMPTZ DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
    v_status_atual VARCHAR;
    v_log_id UUID := gen_random_uuid();
    v_ts TIMESTAMPTZ := COALESCE(p_offline_timestamp, now());
    v_bloqueado BOOLEAN;
BEGIN
    -- 1. LOCK DA LINHA (Ponto vital contra Double Entry)
    -- O 'FOR UPDATE' trava a linha da pessoa até que esta função termine (Commit/Rollback)
    SELECT status_acesso, bloqueado INTO v_status_atual, v_bloqueado
    FROM pessoas 
    WHERE id = p_pessoa_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Pessoa não encontrada');
    END IF;

    -- 2. VALIDAÇÃO DE BLOQUEIO
    IF v_bloqueado THEN
        RETURN json_build_object('success', false, 'error', 'Pessoa está bloqueada no sistema');
    END IF;

    -- 3. IDEMPOTÊNCIA (Para syncs offline não duplicarem)
    IF p_sync_id IS NOT NULL AND EXISTS (SELECT 1 FROM logs_acesso WHERE sync_id = p_sync_id) THEN
        RETURN json_build_object('success', true, 'message', 'Sync já processado', 'already_done', true);
    END IF;

    -- 4. REGRA DE NEGÓCIO: BLOQUEIO DE ENTRADA DUPLA
    IF p_tipo = 'checkin' AND v_status_atual = 'checkin_feito' THEN
        RETURN json_build_object('success', false, 'error', 'Double Entry: Pessoa já possui check-in ativo neste nexus');
    END IF;

    -- 5. REGISTRAR LOG
    INSERT INTO logs_acesso (id, evento_id, pessoa_id, tipo, metodo, dispositivo_id, created_at, created_by, sync_id)
    VALUES (v_log_id, p_evento_id, p_pessoa_id, p_tipo, p_metodo, p_dispositivo_id, v_ts, p_created_by, p_sync_id);

    -- 6. ATUALIZAR STATUS
    UPDATE pessoas 
    SET status_acesso = CASE 
        WHEN p_tipo = 'checkin' THEN 'checkin_feito' 
        WHEN p_tipo = 'checkout' THEN 'checkout_feito' 
        ELSE 'autorizado' 
    END
    WHERE id = p_pessoa_id;

    RETURN json_build_object('success', true, 'log_id', v_log_id, 'new_status', 
        CASE 
            WHEN p_tipo = 'checkin' THEN 'checkin_feito' 
            WHEN p_tipo = 'checkout' THEN 'checkout_feito' 
            ELSE 'autorizado' 
        END
    );
END;
$$ LANGUAGE plpgsql;
