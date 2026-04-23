-- ============================================
-- MIGRATION: Expandir Níveis de Acesso
-- Data: 2026-04-23
-- Objetivo: Permitir novos cargos solicitados na UI que estavam sendo bloqueados por CHECK constraint
-- ============================================

DO $$ 
BEGIN
    -- 1. Remover a restrição antiga que era muito limitada ('admin_master', 'operador')
    ALTER TABLE public.perfis DROP CONSTRAINT IF EXISTS perfis_nivel_acesso_check;
    
    -- 2. Adicionar a nova restrição expandida
    ALTER TABLE public.perfis 
    ADD CONSTRAINT perfis_nivel_acesso_check 
    CHECK (nivel_acesso IN ('master', 'admin_master', 'admin', 'supervisor', 'operador'));

    -- 3. Garantir que as políticas de RLS cubram esses novos nomes (já mapeado em migrations anteriores mas reforçando)
    -- As políticas atuais já citam esses termos, então a conformidade da constraint é o passo principal.
    
    RAISE NOTICE 'Constraint de níveis de acesso expandida com sucesso.';
END
$$;
