-- ========================================================================================
-- CORREÇÃO URGENTE: Políticas RLS Corrigidas
-- Execute este script no SQL Editor do Supabase
-- ========================================================================================

-- 1. Remover todas as políticas antigas (hardcoded email)
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname, tablename 
        FROM pg_policies 
        WHERE schemaname = 'public'
        AND policyname LIKE '%master_all_access%'
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    END LOOP;
END $$;

-- 2. MASTER: Acesso total a tudo (verifica role no top-level do JWT)
CREATE POLICY "master_full_access" ON public.eventos FOR ALL USING ((auth.jwt() ->> 'role') = 'master');
CREATE POLICY "master_full_access" ON public.perfis FOR ALL USING ((auth.jwt() ->> 'role') = 'master');
CREATE POLICY "master_full_access" ON public.empresas FOR ALL USING ((auth.jwt() ->> 'role') = 'master');
CREATE POLICY "master_full_access" ON public.pessoas FOR ALL USING ((auth.jwt() ->> 'role') = 'master');
CREATE POLICY "master_full_access" ON public.logs_acesso FOR ALL USING ((auth.jwt() ->> 'role') = 'master');
CREATE POLICY "master_full_access" ON public.pessoa_evento_empresa FOR ALL USING ((auth.jwt() ->> 'role') = 'master');
CREATE POLICY "master_full_access" ON public.pessoa_documentos FOR ALL USING ((auth.jwt() ->> 'role') = 'master');
CREATE POLICY "master_full_access" ON public.empresa_documentos FOR ALL USING ((auth.jwt() ->> 'role') = 'master');
CREATE POLICY "master_full_access" ON public.dispositivos_acesso FOR ALL USING ((auth.jwt() ->> 'role') = 'master');
CREATE POLICY "master_full_access" ON public.quotas_diarias FOR ALL USING ((auth.jwt() ->> 'role') = 'master');
CREATE POLICY "master_full_access" ON public.evento_areas FOR ALL USING ((auth.jwt() ->> 'role') = 'master');
CREATE POLICY "master_full_access" ON public.evento_tipos_pulseira FOR ALL USING ((auth.jwt() ->> 'role') = 'master');
CREATE POLICY "master_full_access" ON public.pulseira_areas_permitidas FOR ALL USING ((auth.jwt() ->> 'role') = 'master');
CREATE POLICY "master_full_access" ON public.veiculos FOR ALL USING ((auth.jwt() ->> 'role') = 'master');
CREATE POLICY "master_full_access" ON public.evento_etiqueta_layouts FOR ALL USING ((auth.jwt() ->> 'role') = 'master');
CREATE POLICY "master_full_access" ON public.monitor_watchlist FOR ALL USING ((auth.jwt() ->> 'role') = 'master');
CREATE POLICY "master_full_access" ON public.system_settings FOR ALL USING ((auth.jwt() ->> 'role') = 'master');
CREATE POLICY "master_full_access" ON public.system_api_keys FOR ALL USING ((auth.jwt() ->> 'role') = 'master');
CREATE POLICY "master_full_access" ON public.system_webhooks FOR ALL USING ((auth.jwt() ->> 'role') = 'master');

-- 3. ADMIN/SUPERVISOR/OPERADOR: Acesso ao evento específico (verifica app_metadata -> role)
CREATE POLICY "staff_evento_access" ON public.eventos FOR ALL USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador')
    AND (
        (auth.jwt() -> 'app_metadata' ->> 'evento_id' IS NULL) OR 
        id::text = (auth.jwt() -> 'app_metadata' ->> 'evento_id')
    )
);

CREATE POLICY "staff_evento_access" ON public.empresas FOR ALL USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador')
    AND (
        (auth.jwt() -> 'app_metadata' ->> 'evento_id' IS NULL) OR
        evento_id::text = (auth.jwt() -> 'app_metadata' ->> 'evento_id')
    )
);

CREATE POLICY "staff_evento_access" ON public.pessoas FOR ALL USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador')
    AND (
        (auth.jwt() -> 'app_metadata' ->> 'evento_id' IS NULL) OR
        evento_id::text = (auth.jwt() -> 'app_metadata' ->> 'evento_id')
    )
);

CREATE POLICY "staff_evento_access" ON public.logs_acesso FOR ALL USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador')
    AND (
        (auth.jwt() -> 'app_metadata' ->> 'evento_id' IS NULL) OR
        evento_id::text = (auth.jwt() -> 'app_metadata' ->> 'evento_id')
    )
);

CREATE POLICY "staff_evento_access" ON public.pessoa_evento_empresa FOR ALL USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador')
);

CREATE POLICY "staff_evento_access" ON public.pessoa_documentos FOR ALL USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador')
);

CREATE POLICY "staff_evento_access" ON public.empresa_documentos FOR ALL USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador')
);

CREATE POLICY "staff_evento_access" ON public.dispositivos_acesso FOR ALL USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador')
);

CREATE POLICY "staff_evento_access" ON public.quotas_diarias FOR ALL USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador')
);

CREATE POLICY "staff_evento_access" ON public.evento_areas FOR ALL USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador')
);

CREATE POLICY "staff_evento_access" ON public.evento_tipos_pulseira FOR ALL USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador')
);

CREATE POLICY "staff_evento_access" ON public.pulseira_areas_permitidas FOR ALL USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador')
);

CREATE POLICY "staff_evento_access" ON public.veiculos FOR ALL USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador')
);

CREATE POLICY "staff_evento_access" ON public.evento_etiqueta_layouts FOR ALL USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador')
);

CREATE POLICY "staff_evento_access" ON public.monitor_watchlist FOR ALL USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador')
);

-- 4. Service Role: Acesso total (usado pelo backend Node.js)
CREATE POLICY "service_role_full_access" ON public.eventos FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');
CREATE POLICY "service_role_full_access" ON public.perfis FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');
CREATE POLICY "service_role_full_access" ON public.empresas FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');
CREATE POLICY "service_role_full_access" ON public.pessoas FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');
CREATE POLICY "service_role_full_access" ON public.logs_acesso FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');
CREATE POLICY "service_role_full_access" ON public.pessoa_evento_empresa FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');
CREATE POLICY "service_role_full_access" ON public.pessoa_documentos FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');
CREATE POLICY "service_role_full_access" ON public.empresa_documentos FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');
CREATE POLICY "service_role_full_access" ON public.dispositivos_acesso FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');
CREATE POLICY "service_role_full_access" ON public.quotas_diarias FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');
CREATE POLICY "service_role_full_access" ON public.evento_areas FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');
CREATE POLICY "service_role_full_access" ON public.evento_tipos_pulseira FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');
CREATE POLICY "service_role_full_access" ON public.pulseira_areas_permitidas FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');
CREATE POLICY "service_role_full_access" ON public.veiculos FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');
CREATE POLICY "service_role_full_access" ON public.evento_etiqueta_layouts FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');
CREATE POLICY "service_role_full_access" ON public.monitor_watchlist FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');
CREATE POLICY "service_role_full_access" ON public.system_settings FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');
CREATE POLICY "service_role_full_access" ON public.system_api_keys FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');
CREATE POLICY "service_role_full_access" ON public.system_webhooks FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');
CREATE POLICY "service_role_full_access" ON public.consent_records FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');
CREATE POLICY "service_role_full_access" ON public.audit_logs FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');

SELECT '✅ Políticas RLS corrigidas com sucesso!' AS result;