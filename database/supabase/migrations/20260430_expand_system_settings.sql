-- ============================================================================
-- Migration: 20260430_expand_system_settings.sql
-- Purpose: Add all missing columns to system_settings table
-- Root cause: Controller tries to upsert columns that don't exist → 500 error
-- ============================================================================

ALTER TABLE public.system_settings
    ADD COLUMN IF NOT EXISTS system_name         VARCHAR(200) DEFAULT 'NZT Eventos',
    ADD COLUMN IF NOT EXISTS logo_url            TEXT,
    ADD COLUMN IF NOT EXISTS alert_peak_threshold INTEGER DEFAULT 90,
    ADD COLUMN IF NOT EXISTS biometric_confidence INTEGER DEFAULT 75,
    ADD COLUMN IF NOT EXISTS biometric_confianca_baixa INTEGER DEFAULT 60,
    ADD COLUMN IF NOT EXISTS jwt_expiry          VARCHAR(20) DEFAULT '8h',
    ADD COLUMN IF NOT EXISTS cron_reset_hora     VARCHAR(10) DEFAULT '03:00',
    ADD COLUMN IF NOT EXISTS cron_relatorio_hora VARCHAR(10) DEFAULT '03:30',
    ADD COLUMN IF NOT EXISTS log_retention_days  INTEGER DEFAULT 90,
    ADD COLUMN IF NOT EXISTS config              JSONB DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS checkin_cooldown_min INTEGER DEFAULT 15,
    ADD COLUMN IF NOT EXISTS allow_offhour_checkin BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS block_unauthorized_days BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS cooldown_pulseira   INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS horario_inicio      TIME,
    ADD COLUMN IF NOT EXISTS horario_fim         TIME,
    -- SMTP
    ADD COLUMN IF NOT EXISTS smtp_enabled        BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS smtp_host           VARCHAR(200),
    ADD COLUMN IF NOT EXISTS smtp_port           INTEGER DEFAULT 587,
    ADD COLUMN IF NOT EXISTS smtp_email          VARCHAR(200),
    ADD COLUMN IF NOT EXISTS smtp_user           VARCHAR(200),
    ADD COLUMN IF NOT EXISTS smtp_pass           TEXT,
    -- WhatsApp
    ADD COLUMN IF NOT EXISTS wpp_enabled         BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS wpp_provider        VARCHAR(50) DEFAULT 'twilio',
    ADD COLUMN IF NOT EXISTS wpp_token           TEXT,
    ADD COLUMN IF NOT EXISTS wpp_phone_id        VARCHAR(100),
    -- Segurança / Senha
    ADD COLUMN IF NOT EXISTS password_min_length      INTEGER DEFAULT 8,
    ADD COLUMN IF NOT EXISTS password_require_uppercase BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS password_require_number   BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS password_require_special  BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS password_expiry_days      INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS require_2fa_admin_master  BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS require_2fa_operators     BOOLEAN DEFAULT false;
