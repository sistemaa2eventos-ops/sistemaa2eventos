-- Migration 11: Populando a Pivot Table de Pessoas e Empresas

-- Esta script preenche os dados herdados do modelo 1:1 original para o formato M:N (Pivot).
-- Apenas insere as Pessoas cujos IDs já não estejam na Pivot.

INSERT INTO public.pessoa_evento_empresa (pessoa_id, empresa_id, evento_id, status_aprovacao, cargo_funcao)
SELECT 
    id AS pessoa_id, 
    empresa_id, 
    evento_id, 
    'aprovado' AS status_aprovacao, 
    funcao AS cargo_funcao
FROM public.pessoas
WHERE empresa_id IS NOT NULL 
AND NOT EXISTS (
    SELECT 1 FROM public.pessoa_evento_empresa 
    WHERE pessoa_id = pessoas.id AND empresa_id = pessoas.empresa_id
);
