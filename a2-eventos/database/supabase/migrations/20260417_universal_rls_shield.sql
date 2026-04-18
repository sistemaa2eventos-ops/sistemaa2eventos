-- ============================================
-- MIGRATION: Universal RLS Shield (Blindagem de Segurança)
-- Data: 2026-04-17
-- Objetivo: Garantir que 100% das tabelas tenham RLS ativo
-- e aplicar política universal para admin_master.
-- ============================================

-- ============================================
-- PASSO 1: Habilitar RLS em TODAS as tabelas public
-- (Garante que nenhuma tabela vaze dados pela API anônima)
-- ============================================
ALTER TABLE public.perfis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consent_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotas_diarias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pessoa_evento_empresa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pessoa_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresa_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evento_tipos_pulseira ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pulseira_areas_permitidas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispositivos_acesso ENABLE ROW LEVEL SECURITY;

-- ============================================
-- PASSO 2: Criar Política Universal para admin_master
-- Acesso total irrestrito para quem tem o role admin_master no JWT
-- (Abrange as tabelas que ficaram de fora na última migration)
-- ============================================

DO $$
DECLARE
    tabelas TEXT[] := ARRAY[
        'perfis',
        'system_api_keys',
        'system_webhooks',
        'audit_logs',
        'consent_records',
        'quotas_diarias',
        'pessoa_evento_empresa',
        'pessoa_documentos',
        'empresa_documentos',
        'evento_tipos_pulseira',
        'pulseira_areas_permitidas',
        'dispositivos_acesso'
    ];
    t TEXT;
BEGIN
    FOREACH t IN ARRAY tabelas LOOP
        -- Tenta dropar para garantir idempotência
        EXECUTE format('DROP POLICY IF EXISTS "master_full_access" ON public.%I', t);
        
        -- Cria a nova política
        EXECUTE format('
            CREATE POLICY "master_full_access" ON public.%I FOR ALL USING (
                COALESCE(
                    auth.jwt() -> ''user_metadata'' ->> ''nivel_acesso'',
                    auth.jwt() -> ''user_metadata'' ->> ''role'',
                    auth.jwt() -> ''app_metadata'' ->> ''role''
                ) IN (''master'', ''admin_master'')
            );
        ', t);
    END LOOP;
END $$;

-- ============================================
-- PASSO 3: Reparar política de Tenant Isolation para Operadores/Supervisores (Leitura/Escrita)nas tabelas adicionais
-- ============================================

DO $$
DECLARE
    tabelas_tenant TEXT[] := ARRAY[
        'dispositivos_acesso',
        'evento_tipos_pulseira',
        'pessoa_evento_empresa'
    ];
    t TEXT;
BEGIN
    FOREACH t IN ARRAY tabelas_tenant LOOP
        EXECUTE format('DROP POLICY IF EXISTS "tenant_isolation" ON public.%I', t);
        
        -- Nota: assumindo que essas tabelas possuem a coluna 'evento_id'.
        EXECUTE format('
            CREATE POLICY "tenant_isolation" ON public.%I FOR ALL USING (
                COALESCE(
                    auth.jwt() -> ''user_metadata'' ->> ''nivel_acesso'',
                    auth.jwt() -> ''user_metadata'' ->> ''role'',
                    auth.jwt() -> ''app_metadata'' ->> ''role''
                ) IN (''admin'', ''supervisor'', ''operador'', ''admin_master'')
                AND (
                    COALESCE(
                        auth.jwt() -> ''user_metadata'' ->> ''evento_id'',
                        auth.jwt() -> ''app_metadata'' ->> ''evento_id''
                    ) IS NULL
                    OR evento_id::text = COALESCE(
                        auth.jwt() -> ''user_metadata'' ->> ''evento_id'',
                        auth.jwt() -> ''app_metadata'' ->> ''evento_id''
                    )
                )
            );
        ', t);
    END LOOP;
END $$;

-- Política customizada para pulseira_areas_permitidas (Usa tipo_pulseira_id como pivô para checar o evento)
DROP POLICY IF EXISTS "tenant_isolation_areas_pulseira" ON public.pulseira_areas_permitidas;
CREATE POLICY "tenant_isolation_areas_pulseira" ON public.pulseira_areas_permitidas FOR ALL USING (
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
        OR tipo_pulseira_id IN (
            SELECT id FROM public.evento_tipos_pulseira 
            WHERE evento_id::text = COALESCE(
                auth.jwt() -> 'user_metadata' ->> 'evento_id',
                auth.jwt() -> 'app_metadata' ->> 'evento_id'
            )
        )
    )
);

-- ============================================
-- PASSO 4: Verificação Final
-- Deve listar 0 tabelas se o RLS estiver 100% ativo.
-- ============================================
SELECT tablename 
FROM pg_tables 
WHERE schemaname = 'public' 
AND rowsecurity = false;
