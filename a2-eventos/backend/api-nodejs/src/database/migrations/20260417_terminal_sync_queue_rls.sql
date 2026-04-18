-- Migration 20260417_terminal_sync_queue_rls.sql
-- Descrição: Fila de sincronização de terminais com RLS e suporte PostgreSQL
-- Correção: Remove referência a public.usuarios_eventos (não existe).
-- RLS usa o mesmo padrão do sistema: user_metadata/app_metadata no JWT.

-- ============================================
-- 1. TABELA terminal_sync_queue
-- ============================================
CREATE TABLE IF NOT EXISTS public.terminal_sync_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evento_id UUID NOT NULL REFERENCES public.eventos(id) ON DELETE CASCADE,
    dispositivo_id UUID NOT NULL REFERENCES public.dispositivos_acesso(id) ON DELETE CASCADE,
    pessoa_id UUID REFERENCES public.pessoas(id) ON DELETE SET NULL,
    tipo_comando VARCHAR(50) NOT NULL,
    -- 'enroll_face', 'delete_face', 'open_door', 'lock_door', 'close_door', 'display_message'
    payload JSONB,
    status VARCHAR(20) DEFAULT 'pendente',
    -- 'pendente', 'processando', 'sucesso', 'erro'
    attempt_count INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 5,
    error_message TEXT,
    last_attempt TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_tsq_evento_id ON public.terminal_sync_queue(evento_id);
CREATE INDEX IF NOT EXISTS idx_tsq_dispositivo_id ON public.terminal_sync_queue(dispositivo_id);
CREATE INDEX IF NOT EXISTS idx_tsq_pessoa_id ON public.terminal_sync_queue(pessoa_id);
CREATE INDEX IF NOT EXISTS idx_tsq_status_pendente ON public.terminal_sync_queue(status)
    WHERE status IN ('pendente', 'processando');
CREATE INDEX IF NOT EXISTS idx_tsq_dispositivo_status ON public.terminal_sync_queue(dispositivo_id, status);
CREATE INDEX IF NOT EXISTS idx_tsq_created_at ON public.terminal_sync_queue(created_at DESC);

-- ============================================
-- 2. RLS - terminal_sync_queue
-- Usa o mesmo padrão do 20260416_rls_multitenant_fix.sql
-- ============================================
ALTER TABLE public.terminal_sync_queue ENABLE ROW LEVEL SECURITY;

-- service_role (backend Node.js): bypass total
CREATE POLICY "service_role_bypass" ON public.terminal_sync_queue
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- master/admin_master: acesso total
CREATE POLICY "master_full_access" ON public.terminal_sync_queue
    FOR ALL USING (
        COALESCE(
            auth.jwt() -> 'user_metadata' ->> 'nivel_acesso',
            auth.jwt() -> 'user_metadata' ->> 'role',
            auth.jwt() -> 'app_metadata' ->> 'role'
        ) IN ('master', 'admin_master')
    );

-- operadores: isolamento por evento_id (multi-tenant)
CREATE POLICY "tenant_isolation" ON public.terminal_sync_queue
    FOR ALL USING (
        COALESCE(
            auth.jwt() -> 'user_metadata' ->> 'nivel_acesso',
            auth.jwt() -> 'user_metadata' ->> 'role',
            auth.jwt() -> 'app_metadata' ->> 'role'
        ) IN ('admin', 'supervisor', 'operador', 'admin_master')
        AND (
            COALESCE(
                auth.jwt() -> 'user_metadata' ->> 'evento_id',
                auth.jwt() -> 'app_metadata' ->> 'evento_id'
            ) IS NULL
            OR evento_id::text = COALESCE(
                auth.jwt() -> 'user_metadata' ->> 'evento_id',
                auth.jwt() -> 'app_metadata' ->> 'evento_id'
            )
        )
    );

-- ============================================
-- 3. COLUNAS FALTANTES EM dispositivos_acesso
-- ============================================
ALTER TABLE public.dispositivos_acesso
    ADD COLUMN IF NOT EXISTS user_device VARCHAR(100) DEFAULT 'admin',
    ADD COLUMN IF NOT EXISTS password_device VARCHAR(255),
    ADD COLUMN IF NOT EXISTS status_online VARCHAR(20) DEFAULT 'offline',
    ADD COLUMN IF NOT EXISTS modo VARCHAR(20) DEFAULT 'ambos',
    ADD COLUMN IF NOT EXISTS ultimo_ping TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS area_nome VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_disp_evento_status ON public.dispositivos_acesso(evento_id, status_online);
CREATE INDEX IF NOT EXISTS idx_disp_ip_address ON public.dispositivos_acesso(ip_address);

-- ============================================
-- 4. RLS - dispositivos_acesso
-- ============================================
ALTER TABLE public.dispositivos_acesso ENABLE ROW LEVEL SECURITY;

-- Remove políticas existentes se houver (evitar conflito)
DROP POLICY IF EXISTS "service_role_bypass" ON public.dispositivos_acesso;
DROP POLICY IF EXISTS "master_full_access" ON public.dispositivos_acesso;
DROP POLICY IF EXISTS "tenant_isolation" ON public.dispositivos_acesso;

CREATE POLICY "service_role_bypass" ON public.dispositivos_acesso
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "master_full_access" ON public.dispositivos_acesso
    FOR ALL USING (
        COALESCE(
            auth.jwt() -> 'user_metadata' ->> 'nivel_acesso',
            auth.jwt() -> 'user_metadata' ->> 'role',
            auth.jwt() -> 'app_metadata' ->> 'role'
        ) IN ('master', 'admin_master')
    );

CREATE POLICY "tenant_isolation" ON public.dispositivos_acesso
    FOR ALL USING (
        COALESCE(
            auth.jwt() -> 'user_metadata' ->> 'nivel_acesso',
            auth.jwt() -> 'user_metadata' ->> 'role',
            auth.jwt() -> 'app_metadata' ->> 'role'
        ) IN ('admin', 'supervisor', 'operador', 'admin_master')
        AND (
            COALESCE(
                auth.jwt() -> 'user_metadata' ->> 'evento_id',
                auth.jwt() -> 'app_metadata' ->> 'evento_id'
            ) IS NULL
            OR evento_id::text = COALESCE(
                auth.jwt() -> 'user_metadata' ->> 'evento_id',
                auth.jwt() -> 'app_metadata' ->> 'evento_id'
            )
        )
    );

-- ============================================
-- 5. TRIGGER updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_terminal_sync_queue_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trig_tsq_updated_at ON public.terminal_sync_queue;
CREATE TRIGGER trig_tsq_updated_at
    BEFORE UPDATE ON public.terminal_sync_queue
    FOR EACH ROW
    EXECUTE FUNCTION update_terminal_sync_queue_timestamp();

-- ============================================
-- 6. FUNÇÃO: Listar fila pendente por dispositivo
-- ============================================
CREATE OR REPLACE FUNCTION get_sync_queue_for_device(
    p_dispositivo_id UUID,
    p_evento_id UUID
)
RETURNS TABLE (
    id UUID,
    pessoa_id UUID,
    tipo_comando VARCHAR,
    payload JSONB,
    attempt_count INTEGER,
    error_message TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        tsq.id,
        tsq.pessoa_id,
        tsq.tipo_comando,
        tsq.payload,
        tsq.attempt_count,
        tsq.error_message
    FROM public.terminal_sync_queue tsq
    WHERE tsq.dispositivo_id = p_dispositivo_id
      AND tsq.evento_id = p_evento_id
      AND tsq.status IN ('pendente', 'erro')
      AND tsq.attempt_count < tsq.max_attempts
    ORDER BY tsq.created_at ASC
    LIMIT 20;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 7. FUNÇÃO: Marcar como processado
-- ============================================
CREATE OR REPLACE FUNCTION mark_sync_queue_success(
    p_id UUID,
    p_evento_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
    v_affected INTEGER;
BEGIN
    UPDATE public.terminal_sync_queue
    SET status = 'sucesso',
        updated_at = NOW()
    WHERE id = p_id
      AND evento_id = p_evento_id;

    GET DIAGNOSTICS v_affected = ROW_COUNT;
    RETURN v_affected > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 8. FUNÇÃO: Marcar como erro e incrementar tentativas
-- ============================================
CREATE OR REPLACE FUNCTION mark_sync_queue_error(
    p_id UUID,
    p_evento_id UUID,
    p_error_message TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    v_affected INTEGER;
BEGIN
    UPDATE public.terminal_sync_queue
    SET status = CASE
            WHEN attempt_count + 1 >= max_attempts THEN 'erro'
            ELSE 'pendente'
        END,
        attempt_count = attempt_count + 1,
        error_message = p_error_message,
        last_attempt = NOW(),
        updated_at = NOW()
    WHERE id = p_id
      AND evento_id = p_evento_id;

    GET DIAGNOSTICS v_affected = ROW_COUNT;
    RETURN v_affected > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 9. TABELA: Logs de Sincronização (auditoria)
-- ============================================
CREATE TABLE IF NOT EXISTS public.terminal_sync_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evento_id UUID NOT NULL REFERENCES public.eventos(id) ON DELETE CASCADE,
    dispositivo_id UUID NOT NULL REFERENCES public.dispositivos_acesso(id) ON DELETE CASCADE,
    queue_id UUID REFERENCES public.terminal_sync_queue(id) ON DELETE SET NULL,
    tipo_operacao VARCHAR(50),
    resultado VARCHAR(20),
    detalhes JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tsl_evento_id ON public.terminal_sync_logs(evento_id);
CREATE INDEX IF NOT EXISTS idx_tsl_dispositivo_id ON public.terminal_sync_logs(dispositivo_id);
CREATE INDEX IF NOT EXISTS idx_tsl_created_at ON public.terminal_sync_logs(created_at DESC);

-- RLS para terminal_sync_logs
ALTER TABLE public.terminal_sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_bypass" ON public.terminal_sync_logs
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "master_full_access" ON public.terminal_sync_logs
    FOR ALL USING (
        COALESCE(
            auth.jwt() -> 'user_metadata' ->> 'nivel_acesso',
            auth.jwt() -> 'user_metadata' ->> 'role',
            auth.jwt() -> 'app_metadata' ->> 'role'
        ) IN ('master', 'admin_master')
    );

CREATE POLICY "tenant_isolation" ON public.terminal_sync_logs
    FOR SELECT USING (
        COALESCE(
            auth.jwt() -> 'user_metadata' ->> 'nivel_acesso',
            auth.jwt() -> 'user_metadata' ->> 'role',
            auth.jwt() -> 'app_metadata' ->> 'role'
        ) IN ('admin', 'supervisor', 'operador', 'admin_master')
        AND (
            COALESCE(
                auth.jwt() -> 'user_metadata' ->> 'evento_id',
                auth.jwt() -> 'app_metadata' ->> 'evento_id'
            ) IS NULL
            OR evento_id::text = COALESCE(
                auth.jwt() -> 'user_metadata' ->> 'evento_id',
                auth.jwt() -> 'app_metadata' ->> 'evento_id'
            )
        )
    );

-- ============================================
-- 10. METADATA
-- ============================================
COMMENT ON TABLE public.terminal_sync_queue IS
    'Fila de comandos offline para terminais Intelbras/Hikvision. Substitui 20260406_sync_queue.sql (era T-SQL).';

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 20260417_terminal_sync_queue_rls.sql aplicada';
    RAISE NOTICE '   - terminal_sync_queue criada com RLS JWT (user_metadata)';
    RAISE NOTICE '   - terminal_sync_logs criada';
    RAISE NOTICE '   - dispositivos_acesso: colunas user_device, password_device, status_online, modo, ultimo_ping, area_nome adicionadas';
    RAISE NOTICE '   - RLS dispositivos_acesso configurado (padrão JWT)';
    RAISE NOTICE '   - Funções utilitárias: get_sync_queue_for_device, mark_sync_queue_success, mark_sync_queue_error';
END $$;
