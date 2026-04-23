-- ========================================================================================
-- SPRINT 21: SUPABASE RLS EXTREMO (BLINDAGEM B2B)
-- ========================================================================================

-- 1. Habilitar RLS estrito nas tabelas core (caso não estejam)
ALTER TABLE public.pessoas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pessoa_documentos ENABLE ROW LEVEL SECURITY;

-- 2. Limpar políticas antigas/inseguras que possam estar dando bypass
DROP POLICY IF EXISTS "Leitura irrestrita de pessoas" ON public.pessoas;
DROP POLICY IF EXISTS "Empresas veem seus funcionarios" ON public.pessoas;

-- 3. Políticas para a Tabela 'pessoas'
-- Admin / Operador Interno: Pode ver tudo
CREATE POLICY "RLS Pessoas: Admin e Internos Full Access" ON public.pessoas
    FOR ALL
    USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador')
    );

-- Empresa B2B: Só pode ver pessoas que possuam um vinculo aprovado ou pendente com ELA na pivot table
CREATE POLICY "RLS Pessoas: Empresa B2B Isolada" ON public.pessoas
    FOR SELECT
    USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'empresa'
        AND EXISTS (
            SELECT 1 FROM public.pessoa_evento_empresa pivot
            WHERE pivot.pessoa_id = id
            AND pivot.empresa_id::text = auth.jwt() -> 'app_metadata' ->> 'empresa_id'
        )
    );

-- Empresa B2B: Só pode INSERIR ou ATUALIZAR pessoas vinculadas à sua empresa (via claim / pivot na transação)
CREATE POLICY "RLS Pessoas Insert/Update: Empresa B2B Isolada" ON public.pessoas
    FOR UPDATE
    USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'empresa'
        AND EXISTS (
             SELECT 1 FROM public.pessoa_evento_empresa pivot
             WHERE pivot.pessoa_id = id
             AND pivot.empresa_id::text = auth.jwt() -> 'app_metadata' ->> 'empresa_id'
        )
    );

-- 4. Políticas para a Tabela 'pessoa_documentos' (ECM)
-- Admin / Operador Interno: Pode ver tudo
CREATE POLICY "RLS Docs: Admin e Internos Full Access" ON public.pessoa_documentos
    FOR ALL
    USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador')
    );

-- Empresa B2B: Só pode ver documentos de pessoas que pertencem a ela
CREATE POLICY "RLS Docs: Empresa B2B Isolada" ON public.pessoa_documentos
    FOR SELECT
    USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'empresa'
        AND EXISTS (
            SELECT 1 FROM public.pessoa_evento_empresa pivot
            WHERE pivot.pessoa_id = pessoa_id
            AND pivot.empresa_id::text = auth.jwt() -> 'app_metadata' ->> 'empresa_id'
        )
    );

-- ============================================================================
-- A Tabela pessoa_evento_empresa já teve sua política criada na Migração 10.
-- O Node.js backend passará a invocar o JWT das agências para que o Postgres
-- silencie qualquer vazamento caso o desenvolvedor esqueça um .eq('empresa', id)
-- ============================================================================
