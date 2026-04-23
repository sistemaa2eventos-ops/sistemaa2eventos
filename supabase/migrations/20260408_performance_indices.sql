-- 🚀 A2 Eventos - Migração de Performance e Escalabilidade
-- Data: 2026-04-08

-- 1. Índices B-tree para buscas rápidas (Focado em isolamento de evento)
CREATE INDEX IF NOT EXISTS idx_pessoas_evento_id ON public.pessoas(evento_id);
CREATE INDEX IF NOT EXISTS idx_pessoas_evento_cpf ON public.pessoas(evento_id, cpf);
CREATE INDEX IF NOT EXISTS idx_pessoas_evento_nome ON public.pessoas(evento_id, nome text_pattern_ops);
CREATE INDEX IF NOT EXISTS idx_pessoas_status_acesso ON public.pessoas(evento_id, status_acesso);

CREATE INDEX IF NOT EXISTS idx_empresas_evento_id ON public.empresas(evento_id);
CREATE INDEX IF NOT EXISTS idx_pivot_evento_pessoa ON public.pessoa_evento_empresa(evento_id, pessoa_id);
CREATE INDEX IF NOT EXISTS idx_pivot_evento_empresa ON public.pessoa_evento_empresa(evento_id, empresa_id);

-- 2. Índice GIN para campos JSONB (Flexibilidade com Performance)
-- Útil para buscas em campos_extras ou campos_obrigatorios
CREATE INDEX IF NOT EXISTS idx_pessoas_campos_jsonb ON public.pessoas USING GIN(campos_extras);

-- 3. Denormalização: inscritos_count em Eventos
-- Evita COUNT(*) em tempo real nas rotas públicas
ALTER TABLE public.eventos ADD COLUMN IF NOT EXISTS inscritos_count INTEGER DEFAULT 0;

-- Função Trigger para atualizar o contador
CREATE OR REPLACE FUNCTION public.fn_update_inscritos_count()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        UPDATE public.eventos 
        SET inscritos_count = inscritos_count + 1 
        WHERE id = NEW.evento_id;
    ELSIF (TG_OP = 'DELETE') THEN
        UPDATE public.eventos 
        SET inscritos_count = inscritos_count - 1 
        WHERE id = OLD.evento_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger em Pessoas
DROP TRIGGER IF EXISTS tr_update_inscritos_count ON public.pessoas;
CREATE TRIGGER tr_update_inscritos_count
AFTER INSERT OR DELETE ON public.pessoas
FOR EACH ROW EXECUTE FUNCTION public.fn_update_inscritos_count();

-- 4. Inicializar o contador para eventos existentes
UPDATE public.eventos e
SET inscritos_count = (
    SELECT COUNT(*) 
    FROM public.pessoas p 
    WHERE p.evento_id = e.id
);

-- 5. Views Otimizadas (Elimina N+1 Queries no Backend)
CREATE OR REPLACE VIEW public.view_pessoas_listagem AS
SELECT 
    p.*,
    e.nome as empresa_nome,
    pee.empresa_id,
    pee.status_aprovacao as status_pivot,
    pee.updated_at as pivot_updated_at
FROM 
    public.pessoas p
LEFT JOIN 
    public.pessoa_evento_empresa pee ON p.id = pee.pessoa_id AND p.evento_id = pee.evento_id
LEFT JOIN 
    public.empresas e ON pee.empresa_id = e.id;

COMMENT ON VIEW public.view_pessoas_listagem IS 'View consolidada para listagem de pessoas com JOINs de empresa, otimizando performance de listagem.';
