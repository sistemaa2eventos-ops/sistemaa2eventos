-- ============================================
-- ESQUEMA PRINCIPAL DO SISTEMA A2 EVENTOS
-- SUPABASE POSTGRESQL
-- ============================================

-- EXTENSÕES NECESSÁRIAS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- TABELA: eventos
-- ============================================
CREATE TABLE eventos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome VARCHAR(200) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    descricao TEXT,
    local VARCHAR(200),
    data_inicio TIMESTAMP,
    data_fim TIMESTAMP,
    logo_url TEXT,
    status VARCHAR(20) DEFAULT 'ativo' CHECK (status IN ('ativo', 'encerrado', 'rascunho')),
    capacidade_total INTEGER DEFAULT 0,
    datas_montagem JSONB DEFAULT '[]',
    datas_evento JSONB DEFAULT '[]',
    datas_desmontagem JSONB DEFAULT '[]',
    horario_reset TIME DEFAULT '00:00:00',
    tipos_checkin JSONB DEFAULT '["qrcode", "barcode", "manual"]',
    tipos_checkout JSONB DEFAULT '["qrcode", "barcode", "manual"]',
    impressao_etiquetas BOOLEAN DEFAULT FALSE,
    config JSONB DEFAULT '{
        "checkin_mode": ["qrcode", "face", "manual"],
        "fast_track": true,
        "badge_template": "default"
    }',
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- TABELA: perfis (extensão do auth.users)
-- ============================================
CREATE TABLE perfis (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    evento_id UUID REFERENCES eventos(id) ON DELETE SET NULL,
    nome_completo VARCHAR(200) NOT NULL,
    avatar_url TEXT,
    nivel_acesso VARCHAR(20) NOT NULL DEFAULT 'operador' 
        CHECK (nivel_acesso IN ('admin', 'supervisor', 'operador')),
    documento VARCHAR(20),
    telefone VARCHAR(20),
    ativo BOOLEAN DEFAULT true,
    ultimo_acesso TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- TABELA: empresas
-- ============================================
CREATE TABLE empresas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    evento_id UUID NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
    nome VARCHAR(200) NOT NULL,
    servico VARCHAR(100),
    cnpj VARCHAR(20) UNIQUE,
    observacao TEXT,
    ativo BOOLEAN DEFAULT true,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ÍNDICES
CREATE INDEX idx_empresas_evento ON empresas(evento_id);
CREATE INDEX idx_empresas_cnpj ON empresas(cnpj);

-- ============================================
-- TABELA: funcionarios
-- ============================================
CREATE TABLE funcionarios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    evento_id UUID NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
    empresa_id UUID REFERENCES empresas(id) ON DELETE SET NULL,
    nome VARCHAR(200) NOT NULL,
    cpf VARCHAR(14) UNIQUE NOT NULL,
    funcao VARCHAR(100),
    observacao TEXT,
    fase_montagem BOOLEAN DEFAULT false,
    fase_showday BOOLEAN DEFAULT false,
    fase_desmontagem BOOLEAN DEFAULT false,
    foto_url TEXT,
    face_encoding JSONB,
    status_acesso VARCHAR(20) DEFAULT 'pendente' 
        CHECK (status_acesso IN ('checkin', 'checkout', 'pendente', 'expulso')),
    qr_code TEXT UNIQUE,
    credencial_impressa BOOLEAN DEFAULT false,
    ativo BOOLEAN DEFAULT true,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ÍNDICES
CREATE INDEX idx_funcionarios_evento ON funcionarios(evento_id);
CREATE INDEX idx_funcionarios_empresa ON funcionarios(empresa_id);
CREATE INDEX idx_funcionarios_cpf ON funcionarios(cpf);
CREATE INDEX idx_funcionarios_status ON funcionarios(status_acesso);
CREATE INDEX idx_funcionarios_qrcode ON funcionarios(qr_code);

-- ============================================
-- TABELA: logs_acesso
-- ============================================
CREATE TABLE logs_acesso (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    evento_id UUID NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
    funcionario_id UUID NOT NULL REFERENCES funcionarios(id) ON DELETE CASCADE,
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('checkin', 'checkout', 'expulsao')),
    metodo VARCHAR(20) NOT NULL CHECK (metodo IN ('qrcode', 'face', 'manual', 'fast-track')),
    dispositivo_id VARCHAR(100),
    localizacao VARCHAR(200),
    foto_capturada TEXT,
    confianca DECIMAL(5,2),
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- ÍNDICES
CREATE INDEX idx_logs_evento ON logs_acesso(evento_id);
CREATE INDEX idx_logs_funcionario ON logs_acesso(funcionario_id);
CREATE INDEX idx_logs_tipo ON logs_acesso(tipo);
CREATE INDEX idx_logs_data ON logs_acesso(created_at DESC);

-- ============================================
-- TABELA: dispositivos_acesso
-- ============================================
CREATE TABLE dispositivos_acesso (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    evento_id UUID NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
    nome VARCHAR(100) NOT NULL,
    tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('catraca', 'terminal_facial', 'totem')),
    modelo VARCHAR(50),
    ip_address INET,
    rtsp_url TEXT,
    porta INTEGER,
    status VARCHAR(20) DEFAULT 'offline',
    config JSONB,
    ultimo_heartbeat TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- FUNÇÃO: atualizar_timestamp
-- ============================================
CREATE OR REPLACE FUNCTION atualizar_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- TRIGGERS
CREATE TRIGGER trigger_atualizar_eventos BEFORE UPDATE ON eventos
    FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp();
CREATE TRIGGER trigger_atualizar_empresas BEFORE UPDATE ON empresas
    FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp();
CREATE TRIGGER trigger_atualizar_funcionarios BEFORE UPDATE ON funcionarios
    FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp();

-- ============================================
-- POLÍTICAS DE SEGURANÇA (RLS)
-- ============================================

-- Habilitar RLS
ALTER TABLE eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfis ENABLE ROW LEVEL SECURITY;
ALTER TABLE empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE funcionarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs_acesso ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispositivos_acesso ENABLE ROW LEVEL SECURITY;

-- Política: Admin tem acesso total
CREATE POLICY admin_all_access ON eventos
    FOR ALL USING (auth.jwt() ->> 'nivel_acesso' = 'admin');

-- Política: Usuários veem apenas seus eventos
CREATE POLICY select_own_event ON eventos
    FOR SELECT USING (
        id IN (
            SELECT evento_id FROM perfis 
            WHERE id = auth.uid()
        )
    );