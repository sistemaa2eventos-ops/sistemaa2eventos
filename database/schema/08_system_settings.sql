-- backend/database/schema/08_system_settings.sql

-- Tabela de configurações globais do sistema
CREATE TABLE IF NOT EXISTS system_settings (
    id SERIAL PRIMARY KEY,
    theme_neon_enabled BOOLEAN DEFAULT true,
    language VARCHAR(10) DEFAULT 'pt-BR',
    biometric_login_enabled BOOLEAN DEFAULT true,
    cloud_sync_enabled BOOLEAN DEFAULT true,
    api_url VARCHAR(255) DEFAULT 'http://localhost:3001/api',
    alert_operator_login BOOLEAN DEFAULT false,
    alert_event_peak BOOLEAN DEFAULT true,
    biometric_sensitivity INTEGER DEFAULT 85,
    liveness_check_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Inserindo um registro de sistema padrao (singleton / ID constante = 1)
INSERT INTO system_settings (id, theme_neon_enabled, language) 
VALUES (1, true, 'pt-BR')
ON CONFLICT (id) DO NOTHING;
