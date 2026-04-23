-- Corrigir políticas da tabela audit_logs para permitir service_role
DROP POLICY IF EXISTS master_access ON audit_logs;
DROP POLICY IF EXISTS service_access ON audit_logs;

CREATE POLICY "master_access" ON audit_logs FOR ALL 
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');

CREATE POLICY "service_access" ON audit_logs FOR ALL 
    USING ((auth.jwt() ->> 'role') = 'service_role');

-- Também corrigir otras tabelas de sistema que podem ter o mesmo problema
DO $$
DECLARE
    tables TEXT[] := ARRAY[
        'system_settings', 'system_api_keys', 'system_webhooks', 
        'consent_records', 'webhook_events', 'api_keys',
        'transacoes_financeiras', 'webhooks', 'backups_acesso_diario',
        'logs_acesso_veiculos', 'logs_veiculos', 'mensagem_templates',
        'event_modules', 'perfil_eventos', 'saas_config_global',
        'sys_event_role_permissions', 'sys_permissions', 
        'sys_role_permissions', 'sys_roles'
    ];
    t TEXT;
BEGIN
    FOREACH t IN ARRAY tables LOOP
        EXECUTE format('DROP POLICY IF EXISTS master_access ON public.%I', t);
        EXECUTE format('DROP POLICY IF EXISTS service_access ON public.%I', t);
        EXECUTE format('CREATE POLICY "master_access" ON public.%I FOR ALL USING ((auth.jwt() -> ''app_metadata'' ->> ''role'') = ''master'')', t);
        EXECUTE format('CREATE POLICY "service_access" ON public.%I FOR ALL USING ((auth.jwt() ->> ''role'') = ''service_role'')', t);
    END LOOP;
END $$;

SELECT '✅ Políticas corrigidas para service_role!' AS status;
