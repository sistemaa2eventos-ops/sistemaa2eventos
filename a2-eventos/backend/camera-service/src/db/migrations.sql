-- ============================================
-- A2 EVENTOS - MÓDULO CÂMERAS - MIGRATIONS
-- Executar no Supabase SQL Editor
-- ============================================

-- ============================================
-- 001: EXTENSÃO PGVECTOR (Se não existir)
-- ============================================
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- 002: TABELA camera_face_embeddings
-- Armazena embeddings faciais 512-dim por CPF
-- ============================================
CREATE TABLE IF NOT EXISTS camera_face_embeddings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cpf VARCHAR(14) NOT NULL,
    nome VARCHAR(200),
    embedding VECTOR(512) NOT NULL,
    foto_url TEXT,
    qualidade_score DECIMAL(5,4) DEFAULT 0,
    ativo BOOLEAN DEFAULT true,
    cadastrado_por UUID REFERENCES auth.users(id),
    evento_id UUID REFERENCES eventos(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(cpf)
);

-- Índice HNSW para busca por similaridade (cosine distance)
CREATE INDEX IF NOT EXISTS idx_face_embedding_hnsw
    ON camera_face_embeddings USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- Índice para busca por CPF
CREATE INDEX IF NOT EXISTS idx_face_cpf ON camera_face_embeddings(cpf);

-- Índice por evento
CREATE INDEX IF NOT EXISTS idx_face_evento ON camera_face_embeddings(evento_id);

COMMENT ON TABLE camera_face_embeddings IS 'Armazena embeddings faciais (512-dim) para reconhecimento via câmera';
COMMENT ON COLUMN camera_face_embeddings.embedding IS 'Vetor 512-dim normalizado do InsightFace Buffalo_L';
COMMENT ON COLUMN camera_face_embeddings.qualidade_score IS 'Pontuação de qualidade da foto (0-1), baseada no Laplaciano';

-- ============================================
-- 003: TABELA camera_watchlist_cpf
-- Lista de CPFs em vigilância
-- ============================================
CREATE TABLE IF NOT EXISTS camera_watchlist_cpf (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cpf VARCHAR(14) NOT NULL UNIQUE,
    nome VARCHAR(200),
    motivo TEXT,
    nivel_alerta VARCHAR(20) DEFAULT 'medio'
        CHECK (nivel_alerta IN ('baixo', 'medio', 'alto', 'critico')),
    ativo BOOLEAN DEFAULT true,
    criado_por UUID REFERENCES auth.users(id),
    evento_id UUID REFERENCES eventos(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_watchlist_cpf ON camera_watchlist_cpf(cpf);
CREATE INDEX IF NOT EXISTS idx_watchlist_cpf_evento ON camera_watchlist_cpf(evento_id);

COMMENT ON TABLE camera_watchlist_cpf IS 'Lista de CPFs em vigilância - alertas especiais quando detectados';

-- ============================================
-- 004: TABELA camera_watchlist_placa
-- Lista de placas em vigilância
-- ============================================
CREATE TABLE IF NOT EXISTS camera_watchlist_placa (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    placa VARCHAR(10) NOT NULL UNIQUE,
    proprietario_nome VARCHAR(200),
    motivo TEXT,
    nivel_alerta VARCHAR(20) DEFAULT 'medio'
        CHECK (nivel_alerta IN ('baixo', 'medio', 'alto', 'critico')),
    ativo BOOLEAN DEFAULT true,
    criado_por UUID REFERENCES auth.users(id),
    evento_id UUID REFERENCES eventos(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_watchlist_placa ON camera_watchlist_placa(placa);
CREATE INDEX IF NOT EXISTS idx_watchlist_placa_evento ON camera_watchlist_placa(evento_id);

COMMENT ON TABLE camera_watchlist_placa IS 'Lista de placas em vigilância - alertas especiais quando detectadas';

-- ============================================
-- 005: TABELA camera_devices
-- Dispositivos de câmera (espelho cameras_ip)
-- ============================================
CREATE TABLE IF NOT EXISTS camera_devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome VARCHAR(100) NOT NULL,
    localizacao VARCHAR(200),
    tipo VARCHAR(20) DEFAULT 'face'
        CHECK (tipo IN ('face', 'plate', 'both')),
    url_rtsp TEXT,
    ip_address VARCHAR(50),
    porta INTEGER DEFAULT 554,
    fabricante VARCHAR(50),
    usuario VARCHAR(100),
    senha VARCHAR(200),
    resolucao_width INTEGER DEFAULT 1280,
    resolucao_height INTEGER DEFAULT 720,
    fps INTEGER DEFAULT 30,
    ativo BOOLEAN DEFAULT true,
    evento_id UUID REFERENCES eventos(id) ON DELETE CASCADE,
    last_seen TIMESTAMP,
    status VARCHAR(20) DEFAULT 'offline'
        CHECK (status IN ('online', 'offline', 'error')),
    metadata JSONB DEFAULT '{}',
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_camera_devices_evento ON camera_devices(evento_id);
CREATE INDEX IF NOT EXISTS idx_camera_devices_status ON camera_devices(status);
CREATE INDEX IF NOT EXISTS idx_camera_devices_ativo ON camera_devices(ativo);

COMMENT ON TABLE camera_devices IS 'Dispositivos de câmera para monitoramento';
COMMENT ON COLUMN camera_devices.tipo IS 'Tipo de detecção: face, plate, ou both';

-- ============================================
-- 006: TABELA camera_detections
-- Log de detecções (faces e placas)
-- ============================================
CREATE TABLE IF NOT EXISTS camera_detections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    camera_id UUID REFERENCES camera_devices(id) ON DELETE SET NULL,
    tipo VARCHAR(20) NOT NULL
        CHECK (tipo IN ('face', 'plate')),
    pessoa_id UUID REFERENCES pessoas(id) ON DELETE SET NULL,
    veiculo_id UUID REFERENCES veiculos(id) ON DELETE SET NULL,
    embedding_id UUID REFERENCES camera_face_embeddings(id) ON DELETE SET NULL,
    cpf_detectado VARCHAR(14),
    nome_detectado VARCHAR(200),
    placa_detectada VARCHAR(10),
    snapshot_url TEXT,
    localizacao VARCHAR(200),
    confianca DECIMAL(5,4),
    is_watchlist BOOLEAN DEFAULT false,
    is_authorized BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}',
    evento_id UUID REFERENCES eventos(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_detections_camera ON camera_detections(camera_id);
CREATE INDEX IF NOT EXISTS idx_detections_evento ON camera_detections(evento_id);
CREATE INDEX IF NOT EXISTS idx_detections_data ON camera_detections(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_detections_cpf ON camera_detections(cpf_detectado);
CREATE INDEX IF NOT EXISTS idx_detections_placa ON camera_detections(placa_detectada);
CREATE INDEX IF NOT EXISTS idx_detections_watchlist ON camera_detections(is_watchlist) WHERE is_watchlist = true;

COMMENT ON TABLE camera_detections IS 'Log de detecções de faces e placas via câmera';

-- ============================================
-- 007: TABELA camera_known_plates
-- Placas autorizadas cadastradas
-- ============================================
CREATE TABLE IF NOT EXISTS camera_known_plates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    placa VARCHAR(10) NOT NULL UNIQUE,
    proprietario_nome VARCHAR(200),
    proprietario_id UUID REFERENCES pessoas(id) ON DELETE SET NULL,
    veiculo_modelo VARCHAR(100),
    veiculo_cor VARCHAR(50),
    autorizado BOOLEAN DEFAULT true,
    evento_id UUID REFERENCES eventos(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_known_plates_evento ON camera_known_plates(evento_id);
CREATE INDEX IF NOT EXISTS idx_known_plates_autorizado ON camera_known_plates(autorizado);

COMMENT ON TABLE camera_known_plates IS 'Placas de veículos autorizadas para reconhecimento';

-- ============================================
-- 008: TABELA camera_settings
-- Configurações do módulo
-- ============================================
CREATE TABLE IF NOT EXISTS camera_settings (
    id INTEGER PRIMARY KEY DEFAULT 1,
    face_tolerance DECIMAL(3,2) DEFAULT 0.60,
    min_face_size INTEGER DEFAULT 150,
    confidence_threshold DECIMAL(3,2) DEFAULT 0.65,
    frame_skip INTEGER DEFAULT 3,
    plate_tolerance DECIMAL(3,2) DEFAULT 0.85,
    enable_face_detection BOOLEAN DEFAULT true,
    enable_plate_detection BOOLEAN DEFAULT true,
    enable_watchlist_alerts BOOLEAN DEFAULT true,
    snapshot_quality INTEGER DEFAULT 80,
    snapshot_max_width INTEGER DEFAULT 800,
    webhook_url TEXT,
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT single_row CHECK (id = 1)
);

INSERT INTO camera_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 009: HABILITAR RLS EM TODAS AS TABELAS
-- ============================================
ALTER TABLE camera_face_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE camera_watchlist_cpf ENABLE ROW LEVEL SECURITY;
ALTER TABLE camera_watchlist_placa ENABLE ROW LEVEL SECURITY;
ALTER TABLE camera_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE camera_detections ENABLE ROW LEVEL SECURITY;
ALTER TABLE camera_known_plates ENABLE ROW LEVEL SECURITY;
ALTER TABLE camera_settings ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 010: POLÍTICAS RLS
-- Master tem acesso total
-- Staff tem acesso ao próprio evento
-- Service role tem acesso total (para o microsserviço)
-- ============================================

-- camera_face_embeddings
DROP POLICY IF EXISTS master_rls_face ON camera_face_embeddings;
DROP POLICY IF EXISTS staff_rls_face ON camera_face_embeddings;
DROP POLICY IF EXISTS service_rls_face ON camera_face_embeddings;
CREATE POLICY master_rls_face ON camera_face_embeddings FOR ALL
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY staff_rls_face ON camera_face_embeddings FOR ALL
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador')
           AND (evento_id IS NULL OR evento_id::text = (auth.jwt() -> 'app_metadata' ->> 'evento_id')));
CREATE POLICY service_rls_face ON camera_face_embeddings FOR ALL
    USING ((auth.jwt() ->> 'role') = 'service_role');

-- camera_watchlist_cpf
DROP POLICY IF EXISTS master_rls_wc ON camera_watchlist_cpf;
DROP POLICY IF EXISTS staff_rls_wc ON camera_watchlist_cpf;
DROP POLICY IF EXISTS service_rls_wc ON camera_watchlist_cpf;
CREATE POLICY master_rls_wc ON camera_watchlist_cpf FOR ALL
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY staff_rls_wc ON camera_watchlist_cpf FOR ALL
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador')
           AND (evento_id IS NULL OR evento_id::text = (auth.jwt() -> 'app_metadata' ->> 'evento_id')));
CREATE POLICY service_rls_wc ON camera_watchlist_cpf FOR ALL
    USING ((auth.jwt() ->> 'role') = 'service_role');

-- camera_watchlist_placa
DROP POLICY IF EXISTS master_rls_wp ON camera_watchlist_placa;
DROP POLICY IF EXISTS staff_rls_wp ON camera_watchlist_placa;
DROP POLICY IF EXISTS service_rls_wp ON camera_watchlist_placa;
CREATE POLICY master_rls_wp ON camera_watchlist_placa FOR ALL
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY staff_rls_wp ON camera_watchlist_placa FOR ALL
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador')
           AND (evento_id IS NULL OR evento_id::text = (auth.jwt() -> 'app_metadata' ->> 'evento_id')));
CREATE POLICY service_rls_wp ON camera_watchlist_placa FOR ALL
    USING ((auth.jwt() ->> 'role') = 'service_role');

-- camera_devices
DROP POLICY IF EXISTS master_rls_devices ON camera_devices;
DROP POLICY IF EXISTS staff_rls_devices ON camera_devices;
DROP POLICY IF EXISTS service_rls_devices ON camera_devices;
CREATE POLICY master_rls_devices ON camera_devices FOR ALL
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY staff_rls_devices ON camera_devices FOR ALL
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador')
           AND (evento_id IS NULL OR evento_id::text = (auth.jwt() -> 'app_metadata' ->> 'evento_id')));
CREATE POLICY service_rls_devices ON camera_devices FOR ALL
    USING ((auth.jwt() ->> 'role') = 'service_role');

-- camera_detections
DROP POLICY IF EXISTS master_rls_detections ON camera_detections;
DROP POLICY IF EXISTS staff_rls_detections ON camera_detections;
DROP POLICY IF EXISTS service_rls_detections ON camera_detections;
CREATE POLICY master_rls_detections ON camera_detections FOR ALL
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY staff_rls_detections ON camera_detections FOR ALL
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador')
           AND (evento_id IS NULL OR evento_id::text = (auth.jwt() -> 'app_metadata' ->> 'evento_id')));
CREATE POLICY service_rls_detections ON camera_detections FOR ALL
    USING ((auth.jwt() ->> 'role') = 'service_role');

-- camera_known_plates
DROP POLICY IF EXISTS master_rls_plates ON camera_known_plates;
DROP POLICY IF EXISTS staff_rls_plates ON camera_known_plates;
DROP POLICY IF EXISTS service_rls_plates ON camera_known_plates;
CREATE POLICY master_rls_plates ON camera_known_plates FOR ALL
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY staff_rls_plates ON camera_known_plates FOR ALL
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador')
           AND (evento_id IS NULL OR evento_id::text = (auth.jwt() -> 'app_metadata' ->> 'evento_id')));
CREATE POLICY service_rls_plates ON camera_known_plates FOR ALL
    USING ((auth.jwt() ->> 'role') = 'service_role');

-- camera_settings (apenas master e service)
DROP POLICY IF EXISTS master_rls_settings ON camera_settings;
DROP POLICY IF EXISTS service_rls_settings ON camera_settings;
CREATE POLICY master_rls_settings ON camera_settings FOR ALL
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY service_rls_settings ON camera_settings FOR ALL
    USING ((auth.jwt() ->> 'role') = 'service_role');

-- ============================================
-- 011: TRIGGER UPDATED_AT
-- ============================================
CREATE OR REPLACE FUNCTION camera_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_face_embeddings_updated ON camera_face_embeddings;
CREATE TRIGGER trg_face_embeddings_updated BEFORE UPDATE ON camera_face_embeddings
    FOR EACH ROW EXECUTE FUNCTION camera_update_updated_at();

DROP TRIGGER IF EXISTS trg_watchlist_cpf_updated ON camera_watchlist_cpf;
CREATE TRIGGER trg_watchlist_cpf_updated BEFORE UPDATE ON camera_watchlist_cpf
    FOR EACH ROW EXECUTE FUNCTION camera_update_updated_at();

DROP TRIGGER IF EXISTS trg_watchlist_placa_updated ON camera_watchlist_placa;
CREATE TRIGGER trg_watchlist_placa_updated BEFORE UPDATE ON camera_watchlist_placa
    FOR EACH ROW EXECUTE FUNCTION camera_update_updated_at();

DROP TRIGGER IF EXISTS trg_camera_devices_updated ON camera_devices;
CREATE TRIGGER trg_camera_devices_updated BEFORE UPDATE ON camera_devices
    FOR EACH ROW EXECUTE FUNCTION camera_update_updated_at();

DROP TRIGGER IF EXISTS trg_known_plates_updated ON camera_known_plates;
CREATE TRIGGER trg_known_plates_updated BEFORE UPDATE ON camera_known_plates
    FOR EACH ROW EXECUTE FUNCTION camera_update_updated_at();

DROP TRIGGER IF EXISTS trg_settings_updated ON camera_settings;
CREATE TRIGGER trg_settings_updated BEFORE UPDATE ON camera_settings
    FOR EACH ROW EXECUTE FUNCTION camera_update_updated_at();

-- ============================================
-- VERIFICAÇÃO FINAL
-- ============================================
SELECT
    '✅ MÓDULO CÂMERAS CRIADO!' AS status,
    (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'camera_%') AS tabelas_camera,
    (SELECT COUNT(*) FROM pg_indexes WHERE tablename LIKE 'camera_%' AND indexname LIKE '%embedding%') AS indices_vector;