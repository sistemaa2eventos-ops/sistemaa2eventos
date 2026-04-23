-- ===================================================================================
-- SPRINT 16: IAM & ECM EXPANSION (8-Tier Profiles & Document Management)
-- Date: 2026-02-24
-- ===================================================================================

-- 1. IAM (Identity and Access Management) Tables
CREATE TABLE IF NOT EXISTS sys_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome VARCHAR(50) NOT NULL UNIQUE,
    descricao TEXT,
    is_system_role BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sys_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recurso VARCHAR(100) NOT NULL, -- ex: 'pessoas', 'devices', 'reports', 'documentos'
    acao VARCHAR(50) NOT NULL,     -- ex: 'ler', 'criar', 'editar', 'excluir', 'aprovar'
    escopo VARCHAR(50) DEFAULT 'evento', -- ex: 'global', 'evento', 'empresa'
    descricao TEXT,
    UNIQUE(recurso, acao)
);

CREATE TABLE IF NOT EXISTS sys_role_permissions (
    role_id UUID REFERENCES sys_roles(id) ON DELETE CASCADE,
    permission_id UUID REFERENCES sys_permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (role_id, permission_id)
);

-- Seed Initial Roles (8-Tiers)
INSERT INTO sys_roles (nome, descricao, is_system_role) VALUES
    ('master', 'Top-level. Visualiza e opera configurações críticas multiplataforma.', true),
    ('admin', 'Administrador técnico de tenant. Possui acesso total dentro dos limites visuais do seu ambiente.', true),
    ('supervisor', 'Gerente tático. Visualiza reports analíticos, gerencia dados (pessoas/empresas/veículos), opera portaria.', true),
    ('op_atendimento', 'Agente final de credenciamento. Gerencia dados e roda terminais de Check-in/Check-out.', true),
    ('op_monitoramento', 'Agente de "Control Room". Roda terminais de monitoramento e reports.', true),
    ('op_analista', 'Agente de validação. Gerenciamento, aprovação/reprovação de documentos e dados.', true),
    ('cliente', 'Acesso via link. Visualização e impressão tickets/QR Code.', true),
    ('empresa', 'Acesso restrito a inserção de colaboradores e fluxos de aprovação documental.', true)
ON CONFLICT (nome) DO NOTHING;

-- Seed Basic Permissions Space (To build the policy engine later)
INSERT INTO sys_permissions (recurso, acao, escopo, descricao) VALUES 
    ('documentos', 'aprovar', 'evento', 'Permite aprovar e rejeitar PDFs de NRs e ASOs na auditoria documental.'),
    ('documentos', 'submeter', 'empresa', 'Permite fazer upload de arquivos da própria empresa.'),
    ('reports', 'ler', 'evento', 'Permite visualizar gráficos logísticos de lotação.'),
    ('portaria', 'operar', 'evento', 'Acesso à página física de Check-in / Checkout para biometria e barras.')
ON CONFLICT (recurso, acao) DO NOTHING;

-- ===================================================================================
-- 2. ECM (Enterprise Content Management) & Entities Extension
-- ===================================================================================

-- Extending Empresas
ALTER TABLE empresas 
    ADD COLUMN IF NOT EXISTS cnpj VARCHAR(20),
    ADD COLUMN IF NOT EXISTS tipo_operacao VARCHAR(100),
    ADD COLUMN IF NOT EXISTS responsavel_legal VARCHAR(150),
    ADD COLUMN IF NOT EXISTS email_convite VARCHAR(255);

CREATE TABLE IF NOT EXISTS empresa_documentos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE,
    titulo VARCHAR(255) NOT NULL,
    tipo_doc VARCHAR(100) NOT NULL, -- ex: 'Contrato', 'Alvara'
    status VARCHAR(50) DEFAULT 'pendente', -- pendente, aprovado, rejeitado
    url_arquivo TEXT NOT NULL,
    data_inclusao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    data_revisao TIMESTAMP WITH TIME ZONE,
    revisado_por_user_id TEXT, -- Who approved/rejected it
    notas_auditoria TEXT
);

-- Extending Pessoas (Working Contexts)
ALTER TABLE pessoas
    ADD COLUMN IF NOT EXISTS passaporte VARCHAR(50),
    ADD COLUMN IF NOT EXISTS telefone VARCHAR(30),
    ADD COLUMN IF NOT EXISTS funcao VARCHAR(100),
    ADD COLUMN IF NOT EXISTS trabalho_area_tecnica BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS trabalho_altura BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS nome_credencial VARCHAR(100),
    ADD COLUMN IF NOT EXISTS pagamento_validado BOOLEAN DEFAULT false;

CREATE TABLE IF NOT EXISTS pessoa_documentos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pessoa_id UUID REFERENCES pessoas(id) ON DELETE CASCADE,
    titulo VARCHAR(255) NOT NULL,
    tipo_doc VARCHAR(50) NOT NULL, -- 'RG_CNH_PASSPORT', 'NR01', 'NR07_ASO', 'NR06_EPI', 'CONTRATO', 'TREINAMENTOS'
    status VARCHAR(50) DEFAULT 'pendente', -- pendente, aprovado, rejeitado
    url_arquivo TEXT NOT NULL,
    data_inclusao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    data_revisao TIMESTAMP WITH TIME ZONE,
    revisado_por_user_id TEXT, -- Who approved/rejected it
    notas_auditoria TEXT
);

-- Adicionar FK de "sys_roles" a "usuarios" no ambiente ideal. Por agora, a app node usará o claim direto no users JSON.
-- Create RLS Enablers for Portals
ALTER TABLE empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE pessoas ENABLE ROW LEVEL SECURITY;

-- Note: Actual RLS policies will be applied from the NodeJS backend depending on the JWT token decoding.
