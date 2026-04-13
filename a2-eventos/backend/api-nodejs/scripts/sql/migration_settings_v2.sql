-- migration_settings_v2.sql
-- Run this script in your SQL Server / Supabase environment to support the new unified settings.

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('system_settings') AND name = 'telegram_enabled')
BEGIN
    ALTER TABLE system_settings ADD 
        telegram_enabled BIT DEFAULT 0,
        telegram_token NVARCHAR(MAX),
        telegram_chat_id NVARCHAR(MAX),
        smtp_enabled BIT DEFAULT 0,
        smtp_host NVARCHAR(MAX),
        smtp_port INT,
        smtp_email NVARCHAR(MAX),
        smtp_user NVARCHAR(MAX),
        smtp_pass NVARCHAR(MAX),
        wpp_enabled BIT DEFAULT 0,
        wpp_provider NVARCHAR(50),
        wpp_token NVARCHAR(MAX),
        wpp_phone_id NVARCHAR(MAX),
        biometric_sensitivity INT DEFAULT 85,
        liveness_check_enabled BIT DEFAULT 1,
        anti_passback_enabled BIT DEFAULT 0,
        anti_passback_cooldown_min INT DEFAULT 15,
        auto_checkout_timeout_min INT DEFAULT 300,
        capacity_hard_block_enabled BIT DEFAULT 0,
        capacity_vip_bypass BIT DEFAULT 1,
        gamification_enabled BIT DEFAULT 0,
        gamification_points_scan INT DEFAULT 15,
        gamification_points_earlybird INT DEFAULT 50,
        gamification_points_checkin INT DEFAULT 10,
        syslog_retention_edge_days INT DEFAULT 30,
        syslog_retention_admin_days INT DEFAULT 90;
END
GO

-- Garante que existe ao menos um registro de configuração global
IF NOT EXISTS (SELECT 1 FROM system_settings)
BEGIN
    INSERT INTO system_settings (language, theme_neon_enabled) VALUES ('pt-BR', 1);
END
GO
