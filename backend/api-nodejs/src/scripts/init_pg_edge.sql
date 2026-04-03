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
    face_embedding vector(512),
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
CREATE INDEX idx_pessoas_face_embedding ON pessoas USING hnsw (face_embedding vector_cosine_ops);
