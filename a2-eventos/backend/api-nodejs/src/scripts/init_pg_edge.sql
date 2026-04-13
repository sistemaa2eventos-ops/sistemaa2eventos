-- Ativa a extensão de Vetores Inteligentes 
CREATE EXTENSION IF NOT EXISTS vector;

-- Tabelas Locais da Borda
CREATE TABLE IF NOT EXISTS eventos (
    id UUID PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    data_inicio TIMESTAMPTZ,
    data_fim TIMESTAMPTZ,
    timezone VARCHAR(50) DEFAULT 'America/Sao_Paulo',
    criado_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pessoas (
    id UUID PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    cpf VARCHAR(14),
    email VARCHAR(255),
    foto_url TEXT,
    telefone VARCHAR(20),
    status_acesso VARCHAR(50) DEFAULT 'pendente',
    evento_id UUID REFERENCES eventos(id) ON DELETE CASCADE,
    qr_code TEXT,
    barcode TEXT,
    rfid_tag VARCHAR(100),
    face_id TEXT,
    veiculo_placa VARCHAR(20),
    -- Coluna crítica para Inteligência Artificial Offline (InsightFace)
    face_encoding vector(512),
    alerta_ativo BOOLEAN DEFAULT FALSE,
    tipo VARCHAR(50),
    criado_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS logs_acesso (
    id UUID PRIMARY KEY,
    evento_id UUID REFERENCES eventos(id) ON DELETE CASCADE,
    pessoa_id UUID REFERENCES pessoas(id) ON DELETE CASCADE,
    tipo VARCHAR(20) NOT NULL, -- checkin, checkout, negado
    metodo VARCHAR(20),        -- face, qrcode, rfid, manual
    dispositivo_id VARCHAR(100),
    confianca DECIMAL(5, 2),
    foto_capturada TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by UUID,
    sincronizado BOOLEAN DEFAULT false,
    sync_id UUID
);

-- Índices Rápidos
CREATE INDEX idx_pessoas_evento ON pessoas(evento_id);
CREATE INDEX idx_pessoas_status ON pessoas(status_acesso);
CREATE INDEX idx_logs_sincronizacao ON logs_acesso(sincronizado) WHERE sincronizado = false;
-- Índice HNSW para Busca Supersônica de Rostos na Borda
CREATE INDEX IF NOT EXISTS idx_pessoas_face_encoding ON pessoas USING hnsw (face_encoding vector_cosine_ops);

-- Configurações Globais do Sistema (SaaS/Local)
CREATE TABLE IF NOT EXISTS system_settings (
    id SERIAL PRIMARY KEY,
    theme_neon_enabled BOOLEAN DEFAULT TRUE,
    language VARCHAR(10) DEFAULT 'pt-BR',
    biometric_login_enabled BOOLEAN DEFAULT TRUE,
    cloud_sync_enabled BOOLEAN DEFAULT TRUE,
    api_url TEXT DEFAULT 'https://api.nzt.app.br/api',
    alert_operator_login BOOLEAN DEFAULT FALSE,
    alert_event_peak BOOLEAN DEFAULT TRUE,
    biometric_sensitivity INTEGER DEFAULT 85,
    liveness_check_enabled BOOLEAN DEFAULT TRUE,
    anti_passback_enabled BOOLEAN DEFAULT TRUE,
    anti_passback_cooldown_min INTEGER DEFAULT 15,
    auto_checkout_timeout_min INTEGER DEFAULT 300,
    capacity_hard_block_enabled BOOLEAN DEFAULT TRUE,
    gamification_enabled BOOLEAN DEFAULT FALSE,
    -- Campos de Comunicação (v16.2)
    smtp_enabled BOOLEAN DEFAULT FALSE,
    smtp_host TEXT,
    smtp_port INTEGER DEFAULT 465,
    smtp_email TEXT,
    smtp_user TEXT,
    smtp_pass TEXT,
    wpp_enabled BOOLEAN DEFAULT FALSE,
    wpp_provider VARCHAR(50) DEFAULT 'twilio',
    wpp_token TEXT,
    wpp_phone_id TEXT,
    capacity_vip_bypass BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Garantir registro inicial de soberania
INSERT INTO system_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
