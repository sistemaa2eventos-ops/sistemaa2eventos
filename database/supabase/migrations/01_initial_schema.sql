-- ============================================
-- SPREAD SOBERANO: REESCRITA UNIVERSAL M:N (v23.0)
-- Arquitetura Nexus da API A2 Eventos
-- ============================================

-- Habilitar extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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
    status VARCHAR(20) DEFAULT 'rascunho' CHECK (status IN ('ativo', 'encerrado', 'rascunho')),
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
-- TABELA: empresas
-- ============================================
CREATE TABLE empresas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    evento_id UUID REFERENCES eventos(id) ON DELETE CASCADE,
    nome VARCHAR(200) NOT NULL,
    cnpj VARCHAR(20) UNIQUE,
    servico VARCHAR(100),
    email VARCHAR(200),
    responsavel VARCHAR(200),
    max_colaboradores INTEGER DEFAULT 0,
    datas_presenca JSONB DEFAULT '[]',
    registration_token UUID DEFAULT uuid_generate_v4(),
    observacao TEXT,
    ativo BOOLEAN DEFAULT true,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- TABELA: pessoas (Antiga funcionarios - Unificada)
-- ============================================
CREATE TABLE pessoas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome VARCHAR(200) NOT NULL,
    cpf VARCHAR(14) UNIQUE,
    email VARCHAR(200),
    funcao VARCHAR(100) DEFAULT 'Participante',
    tipo_pessoa VARCHAR(30) DEFAULT 'colaborador',
    empresa_id UUID REFERENCES empresas(id) ON DELETE SET NULL, -- Vínculo principal/original
    evento_id UUID REFERENCES eventos(id) ON DELETE CASCADE,     -- Vínculo principal/original
    nome_mae VARCHAR(200),
    data_nascimento DATE,
    telefone VARCHAR(20),
    documento VARCHAR(30),
    dias_trabalho JSONB DEFAULT '[]',
    foto_url TEXT,
    face_encoding JSONB,
    qr_code TEXT UNIQUE,
    numero_pulseira VARCHAR(50),
    tipo_fluxo VARCHAR(30) DEFAULT 'checkin_checkout',
    status_acesso VARCHAR(30) DEFAULT 'pendente' 
        CHECK (status_acesso IN ('autorizado', 'pendente', 'recusado', 'bloqueado', 'verificacao', 'checkin_feito', 'checkout_feito')),
    origem_cadastro VARCHAR(20) DEFAULT 'externo' CHECK (origem_cadastro IN ('interno', 'externo', 'totem')),
    fase_montagem BOOLEAN DEFAULT false,
    fase_showday BOOLEAN DEFAULT false,
    fase_desmontagem BOOLEAN DEFAULT false,
    bloqueado BOOLEAN DEFAULT false,
    motivo_bloqueio TEXT,
    observacao TEXT,
    ativo BOOLEAN DEFAULT true,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- TABELA: pessoa_evento_empresa (Pivot N:N)
-- ============================================
CREATE TABLE pessoa_evento_empresa (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pessoa_id UUID NOT NULL REFERENCES pessoas(id) ON DELETE CASCADE,
    evento_id UUID NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
    empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE,
    status_aprovacao VARCHAR(30) DEFAULT 'pendente' 
        CHECK (status_aprovacao IN ('aprovado', 'pendente', 'recusado')),
    cargo_funcao VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(pessoa_id, evento_id)
);

-- ============================================
-- TABELA: perfis (Sessão de Usuários Admin)
-- ============================================
CREATE TABLE perfis (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    evento_id UUID REFERENCES eventos(id) ON DELETE SET NULL,
    nome_completo VARCHAR(200) NOT NULL,
    avatar_url TEXT,
    nivel_acesso VARCHAR(20) NOT NULL DEFAULT 'operador' 
        CHECK (nivel_acesso IN ('master', 'admin', 'supervisor', 'operador')),
    documento VARCHAR(20),
    telefone VARCHAR(20),
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- TABELA: logs_acesso
-- ============================================
CREATE TABLE logs_acesso (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    evento_id UUID NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
    pessoa_id UUID REFERENCES pessoas(id) ON DELETE CASCADE,
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('checkin', 'checkout', 'expulsao')),
    metodo VARCHAR(20) NOT NULL CHECK (metodo IN ('qrcode', 'face', 'manual', 'fast-track')),
    dispositivo_id VARCHAR(100),
    localizacao VARCHAR(200),
    foto_capturada TEXT,
    confianca DECIMAL(5,2),
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- INDEXES SOBERANOS
CREATE INDEX idx_pessoas_cpf ON pessoas(cpf);
CREATE INDEX idx_pessoas_evento ON pessoas(evento_id);
CREATE INDEX idx_pivot_pessoa ON pessoa_evento_empresa(pessoa_id);
CREATE INDEX idx_pivot_evento ON pessoa_evento_empresa(evento_id);
CREATE INDEX idx_logs_data_full ON logs_acesso(created_at DESC);

-- TRIGGER PARA UPDATED_AT
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_eventos_modtime BEFORE UPDATE ON eventos FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_empresas_modtime BEFORE UPDATE ON empresas FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_pessoas_modtime BEFORE UPDATE ON pessoas FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_perfis_modtime BEFORE UPDATE ON perfis FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_pivot_modtime BEFORE UPDATE ON pessoa_evento_empresa FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();