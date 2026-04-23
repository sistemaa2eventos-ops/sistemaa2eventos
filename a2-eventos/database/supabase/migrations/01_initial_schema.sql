-- ============================================
-- SPREAD SOBERANO: REESCRITA UNIVERSAL M:N (v23.0)
-- Arquitetura Nexus da API A2 Eventos
-- ============================================

-- Habilitar extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABELA: eventos
-- ============================================
CREATE TABLE IF NOT EXISTS eventos (
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
CREATE TABLE IF NOT EXISTS empresas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    evento_id UUID REFERENCES eventos(id) ON DELETE CASCADE,
    nome VARCHAR(200) NOT NULL,
    cnpj VARCHAR(20) UNIQUE,
    servico VARCHAR(100), -- Mantido para legado
    tipo_operacao VARCHAR(100), -- Adicionado para v27.2
    email VARCHAR(200),
    responsavel VARCHAR(200), -- Mantido para legado
    responsavel_legal VARCHAR(200), -- Adicionado para v27.2
    max_colaboradores INTEGER DEFAULT 0,
    datas_presenca JSONB DEFAULT '[]',
    registration_token UUID DEFAULT uuid_generate_v4(),
    observacao TEXT,
    ativo BOOLEAN DEFAULT true,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- GARANTIR EXPANSÃO v27.2
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS tipo_operacao VARCHAR(100);
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS responsavel_legal VARCHAR(200);

-- ============================================
-- TABELA: pessoas (Antiga funcionarios - Unificada)
-- ============================================
CREATE TABLE IF NOT EXISTS pessoas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome VARCHAR(200) NOT NULL,
    nome_credencial VARCHAR(100), -- Adicionado para v27.2
    cpf VARCHAR(14) UNIQUE,
    passaporte VARCHAR(30), -- Adicionado para v27.2
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
    fase_montagem BOOLEAN DEFAULT true,
    fase_showday BOOLEAN DEFAULT true,
    fase_desmontagem BOOLEAN DEFAULT true,
    bloqueado BOOLEAN DEFAULT false,
    motivo_bloqueio TEXT,
    observacao TEXT,
    trabalho_area_tecnica BOOLEAN DEFAULT false, -- Adicionado para v27.2
    trabalho_altura BOOLEAN DEFAULT false, -- Adicionado para v27.2
    pagamento_validado BOOLEAN DEFAULT false, -- Adicionado para v27.2
    ativo BOOLEAN DEFAULT true,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- GARANTIR EXPANSÃO v27.2
ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS nome_credencial VARCHAR(100);
ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS passaporte VARCHAR(30);
ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS trabalho_area_tecnica BOOLEAN DEFAULT false;
ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS trabalho_altura BOOLEAN DEFAULT false;
ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS pagamento_validado BOOLEAN DEFAULT false;

-- ============================================
-- TABELA: pessoa_evento_empresa (Pivot N:N)
-- ============================================
CREATE TABLE IF NOT EXISTS pessoa_evento_empresa (
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
CREATE TABLE IF NOT EXISTS perfis (
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
CREATE TABLE IF NOT EXISTS logs_acesso (
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
CREATE INDEX IF NOT EXISTS idx_pessoas_cpf ON pessoas(cpf);
CREATE INDEX IF NOT EXISTS idx_pessoas_evento ON pessoas(evento_id);
CREATE INDEX IF NOT EXISTS idx_pivot_pessoa ON pessoa_evento_empresa(pessoa_id);
CREATE INDEX IF NOT EXISTS idx_pivot_evento ON pessoa_evento_empresa(evento_id);
CREATE INDEX IF NOT EXISTS idx_logs_data_full ON logs_acesso(created_at DESC);

-- TRIGGER PARA UPDATED_AT
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_eventos_modtime ON eventos;
CREATE TRIGGER update_eventos_modtime BEFORE UPDATE ON eventos FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_empresas_modtime ON empresas;
CREATE TRIGGER update_empresas_modtime BEFORE UPDATE ON empresas FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_pessoas_modtime ON pessoas;
CREATE TRIGGER update_pessoas_modtime BEFORE UPDATE ON pessoas FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_perfis_modtime ON perfis;
CREATE TRIGGER update_perfis_modtime BEFORE UPDATE ON perfis FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_pivot_modtime ON pessoa_evento_empresa;
CREATE TRIGGER update_pivot_modtime BEFORE UPDATE ON pessoa_evento_empresa FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- ============================================
-- POLÍTICAS DE SEGURANÇA (RLS) - SOBERANIA MASTER
-- ============================================

-- Habilitar RLS em todas as tabelas
ALTER TABLE eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfis ENABLE ROW LEVEL SECURITY;
ALTER TABLE empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE pessoas ENABLE ROW LEVEL SECURITY;
ALTER TABLE pessoa_evento_empresa ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs_acesso ENABLE ROW LEVEL SECURITY;

-- POLÍTICA SOBERANA: Master tem poder total em tudo
DROP POLICY IF EXISTS master_all_access_eventos ON eventos;
CREATE POLICY master_all_access_eventos ON eventos FOR ALL USING (auth.jwt() ->> 'email' = 'sistemaa2eventos@gmail.com');

DROP POLICY IF EXISTS master_all_access_perfis ON perfis;
CREATE POLICY master_all_access_perfis ON perfis FOR ALL USING (auth.jwt() ->> 'email' = 'sistemaa2eventos@gmail.com');

DROP POLICY IF EXISTS master_all_access_empresas ON empresas;
CREATE POLICY master_all_access_empresas ON empresas FOR ALL USING (auth.jwt() ->> 'email' = 'sistemaa2eventos@gmail.com');

DROP POLICY IF EXISTS master_all_access_pessoas ON pessoas;
CREATE POLICY master_all_access_pessoas ON pessoas FOR ALL USING (auth.jwt() ->> 'email' = 'sistemaa2eventos@gmail.com');

DROP POLICY IF EXISTS master_all_access_pivot ON pessoa_evento_empresa;
CREATE POLICY master_all_access_pivot ON pessoa_evento_empresa FOR ALL USING (auth.jwt() ->> 'email' = 'sistemaa2eventos@gmail.com');

DROP POLICY IF EXISTS master_all_access_logs ON logs_acesso;
CREATE POLICY master_all_access_logs ON logs_acesso FOR ALL USING (auth.jwt() ->> 'email' = 'sistemaa2eventos@gmail.com');

-- ============================================
-- TABELA: monitor_watchlist (Vigilância de Alvos)
-- ============================================
CREATE TABLE IF NOT EXISTS monitor_watchlist (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    evento_id UUID NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
    pessoa_id UUID REFERENCES pessoas(id) ON DELETE CASCADE,
    cpf VARCHAR(14),
    nome VARCHAR(200),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE monitor_watchlist ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS master_all_access_watchlist ON monitor_watchlist;
CREATE POLICY master_all_access_watchlist ON monitor_watchlist FOR ALL USING (auth.jwt() ->> 'email' = 'sistemaa2eventos@gmail.com');

-- ============================================
-- EXPANSÃO NEXUS: LOGÍSTICA E FROTA
-- ============================================
CREATE TABLE IF NOT EXISTS veiculos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    placa VARCHAR(20) UNIQUE NOT NULL,
    modelo VARCHAR(100) NOT NULL,
    empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE,
    motorista_id UUID REFERENCES pessoas(id) ON DELETE SET NULL,
    criado_em TIMESTAMP DEFAULT NOW(),
    atualizado_em TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- EXPANSÃO NEXUS: GESTÃO DOCUMENTAL
-- ============================================
CREATE TABLE IF NOT EXISTS empresa_documentos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    titulo VARCHAR(200) NOT NULL,
    tipo_doc VARCHAR(100) NOT NULL,
    url_arquivo TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovado', 'rejeitado')),
    notas_auditoria TEXT,
    revisado_por_user_id UUID REFERENCES auth.users(id),
    data_revisao TIMESTAMP,
    data_emissao DATE,
    data_validade DATE,
    data_inclusao TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pessoa_documentos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pessoa_id UUID NOT NULL REFERENCES pessoas(id) ON DELETE CASCADE,
    titulo VARCHAR(200) NOT NULL,
    tipo_doc VARCHAR(100) NOT NULL,
    url_arquivo TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovado', 'rejeitado')),
    notas_auditoria TEXT,
    revisado_por_user_id UUID REFERENCES auth.users(id),
    data_revisao TIMESTAMP,
    data_emissao DATE,
    data_validade DATE,
    data_inclusao TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- EXPANSÃO NEXUS: INFRAESTRUTURA FÍSICA
-- ============================================
CREATE TABLE IF NOT EXISTS evento_areas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    evento_id UUID NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
    nome_area VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS evento_tipos_pulseira (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    evento_id UUID NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
    nome_tipo VARCHAR(100) NOT NULL,
    cor_hex VARCHAR(7),
    numero_inicial INTEGER DEFAULT 0,
    numero_final INTEGER DEFAULT 0,
    tipo_leitura VARCHAR(30) DEFAULT 'qr_code'
);

CREATE TABLE IF NOT EXISTS pulseira_areas_permitidas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pulseira_id UUID NOT NULL REFERENCES evento_tipos_pulseira(id) ON DELETE CASCADE,
    area_id UUID NOT NULL REFERENCES evento_areas(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS evento_etiqueta_layouts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    evento_id UUID UNIQUE NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
    papel_config JSONB DEFAULT '{}',
    elementos JSONB DEFAULT '[]',
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- EXPANSÃO NEXUS: INTELIGÊNCIA DE SISTEMA
-- ============================================
CREATE TABLE IF NOT EXISTS system_settings (
    id INTEGER PRIMARY KEY,
    theme_neon_enabled BOOLEAN DEFAULT true,
    language VARCHAR(10) DEFAULT 'pt-BR',
    biometric_login_enabled BOOLEAN DEFAULT true,
    cloud_sync_enabled BOOLEAN DEFAULT true,
    api_url TEXT,
    alert_operator_login BOOLEAN DEFAULT false,
    alert_event_peak BOOLEAN DEFAULT true,
    biometric_sensitivity INTEGER DEFAULT 85,
    liveness_check_enabled BOOLEAN DEFAULT true,
    anti_passback_enabled BOOLEAN DEFAULT true,
    anti_passback_cooldown_min INTEGER DEFAULT 15,
    auto_checkout_timeout_min INTEGER DEFAULT 300,
    capacity_hard_block_enabled BOOLEAN DEFAULT true,
    gamification_enabled BOOLEAN DEFAULT false,
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS system_api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS system_webhooks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trigger_event VARCHAR(100) NOT NULL,
    target_url TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- BLINDAGEM RLS SOBERANA (v26.0)
-- ============================================
ALTER TABLE veiculos ENABLE ROW LEVEL SECURITY;
ALTER TABLE empresa_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE pessoa_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE evento_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE evento_tipos_pulseira ENABLE ROW LEVEL SECURITY;
ALTER TABLE pulseira_areas_permitidas ENABLE ROW LEVEL SECURITY;
ALTER TABLE evento_etiqueta_layouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_webhooks ENABLE ROW LEVEL SECURITY;

-- Política Mestra Global
DROP POLICY IF EXISTS master_full_access_veiculos ON veiculos;
CREATE POLICY master_full_access_veiculos ON veiculos FOR ALL USING (auth.jwt() ->> 'email' = 'sistemaa2eventos@gmail.com');

DROP POLICY IF EXISTS master_full_access_emp_docs ON empresa_documentos;
CREATE POLICY master_full_access_emp_docs ON empresa_documentos FOR ALL USING (auth.jwt() ->> 'email' = 'sistemaa2eventos@gmail.com');

DROP POLICY IF EXISTS master_full_access_pes_docs ON pessoa_documentos;
CREATE POLICY master_full_access_pes_docs ON pessoa_documentos FOR ALL USING (auth.jwt() ->> 'email' = 'sistemaa2eventos@gmail.com');

DROP POLICY IF EXISTS master_full_access_areas ON evento_areas;
CREATE POLICY master_full_access_areas ON evento_areas FOR ALL USING (auth.jwt() ->> 'email' = 'sistemaa2eventos@gmail.com');

DROP POLICY IF EXISTS master_full_access_puls ON evento_tipos_pulseira;
CREATE POLICY master_full_access_puls ON evento_tipos_pulseira FOR ALL USING (auth.jwt() ->> 'email' = 'sistemaa2eventos@gmail.com');

DROP POLICY IF EXISTS master_full_access_puls_areas ON pulseira_areas_permitidas;
CREATE POLICY master_full_access_puls_areas ON pulseira_areas_permitidas FOR ALL USING (auth.jwt() ->> 'email' = 'sistemaa2eventos@gmail.com');

DROP POLICY IF EXISTS master_full_access_layouts ON evento_etiqueta_layouts;
CREATE POLICY master_full_access_layouts ON evento_etiqueta_layouts FOR ALL USING (auth.jwt() ->> 'email' = 'sistemaa2eventos@gmail.com');

DROP POLICY IF EXISTS master_full_access_settings ON system_settings;
CREATE POLICY master_full_access_settings ON system_settings FOR ALL USING (auth.jwt() ->> 'email' = 'sistemaa2eventos@gmail.com');

DROP POLICY IF EXISTS master_full_access_api_keys ON system_api_keys;
CREATE POLICY master_full_access_api_keys ON system_api_keys FOR ALL USING (auth.jwt() ->> 'email' = 'sistemaa2eventos@gmail.com');

DROP POLICY IF EXISTS master_full_access_webhooks ON system_webhooks;
CREATE POLICY master_full_access_webhooks ON system_webhooks FOR ALL USING (auth.jwt() ->> 'email' = 'sistemaa2eventos@gmail.com');

-- ============================================
-- EXPANSÃO NEXUS: REGRAS E SEGURANÇA (v26.2)
-- ============================================
CREATE TABLE IF NOT EXISTS event_modules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    evento_id UUID NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
    module_key VARCHAR(50) NOT NULL,
    is_enabled BOOLEAN DEFAULT true,
    UNIQUE(evento_id, module_key)
);

CREATE TABLE IF NOT EXISTS historico_bloqueios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pessoa_id UUID NOT NULL REFERENCES pessoas(id) ON DELETE CASCADE,
    acao_tipo VARCHAR(20) NOT NULL, -- 'bloqueio', 'desbloqueio'
    justificativa TEXT NOT NULL,
    executado_por_admin_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Inserir Módulos Padrão para novos eventos
CREATE OR REPLACE FUNCTION public.handle_new_event_modules()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO event_modules (evento_id, module_key) VALUES
    (NEW.id, 'checkin_qrcode'),
    (NEW.id, 'checkin_face'),
    (NEW.id, 'checkin_manual'),
    (NEW.id, 'checkout_manual');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_event_created_modules ON eventos;
CREATE TRIGGER on_event_created_modules
    AFTER INSERT ON eventos
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_event_modules();

-- Blindagem Adicional RLS
ALTER TABLE event_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE historico_bloqueios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS master_full_access_modules ON event_modules;
CREATE POLICY master_full_access_modules ON event_modules FOR ALL USING (auth.jwt() ->> 'email' = 'sistemaa2eventos@gmail.com');

DROP POLICY IF EXISTS master_full_access_hist_bloq ON historico_bloqueios;
CREATE POLICY master_full_access_hist_bloq ON historico_bloqueios FOR ALL USING (auth.jwt() ->> 'email' = 'sistemaa2eventos@gmail.com');

-- Inserir Configuração Inicial se não existir
INSERT INTO system_settings (id, theme_neon_enabled) VALUES (1, true) ON CONFLICT (id) DO NOTHING;