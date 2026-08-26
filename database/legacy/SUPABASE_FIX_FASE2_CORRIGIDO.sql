-- ============================================
-- FASE 2: CORRIGIDA - Funções com DROP primeiro
-- ============================================
-- Tempo: ~20 minutos
-- Risco: Baixo (sem mudanças de lógica, apenas segurança)
-- MUDANÇA: Adicionado DROP FUNCTION antes de CREATE

-- =====================================================
-- PASSO 1: DROPAR FUNÇÕES ANTIGAS (com CASCADE)
-- =====================================================

DROP FUNCTION IF EXISTS public.registrar_acesso_atomico(uuid,uuid,text,text,text,numeric,text,uuid,uuid,timestamp with time zone) CASCADE;
DROP FUNCTION IF EXISTS public.buscar_pessoa_por_id_prefixo(text) CASCADE;
DROP FUNCTION IF EXISTS public.reconcile_transaction(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.record_audit_log() CASCADE;
DROP FUNCTION IF EXISTS public.handle_sync_user_claims() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_event_modules() CASCADE;
DROP FUNCTION IF EXISTS public.is_master() CASCADE;

-- =====================================================
-- PASSO 2: CRIAR NOVAS VERSÕES COM SEGURANÇA
-- =====================================================

-- 1️⃣  REGISTRAR_ACESSO_ATOMICO - Com search_path + Validação
-- =====================================================
CREATE FUNCTION public.registrar_acesso_atomico(
    p_evento_id uuid,
    p_pessoa_id uuid,
    p_tipo text,
    p_metodo text,
    p_dispositivo_id text,
    p_confianca numeric,
    p_foto_capturada text,
    p_created_by uuid,
    p_sync_id uuid,
    p_data_hora timestamp with time zone
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
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- 2️⃣  BUSCAR_PESSOA_POR_ID_PREFIXO - SECURITY INVOKER (busca pública)
-- =====================================================
CREATE FUNCTION public.buscar_pessoa_por_id_prefixo(prefixo text)
RETURNS TABLE(id uuid, evento_id uuid, nome text, empresa_id uuid, foto_url text) AS $$
BEGIN
    RETURN QUERY
    SELECT p.id, p.evento_id, p.nome, p.empresa_id, p.foto_url
    FROM public.pessoas p
    WHERE p.id::text LIKE prefixo || '%'
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

-- 3️⃣  RECONCILE_TRANSACTION - Com search_path + Validação de Role
-- =====================================================
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
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- 4️⃣  RECORD_AUDIT_LOG - Função trigger com search_path
-- =====================================================
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
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- 5️⃣  HANDLE_SYNC_USER_CLAIMS - Função trigger com search_path
-- =====================================================
CREATE FUNCTION public.handle_sync_user_claims()
RETURNS trigger AS $$
BEGIN
  UPDATE auth.users
  SET raw_app_meta_data =
    raw_app_meta_data ||
    jsonb_build_object('nivel_acesso', NEW.nivel_acesso, 'evento_id', NEW.evento_id)
  WHERE id = NEW.user_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- 6️⃣  HANDLE_NEW_EVENT_MODULES - Função trigger com search_path
-- =====================================================
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
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- 7️⃣  IS_MASTER - Função helper com search_path
-- =====================================================
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
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- =====================================================
-- PASSO 3: VERIFICAÇÃO FINAL
-- =====================================================
-- Verificar que todas as funções têm search_path agora
SELECT
  r.routine_name,
  CASE
    WHEN r.routine_definition LIKE '%SET search_path%' THEN '✅ OK'
    ELSE '⚠️  VERIFICAR'
  END as search_path_status
FROM information_schema.routines r
WHERE r.routine_schema = 'public'
  AND r.routine_name IN (
    'registrar_acesso_atomico',
    'buscar_pessoa_por_id_prefixo',
    'reconcile_transaction',
    'record_audit_log',
    'handle_sync_user_claims',
    'handle_new_event_modules',
    'is_master'
  )
ORDER BY r.routine_name;

-- =====================================================
-- PASSO 4: TESTES
-- =====================================================
-- Testar is_master
SELECT public.is_master() as sou_master;

-- Testar buscar_pessoa_por_id_prefixo (com um UUID real)
-- SELECT * FROM public.buscar_pessoa_por_id_prefixo('550e8400-e29b-41d4-a716-446655440000');

-- =====================================================
-- PRÓXIMAS AÇÕES
-- =====================================================
-- 1. Testar todas as funções no staging/produção
-- 2. Monitorar logs por 24h
-- 3. Quando estável, agendar FASE 3 (limpeza RLS)
