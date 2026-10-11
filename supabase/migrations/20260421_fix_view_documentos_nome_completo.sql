-- Fix view_documentos_pendentes para usar nome_completo em vez de nome
DROP VIEW IF EXISTS public.view_documentos_pendentes;

CREATE OR REPLACE VIEW public.view_documentos_pendentes AS
SELECT
    d.id,
    'pessoa' AS entity_type,
    d.pessoa_id AS entity_id,
    p.evento_id,
    d.titulo,
    d.tipo_doc,
    d.url_arquivo,
    d.status,
    d.data_inclusao AS created_at,
    p.nome_completo AS entidade_nome,
    p.cpf AS entidade_doc
FROM pessoa_documentos d
LEFT JOIN pessoas p ON p.id = d.pessoa_id
WHERE d.status = 'pendente'

UNION ALL

SELECT
    d.id,
    'empresa' AS entity_type,
    d.empresa_id AS entity_id,
    e.evento_id,
    d.titulo,
    d.tipo_doc,
    d.url_arquivo,
    d.status,
    d.data_inclusao AS created_at,
    e.nome AS entidade_nome,
    e.cnpj AS entidade_doc
FROM empresa_documentos d
LEFT JOIN empresas e ON e.id = d.empresa_id
WHERE d.status = 'pendente';

COMMENT ON VIEW public.view_documentos_pendentes IS 'View consolidada de documentos pendentes (pessoas e empresas) para fila de auditoria';
