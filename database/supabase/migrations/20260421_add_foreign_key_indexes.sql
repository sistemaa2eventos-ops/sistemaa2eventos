-- ========================================================================================
-- MIGRATION: Adicionar Índices em Foreign Keys para Performance
-- Data: 2026-04-21
-- Descrição: Complementa índices já existentes com novos para melhorar JOINs
-- ========================================================================================

-- 📍 DOCUMENTOS (Document Management Performance)

-- Documentos de Pessoa (já têm idx_pessoa_documentos_pessoa_id)
CREATE INDEX IF NOT EXISTS idx_pessoa_documentos_status ON pessoa_documentos(status);
CREATE INDEX IF NOT EXISTS idx_pessoa_documentos_revisado_por ON pessoa_documentos(revisado_por_user_id);

-- Documentos de Empresa (já têm idx_empresa_documentos_empresa_id)
CREATE INDEX IF NOT EXISTS idx_empresa_documentos_status ON empresa_documentos(status);
CREATE INDEX IF NOT EXISTS idx_empresa_documentos_revisado_por ON empresa_documentos(revisado_por_user_id);

-- 📍 AUDITORIA & COMPLIANCE

-- Histórico de Bloqueios (já têm idx_historico_bloqueios_pessoa_id)
CREATE INDEX IF NOT EXISTS idx_historico_bloqueios_executado_por ON historico_bloqueios(executado_por_admin_id);
CREATE INDEX IF NOT EXISTS idx_historico_bloqueios_created_at ON historico_bloqueios(created_at DESC);

-- Audit Logs - Complementar
CREATE INDEX IF NOT EXISTS idx_audit_logs_evento_id ON audit_logs(evento_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_dispositivo_id ON audit_logs(dispositivo_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_changed_at ON audit_logs(changed_at DESC);

-- 📍 BIOMETRIA (já têm idx_biometria_pessoa_pessoa_id)
CREATE INDEX IF NOT EXISTS idx_biometria_pessoa_sincronizado_em ON biometria_pessoa(sincronizado_em);

-- 📍 MONITORAMENTO & VEÍCULOS

-- Logs de Veículos (já têm idx_logs_veiculos_veiculo_id e idx_logs_veiculos_evento_id)
CREATE INDEX IF NOT EXISTS idx_logs_veiculos_operador_id ON logs_veiculos(operador_id);
CREATE INDEX IF NOT EXISTS idx_logs_veiculos_metodo ON logs_veiculos(metodo);

-- Logs de Acesso Veículos (nova tabela)
CREATE INDEX IF NOT EXISTS idx_logs_acesso_veiculos_veiculo_id ON logs_acesso_veiculos(veiculo_id);
CREATE INDEX IF NOT EXISTS idx_logs_acesso_veiculos_equipamento_id ON logs_acesso_veiculos(equipamento_id);
CREATE INDEX IF NOT EXISTS idx_logs_acesso_veiculos_registrado_por ON logs_acesso_veiculos(registrado_por);

-- 📍 WATCHLIST & SEGURANÇA

-- Watchlist (já têm idx_watchlist_evento_id)
CREATE INDEX IF NOT EXISTS idx_watchlist_adicionado_por ON watchlist(adicionado_por);
CREATE INDEX IF NOT EXISTS idx_watchlist_cpf ON watchlist(cpf);

-- Watchlist Alertas
CREATE INDEX IF NOT EXISTS idx_watchlist_alertas_watchlist_id ON watchlist_alertas(watchlist_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_alertas_pessoa_id ON watchlist_alertas(pessoa_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_alertas_evento_id ON watchlist_alertas(evento_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_alertas_area_id ON watchlist_alertas(area_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_alertas_dispositivo_id ON watchlist_alertas(dispositivo_id);

-- Watchlist Contatos (já têm idx_watchlist_contatos_watchlist_id implicitamente)
CREATE INDEX IF NOT EXISTS idx_watchlist_contatos_evento_id ON watchlist_contatos(evento_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_contatos_ativo ON watchlist_contatos(ativo);

-- 📍 VERIFICAÇÃO

SELECT '✅ Índices complementares criados com sucesso!' AS resultado;

-- Listar índices criados nesta migration
SELECT COUNT(*) as total_novos_indexes
FROM pg_indexes
WHERE schemaname = 'public'
AND (
  indexname LIKE 'idx_pessoa_documentos_status%'
  OR indexname LIKE 'idx_pessoa_documentos_revisado%'
  OR indexname LIKE 'idx_empresa_documentos_status%'
  OR indexname LIKE 'idx_empresa_documentos_revisado%'
  OR indexname LIKE 'idx_historico_bloqueios%'
  OR indexname LIKE 'idx_audit_logs_%'
  OR indexname LIKE 'idx_biometria_pessoa_sincronizado%'
  OR indexname LIKE 'idx_logs_veiculos_%'
  OR indexname LIKE 'idx_logs_acesso_veiculos_%'
  OR indexname LIKE 'idx_watchlist%'
);
