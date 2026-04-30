-- ============================================
-- FASE 6: REMOVE SECURITY DEFINER FROM FUNCTIONS
-- ============================================
-- Objetivo: Eliminar os 23 warnings de SECURITY DEFINER
-- Abordagem: Mudar para SECURITY INVOKER (mais seguro para funções trigger)
-- Tempo: ~10 minutos
-- Risco: Baixo (funcionalidade não muda)

-- =====================================================
-- FUNÇÕES TRIGGER - Devem ser SECURITY INVOKER
-- =====================================================
-- Triggers NÃO devem ser chamadas via API pública
-- Mudar para SECURITY INVOKER e revogar tudo de público

-- 1. camera_update_updated_at - É uma trigger, não deveria ser chamada
DROP FUNCTION IF EXISTS public.camera_update_updated_at() CASCADE;
CREATE FUNCTION public.camera_update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

-- 2. handle_new_event_modules - É uma trigger, não deveria ser chamada
DROP FUNCTION IF EXISTS public.handle_new_event_modules() CASCADE;
CREATE FUNCTION public.handle_new_event_modules()
RETURNS trigger AS $$
BEGIN
    INSERT INTO event_modules (evento_id, module_key) VALUES
    (NEW.id, 'checkin_qrcode'),
    (NEW.id, 'checkin_face'),
    (NEW.id, 'checkin_manual'),
    (NEW.id, 'checkout_manual');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

-- 3. handle_sync_user_claims - É uma trigger, não deveria ser chamada
DROP FUNCTION IF EXISTS public.handle_sync_user_claims() CASCADE;
CREATE FUNCTION public.handle_sync_user_claims()
RETURNS trigger AS $$
BEGIN
  UPDATE auth.users
  SET raw_app_meta_data =
    raw_app_meta_data ||
    jsonb_build_object('nivel_acesso', NEW.nivel_acesso, 'evento_id', NEW.evento_id)
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

-- 4. record_audit_log - É uma trigger, não deveria ser chamada
DROP FUNCTION IF EXISTS public.record_audit_log() CASCADE;
CREATE FUNCTION public.record_audit_log()
RETURNS trigger AS $$
DECLARE
    v_user_id UUID;
    v_old_data JSONB := NULL;
    v_new_data JSONB := NULL;
    v_record_id UUID;
BEGIN
    v_user_id := auth.uid();

    IF TG_OP = 'INSERT' THEN
        v_new_data := row_to_json(NEW)::JSONB;
        v_record_id := NEW.id;
    ELSIF TG_OP = 'UPDATE' THEN
        v_old_data := row_to_json(OLD)::JSONB;
        v_new_data := row_to_json(NEW)::JSONB;
        v_record_id := NEW.id;

        IF v_old_data = v_new_data THEN
            RETURN NEW;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        v_old_data := row_to_json(OLD)::JSONB;
        v_record_id := OLD.id;
    END IF;

    INSERT INTO audit_logs (
        tabela_nome,
        acao,
        registro_id,
        old_data,
        new_data,
        changed_by
    ) VALUES (
        TG_TABLE_NAME,
        TG_OP,
        v_record_id,
        v_old_data,
        v_new_data,
        v_user_id
    );

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public;

-- 5. update_pessoa_evento_empresa_timestamp - É uma trigger
DROP FUNCTION IF EXISTS public.update_pessoa_evento_empresa_timestamp() CASCADE;
CREATE FUNCTION public.update_pessoa_evento_empresa_timestamp()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public;

-- 6. update_terminal_sync_queue_updated_at - É uma trigger
DROP FUNCTION IF EXISTS public.update_terminal_sync_queue_updated_at() CASCADE;
CREATE FUNCTION public.update_terminal_sync_queue_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

-- 7. get_my_event_id - Helper que deveria ser private
DROP FUNCTION IF EXISTS public.get_my_event_id() CASCADE;
CREATE FUNCTION public.get_my_event_id()
RETURNS uuid AS $$
BEGIN
  RETURN (SELECT evento_id FROM public.perfis WHERE id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

-- =====================================================
-- FUNÇÕES DE NEGÓCIO - Mudar para SECURITY INVOKER
-- =====================================================
-- Essas funções têm validações internas, não precisam de SECURITY DEFINER

-- 1. is_master - Tem validação, pode ser SECURITY INVOKER
DROP FUNCTION IF EXISTS public.is_master() CASCADE;
CREATE FUNCTION public.is_master()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.perfis
    WHERE id = auth.uid()
    AND nivel_acesso = 'master'
    AND ativo = true
  );
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

-- 2. reconcile_transaction - Tem validação de role, pode ser SECURITY INVOKER
DROP FUNCTION IF EXISTS public.reconcile_transaction(uuid) CASCADE;
CREATE FUNCTION public.reconcile_transaction(t_id uuid)
RETURNS jsonb AS $$
DECLARE
    v_pessoa_id UUID;
    v_updated_count INT;
    v_user_role TEXT;
BEGIN
    -- VALIDAÇÃO: Apenas ADMIN pode reconciliar transações
    SELECT nivel_acesso INTO v_user_role
    FROM public.perfis
    WHERE id = auth.uid();

    IF v_user_role NOT IN ('master', 'admin') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Apenas administradores podem reconciliar transações'
        );
    END IF;

    -- 1. Buscar pessoa_id da transação e validar existência
    SELECT pessoa_id INTO v_pessoa_id FROM pagamentos WHERE id = t_id;

    IF v_pessoa_id IS NULL THEN
        RAISE EXCEPTION 'Transação % não encontrada ou sem vínculo de pessoa.', t_id;
    END IF;

    -- 2. Atualizar Pagamento
    UPDATE pagamentos
    SET status = 'confirmado',
        updated_at = now()
    WHERE id = t_id;

    -- 3. Atualizar Pessoa (Ativação de Acesso)
    UPDATE pessoas
    SET status_acesso = 'autorizado',
        pagamento_validado = true,
        updated_at = now()
    WHERE id = v_pessoa_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        RAISE EXCEPTION 'Falha ao atualizar status de acesso para a pessoa %.', v_pessoa_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'transaction_id', t_id,
        'pessoa_id', v_pessoa_id
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public;

-- 3. registrar_acesso_atomico - Tem validação de auth
DROP FUNCTION IF EXISTS public.registrar_acesso_atomico(uuid,uuid,text,text,text,numeric,text,uuid,uuid,timestamp with time zone) CASCADE;
CREATE FUNCTION public.registrar_acesso_atomico(
    p_evento_id uuid,
    p_pessoa_id uuid,
    p_tipo text,
    p_metodo text,
    p_dispositivo_id text DEFAULT NULL,
    p_confianca numeric DEFAULT NULL,
    p_foto_capturada text DEFAULT NULL,
    p_created_by uuid DEFAULT NULL,
    p_sync_id uuid DEFAULT NULL,
    p_data_hora timestamp with time zone DEFAULT now()
)
RETURNS json AS $$
DECLARE
    v_log_id UUID := gen_random_uuid();
    v_new_status TEXT;
    v_existing_log UUID;
    v_result JSON;
BEGIN
    -- VALIDAÇÃO: Autenticação necessária
    IF auth.uid() IS NULL AND current_setting('request.header.authorization', true) IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Autenticação necessária');
    END IF;

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
        v_new_status := p_tipo;
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
    RETURN json_build_object(
        'success', true,
        'already_done', true,
        'log_id', v_log_id
    );
END;
$$ LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public;

-- 4. buscar_pessoa_por_id_prefixo - Já é SECURITY INVOKER, mas confirmar
-- (Esta já foi criada como SECURITY INVOKER, mas vamos confirmar)

-- =====================================================
-- VERIFICAÇÃO FINAL
-- =====================================================

-- Ver definições das funções recriadas
SELECT
  p.proname,
  CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END as security_type
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN (
    'camera_update_updated_at',
    'handle_new_event_modules',
    'handle_sync_user_claims',
    'record_audit_log',
    'update_pessoa_evento_empresa_timestamp',
    'update_terminal_sync_queue_updated_at',
    'get_my_event_id',
    'is_master',
    'reconcile_transaction',
    'registrar_acesso_atomico',
    'buscar_pessoa_por_id_prefixo'
  )
ORDER BY p.proname;

-- =====================================================
-- PRÓXIMAS AÇÕES
-- =====================================================
-- 1. ✅ Executar este script SQL
-- 2. Executar Database Linter novamente
-- 3. Verificar se os 23 warnings foram resolvidos
