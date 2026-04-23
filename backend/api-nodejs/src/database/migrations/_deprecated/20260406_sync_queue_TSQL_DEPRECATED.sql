-- Migration 20260406_sync_queue: Fila de Sincronização de Dispositivos (Outbox Hardening)
-- Descrição: Permite o envio resiliente de faces/usuários para catracas offline.

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'terminal_sync_queue')
BEGIN
    CREATE TABLE terminal_sync_queue (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        dispositivo_id UNIQUEIDENTIFIER NOT NULL, -- O terminal de destino
        tipo_comando VARCHAR(50) NOT NULL, -- 'enroll_face', 'delete_face', 'open_door', 'set_config'
        payload NVARCHAR(MAX) NOT NULL, -- JSON com dados do comando
        attempt_count INT DEFAULT 0,
        last_attempt DATETIME,
        status VARCHAR(20) DEFAULT 'pendente', -- 'pendente', 'processando', 'erro', 'sucesso'
        error_message NVARCHAR(MAX),
        created_at DATETIME DEFAULT GETDATE(),
        updated_at DATETIME DEFAULT GETDATE(),

        CONSTRAINT FK_Sync_Dispositivo FOREIGN KEY (dispositivo_id) 
            REFERENCES dispositivos_acesso(id) ON DELETE CASCADE
    );
    CREATE INDEX IX_Sync_Status ON terminal_sync_queue(status, dispositivo_id);
    PRINT '✅ Tabela terminal_sync_queue criada com sucesso.';
END
ELSE
BEGIN
    PRINT '⚠️ Tabela terminal_sync_queue já existe.';
END
GO

-- Garantir que a tabela de Pessoas tenha o sync_id exposto se necessário
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE name = 'sync_id' AND object_id = OBJECT_ID('pessoas'))
BEGIN
    ALTER TABLE pessoas ADD sync_id UNIQUEIDENTIFIER;
    PRINT '✅ Coluna sync_id adicionada em pessoas.';
END
GO
