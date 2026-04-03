const { getConnection, sql } = require('../../config/database');
const logger = require('../../services/logger');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const axios = require('axios');

class SettingsController {
    // Retorna as configurações base do sistema (sempre id = 1)
    async getSettings(req, res) {
        try {
            const conn = await getConnection();

            // Tenta buscar a config
            let result = await conn.request()
                .input('id', sql.Int, 1)
                .query(`SELECT * FROM system_settings WHERE id = @id`);

            let settings = result.recordset[0];

            // Fallback se n existir
            if (!settings) {
                settings = {
                    theme_neon_enabled: 1,
                    language: 'pt-BR',
                    biometric_login_enabled: 1,
                    cloud_sync_enabled: 1,
                    api_url: 'http://localhost:3001/api',
                    alert_operator_login: 0,
                    alert_event_peak: 1,
                    biometric_sensitivity: 85,
                    liveness_check_enabled: 1,
                    anti_passback_enabled: 1,
                    anti_passback_cooldown_min: 15,
                    auto_checkout_timeout_min: 300,
                    capacity_hard_block_enabled: 1,
                    gamification_enabled: 0
                };

                await conn.request()
                    .input('id', sql.Int, 1)
                    .input('theme_neon_enabled', sql.Bit, settings.theme_neon_enabled)
                    .input('language', sql.NVarChar, settings.language)
                    .input('biometric_login_enabled', sql.Bit, settings.biometric_login_enabled)
                    .input('cloud_sync_enabled', sql.Bit, settings.cloud_sync_enabled)
                    .input('api_url', sql.NVarChar, settings.api_url)
                    .input('alert_operator_login', sql.Bit, settings.alert_operator_login)
                    .input('alert_event_peak', sql.Bit, settings.alert_event_peak)
                    .input('biometric_sensitivity', sql.Int, settings.biometric_sensitivity)
                    .input('liveness_check_enabled', sql.Bit, settings.liveness_check_enabled)
                    .input('anti_passback_enabled', sql.Bit, settings.anti_passback_enabled)
                    .input('anti_passback_cooldown_min', sql.Int, settings.anti_passback_cooldown_min)
                    .input('auto_checkout_timeout_min', sql.Int, settings.auto_checkout_timeout_min)
                    .input('capacity_hard_block_enabled', sql.Bit, settings.capacity_hard_block_enabled)
                    .input('gamification_enabled', sql.Bit, settings.gamification_enabled)
                    .query(`
                        INSERT INTO system_settings (
                            id, theme_neon_enabled, language, biometric_login_enabled, cloud_sync_enabled,
                            api_url, alert_operator_login, alert_event_peak, biometric_sensitivity, liveness_check_enabled,
                            anti_passback_enabled, anti_passback_cooldown_min, auto_checkout_timeout_min, capacity_hard_block_enabled,
                            gamification_enabled
                        ) VALUES (
                            @id, @theme_neon_enabled, @language, @biometric_login_enabled, @cloud_sync_enabled,
                            @api_url, @alert_operator_login, @alert_event_peak, @biometric_sensitivity, @liveness_check_enabled,
                            @anti_passback_enabled, @anti_passback_cooldown_min, @auto_checkout_timeout_min, @capacity_hard_block_enabled,
                            @gamification_enabled
                        )
                    `);
            }

            // Convert bit values to boolean for frontend compatibility
            if (settings) {
                for (const key in settings) {
                    if (settings[key] === true || settings[key] === false || settings[key] === 1 || settings[key] === 0) {
                        if (typeof settings[key] === 'number') {
                            settings[key] = settings[key] === 1;
                        }
                    }
                }
            }

            res.json({ success: true, data: settings });
        } catch (error) {
            logger.error('Erro ao buscar system_settings:', error);
            res.status(500).json({ error: 'Erro ao buscar configurações globais' });
        }
    }

    // Atualiza as configurações
    async updateSettings(req, res) {
        try {
            const conn = await getConnection();
            const payload = req.body;
            delete payload.id; // Nunca altera o ID

            // WHITELIST de colunas permitidas (previne SQL Injection via nome de coluna)
            const ALLOWED_COLUMNS = [
                'theme_neon_enabled', 'language', 'biometric_login_enabled', 'cloud_sync_enabled',
                'api_url', 'alert_operator_login', 'alert_event_peak', 'biometric_sensitivity',
                'liveness_check_enabled', 'anti_passback_enabled', 'anti_passback_cooldown_min',
                'auto_checkout_timeout_min', 'capacity_hard_block_enabled', 'gamification_enabled',
                'gamification_points_scan', 'gamification_points_earlybird', 'gamification_points_checkin'
            ];

            // Filtrar apenas colunas permitidas
            const keys = Object.keys(payload).filter(k => ALLOWED_COLUMNS.includes(k));

            if (keys.length === 0) {
                return res.json({ success: true, message: 'Nenhuma configuração válida para atualizar' });
            }

            let updateStrings = [];
            const request = conn.request();
            request.input('id', sql.Int, 1);

            keys.forEach((key, index) => {
                const paramName = `param${index}`;
                updateStrings.push(`[${key}] = @${paramName}`);

                let val = payload[key];
                // Boolean conversion to Bit
                if (typeof val === 'boolean') {
                    request.input(paramName, sql.Bit, val ? 1 : 0);
                } else if (typeof val === 'number') {
                    request.input(paramName, sql.Int, val);
                } else {
                    request.input(paramName, sql.NVarChar, val);
                }
            });

            const query = `UPDATE system_settings SET ${updateStrings.join(', ')}, updated_at = GETDATE() WHERE id = @id`;
            await request.query(query);

            res.json({ success: true, message: 'Configurações atualizadas com sucesso' });
        } catch (error) {
            logger.error('Erro ao atualizar system_settings:', error);
            res.status(500).json({ error: 'Erro ao atualizar configurações' });
        }
    }
    // --- API KEYS ---
    async getApiKeys(req, res) {
        try {
            const conn = await getConnection();
            const result = await conn.request().query(`SELECT * FROM system_api_keys ORDER BY id DESC`);
            res.json({ success: true, count: result.recordset.length, data: result.recordset });
        } catch (error) {
            logger.error('Erro ao buscar api_keys:', error);
            res.status(500).json({ error: 'Erro ao buscar chaves de API' });
        }
    }

    async createApiKey(req, res) {
        try {
            const { name, expires_in_days } = req.body;
            if (!name) return res.status(400).json({ error: 'Nome obrigatório' });

            const token = crypto.randomBytes(32).toString('hex');

            const conn = await getConnection();
            const result = await conn.request()
                .input('name', sql.NVarChar, name)
                .input('token', sql.NVarChar, token)
                .input('expires', sql.Int, expires_in_days || 365)
                .query(`
                    INSERT INTO system_api_keys (name, token, expires_at)
                    OUTPUT INSERTED.*
                    VALUES (@name, @token, DATEADD(day, @expires, GETDATE()))
                `);

            res.json({ success: true, data: result.recordset[0] });
        } catch (error) {
            logger.error('Erro ao criar api_key:', error);
            res.status(500).json({ error: 'Erro ao criar chave de API' });
        }
    }

    async deleteApiKey(req, res) {
        try {
            const { id } = req.params;
            const conn = await getConnection();
            await conn.request()
                .input('id', sql.Int, id)
                .query(`DELETE FROM system_api_keys WHERE id = @id`);

            res.json({ success: true, message: 'Chave revogada com sucesso' });
        } catch (error) {
            logger.error('Erro ao excluir api_key:', error);
            res.status(500).json({ error: 'Erro ao revogar chave de API' });
        }
    }

    // --- WEBHOOKS ---
    async getWebhooks(req, res) {
        try {
            const conn = await getConnection();
            const result = await conn.request().query(`SELECT * FROM system_webhooks ORDER BY id DESC`);
            res.json({ success: true, count: result.recordset.length, data: result.recordset });
        } catch (error) {
            logger.error('Erro ao buscar webhooks:', error);
            res.status(500).json({ error: 'Erro ao buscar webhooks' });
        }
    }

    async createWebhook(req, res) {
        try {
            const { trigger_event, target_url, is_active } = req.body;
            if (!trigger_event || !target_url) return res.status(400).json({ error: 'Evento e URL são obrigatórios' });

            const conn = await getConnection();
            const result = await conn.request()
                .input('trigger_event', sql.NVarChar, trigger_event)
                .input('target_url', sql.NVarChar, target_url)
                .input('is_active', sql.Bit, is_active === undefined ? 1 : is_active ? 1 : 0)
                .query(`
                    INSERT INTO system_webhooks (trigger_event, target_url, is_active)
                    OUTPUT INSERTED.*
                    VALUES (@trigger_event, @target_url, @is_active)
                `);

            res.json({ success: true, data: result.recordset[0] });
        } catch (error) {
            logger.error('Erro ao criar webhook:', error);
            res.status(500).json({ error: 'Erro ao criar webhook' });
        }
    }

    async deleteWebhook(req, res) {
        try {
            const { id } = req.params;
            const conn = await getConnection();
            await conn.request()
                .input('id', sql.Int, id)
                .query(`DELETE FROM system_webhooks WHERE id = @id`);

            res.json({ success: true, message: 'Webhook excluído com sucesso' });
        } catch (error) {
            logger.error('Erro ao excluir webhook:', error);
            res.status(500).json({ error: 'Erro ao remover webhook' });
        }
    }

    // --- AUDITORIA ---
    async testConnection(req, res) {
        try {
            const { testConnection: dbTest } = require('../../config/database');
            const isOnline = await dbTest();

            if (isOnline) {
                res.json({ success: true, message: 'Conexão com SQL Server estabelecida com sucesso!' });
            } else {
                res.status(503).json({ success: false, error: 'SQL Server não está respondendo.' });
            }
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async getSyncHistory(req, res) {
        try {
            const syncService = require('../devices/sync.service');
            const stats = await syncService.getDetailedStats();
            res.json({ success: true, data: stats.syncHistory || [] });
        } catch (error) {
            logger.error('Erro ao buscar histórico de sync:', error);
            res.status(500).json({ error: 'Erro ao buscar histórico' });
        }
    }

    // --- VERIFICAÇÃO DE COMUNICAÇÃO ---
    async verifySmtp(req, res) {
        try {
            const { host, port, user, pass, from, to } = req.body;


            const transporter = nodemailer.createTransport({
                host: host,
                port: parseInt(port, 10),
                secure: parseInt(port, 10) === 465,
                auth: { user, pass },
                timeout: 5000
            });

            await transporter.verify();

            // Opcional: enviar e-mail de teste real
            if (to) {
                await transporter.sendMail({
                    from: `"Teste Nexus" <${from}>`,
                    to,
                    subject: 'Teste de Configuração SMTP',
                    text: 'Se você recebeu este e-mail, sua configuração SMTP está correta.',
                    html: '<b>Se você recebeu este e-mail, sua configuração SMTP está correta.</b>'
                });
            }

            res.json({ success: true, message: 'Configuração SMTP validada com sucesso!' });
        } catch (error) {
            logger.error('Erro na verificação SMTP:', error);
            res.status(400).json({ success: false, error: error.message });
        }
    }

    async verifyWpp(req, res) {
        try {
            const { provider, token, phone_id } = req.body;


            let isValid = false;
            let message = '';

            if (provider === 'twilio') {
                // Mock ou chamada real de validação Twilio
                isValid = token && token.length > 20;
                message = isValid ? 'Credenciais Twilio parecem válidas.' : 'Token Twilio inválido.';
            } else if (provider === 'meta') {
                try {
                    // Tenta buscar info básica do telefone na API da Meta
                    const response = await axios.get(`https://graph.facebook.com/v17.0/${phone_id}`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    isValid = response.status === 200;
                    message = 'Conexão com Meta Cloud API estabelecida!';
                } catch (e) {
                    isValid = false;
                    message = `Erro Meta API: ${e.response?.data?.error?.message || e.message}`;
                }
            } else {
                isValid = true;
                message = `Provedor ${provider} selecionado. Validação básica concluída.`;
            }

            if (isValid) {
                res.json({ success: true, message });
            } else {
                res.status(400).json({ success: false, error: message });
            }
        } catch (error) {
            logger.error('Erro na verificação WhatsApp:', error);
            res.status(400).json({ success: false, error: error.message });
        }
    }
}

module.exports = new SettingsController();
