-- Migration 10: Pivot Table Pessoas x Empresas (N:N)
-- Resolução de dívida técnica para suportar Freelancers em múltiplas agências

CREATE TABLE IF NOT EXISTS public.pessoa_evento_empresa (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    pessoa_id UUID NOT NULL REFERENCES public.pessoas(id) ON DELETE CASCADE,
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    evento_id UUID REFERENCES public.eventos(id) ON DELETE SET NULL,
    status_aprovacao VARCHAR(50) DEFAULT 'pendente',
    cargo_funcao VARCHAR(150),
    data_vinculo TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(pessoa_id, empresa_id, evento_id)
);

-- Habilitar RLS
ALTER TABLE public.pessoa_evento_empresa ENABLE ROW LEVEL SECURITY;

-- Política de RLS: Qualquer um autenticado como admin ou a propria empresa vinculada pode ler
CREATE POLICY "Leitura irrestrita para Admin e Empresa Dona do Vinculo" ON public.pessoa_evento_empresa
    FOR SELECT
    USING (
        auth.jwt()->>'role' = 'admin' 
        OR auth.jwt()->>'role' = 'supervisor'
        OR auth.jwt()->>'role' = 'operador'
        OR (auth.jwt()->>'role' = 'empresa' AND empresa_id::text = auth.jwt()->>'empresa_id')
    );

-- Nota: não removeremos o "empresa_id" direto de Pessoas IMEDIATAMENTE para retrocompatibilidade,
-- mas a nova fonte de verdade para listagem cruzada será esta tabela Pivot.
