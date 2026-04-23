-- ============================================
-- MIGRATION: Fix RLS Multi-Tenant Real (versão corrigida)
-- Data: 2026-04-16
-- Audit ref: S-04 — políticas liam app_metadata errado; fixado para user_metadata
-- NOTA: Sem funções no schema auth (sem permissão no Supabase managed)
-- ============================================

-- ============================================
-- PASSO 1: Remover políticas existentes (reset limpo)
-- ============================================
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname, tablename
        FROM pg_policies
        WHERE schemaname = 'public'
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    END LOOP;
END $$;

-- ============================================
-- PASSO 2: Habilitar RLS nas tabelas críticas
-- ============================================
ALTER TABLE public.eventos              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresas             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pessoas              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logs_acesso          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evento_areas         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitor_watchlist    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.veiculos             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings      ENABLE ROW LEVEL SECURITY;

-- ============================================
-- PASSO 3: service_role — bypass total (backend Node.js)
-- service_role ignora RLS nativamente, mas a política explícita
-- garante compatibilidade com versões futuras do Supabase.
-- ============================================
DO $$
DECLARE
    tabelas TEXT[] := ARRAY[
        'eventos','empresas','pessoas','logs_acesso','evento_areas',
        'evento_tipos_pulseira','pulseira_areas_permitidas','dispositivos_acesso',
        'monitor_watchlist','veiculos','system_settings','system_api_keys',
        'system_webhooks','audit_logs','consent_records','quotas_diarias',
        'perfis','pessoa_evento_empresa','pessoa_documentos','empresa_documentos'
    ];
    t TEXT;
BEGIN
    FOREACH t IN ARRAY tabelas LOOP
        IF EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = t
        ) THEN
            EXECUTE format(
                'CREATE POLICY "service_role_bypass" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
                t
            );
        END IF;
    END LOOP;
END $$;

-- ============================================
-- PASSO 4: MASTER — acesso total a todos os eventos
-- Lê de user_metadata (onde o backend salva) E app_metadata (fallback)
-- ============================================
CREATE POLICY "master_full_access" ON public.eventos FOR ALL USING (
    COALESCE(
        auth.jwt() -> 'user_metadata' ->> 'nivel_acesso',
        auth.jwt() -> 'user_metadata' ->> 'role',
        auth.jwt() -> 'app_metadata' ->> 'role'
    ) IN ('master', 'admin_master')
);

CREATE POLICY "master_full_access" ON public.empresas FOR ALL USING (
    COALESCE(
        auth.jwt() -> 'user_metadata' ->> 'nivel_acesso',
        auth.jwt() -> 'user_metadata' ->> 'role',
        auth.jwt() -> 'app_metadata' ->> 'role'
    ) IN ('master', 'admin_master')
);

CREATE POLICY "master_full_access" ON public.pessoas FOR ALL USING (
    COALESCE(
        auth.jwt() -> 'user_metadata' ->> 'nivel_acesso',
        auth.jwt() -> 'user_metadata' ->> 'role',
        auth.jwt() -> 'app_metadata' ->> 'role'
    ) IN ('master', 'admin_master')
);

CREATE POLICY "master_full_access" ON public.logs_acesso FOR ALL USING (
    COALESCE(
        auth.jwt() -> 'user_metadata' ->> 'nivel_acesso',
        auth.jwt() -> 'user_metadata' ->> 'role',
        auth.jwt() -> 'app_metadata' ->> 'role'
    ) IN ('master', 'admin_master')
);

CREATE POLICY "master_full_access" ON public.monitor_watchlist FOR ALL USING (
    COALESCE(
        auth.jwt() -> 'user_metadata' ->> 'nivel_acesso',
        auth.jwt() -> 'user_metadata' ->> 'role',
        auth.jwt() -> 'app_metadata' ->> 'role'
    ) IN ('master', 'admin_master')
);

CREATE POLICY "master_full_access" ON public.system_settings FOR ALL USING (
    COALESCE(
        auth.jwt() -> 'user_metadata' ->> 'nivel_acesso',
        auth.jwt() -> 'user_metadata' ->> 'role',
        auth.jwt() -> 'app_metadata' ->> 'role'
    ) IN ('master', 'admin_master')
);

CREATE POLICY "master_full_access" ON public.veiculos FOR ALL USING (
    COALESCE(
        auth.jwt() -> 'user_metadata' ->> 'nivel_acesso',
        auth.jwt() -> 'user_metadata' ->> 'role',
        auth.jwt() -> 'app_metadata' ->> 'role'
    ) IN ('master', 'admin_master')
);

-- ============================================
-- PASSO 5: OPERADOR/ADMIN — isolamento por evento_id (MULTI-TENANT)
-- FIX S-04: user_metadata é onde o backend grava; app_metadata é fallback
-- ============================================

-- PESSOAS: só vê do próprio evento
CREATE POLICY "tenant_isolation" ON public.pessoas FOR ALL USING (
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

-- EMPRESAS: só vê do próprio evento
CREATE POLICY "tenant_isolation" ON public.empresas FOR ALL USING (
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

-- LOGS: só vê logs do próprio evento
CREATE POLICY "tenant_isolation" ON public.logs_acesso FOR ALL USING (
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

-- ÁREAS: só vê áreas do próprio evento
CREATE POLICY "tenant_isolation" ON public.evento_areas FOR ALL USING (
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

-- WATCHLIST: só vê alertas do próprio evento
CREATE POLICY "tenant_isolation" ON public.monitor_watchlist FOR ALL USING (
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

-- VEICULOS: só vê veículos do próprio evento
CREATE POLICY "tenant_isolation" ON public.veiculos FOR ALL USING (
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

-- EVENTOS: operador vê apenas o próprio evento
CREATE POLICY "tenant_isolation" ON public.eventos FOR SELECT USING (
    COALESCE(
        auth.jwt() -> 'user_metadata' ->> 'nivel_acesso',
        auth.jwt() -> 'user_metadata' ->> 'role',
        auth.jwt() -> 'app_metadata' ->> 'role'
    ) IN ('admin', 'supervisor', 'operador')
    AND (
        COALESCE(
            auth.jwt() -> 'user_metadata' ->> 'evento_id',
            auth.jwt() -> 'app_metadata' ->> 'evento_id'
        ) IS NULL
        OR id::text = COALESCE(
            auth.jwt() -> 'user_metadata' ->> 'evento_id',
            auth.jwt() -> 'app_metadata' ->> 'evento_id'
        )
    )
);

-- SYSTEM SETTINGS: apenas master/admin_master
CREATE POLICY "admin_only" ON public.system_settings FOR ALL USING (
    COALESCE(
        auth.jwt() -> 'user_metadata' ->> 'nivel_acesso',
        auth.jwt() -> 'user_metadata' ->> 'role',
        auth.jwt() -> 'app_metadata' ->> 'role'
    ) IN ('master', 'admin_master')
);

-- ============================================
-- VERIFICAÇÃO
-- ============================================
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
