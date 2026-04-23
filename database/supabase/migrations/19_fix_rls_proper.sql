-- ========================================================================================
-- CORREÇÃO RLS FINAL - PERMITE TUDO TEMPORARIAMENTE
-- Execute este script no SQL Editor do Supabase
-- ========================================================================================

-- ============================================
-- 1. LIMPAR POLÍTICAS ANTIGAS
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
-- 2. HABILITAR RLS
-- ============================================
ALTER TABLE public.eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pessoas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logs_acesso ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pessoa_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresa_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispositivos_acesso ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotas_diarias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfis ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 3. POLÍTICA QUE PERMITE TUDO (SEM RESTRIÇÃO)
-- Isso faz o RLS ser efektifmente desabilitado
-- mas mantém a interface do RLS ativa
-- ============================================

CREATE POLICY "allow_all" ON public.eventos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON public.pessoas FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON public.empresas FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON public.logs_acesso FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON public.pessoa_documentos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON public.empresa_documentos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON public.dispositivos_acesso FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON public.quotas_diarias FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON public.perfis FOR ALL USING (true) WITH CHECK (true);

SELECT '✅ RLS ativo mas permissivo (usando true)!' AS resultado;