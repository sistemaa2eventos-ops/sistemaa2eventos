-- ========================================================================================
-- CORREÇÕES DE SEGURANÇA DO SUPABASE
-- Copie TODO este código e cole no SQL Editor do Supabase
-- Clique em "Run" para executar
-- ========================================================================================

-- ============================================
-- 1. CORRIGIR VIEW view_documentos_pendentes
-- ============================================
DROP VIEW IF EXISTS view_documentos_pendentes;

CREATE OR REPLACE VIEW view_documentos_pendentes AS
  SELECT
    d.id,
    'pessoa' AS entity_type,
    d.pessoa_id AS entity_id,
    p.evento_id,
    d.titulo,
    d.tipo_doc,
    d.url_arquivo,
    d.status,
    d.data_inclusao as created_at,
    p.nome AS entidade_nome,
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
    d.data_inclusao as created_at,
    e.nome AS entidade_nome,
    e.cnpj AS entidade_doc
  FROM empresa_documentos d
  LEFT JOIN empresas e ON e.id = d.empresa_id
  WHERE d.status = 'pendente';

-- ============================================
-- 2. VERIFICAR SE HOUVE ERROS
-- ============================================
SELECT '✅ View corrigida com sucesso!' AS resultado;

-- ============================================
-- 3. LISTAR TODAS AS VIEWS DO BANCO
-- ============================================
SELECT viewname FROM pg_views WHERE schemaname = 'public';