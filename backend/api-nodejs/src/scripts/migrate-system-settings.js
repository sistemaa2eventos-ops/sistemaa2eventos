#!/usr/bin/env node

require('dotenv').config();
const { getConnection } = require('../config/database');
const logger = require('../services/logger');

async function migrate() {
    console.log('\n🚀 ========================================');
    console.log('🚀 MIGRAÇÃO DO BANCO DE DADOS (SPRINT 13)');
    console.log('🚀 ========================================\n');

    try {
        const connection = await getConnection();

        // 0. Criando a tabela base se não existir
        console.log('📋 Verificando e criando a tabela base system_settings...');
        await connection.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[system_settings]') AND type in (N'U'))
            BEGIN
                CREATE TABLE system_settings (
                    id INT PRIMARY KEY,
                    theme_neon_enabled BIT DEFAULT 1,
                    language NVARCHAR(10) DEFAULT 'pt-BR',
                    biometric_login_enabled BIT DEFAULT 1,
                    cloud_sync_enabled BIT DEFAULT 1,
                    api_url NVARCHAR(255) DEFAULT 'http://localhost:3001/api',
                    alert_operator_login BIT DEFAULT 0,
                    alert_event_peak BIT DEFAULT 1,
                    biometric_sensitivity INT DEFAULT 85,
                    liveness_check_enabled BIT DEFAULT 1,
                    created_at DATETIME DEFAULT GETDATE(),
                    updated_at DATETIME
                )
            END
        `);

        // 1. Expandindo a system_settings
        console.log('📋 Expandindo a tabela system_settings...');

        const newColumns = [
            // Credenciamento
            "credenciamento_fields NVARCHAR(MAX) DEFAULT '[]'",
            "credenciamento_auto_approve BIT DEFAULT 1",
            "credenciamento_double_optin BIT DEFAULT 0",

            // Check-in / Acesso
            "anti_passback_enabled BIT DEFAULT 1",
            "anti_passback_cooldown_min INT DEFAULT 15",
            "auto_checkout_timeout_min INT DEFAULT 300",
            "capacity_hard_block_enabled BIT DEFAULT 1",
            "capacity_vip_bypass BIT DEFAULT 0",

            // Veiculos (ANPR)
            "anpr_enabled BIT DEFAULT 0",
            "anpr_endpoint NVARCHAR(255) DEFAULT 'http://localhost:5001'",
            "anpr_confidence_min INT DEFAULT 90",
            "anpr_log_retention_days INT DEFAULT 30",

            // Seguranca
            "jwt_expiration_hours INT DEFAULT 8",
            "force_2fa_admin BIT DEFAULT 1",
            "ddos_shield_enabled BIT DEFAULT 0",

            // Logs
            "syslog_retention_edge_days INT DEFAULT 30",
            "syslog_retention_admin_days INT DEFAULT 90",

            // Comunicacao SMTP
            "smtp_enabled BIT DEFAULT 1",
            "smtp_host NVARCHAR(255) DEFAULT ''",
            "smtp_port INT DEFAULT 465",
            "smtp_email NVARCHAR(255) DEFAULT ''",
            "smtp_user NVARCHAR(255) DEFAULT ''",
            "smtp_pass NVARCHAR(255) DEFAULT ''",

            // Comunicacao WhatsApp
            "wpp_enabled BIT DEFAULT 0",
            "wpp_provider NVARCHAR(50) DEFAULT 'twilio'",
            "wpp_token NVARCHAR(255) DEFAULT ''",
            "wpp_phone_id NVARCHAR(100) DEFAULT ''",

            // Gamificacao
            "gamification_enabled BIT DEFAULT 0",
            "gamification_points_scan INT DEFAULT 15",
            "gamification_points_earlybird INT DEFAULT 50",
            "gamification_points_checkin INT DEFAULT 10"
        ];

        for (const colDef of newColumns) {
            const colName = colDef.split(' ')[0];
            try {
                // Tenta adicionar a coluna
                await connection.request().query(`
                    IF NOT EXISTS (
                        SELECT * FROM sys.columns 
                        WHERE Name = N'${colName}' 
                        AND Object_ID = Object_ID(N'system_settings')
                    )
                    BEGIN
                        ALTER TABLE system_settings ADD ${colDef};
                    END
                `);
            } catch (err) {
                console.error(`⚠️ Erro ao adicionar coluna ${colName}:`, err.message);
            }
        }
        console.log('✅ Tabela system_settings expandida com sucesso.');

        // 2. Criar system_api_keys
        console.log('\n🔑 Criando tabela system_api_keys...');
        await connection.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[system_api_keys]') AND type in (N'U'))
            BEGIN
                CREATE TABLE system_api_keys (
                    id INT IDENTITY(1,1) PRIMARY KEY,
                    name NVARCHAR(100) NOT NULL,
                    token NVARCHAR(255) NOT NULL UNIQUE,
                    expires_at DATETIME,
                    created_at DATETIME DEFAULT GETDATE(),
                    updated_at DATETIME
                )
            END
        `);
        console.log('✅ Tabela system_api_keys pronta.');

        // 3. Criar system_webhooks
        console.log('\n🔗 Criando tabela system_webhooks...');
        await connection.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[system_webhooks]') AND type in (N'U'))
            BEGIN
                CREATE TABLE system_webhooks (
                    id INT IDENTITY(1,1) PRIMARY KEY,
                    trigger_event NVARCHAR(100) NOT NULL,
                    target_url NVARCHAR(MAX) NOT NULL,
                    is_active BIT DEFAULT 1,
                    created_at DATETIME DEFAULT GETDATE(),
                    updated_at DATETIME
                )
            END
        `);
        console.log('✅ Tabela system_webhooks pronta.');

        console.log('\n🎉 MIGRAÇÃO CONCLUÍDA COM SUCESSO!\n');
        process.exit(0);

    } catch (error) {
        console.error('\n❌ ERRO NA MIGRAÇÃO:', error.message);
        process.exit(1);
    }
}

migrate();
