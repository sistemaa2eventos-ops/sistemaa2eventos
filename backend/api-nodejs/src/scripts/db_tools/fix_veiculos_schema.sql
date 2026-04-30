-- FIX: Veiculos Table Schema Alignment
-- This script ensures the veiculos table has correct foreign keys and RLS policies

BEGIN;

-- 1. Ensure columns exist and have correct types
ALTER TABLE public.veiculos 
ADD COLUMN IF NOT EXISTS evento_id UUID REFERENCES public.eventos(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS motorista_id UUID REFERENCES public.pessoas(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 2. Explicitly recreate foreign keys if they are missing (to ensure join works via PostgREST)
-- Note: Add IF NOT EXISTS for constraints is not standard in all PG versions, so we use a DO block
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'veiculos_empresa_id_fkey') THEN
        ALTER TABLE public.veiculos ADD CONSTRAINT veiculos_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'veiculos_motorista_id_fkey') THEN
        ALTER TABLE public.veiculos ADD CONSTRAINT veiculos_motorista_id_fkey FOREIGN KEY (motorista_id) REFERENCES public.pessoas(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 3. Enable RLS
ALTER TABLE public.veiculos ENABLE ROW LEVEL SECURITY;

-- 4. Policies (Aligned with other entities)
DROP POLICY IF EXISTS "Admin All Access" ON public.veiculos;
CREATE POLICY "Admin All Access" ON public.veiculos
    FOR ALL TO authenticated
    USING ( (SELECT nivel_acesso FROM public.perfis WHERE id = auth.uid()) = 'admin' );

DROP POLICY IF EXISTS "Supervisor Full Access" ON public.veiculos;
CREATE POLICY "Supervisor Full Access" ON public.veiculos
    FOR ALL TO authenticated
    USING ( (SELECT nivel_acesso FROM public.perfis WHERE id = auth.uid()) = 'supervisor' );

DROP POLICY IF EXISTS "Operator Read Access" ON public.veiculos;
CREATE POLICY "Operator Read Access" ON public.veiculos
    FOR SELECT TO authenticated
    USING ( (SELECT nivel_acesso FROM public.perfis WHERE id = auth.uid()) = 'operador' );

COMMIT;
