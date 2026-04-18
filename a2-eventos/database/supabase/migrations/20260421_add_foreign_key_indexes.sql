-- ========================================================================================
-- MIGRATION: Adicionar Índices em Foreign Keys para Performance
-- Data: 2026-04-21
-- Descrição: Melhora significativa em performance de JOINs com milhares de registros
-- ========================================================================================

-- Empresas
CREATE INDEX IF NOT EXISTS idx_empresas_evento_id ON empresas(evento_id);
CREATE INDEX IF NOT EXISTS idx_empresas_created_by ON empresas(created_by);

-- Pessoas
CREATE INDEX IF NOT EXISTS idx_pessoas_evento_id ON pessoas(evento_id);
CREATE INDEX IF NOT EXISTS idx_pessoas_empresa_id ON pessoas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_pessoas_documento_id ON pessoas(documento_id);
CREATE INDEX IF NOT EXISTS idx_pessoas_status_acesso ON pessoas(status_acesso);

-- Logs de Acesso
CREATE INDEX IF NOT EXISTS idx_logs_acesso_evento_id ON logs_acesso(evento_id);
CREATE INDEX IF NOT EXISTS idx_logs_acesso_pessoa_id ON logs_acesso(pessoa_id);
CREATE INDEX IF NOT EXISTS idx_logs_acesso_tipo ON logs_acesso(tipo);
CREATE INDEX IF NOT EXISTS idx_logs_acesso_created_at ON logs_acesso(created_at DESC);

-- Dispositivos de Acesso
CREATE INDEX IF NOT EXISTS idx_dispositivos_acesso_evento_id ON dispositivos_acesso(evento_id);
CREATE INDEX IF NOT EXISTS idx_dispositivos_acesso_area_id ON dispositivos_acesso(area_id);
CREATE INDEX IF NOT EXISTS idx_dispositivos_acesso_status ON dispositivos_acesso(status);

-- Áreas de Evento
CREATE INDEX IF NOT EXISTS idx_evento_areas_evento_id ON evento_areas(evento_id);

-- Documentos de Pessoa
CREATE INDEX IF NOT EXISTS idx_pessoa_documentos_pessoa_id ON pessoa_documentos(pessoa_id);
CREATE INDEX IF NOT EXISTS idx_pessoa_documentos_status ON pessoa_documentos(status);

-- Documentos de Empresa
CREATE INDEX IF NOT EXISTS idx_empresa_documentos_empresa_id ON empresa_documentos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_empresa_documentos_status ON empresa_documentos(status);

-- Pulseiras
CREATE INDEX IF NOT EXISTS idx_pulseiras_evento_id ON pulseiras(evento_id);
CREATE INDEX IF NOT EXISTS idx_pulseiras_pessoa_id ON pulseiras(pessoa_id);
CREATE INDEX IF NOT EXISTS idx_pulseiras_status ON pulseiras(status);

-- Verificar criação
SELECT '✅ Índices de Foreign Key criados com sucesso!' AS resultado;

-- Listar índices criados
SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public'
AND indexname LIKE 'idx_%'
ORDER BY indexname;
