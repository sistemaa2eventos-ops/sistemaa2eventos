-- ========================================================================================
-- SUPABASE SECURITY AUDIT & FIX - A2 EVENTOS
-- Execute este script no SQL Editor do Supabase para corrigir TODAS as políticas de segurança
-- ========================================================================================

-- ========================================================================================
-- FASE 1: AUDITORIA - VERIFICAR STATUS ATUAL
-- ========================================================================================

-- 1.1 Listar todas as tabelas e status RLS
SELECT 
    schemaname,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;

-- 1.2 Listar todas as políticas existentes
SELECT 
    policyname,
    tablename,
    cmd,
    permissive,
    roles,
    qual,
    with_check
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 1.3 Verificar funções de segurança (security definer)
SELECT 
    proname,
    prosrc,
    pronsecurity,
    proiswindow,
    langugage::reglanguage::text as language
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND proname LIKE '%audit%' OR proname LIKE '%registrar%' OR proname LIKE '%reconcile%'
ORDER BY proname;

-- ========================================================================================
-- FASE 2: CORREÇÕES CRÍTICAS - ERRORS
-- ========================================================================================

-- 2.1 Habilitar RLS em todas as tabelas que ainda não têm
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public'
        AND tablename NOT IN ('pg_stat_statements', 'pg_buffercache', 'pg_prepared_statements')
        AND rowsecurity = false
    ) LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
    END LOOP;
END $$;

-- 2.2 Remover políticas antigas com email hardcoded (SEGURANÇA CRÍTICA)
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname, tablename 
        FROM pg_policies 
        WHERE schemaname = 'public'
        AND qual LIKE '%sistemaa2eventos@gmail.com%'
    ) LOOP
        RAISE NOTICE 'Removendo política antiga: % em %', r.policyname, r.tablename;
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    END LOOP;
END $$;

-- 2.3 Criar políticas corretas usando JWT claims (não email hardcoded)
-- ========================================================================================

-- POLÍTICAS PARA TABELAS PRINCIPAIS
-- ========================================================================================

-- 2.3.1 TABELA: eventos
DROP POLICY IF EXISTS master_full_access ON eventos;
DROP POLICY IF EXISTS staff_evento_access ON eventos;
DROP POLICY IF EXISTS service_role_full_access ON eventos;

CREATE POLICY "master_full_access" ON eventos FOR ALL 
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');

CREATE POLICY "staff_evento_access" ON eventos FOR ALL 
    USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador')
        AND (
            (auth.jwt() -> 'app_metadata' ->> 'evento_id' IS NULL) OR 
            id::text = (auth.jwt() -> 'app_metadata' ->> 'evento_id')
        )
    );

CREATE POLICY "service_role_full_access" ON eventos FOR ALL 
    USING ((auth.jwt() ->> 'role') = 'service_role');

-- 2.3.2 TABELA: perfis
DROP POLICY IF EXISTS master_full_access ON perfis;
DROP POLICY IF EXISTS service_role_full_access ON perfis;

CREATE POLICY "master_full_access" ON perfis FOR ALL 
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');

CREATE POLICY "service_role_full_access" ON perfis FOR ALL 
    USING ((auth.jwt() ->> 'role') = 'service_role');

-- 2.3.3 TABELA: empresas
DROP POLICY IF EXISTS master_full_access ON empresas;
DROP POLICY IF EXISTS staff_evento_access ON empresas;
DROP POLICY IF EXISTS service_role_full_access ON empresas;

CREATE POLICY "master_full_access" ON empresas FOR ALL 
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');

CREATE POLICY "staff_evento_access" ON empresas FOR ALL 
    USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador')
        AND (
            (auth.jwt() -> 'app_metadata' ->> 'evento_id' IS NULL) OR
            evento_id::text = (auth.jwt() -> 'app_metadata' ->> 'evento_id')
        )
    );

CREATE POLICY "service_role_full_access" ON empresas FOR ALL 
    USING ((auth.jwt() ->> 'role') = 'service_role');

-- 2.3.4 TABELA: pessoas
DROP POLICY IF EXISTS master_full_access ON pessoas;
DROP POLICY IF EXISTS staff_evento_access ON pessoas;
DROP POLICY IF EXISTS service_role_full_access ON pessoas;

CREATE POLICY "master_full_access" ON pessoas FOR ALL 
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');

CREATE POLICY "staff_evento_access" ON pessoas FOR ALL 
    USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador')
        AND (
            (auth.jwt() -> 'app_metadata' ->> 'evento_id' IS NULL) OR
            evento_id::text = (auth.jwt() -> 'app_metadata' ->> 'evento_id')
        )
    );

CREATE POLICY "service_role_full_access" ON pessoas FOR ALL 
    USING ((auth.jwt() ->> 'role') = 'service_role');

-- 2.3.5 TABELA: logs_acesso
DROP POLICY IF EXISTS master_full_access ON logs_acesso;
DROP POLICY IF EXISTS staff_evento_access ON logs_acesso;
DROP POLICY IF EXISTS service_role_full_access ON logs_acesso;

CREATE POLICY "master_full_access" ON logs_acesso FOR ALL 
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');

CREATE POLICY "staff_evento_access" ON logs_acesso FOR ALL 
    USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador')
        AND (
            (auth.jwt() -> 'app_metadata' ->> 'evento_id' IS NULL) OR
            evento_id::text = (auth.jwt() -> 'app_metadata' ->> 'evento_id')
        )
    );

CREATE POLICY "service_role_full_access" ON logs_acesso FOR ALL 
    USING ((auth.jwt() ->> 'role') = 'service_role');

-- 2.3.6 TABELA: pessoa_evento_empresa
DROP POLICY IF EXISTS master_full_access ON pessoa_evento_empresa;
DROP POLICY IF EXISTS staff_evento_access ON pessoa_evento_empresa;
DROP POLICY IF EXISTS service_role_full_access ON pessoa_evento_empresa;

CREATE POLICY "master_full_access" ON pessoa_evento_empresa FOR ALL 
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');

CREATE POLICY "staff_evento_access" ON pessoa_evento_empresa FOR ALL 
    USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador')
    );

CREATE POLICY "service_role_full_access" ON pessoa_evento_empresa FOR ALL 
    USING ((auth.jwt() ->> 'role') = 'service_role');

-- 2.3.7 TABELA: pessoa_documentos
DROP POLICY IF EXISTS master_full_access ON pessoa_documentos;
DROP POLICY IF EXISTS staff_evento_access ON pessoa_documentos;
DROP POLICY IF EXISTS service_role_full_access ON pessoa_documentos;

CREATE POLICY "master_full_access" ON pessoa_documentos FOR ALL 
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');

CREATE POLICY "staff_evento_access" ON pessoa_documentos FOR ALL 
    USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador')
    );

CREATE POLICY "service_role_full_access" ON pessoa_documentos FOR ALL 
    USING ((auth.jwt() ->> 'role') = 'service_role');

-- 2.3.8 TABELA: empresa_documentos
DROP POLICY IF EXISTS master_full_access ON empresa_documentos;
DROP POLICY IF EXISTS staff_evento_access ON empresa_documentos;
DROP POLICY IF EXISTS service_role_full_access ON empresa_documentos;

CREATE POLICY "master_full_access" ON empresa_documentos FOR ALL 
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');

CREATE POLICY "staff_evento_access" ON empresa_documentos FOR ALL 
    USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador')
    );

CREATE POLICY "service_role_full_access" ON empresa_documentos FOR ALL 
    USING ((auth.jwt() ->> 'role') = 'service_role');

-- 2.3.9 TABELA: dispositivos_acesso
DROP POLICY IF EXISTS master_full_access ON dispositivos_acesso;
DROP POLICY IF EXISTS staff_evento_access ON dispositivos_acesso;
DROP POLICY IF EXISTS service_role_full_access ON dispositivos_acesso;

CREATE POLICY "master_full_access" ON dispositivos_acesso FOR ALL 
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');

CREATE POLICY "staff_evento_access" ON dispositivos_acesso FOR ALL 
    USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador')
    );

CREATE POLICY "service_role_full_access" ON dispositivos_acesso FOR ALL 
    USING ((auth.jwt() ->> 'role') = 'service_role');

-- 2.3.10 TABELA: quotas_diarias
DROP POLICY IF EXISTS master_full_access ON quotas_diarias;
DROP POLICY IF EXISTS staff_evento_access ON quotas_diarias;
DROP POLICY IF EXISTS service_role_full_access ON quotas_diarias;

CREATE POLICY "master_full_access" ON quotas_diarias FOR ALL 
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');

CREATE POLICY "staff_evento_access" ON quotas_diarias FOR ALL 
    USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador')
    );

CREATE POLICY "service_role_full_access" ON quotas_diarias FOR ALL 
    USING ((auth.jwt() ->> 'role') = 'service_role');

-- 2.3.11 TABELA: evento_areas
DROP POLICY IF EXISTS master_full_access ON evento_areas;
DROP POLICY IF EXISTS staff_evento_access ON evento_areas;
DROP POLICY IF EXISTS service_role_full_access ON evento_areas;

CREATE POLICY "master_full_access" ON evento_areas FOR ALL 
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');

CREATE POLICY "staff_evento_access" ON evento_areas FOR ALL 
    USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador')
    );

CREATE POLICY "service_role_full_access" ON evento_areas FOR ALL 
    USING ((auth.jwt() ->> 'role') = 'service_role');

-- 2.3.12 TABELA: evento_tipos_pulseira
DROP POLICY IF EXISTS master_full_access ON evento_tipos_pulseira;
DROP POLICY IF EXISTS staff_evento_access ON evento_tipos_pulseira;
DROP POLICY IF EXISTS service_role_full_access ON evento_tipos_pulseira;

CREATE POLICY "master_full_access" ON evento_tipos_pulseira FOR ALL 
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');

CREATE POLICY "staff_evento_access" ON evento_tipos_pulseira FOR ALL 
    USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador')
    );

CREATE POLICY "service_role_full_access" ON evento_tipos_pulseira FOR ALL 
    USING ((auth.jwt() ->> 'role') = 'service_role');

-- 2.3.13 TABELA: pulseira_areas_permitidas
DROP POLICY IF EXISTS master_full_access ON pulseira_areas_permitidas;
DROP POLICY IF EXISTS staff_evento_access ON pulseira_areas_permitidas;
DROP POLICY IF EXISTS service_role_full_access ON pulseira_areas_permitidas;

CREATE POLICY "master_full_access" ON pulseira_areas_permitidas FOR ALL 
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');

CREATE POLICY "staff_evento_access" ON pulseira_areas_permitidas FOR ALL 
    USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador')
    );

CREATE POLICY "service_role_full_access" ON pulseira_areas_permitidas FOR ALL 
    USING ((auth.jwt() ->> 'role') = 'service_role');

-- 2.3.14 TABELA: veiculos
DROP POLICY IF EXISTS master_full_access ON veiculos;
DROP POLICY IF EXISTS staff_evento_access ON veiculos;
DROP POLICY IF EXISTS service_role_full_access ON veiculos;

CREATE POLICY "master_full_access" ON veiculos FOR ALL 
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');

CREATE POLICY "staff_evento_access" ON veiculos FOR ALL 
    USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador')
    );

CREATE POLICY "service_role_full_access" ON veiculos FOR ALL 
    USING ((auth.jwt() ->> 'role') = 'service_role');

-- 2.3.15 TABELA: evento_etiqueta_layouts
DROP POLICY IF EXISTS master_full_access ON evento_etiqueta_layouts;
DROP POLICY IF EXISTS staff_evento_access ON evento_etiqueta_layouts;
DROP POLICY IF EXISTS service_role_full_access ON evento_etiqueta_layouts;

CREATE POLICY "master_full_access" ON evento_etiqueta_layouts FOR ALL 
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');

CREATE POLICY "staff_evento_access" ON evento_etiqueta_layouts FOR ALL 
    USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador')
    );

CREATE POLICY "service_role_full_access" ON evento_etiqueta_layouts FOR ALL 
    USING ((auth.jwt() ->> 'role') = 'service_role');

-- 2.3.16 TABELA: monitor_watchlist
DROP POLICY IF EXISTS master_full_access ON monitor_watchlist;
DROP POLICY IF EXISTS staff_evento_access ON monitor_watchlist;
DROP POLICY IF EXISTS service_role_full_access ON monitor_watchlist;

CREATE POLICY "master_full_access" ON monitor_watchlist FOR ALL 
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');

CREATE POLICY "staff_evento_access" ON monitor_watchlist FOR ALL 
    USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador')
    );

CREATE POLICY "service_role_full_access" ON monitor_watchlist FOR ALL 
    USING ((auth.jwt() ->> 'role') = 'service_role');

-- 2.3.17 TABELA: system_settings
DROP POLICY IF EXISTS master_full_access ON system_settings;
DROP POLICY IF EXISTS service_role_full_access ON system_settings;

CREATE POLICY "master_full_access" ON system_settings FOR ALL 
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');

CREATE POLICY "service_role_full_access" ON system_settings FOR ALL 
    USING ((auth.jwt() ->> 'role') = 'service_role');

-- 2.3.18 TABELA: system_api_keys
DROP POLICY IF EXISTS master_full_access ON system_api_keys;
DROP POLICY IF EXISTS service_role_full_access ON system_api_keys;

CREATE POLICY "master_full_access" ON system_api_keys FOR ALL 
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');

CREATE POLICY "service_role_full_access" ON system_api_keys FOR ALL 
    USING ((auth.jwt() ->> 'role') = 'service_role');

-- 2.3.19 TABELA: system_webhooks
DROP POLICY IF EXISTS master_full_access ON system_webhooks;
DROP POLICY IF EXISTS service_role_full_access ON system_webhooks;

CREATE POLICY "master_full_access" ON system_webhooks FOR ALL 
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');

CREATE POLICY "service_role_full_access" ON system_webhooks FOR ALL 
    USING ((auth.jwt() ->> 'role') = 'service_role');

-- 2.3.20 TABELA: consent_records
DROP POLICY IF EXISTS master_full_access ON consent_records;
DROP POLICY IF EXISTS service_role_full_access ON consent_records;

CREATE POLICY "master_full_access" ON consent_records FOR ALL 
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');

CREATE POLICY "service_role_full_access" ON consent_records FOR ALL 
    USING ((auth.jwt() ->> 'role') = 'service_role');

-- 2.3.21 TABELA: audit_logs
DROP POLICY IF EXISTS master_full_access ON audit_logs;
DROP POLICY IF EXISTS service_role_full_access ON audit_logs;

CREATE POLICY "master_full_access" ON audit_logs FOR ALL 
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');

CREATE POLICY "service_role_full_access" ON audit_logs FOR ALL 
    USING ((auth.jwt() ->> 'role') = 'service_role');

-- 2.3.22 TABELA: webhook_events
DROP POLICY IF EXISTS master_full_access ON webhook_events;
DROP POLICY IF EXISTS service_role_full_access ON webhook_events;

CREATE POLICY "master_full_access" ON webhook_events FOR ALL 
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');

CREATE POLICY "service_role_full_access" ON webhook_events FOR ALL 
    USING ((auth.jwt() ->> 'role') = 'service_role');

-- ========================================================================================
-- FASE 3: CORREÇÕES DE WARNINGS - Funções com search_path vulnerável
-- ========================================================================================

-- 3.1 Corrigir search_path em todas as funções públicas
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT proname 
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        AND proname NOT LIKE 'pg_%'
        AND proname NOT LIKE 'ts_%'
    ) LOOP
        EXECUTE format('ALTER FUNCTION public.%I SET search_path = public', r.proname);
    END LOOP;
    RAISE NOTICE 'Search path corrigido em todas as funções';
END $$;

-- 3.2 Configurar funções críticas com security definer seguro
ALTER FUNCTION public.fn_audit_log_trigger() SET search_path = public;
ALTER FUNCTION public.fn_update_inscritos_count() SET search_path = public;
ALTER FUNCTION public.registrar_acesso_atomico(uuid, uuid, varchar, varchar, varchar, uuid, uuid, timestamptz) SET search_path = public;

-- ========================================================================================
-- FASE 4: CORREÇÕES DE INFO - Views com security_invoker
-- ========================================================================================

-- 4.1 Aplicar security_invoker em todas as views públicas
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT viewname 
        FROM pg_views 
        WHERE schemaname = 'public'
        AND viewname NOT LIKE 'pg_%'
    ) LOOP
        EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', r.viewname);
    END LOOP;
    RAISE NOTICE 'SecurityInvoker aplicado em todas as views';
END $$;

-- ========================================================================================
-- FASE 5: VERIFICAÇÃO FINAL
-- ========================================================================================

-- 5.1 Confirmar políticas criadas
SELECT 
    tablename,
    policyname,
    cmd
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 5.2 Verificar RLS enabled em todas as tabelas
SELECT 
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables 
WHERE schemaname = 'public'
AND tablename NOT LIKE 'pg_%'
ORDER BY tablename;

-- 5.3 Resultado final
SELECT 
    '✅ Segurança corrigida com sucesso!' AS status,
    (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public') AS total_politicas,
    (SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = true) AS tabelas_rls;
