-- ============================================
-- MIGRATION: Security & Performance Patch
-- Data: 2026-04-18
-- Objetivo: Remover vulnerabilidade de JWT (app_metadata vs user_metadata) e otimizar índices.
-- ============================================

-- ============================================
-- PASSO 1: OTIMIZAÇÃO (PERFORMANCE)
-- Remover Índices Duplicados apontados pelo Advisor
-- ============================================
DROP INDEX IF EXISTS public.idx_empresas_evento_id;
DROP INDEX IF EXISTS public.idx_logs_acesso_evento_data;
DROP INDEX IF EXISTS public.idx_logs_acesso_pessoa_id;
DROP INDEX IF EXISTS public.idx_pessoas_evento_id;

-- ============================================
-- PASSO 2: BLINDAGEM DE RLS (SEGURANÇA EXTREMA)
-- Substituir qualquer leitura de 'user_metadata' por 'app_metadata'.
-- O user_metadata pode ser alterado no cliente maliciosamente.
-- ============================================

DO $$
DECLARE
    tabelas_todas TEXT[] := ARRAY[
        'perfis', 'system_api_keys', 'system_webhooks', 'audit_logs',
        'consent_records', 'quotas_diarias', 'pessoa_evento_empresa',
        'pessoa_documentos', 'empresa_documentos', 'evento_tipos_pulseira',
        'pulseira_areas_permitidas', 'dispositivos_acesso', 'eventos',
        'empresas', 'pessoas', 'logs_acesso', 'evento_areas',
        'monitor_watchlist', 'veiculos', 'system_settings', 'terminal_sync_queue'
    ];
    t TEXT;
BEGIN
    FOREACH t IN ARRAY tabelas_todas LOOP
        -- Removemos políticas fracas antigas
        EXECUTE format('DROP POLICY IF EXISTS "master_full_access" ON public.%I', t);
        EXECUTE format('DROP POLICY IF EXISTS "admin_only" ON public.%I', t);

        -- Política Master (Acesso Global Seguro via App Metadata)
        EXECUTE format('
            CREATE POLICY "master_full_access" ON public.%I FOR ALL USING (
                (auth.jwt() -> ''app_metadata'' ->> ''role'') IN (''master'', ''admin_master'')
                OR 
                (auth.jwt() -> ''app_metadata'' ->> ''nivel_acesso'') IN (''master'', ''admin_master'')
            );
        ', t);
    END LOOP;
END $$;


-- Isolamento de Tenant Seguro (Apenas App Metadata)
DO $$
DECLARE
    tabelas_tenant TEXT[] := ARRAY[
        'empresas', 'pessoas', 'logs_acesso', 'evento_areas',
        'monitor_watchlist', 'veiculos', 'eventos', 'dispositivos_acesso',
        'evento_tipos_pulseira', 'pessoa_evento_empresa', 'terminal_sync_queue'
    ];
    t TEXT;
BEGIN
    FOREACH t IN ARRAY tabelas_tenant LOOP
        EXECUTE format('DROP POLICY IF EXISTS "tenant_isolation" ON public.%I', t);
        
        -- Eventos precisam de leitura global para admins
        IF t = 'eventos' THEN
            EXECUTE format('
                CREATE POLICY "tenant_isolation" ON public.%I FOR SELECT USING (
                    (auth.jwt() -> ''app_metadata'' ->> ''role'') IN (''admin'', ''supervisor'', ''operador'', ''admin_master'')
                    AND (
                        (auth.jwt() -> ''app_metadata'' ->> ''evento_id'') IS NULL
                        OR id::text = (auth.jwt() -> ''app_metadata'' ->> ''evento_id'')
                    )
                );
            ', t);
        ELSE
            EXECUTE format('
                CREATE POLICY "tenant_isolation" ON public.%I FOR ALL USING (
                    (auth.jwt() -> ''app_metadata'' ->> ''role'') IN (''admin'', ''supervisor'', ''operador'', ''admin_master'')
                    AND (
                        (auth.jwt() -> ''app_metadata'' ->> ''evento_id'') IS NULL
                        OR evento_id::text = (auth.jwt() -> ''app_metadata'' ->> ''evento_id'')
                    )
                );
            ', t);
        END IF;
    END LOOP;
END $$;

-- A tabela Pivô Pulseiras tem modelo próprio de checagem.
DROP POLICY IF EXISTS "tenant_isolation_areas_pulseira" ON public.pulseira_areas_permitidas;
CREATE POLICY "tenant_isolation_areas_pulseira" ON public.pulseira_areas_permitidas FOR ALL USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador', 'admin_master')
    AND (
        (auth.jwt() -> 'app_metadata' ->> 'evento_id') IS NULL
        OR tipo_pulseira_id IN (
            SELECT id FROM public.evento_tipos_pulseira 
            WHERE evento_id::text = (auth.jwt() -> 'app_metadata' ->> 'evento_id')
        )
    )
);

-- FIM DA BLINDAGEM.
