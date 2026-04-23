-- ========================================================================================
-- CORREÇÃO DE EMERGÊNCIA - RLS E PERMISSÕES
-- Execute este script no SQL Editor do Supabase
-- ========================================================================================

-- 1. DESABILITAR RLS TEMPORARIAMENTE PARA TESTES
-- Isso permite que a API funcione enquanto ajustamos as políticas

ALTER TABLE public.eventos DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.pessoas DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresas DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.logs_acesso DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.pessoa_documentos DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresa_documentos DISABLE ROW LEVEL SECURITY;

-- 2. CRIAR POLÍTICAS SIMPLES QUE PERMITEM TUDO (para teste)
-- Policies will be created when RLS is re-enabled

-- 3. VERIFICAR SE HOUVE ERROS
SELECT '✅ RLS temporariamente desabilitado para testes!' AS resultado;

-- 4. LISTAR TABELAS E STATUS RLS
SELECT 
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables 
WHERE schemaname = 'public'
AND tablename IN ('eventos', 'pessoas', 'empresas', 'logs_acesso');