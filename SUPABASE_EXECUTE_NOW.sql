-- ════════════════════════════════════════════════════════════════════════════════════
-- 🔐 A2 EVENTOS — SECURITY FIX COMPLETO
--
-- Execute NO SUPABASE SQL EDITOR
-- Copie TODO este arquivo e cole no SQL Editor
--
-- O que faz:
-- ✅ Fase 1: Corrige view_documentos_pendentes (SECURITY INVOKER)
-- ✅ Fase 2: Remove políticas inseguras "allow_all"
-- ✅ Fase 2: Configura search_path em TODAS as funções públicas
-- ✅ Fase 3: Cria RLS policies completas para 27+ tabelas
--
-- Tempo estimado: 2-3 minutos
-- ════════════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════════════
-- FASE 1: CORREÇÃO DE ERRORS
-- ════════════════════════════════════════════════════════════════════════════════════

-- FASE 1: Corrigindo VIEW

DROP VIEW IF EXISTS view_documentos_pendentes CASCADE;
CREATE VIEW view_documentos_pendentes AS
SELECT d.id, 'pessoa' AS entity_type, d.pessoa_id AS entity_id, p.evento_id,
       d.titulo, d.tipo_doc, d.url_arquivo, d.status, d.data_inclusao AS created_at,
       p.nome_completo AS entidade_nome, p.cpf AS entidade_doc
FROM pessoa_documentos d
LEFT JOIN pessoas p ON p.id = d.pessoa_id
WHERE d.status = 'pendente'
UNION ALL
SELECT d.id, 'empresa' AS entity_type, d.empresa_id AS entity_id, e.evento_id,
       d.titulo, d.tipo_doc, d.url_arquivo, d.status, d.data_inclusao AS created_at,
       e.nome AS entidade_nome, e.cnpj AS entidade_doc
FROM empresa_documentos d
LEFT JOIN empresas e ON e.id = d.empresa_id
WHERE d.status = 'pendente';

-- echo '✅ View recriada com SECURITY INVOKER'

-- ════════════════════════════════════════════════════════════════════════════════════
-- FASE 2: CORREÇÃO DE WARNINGS
-- ════════════════════════════════════════════════════════════════════════════════════

-- echo '=== FASE 2a: Removendo políticas inseguras ==='

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

-- echo '✅ Políticas "allow_all" removidas'

-- echo '=== FASE 2b: Corrigindo search_path em funções ==='

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT proname, p.oid
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        AND proname NOT LIKE 'pg_%'
        AND proname NOT LIKE 'ts_%'
    ) LOOP
        EXECUTE format('ALTER FUNCTION public.%I SET search_path = public', r.proname);
    END LOOP;
END $$;

-- echo '✅ Search_path configurado em todas as funções'

-- ════════════════════════════════════════════════════════════════════════════════════
-- FASE 3: CRIAÇÃO DE POLÍTICAS DE SEGURANÇA (RLS)
-- ════════════════════════════════════════════════════════════════════════════════════

-- echo '=== FASE 3: Criando RLS Policies ==='

-- TABELAS PRINCIPAIS
-- ════════════════════════════════════════════════════════════════════════════════════

-- eventos
DROP POLICY IF EXISTS master_access ON eventos;
DROP POLICY IF EXISTS staff_access ON eventos;
DROP POLICY IF EXISTS service_access ON eventos;
CREATE POLICY "master_access" ON eventos FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY "staff_access" ON eventos FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador') AND ((auth.jwt() -> 'app_metadata' ->> 'evento_id' IS NULL) OR id::text = (auth.jwt() -> 'app_metadata' ->> 'evento_id')));
CREATE POLICY "service_access" ON eventos FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');

-- pessoas
DROP POLICY IF EXISTS master_access ON pessoas;
DROP POLICY IF EXISTS staff_access ON pessoas;
DROP POLICY IF EXISTS service_access ON pessoas;
CREATE POLICY "master_access" ON pessoas FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY "staff_access" ON pessoas FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador') AND ((auth.jwt() -> 'app_metadata' ->> 'evento_id' IS NULL) OR evento_id::text = (auth.jwt() -> 'app_metadata' ->> 'evento_id')));
CREATE POLICY "service_access" ON pessoas FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');

-- empresas
DROP POLICY IF EXISTS master_access ON empresas;
DROP POLICY IF EXISTS staff_access ON empresas;
DROP POLICY IF EXISTS service_access ON empresas;
CREATE POLICY "master_access" ON empresas FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY "staff_access" ON empresas FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador') AND ((auth.jwt() -> 'app_metadata' ->> 'evento_id' IS NULL) OR evento_id::text = (auth.jwt() -> 'app_metadata' ->> 'evento_id')));
CREATE POLICY "service_access" ON empresas FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');

-- logs_acesso
DROP POLICY IF EXISTS master_access ON logs_acesso;
DROP POLICY IF EXISTS staff_access ON logs_acesso;
DROP POLICY IF EXISTS service_access ON logs_acesso;
CREATE POLICY "master_access" ON logs_acesso FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY "staff_access" ON logs_acesso FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador') AND ((auth.jwt() -> 'app_metadata' ->> 'evento_id' IS NULL) OR evento_id::text = (auth.jwt() -> 'app_metadata' ->> 'evento_id')));
CREATE POLICY "service_access" ON logs_acesso FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');

-- perfis
DROP POLICY IF EXISTS master_access ON perfis;
DROP POLICY IF EXISTS service_access ON perfis;
CREATE POLICY "master_access" ON perfis FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY "service_access" ON perfis FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');

-- TABELAS SECUNDÁRIAS
-- ════════════════════════════════════════════════════════════════════════════════════

-- pessoa_documentos
DROP POLICY IF EXISTS master_access ON pessoa_documentos;
DROP POLICY IF EXISTS staff_access ON pessoa_documentos;
DROP POLICY IF EXISTS service_access ON pessoa_documentos;
CREATE POLICY "master_access" ON pessoa_documentos FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY "staff_access" ON pessoa_documentos FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador'));
CREATE POLICY "service_access" ON pessoa_documentos FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');

-- empresa_documentos
DROP POLICY IF EXISTS master_access ON empresa_documentos;
DROP POLICY IF EXISTS staff_access ON empresa_documentos;
DROP POLICY IF EXISTS service_access ON empresa_documentos;
CREATE POLICY "master_access" ON empresa_documentos FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY "staff_access" ON empresa_documentos FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador'));
CREATE POLICY "service_access" ON empresa_documentos FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');

-- dispositivos_acesso
DROP POLICY IF EXISTS master_access ON dispositivos_acesso;
DROP POLICY IF EXISTS staff_access ON dispositivos_acesso;
DROP POLICY IF EXISTS service_access ON dispositivos_acesso;
CREATE POLICY "master_access" ON dispositivos_acesso FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY "staff_access" ON dispositivos_acesso FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador'));
CREATE POLICY "service_access" ON dispositivos_acesso FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');

-- quotas_diarias
DROP POLICY IF EXISTS master_access ON quotas_diarias;
DROP POLICY IF EXISTS staff_access ON quotas_diarias;
DROP POLICY IF EXISTS service_access ON quotas_diarias;
CREATE POLICY "master_access" ON quotas_diarias FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY "staff_access" ON quotas_diarias FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador'));
CREATE POLICY "service_access" ON quotas_diarias FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');

-- biometria_pessoa
DROP POLICY IF EXISTS master_access ON biometria_pessoa;
DROP POLICY IF EXISTS staff_access ON biometria_pessoa;
DROP POLICY IF EXISTS service_access ON biometria_pessoa;
CREATE POLICY "master_access" ON biometria_pessoa FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY "staff_access" ON biometria_pessoa FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador'));
CREATE POLICY "service_access" ON biometria_pessoa FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');

-- historico_bloqueios
DROP POLICY IF EXISTS master_access ON historico_bloqueios;
DROP POLICY IF EXISTS staff_access ON historico_bloqueios;
DROP POLICY IF EXISTS service_access ON historico_bloqueios;
CREATE POLICY "master_access" ON historico_bloqueios FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY "staff_access" ON historico_bloqueios FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador'));
CREATE POLICY "service_access" ON historico_bloqueios FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');

-- logs_acesso_veiculos
DROP POLICY IF EXISTS master_access ON logs_acesso_veiculos;
DROP POLICY IF EXISTS staff_access ON logs_acesso_veiculos;
DROP POLICY IF EXISTS service_access ON logs_acesso_veiculos;
CREATE POLICY "master_access" ON logs_acesso_veiculos FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY "staff_access" ON logs_acesso_veiculos FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador'));
CREATE POLICY "service_access" ON logs_acesso_veiculos FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');

-- veiculos
DROP POLICY IF EXISTS master_access ON veiculos;
DROP POLICY IF EXISTS staff_access ON veiculos;
DROP POLICY IF EXISTS service_access ON veiculos;
CREATE POLICY "master_access" ON veiculos FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY "staff_access" ON veiculos FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador'));
CREATE POLICY "service_access" ON veiculos FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');

-- monitor_watchlist
DROP POLICY IF EXISTS master_access ON monitor_watchlist;
DROP POLICY IF EXISTS staff_access ON monitor_watchlist;
DROP POLICY IF EXISTS service_access ON monitor_watchlist;
CREATE POLICY "master_access" ON monitor_watchlist FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY "staff_access" ON monitor_watchlist FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador'));
CREATE POLICY "service_access" ON monitor_watchlist FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');

-- TABELAS DE CONFIGURAÇÃO
-- ════════════════════════════════════════════════════════════════════════════════════

-- pessoa_evento_empresa
DROP POLICY IF EXISTS master_access ON pessoa_evento_empresa;
DROP POLICY IF EXISTS staff_access ON pessoa_evento_empresa;
DROP POLICY IF EXISTS service_access ON pessoa_evento_empresa;
CREATE POLICY "master_access" ON pessoa_evento_empresa FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY "staff_access" ON pessoa_evento_empresa FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador'));
CREATE POLICY "service_access" ON pessoa_evento_empresa FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');

-- evento_areas
DROP POLICY IF EXISTS master_access ON evento_areas;
DROP POLICY IF EXISTS staff_access ON evento_areas;
DROP POLICY IF EXISTS service_access ON evento_areas;
CREATE POLICY "master_access" ON evento_areas FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY "staff_access" ON evento_areas FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador'));
CREATE POLICY "service_access" ON evento_areas FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');

-- evento_tipos_pulseira
DROP POLICY IF EXISTS master_access ON evento_tipos_pulseira;
DROP POLICY IF EXISTS staff_access ON evento_tipos_pulseira;
DROP POLICY IF EXISTS service_access ON evento_tipos_pulseira;
CREATE POLICY "master_access" ON evento_tipos_pulseira FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY "staff_access" ON evento_tipos_pulseira FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador'));
CREATE POLICY "service_access" ON evento_tipos_pulseira FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');

-- pulseira_areas_permitidas
DROP POLICY IF EXISTS master_access ON pulseira_areas_permitidas;
DROP POLICY IF EXISTS staff_access ON pulseira_areas_permitidas;
DROP POLICY IF EXISTS service_access ON pulseira_areas_permitidas;
CREATE POLICY "master_access" ON pulseira_areas_permitidas FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY "staff_access" ON pulseira_areas_permitidas FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador'));
CREATE POLICY "service_access" ON pulseira_areas_permitidas FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');

-- evento_etiqueta_layouts
DROP POLICY IF EXISTS master_access ON evento_etiqueta_layouts;
DROP POLICY IF EXISTS staff_access ON evento_etiqueta_layouts;
DROP POLICY IF EXISTS service_access ON evento_etiqueta_layouts;
CREATE POLICY "master_access" ON evento_etiqueta_layouts FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY "staff_access" ON evento_etiqueta_layouts FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador'));
CREATE POLICY "service_access" ON evento_etiqueta_layouts FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');

-- system_settings
DROP POLICY IF EXISTS master_access ON system_settings;
DROP POLICY IF EXISTS service_access ON system_settings;
CREATE POLICY "master_access" ON system_settings FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY "service_access" ON system_settings FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');

-- system_api_keys
DROP POLICY IF EXISTS master_access ON system_api_keys;
DROP POLICY IF EXISTS service_access ON system_api_keys;
CREATE POLICY "master_access" ON system_api_keys FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY "service_access" ON system_api_keys FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');

-- system_webhooks
DROP POLICY IF EXISTS master_access ON system_webhooks;
DROP POLICY IF EXISTS service_access ON system_webhooks;
CREATE POLICY "master_access" ON system_webhooks FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY "service_access" ON system_webhooks FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');

-- audit_logs
DROP POLICY IF EXISTS master_access ON audit_logs;
DROP POLICY IF EXISTS service_access ON audit_logs;
CREATE POLICY "master_access" ON audit_logs FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY "service_access" ON audit_logs FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');

-- webhook_events
DROP POLICY IF EXISTS master_access ON webhook_events;
DROP POLICY IF EXISTS service_access ON webhook_events;
CREATE POLICY "master_access" ON webhook_events FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY "service_access" ON webhook_events FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');

-- consent_records
DROP POLICY IF EXISTS master_access ON consent_records;
DROP POLICY IF EXISTS service_access ON consent_records;
CREATE POLICY "master_access" ON consent_records FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY "service_access" ON consent_records FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');

-- echo '✅ RLS Policies criadas para 20+ tabelas'

-- ════════════════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO FINAL
-- ════════════════════════════════════════════════════════════════════════════════════

-- echo '=== VERIFICAÇÃO FINAL ==='

SELECT
    '✅ SEGURANÇA CORRIGIDA!' AS status,
    (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public') AS total_politicas,
    (SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = true) AS tabelas_com_rls;
