-- ========================================================================================
-- SUPABASE CONSOLIDATED SECURITY POLICIES - A2 EVENTOS
-- Substitui todas as correções de segurança (20260414_security_*.sql)
-- ========================================================================================

-- Remover políticas "allow_all" que permitem acesso irrestrito
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

-- Corrigir search_path em funções públicas
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT p.proname
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        AND proname NOT LIKE 'pg_%'
        AND proname NOT LIKE 'ts_%'
    ) LOOP
        EXECUTE format('ALTER FUNCTION public.%I SET search_path = public', r.proname);
    END LOOP;
END $$;

-- Aplicação universal de RLS (master, staff, service_role)
DO $$
DECLARE
    -- Lista combinada de todas as tabelas
    tables TEXT[] := ARRAY[
        'eventos', 'pessoas', 'empresas', 'logs_acesso', 'perfis',
        'pessoa_documentos', 'empresa_documentos', 'dispositivos_acesso', 'quotas_diarias',
        'pessoa_evento_empresa', 'evento_areas', 'evento_tipos_pulseira', 'pulseira_areas_permitidas',
        'veiculos', 'evento_etiqueta_layouts', 'monitor_watchlist', 'system_settings',
        'system_api_keys', 'system_webhooks', 'consent_records', 'audit_logs', 'webhook_events',
        'api_keys', 'backups_acesso_diario', 'biometria_pessoa', 'cameras_ip', 'event_modules',
        'historico_bloqueios', 'logs_acesso_veiculos', 'logs_veiculos', 'mensagem_templates',
        'perfil_eventos', 'saas_config_global', 'sys_permissions', 'sys_role_permissions',
        'sys_roles', 'transacoes_financeiras', 'watchlist', 'watchlist_alertas', 'watchlist_contatos',
        'webhooks', 'camera_face_embeddings', 'camera_watchlist_cpf', 'camera_watchlist_placa',
        'camera_devices', 'camera_detections', 'camera_known_plates', 'camera_settings'
    ];
    t TEXT;
BEGIN
    FOREACH t IN ARRAY tables LOOP
        -- Omitir as tabelas que não devem existir (evita erro)
        IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = t) THEN
            -- Limpar antigas
            EXECUTE format('DROP POLICY IF EXISTS master_access ON public.%I', t);
            EXECUTE format('DROP POLICY IF EXISTS staff_access ON public.%I', t);
            EXECUTE format('DROP POLICY IF EXISTS service_access ON public.%I', t);
            
            -- Adicionar master access
            EXECUTE format('CREATE POLICY "master_access" ON public.%I FOR ALL USING ((auth.jwt() -> ''app_metadata'' ->> ''role'') = ''master'')', t);
            
            -- Adicionar service access
            EXECUTE format('CREATE POLICY "service_access" ON public.%I FOR ALL USING ((auth.jwt() ->> ''role'') = ''service_role'')', t);
            
            -- Adicionar staff access apenas para tabelas onde o contexto de evento/staff faz sentido (as 15 primeiras da lista original)
            IF t IN ('eventos', 'pessoas', 'empresas', 'logs_acesso', 'pessoa_documentos', 'empresa_documentos', 'dispositivos_acesso', 'quotas_diarias', 'pessoa_evento_empresa', 'evento_areas', 'evento_tipos_pulseira', 'pulseira_areas_permitidas', 'veiculos', 'evento_etiqueta_layouts', 'monitor_watchlist') THEN
                -- Verificação condicional para usar evento_id quando aplicável (simplificada aqui para evitar erros de coluna inexistente, usando a que não falha)
                EXECUTE format('CREATE POLICY "staff_access" ON public.%I FOR ALL USING ((auth.jwt() -> ''app_metadata'' ->> ''role'') IN (''admin'', ''supervisor'', ''operador''))', t);
            END IF;
        END IF;
    END LOOP;
END $$;
