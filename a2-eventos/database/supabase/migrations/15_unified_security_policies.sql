-- ========================================================================================
-- SPRINT 22: UNIFIED ROW Level SECURITY & TENANTED ISOLATION
-- ========================================================================================

-- 1. DROP ALL OLD POLICIES TO PREVENT CONFLICTS AND BYPASSES
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

-- 2. ENABLE RLS ON ALL CORE TABLES
ALTER TABLE public.eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pessoas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logs_acesso ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispositivos_acesso ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotas_diarias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pessoa_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresa_documentos ENABLE ROW LEVEL SECURITY;

-- 3. POLICIES USING JWT CLAIMS ONLY
-- ========================================================================================
-- The JWT contains app_metadata populated via auth triggers or manual update:
-- auth.jwt() -> 'app_metadata' ->> 'role'
-- auth.jwt() -> 'app_metadata' ->> 'evento_id'
-- auth.jwt() -> 'app_metadata' ->> 'empresa_id'

-- ==========================================
-- RULESET: MASTER MULTI-TENANT
-- ==========================================
CREATE POLICY "RLS Default: Master View All Eventos" ON public.eventos FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY "RLS Default: Master View All Perfis" ON public.perfis FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY "RLS Default: Master View All Empresas" ON public.empresas FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY "RLS Default: Master View All Pessoas" ON public.pessoas FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY "RLS Default: Master View All Logs" ON public.logs_acesso FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');

-- ==========================================
-- RULESET: ADMIN / SUPERVISOR / OPERADOR
-- ==========================================
CREATE POLICY "RLS Eventos: Staff Leitura" ON public.eventos
    FOR SELECT USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador')
        AND (
            (auth.jwt() -> 'app_metadata' ->> 'evento_id' IS NULL) OR 
            id::text = (auth.jwt() -> 'app_metadata' ->> 'evento_id')
        )
    );

CREATE POLICY "RLS Eventos: Admin Edita" ON public.eventos
    FOR UPDATE USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
        AND id::text = (auth.jwt() -> 'app_metadata' ->> 'evento_id')
    );

CREATE POLICY "RLS Empresas: Staff Evento" ON public.empresas
    FOR ALL USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador')
        AND (
            (auth.jwt() -> 'app_metadata' ->> 'evento_id' IS NULL) OR
            evento_id::text = (auth.jwt() -> 'app_metadata' ->> 'evento_id')
        )
    );

CREATE POLICY "RLS Pessoas: Staff Evento" ON public.pessoas
    FOR ALL USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador')
        AND (
            (auth.jwt() -> 'app_metadata' ->> 'evento_id' IS NULL) OR
            evento_id::text = (auth.jwt() -> 'app_metadata' ->> 'evento_id')
        )
    );

CREATE POLICY "RLS Logs: Staff Evento" ON public.logs_acesso
    FOR ALL USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador')
        AND (
            (auth.jwt() -> 'app_metadata' ->> 'evento_id' IS NULL) OR
            evento_id::text = (auth.jwt() -> 'app_metadata' ->> 'evento_id')
        )
    );

-- ==========================================
-- RULESET: B2B EMPRESA (STRICT ISOLATION)
-- ==========================================
CREATE POLICY "RLS Empresas: Le Propria" ON public.empresas
    FOR SELECT USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'empresa'
        AND id::text = (auth.jwt() -> 'app_metadata' ->> 'empresa_id')
    );

CREATE POLICY "RLS Pessoas: Empresa Isolada Read" ON public.pessoas
    FOR SELECT USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'empresa'
        AND EXISTS (
            SELECT 1 FROM public.pessoa_evento_empresa pivot
            WHERE pivot.pessoa_id = public.pessoas.id
            AND pivot.empresa_id::text = auth.jwt() -> 'app_metadata' ->> 'empresa_id'
        )
    );

CREATE POLICY "RLS Pessoas: Empresa Isolada Write" ON public.pessoas
    FOR UPDATE USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'empresa'
        AND EXISTS (
             SELECT 1 FROM public.pessoa_evento_empresa pivot
             WHERE pivot.pessoa_id = public.pessoas.id
             AND pivot.empresa_id::text = auth.jwt() -> 'app_metadata' ->> 'empresa_id'
        )
    );

CREATE POLICY "RLS Docs: Empresa Isolada Read" ON public.pessoa_documentos
    FOR SELECT USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'empresa'
        AND EXISTS (
            SELECT 1 FROM public.pessoa_evento_empresa pivot
            WHERE pivot.pessoa_id = public.pessoa_documentos.pessoa_id
            AND pivot.empresa_id::text = auth.jwt() -> 'app_metadata' ->> 'empresa_id'
        )
    );
