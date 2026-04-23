-- SQL para criação da tabela de auditoria de sistema (A2 Eventos)
-- Aplicável tanto ao Supabase (PostgreSQL) quanto ao MSSQL (Edge)

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- No MSSQL usar UNIQUEIDENTIFIER
    evento_id UUID NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    nivel_acesso VARCHAR(20), -- Nível na hora da ação
    acao VARCHAR(50) NOT NULL, -- 'RESET_PASSWORD', 'APPROVE_DOC', 'DELETE_PERSON', etc.
    recurso VARCHAR(50) NOT NULL, -- 'USUARIOS', 'DOCUMENTOS', 'PESSOAS', 'EMPRESAS'
    recurso_id UUID, -- ID do alvo da ação
    detalhes JSONB, -- Dados extras (ex: 'antes' vs 'depois')
    ip_origem VARCHAR(45),
    dispositivo_id VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expira_em TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 year') -- Retenção de 1 ano
);

-- Índices para performance em BI
CREATE INDEX IF NOT EXISTS idx_audit_evento ON audit_logs(evento_id);
CREATE INDEX IF NOT EXISTS idx_audit_acao ON audit_logs(acao);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_logs(recurso, recurso_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
