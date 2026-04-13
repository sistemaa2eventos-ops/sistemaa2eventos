-- Migration to add Telegram settings to system_settings
-- Database: SQL Server (A2Eventos)

-- Add columns if they don't exist
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('system_settings') AND name = 'telegram_enabled')
BEGIN
    ALTER TABLE system_settings ADD telegram_enabled BIT DEFAULT 0;
END

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('system_settings') AND name = 'telegram_token')
BEGIN
    ALTER TABLE system_settings ADD telegram_token NVARCHAR(MAX);
END

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('system_settings') AND name = 'telegram_chat_id')
BEGIN
    ALTER TABLE system_settings ADD telegram_chat_id NVARCHAR(100);
END
GO

-- Update existing record (id=1)
UPDATE system_settings 
SET telegram_enabled = 0 
WHERE id = 1 AND telegram_enabled IS NULL;
GO
