-- ===================================================================================
-- MIGRATION: EXTENSÃO DE CONFIGURAÇÕES GLOBAIS (SQL SERVER)
-- Adiciona suporte para SMTP, WhatsApp e Regras de Lotação Avançadas
-- ===================================================================================

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('system_settings') AND name = 'smtp_enabled')
BEGIN
    ALTER TABLE system_settings ADD 
        smtp_enabled BIT DEFAULT 0,
        smtp_host NVARCHAR(200),
        smtp_port INT DEFAULT 465,
        smtp_email NVARCHAR(200),
        smtp_user NVARCHAR(100),
        smtp_pass NVARCHAR(200),
        wpp_enabled BIT DEFAULT 0,
        wpp_provider NVARCHAR(50) DEFAULT 'twilio',
        wpp_token NVARCHAR(MAX),
        wpp_phone_id NVARCHAR(100),
        capacity_vip_bypass BIT DEFAULT 0;
END
GO

-- Garantir que o ID 1 exista para evitar erros no GetSettings
IF NOT EXISTS (SELECT 1 FROM system_settings WHERE id = 1)
BEGIN
    INSERT INTO system_settings (id, language, theme_neon_enabled) VALUES (1, 'pt-BR', 1);
END
GO
