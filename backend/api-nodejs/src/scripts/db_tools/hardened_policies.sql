-- 🛡️ POLÍTICAS DE SEGURANÇA (RLS) - NEXUS CREDENCIAMENTO

-- 1. Habilitar RLS em todas as tabelas
ALTER TABLE IF EXISTS public.perfis ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.funcionarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.logs_acesso ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.quotas_diarias ENABLE ROW LEVEL SECURITY;

-- 2. Limpar políticas existentes (opcional, use com cuidado)
-- DROP POLICY IF EXISTS "Admin Full Access" ON public.funcionarios;

-- 3. POLÍTICA: ADMINS (Acesso Total)
-- Assume-se que admins têm nivel_acesso = 'admin' no seu perfil (tabela perfis)
-- Como o Supabase Auth não tem roles nativos sem custom claims, usamos o join com perfis ou metadados do auth.

CREATE POLICY "Admin All Access" ON public.funcionarios
    FOR ALL
    TO authenticated
    USING ( (SELECT nivel_acesso FROM public.perfis WHERE id = auth.uid()) = 'admin' );

CREATE POLICY "Admin All Access" ON public.eventos
    FOR ALL
    TO authenticated
    USING ( (SELECT nivel_acesso FROM public.perfis WHERE id = auth.uid()) = 'admin' );

-- 4. POLÍTICA: SUPERVISORES
-- Podem ver tudo, mas só editam empresas e funcionários
CREATE POLICY "Supervisor Read Access" ON public.eventos
    FOR SELECT
    TO authenticated
    USING ( (SELECT nivel_acesso FROM public.perfis WHERE id = auth.uid()) = 'supervisor' );

CREATE POLICY "Supervisor Full Access" ON public.funcionarios
    FOR ALL
    TO authenticated
    USING ( (SELECT nivel_acesso FROM public.perfis WHERE id = auth.uid()) = 'supervisor' );

-- 5. POLÍTICA: OPERADORES
-- Só podem ver o evento ao qual estão vinculados e inserir logs
CREATE POLICY "Operador View Assigned Event" ON public.eventos
    FOR SELECT
    TO authenticated
    USING ( 
        id = (SELECT evento_id FROM public.perfis WHERE id = auth.uid()) 
    );

CREATE POLICY "Operador Insert Logs" ON public.logs_acesso
    FOR INSERT
    TO authenticated
    WITH CHECK ( 
        evento_id = (SELECT evento_id FROM public.perfis WHERE id = auth.uid()) 
    );

-- 6. ACESSO PÚBLICO (Para links de cadastro)
CREATE POLICY "Public Registration Insert" ON public.funcionarios
    FOR INSERT
    TO anon
    WITH CHECK ( true ); -- Validação é feita no backend, RLS permite o insert inicial

-- 💡 INSTRUÇÕES: 
-- Copie e cole este script no SQL Editor do seu painel Supabase.
-- Certifique-se de que a coluna 'nivel_acesso' na tabela 'perfis' existe e contém os valores 'admin', 'supervisor' ou 'operador'.
