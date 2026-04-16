-- ============================================
-- MIGRATION COMPLETA: Refatorar Sistema de Usuários
-- Execute TODO este arquivo no Supabase SQL Editor
-- ============================================

-- ============================================
-- PASSO 1: Remover constraint ANTES de tudo
-- ============================================
DO $$ 
BEGIN
    EXECUTE 'ALTER TABLE public.perfis DROP CONSTRAINT IF EXISTS perfis_nivel_acesso_check';
EXCEPTION
    WHEN undefined_table THEN NULL;
END
$$;

-- ============================================
-- PASSO 2: Adicionar novas colunas
-- ============================================
ALTER TABLE public.perfis 
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pendente' 
CHECK (status IN ('pendente', 'ativo', 'inativo'));

ALTER TABLE public.perfis 
ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{"dashboard":true,"empresas":false,"pessoas":false,"auditoria_documentos":false,"monitoramento":false,"relatorios":false,"checkin":false,"checkout":false}'::jsonb;

ALTER TABLE public.perfis 
ADD COLUMN IF NOT EXISTS aprovado_por UUID REFERENCES public.perfis(id) ON DELETE SET NULL;

ALTER TABLE public.perfis 
ADD COLUMN IF NOT EXISTS aprovado_em TIMESTAMPTZ;

-- ============================================
-- PASSO 3: Atualizar dados EXISTENTES
-- ============================================
-- Master -> admin_master
UPDATE public.perfis 
SET nivel_acesso = 'admin_master', 
    status = 'ativo',
    permissions = '{"dashboard":true,"empresas":true,"pessoas":true,"auditoria_documentos":true,"monitoramento":true,"relatorios":true,"checkin":true,"checkout":true}'::jsonb
WHERE nivel_acesso = 'master';

-- admin/supervisor -> operador
UPDATE public.perfis 
SET nivel_acesso = 'operador', 
    status = 'ativo'
WHERE nivel_acesso IN ('admin', 'supervisor');

-- ============================================
-- PASSO 4: Recriar constraint
-- ============================================
ALTER TABLE public.perfis 
ADD CONSTRAINT perfis_nivel_acesso_check 
CHECK (nivel_acesso IN ('admin_master', 'operador'));

-- ============================================
-- VERIFICAÇÃO FINAL
-- ============================================
SELECT 
    nivel_acesso,
    status,
    COUNT(*) as total
FROM public.perfis 
GROUP BY nivel_acesso, status
ORDER BY nivel_acesso;

-- Verificar colunas
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'perfis' AND table_schema = 'public'
ORDER BY ordinal_position;