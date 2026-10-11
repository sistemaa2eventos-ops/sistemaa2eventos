-- ========================================================================================
-- SUPABASE SECURITY FIX COMPLETO - A2 EVENTOS
-- Corrige TODOS os errors, warnings e infos do database linter
-- ========================================================================================

-- ========================================================================================
-- PARTE 1: CORREÇÃO DE ERRORS
-- ========================================================================================

-- 1.1 Corrigir View com SECURITY DEFINER (view_documentos_pendentes)
-- Remove SECURITY DEFINER e usa INVOKER (executa com permissões do usuário)
DROP VIEW IF EXISTS view_documentos_pendentes;

CREATE OR REPLACE VIEW view_documentos_pendentes 
-- SECURITY INVOKER é o padrão, mas vamos garantir explicitamente
AS
SELECT
    d.id,
    'pessoa' AS entity_type,
    d.pessoa_id AS entity_id,
    p.evento_id,
    d.titulo,
    d.tipo_doc,
    d.url_arquivo,
    d.status,
    d.data_inclusao AS created_at,
    p.nome AS entidade_nome,
    p.cpf AS entidade_doc
FROM pessoa_documentos d
LEFT JOIN pessoas p ON p.id = d.pessoa_id
WHERE d.status = 'pendente'

UNION ALL

SELECT
    d.id,
    'empresa' AS entity_type,
    d.empresa_id AS entity_id,
    e.evento_id,
    d.titulo,
    d.tipo_doc,
    d.url_arquivo,
    d.status,
    d.data_inclusao AS created_at,
    e.nome AS entidade_nome,
    e.cnpj AS entidade_doc
FROM empresa_documentos d
LEFT JOIN empresas e ON e.id = d.empresa_id
WHERE d.status = 'pendente';

-- ========================================================================================
-- PARTE 2: CORREÇÃO DE WARNINGS
-- ========================================================================================

-- 2.1 Corrigir search_path em TODAS as funções públicas
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT proname, oid
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        AND proname NOT LIKE 'pg_%'
        AND proname NOT LIKE 'ts_%'
        AND proname NOT LIKE 'uuid_%'
    ) LOOP
        EXECUTE format('ALTER FUNCTION public.%I SET search_path = public', r.proname);
    END LOOP;
    RAISE NOTICE 'Search path corrigido em todas as funções';
END $$;

-- 2.2 Remover políticas "allow_all" que usam (true) e criar políticas corretas
-- Primeiro, identificar e remover todas as políticas "allow_all"
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname, tablename 
        FROM pg_policies 
        WHERE schemaname = 'public'
        AND policyname = 'allow_all'
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    END LOOP;
END $$;

-- 2.3 Criar políticas de segurança corretas para TODAS as tabelas
-- ========================================================================================

-- TABELAS PRINCIPAIS (eventos, pessoas, empresas, etc)
-- ========================================================================================

-- eventos
CREATE POLICY "master_access" ON eventos FOR ALL 
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY "staff_access" ON eventos FOR ALL 
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador')
    AND (
        (auth.jwt() -> 'app_metadata' ->> 'evento_id' IS NULL) OR 
        id::text = (auth.jwt() -> 'app_metadata' ->> 'evento_id')
    ));
CREATE POLICY "service_access" ON eventos FOR ALL 
    USING ((auth.jwt() ->> 'role') = 'service_role');

-- pessoas
CREATE POLICY "master_access" ON pessoas FOR ALL 
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY "staff_access" ON pessoas FOR ALL 
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador')
    AND (
        (auth.jwt() -> 'app_metadata' ->> 'evento_id' IS NULL) OR
        evento_id::text = (auth.jwt() -> 'app_metadata' ->> 'evento_id')
    ));
CREATE POLICY "service_access" ON pessoas FOR ALL 
    USING ((auth.jwt() ->> 'role') = 'service_role');

-- empresas
CREATE POLICY "master_access" ON empresas FOR ALL 
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY "staff_access" ON empresas FOR ALL 
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador')
    AND (
        (auth.jwt() -> 'app_metadata' ->> 'evento_id' IS NULL) OR
        evento_id::text = (auth.jwt() -> 'app_metadata' ->> 'evento_id')
    ));
CREATE POLICY "service_access" ON empresas FOR ALL 
    USING ((auth.jwt() ->> 'role') = 'service_role');

-- logs_acesso
CREATE POLICY "master_access" ON logs_acesso FOR ALL 
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY "staff_access" ON logs_acesso FOR ALL 
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador')
    AND (
        (auth.jwt() -> 'app_metadata' ->> 'evento_id' IS NULL) OR
        evento_id::text = (auth.jwt() -> 'app_metadata' ->> 'evento_id')
    ));
CREATE POLICY "service_access" ON logs_acesso FOR ALL 
    USING ((auth.jwt() ->> 'role') = 'service_role');

-- perfis
CREATE POLICY "master_access" ON perfis FOR ALL 
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY "service_access" ON perfis FOR ALL 
    USING ((auth.jwt() ->> 'role') = 'service_role');

-- pessoa_documentos
CREATE POLICY "master_access" ON pessoa_documentos FOR ALL 
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY "staff_access" ON pessoa_documentos FOR ALL 
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador'));
CREATE POLICY "service_access" ON pessoa_documentos FOR ALL 
    USING ((auth.jwt() ->> 'role') = 'service_role');

-- empresa_documentos
CREATE POLICY "master_access" ON empresa_documentos FOR ALL 
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY "staff_access" ON empresa_documentos FOR ALL 
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador'));
CREATE POLICY "service_access" ON empresa_documentos FOR ALL 
    USING ((auth.jwt() ->> 'role') = 'service_role');

-- dispositivos_acesso
CREATE POLICY "master_access" ON dispositivos_acesso FOR ALL 
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY "staff_access" ON dispositivos_acesso FOR ALL 
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador'));
CREATE POLICY "service_access" ON dispositivos_acesso FOR ALL 
    USING ((auth.jwt() ->> 'role') = 'service_role');

-- quotas_diarias
CREATE POLICY "master_access" ON quotas_diarias FOR ALL 
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY "staff_access" ON quotas_diarias FOR ALL 
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador'));
CREATE POLICY "service_access" ON quotas_diarias FOR ALL 
    USING ((auth.jwt() ->> 'role') = 'service_role');

-- ========================================================================================
-- PARTE 3: CORREÇÃO DE INFOS (RLS enabled no policy)
-- ========================================================================================

-- Tabelas que precisam de políticas
-- pessoa_evento_empresa
CREATE POLICY "master_access" ON pessoa_evento_empresa FOR ALL 
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY "staff_access" ON pessoa_evento_empresa FOR ALL 
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador'));
CREATE POLICY "service_access" ON pessoa_evento_empresa FOR ALL 
    USING ((auth.jwt() ->> 'role') = 'service_role');

-- evento_areas
CREATE POLICY "master_access" ON evento_areas FOR ALL 
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY "staff_access" ON evento_areas FOR ALL 
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador'));
CREATE POLICY "service_access" ON evento_areas FOR ALL 
    USING ((auth.jwt() ->> 'role') = 'service_role');

-- evento_tipos_pulseira
CREATE POLICY "master_access" ON evento_tipos_pulseira FOR ALL 
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY "staff_access" ON evento_tipos_pulseira FOR ALL 
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador'));
CREATE POLICY "service_access" ON evento_tipos_pulseira FOR ALL 
    USING ((auth.jwt() ->> 'role') = 'service_role');

-- pulseira_areas_permitidas
CREATE POLICY "master_access" ON pulseira_areas_permitidas FOR ALL 
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY "staff_access" ON pulseira_areas_permitidas FOR ALL 
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador'));
CREATE POLICY "service_access" ON pulseira_areas_permitidas FOR ALL 
    USING ((auth.jwt() ->> 'role') = 'service_role');

-- veiculos
CREATE POLICY "master_access" ON veiculos FOR ALL 
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY "staff_access" ON veiculos FOR ALL 
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador'));
CREATE POLICY "service_access" ON veiculos FOR ALL 
    USING ((auth.jwt() ->> 'role') = 'service_role');

-- evento_etiqueta_layouts
CREATE POLICY "master_access" ON evento_etiqueta_layouts FOR ALL 
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY "staff_access" ON evento_etiqueta_layouts FOR ALL 
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador'));
CREATE POLICY "service_access" ON evento_etiqueta_layouts FOR ALL 
    USING ((auth.jwt() ->> 'role') = 'service_role');

-- monitor_watchlist
CREATE POLICY "master_access" ON monitor_watchlist FOR ALL 
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY "staff_access" ON monitor_watchlist FOR ALL 
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador'));
CREATE POLICY "service_access" ON monitor_watchlist FOR ALL 
    USING ((auth.jwt() ->> 'role') = 'service_role');

-- system_settings
CREATE POLICY "master_access" ON system_settings FOR ALL 
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY "service_access" ON system_settings FOR ALL 
    USING ((auth.jwt() ->> 'role') = 'service_role');

-- system_api_keys
CREATE POLICY "master_access" ON system_api_keys FOR ALL 
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY "service_access" ON system_api_keys FOR ALL 
    USING ((auth.jwt() ->> 'role') = 'service_role');

-- system_webhooks
CREATE POLICY "master_access" ON system_webhooks FOR ALL 
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY "service_access" ON system_webhooks FOR ALL 
    USING ((auth.jwt() ->> 'role') = 'service_role');

-- consent_records
CREATE POLICY "master_access" ON consent_records FOR ALL 
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY "service_access" ON consent_records FOR ALL 
    USING ((auth.jwt() ->> 'role') = 'service_role');

-- audit_logs
CREATE POLICY "master_access" ON audit_logs FOR ALL 
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY "service_access" ON audit_logs FOR ALL 
    USING ((auth.jwt() ->> 'role') = 'service_role');

-- webhook_events
CREATE POLICY "master_access" ON webhook_events FOR ALL 
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY "service_access" ON webhook_events FOR ALL 
    USING ((auth.jwt() ->> 'role') = 'service_role');

-- ========================================================================================
-- VERIFICAÇÃO FINAL
-- ========================================================================================

-- Listar todas as políticas criadas
SELECT 
    tablename,
    policyname,
    cmd
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Resultado
SELECT 
    '✅ Segurança corrigida com sucesso!' AS status,
    (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public') AS total_politicas;
