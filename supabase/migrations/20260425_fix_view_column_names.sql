-- ========================================================================================
-- FIX: Corrigir nomes de colunas na view_documentos_pendentes
-- Problema: Coluna 'nome' pode não existir (pode ser 'full_name', 'person_name', etc)
-- Solução: Usar colunas que existem ou remover a coluna problemática
-- ========================================================================================

-- OPÇÃO 1: Simplificar a view (remover coluna nome)
DROP VIEW IF EXISTS view_documentos_pendentes CASCADE;
CREATE VIEW view_documentos_pendentes AS
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
    e.cnpj AS entidade_doc
FROM empresa_documentos d
LEFT JOIN empresas e ON e.id = d.empresa_id
WHERE d.status = 'pendente';

-- ========================================================================================
-- VERIFICAÇÃO: Listar colunas da tabela pessoas (para referência)
-- ========================================================================================

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'pessoas'
ORDER BY ordinal_position;

-- ========================================================================================
-- VERIFICAÇÃO: Listar colunas da tabela empresas
-- ========================================================================================

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'empresas'
ORDER BY ordinal_position;

-- ========================================================================================
-- VERIFICAÇÃO: Testar a view
-- ========================================================================================

SELECT COUNT(*) as pendentes_pessoas FROM view_documentos_pendentes WHERE entity_type = 'pessoa';
SELECT COUNT(*) as pendentes_empresas FROM view_documentos_pendentes WHERE entity_type = 'empresa';

SELECT * FROM view_documentos_pendentes LIMIT 5;
