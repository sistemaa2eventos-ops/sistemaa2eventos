const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');
const crypto = require('crypto');

// ── Whitelist de campos permitidos para system_settings (previne mass-assignment)
const SETTINGS_ALLOWED_FIELDS = [
    'system_name', 'theme_neon_enabled', 'language',
    'biometric_login_enabled', 'cloud_sync_enabled', 'api_url',
    'alert_operator_login', 'alert_event_peak', 'alert_peak_threshold',
    'biometric_sensitivity', 'liveness_check_enabled',
    'anti_passback_enabled', 'checkin_cooldown_min',
    'biometric_confidence', 'biometric_confianca_baixa',
    'jwt_expiry', 'cron_reset_hora', 'cron_relatorio_hora',
    'log_retention_days', 'logo_url', 'config',
    // SMTP
    'smtp_enabled', 'smtp_host', 'smtp_port', 'smtp_email', 'smtp_user', 'smtp_pass',
    // WhatsApp
    'wpp_enabled', 'wpp_provider', 'wpp_token', 'wpp_phone_id',
    // Segurança
    'password_min_length', 'password_require_uppercase', 'password_require_number',
    'password_require_special', 'password_expiry_days',
    'require_2fa_admin_master', 'require_2fa_operators',
    // Checkin
    'horario_inicio', 'horario_fim', 'allow_offhour_checkin',
    'block_unauthorized_days', 'cooldown_pulseira'
];

/** Extrai apenas campos permitidos do payload */
function pickAllowed(body, allowedFields) {
    const result = {};
    for (const field of allowedFields) {
        if (body[field] !== undefined) {
            result[field] = body[field];
        }
    }
    return result;
}

class SettingsController {
    // Retorna as configurações base do sistema (sempre id = 1)
    async getSettings(req, res) {
        try {
            const { data, error } = await supabase
                .from('system_settings')
                .select('*')
                .eq('id', 1)
                .maybeSingle();

            if (error) throw error;

            // Fallback se não existir no banco ainda
            let settings = data;
            if (!settings) {
                settings = {
                    id: 1,
                    system_name: 'NZT Eventos',
                    theme_neon_enabled: true,
                    language: 'pt-BR',
                    biometric_login_enabled: true,
                    cloud_sync_enabled: true,
                    api_url: process.env.API_URL ? `${process.env.API_URL}/api` : 'http://localhost:3001/api',
                    alert_operator_login: false,
                    alert_event_peak: true,
                    biometric_sensitivity: 85,
                    liveness_check_enabled: true,
                    anti_passback_enabled: true,
                    checkin_cooldown_min: 15,
                    biometric_confidence: 75,
                    jwt_expiry: '8h',
                    cron_reset_hora: '03:00',
                    cron_relatorio_hora: '03:30',
                    log_retention_days: 90,
                    config: {}
                };
            }

            res.json({ success: true, data: settings });
        } catch (error) {
            logger.error('Erro ao buscar system_settings no Supabase:', error);
            res.status(500).json({ error: 'Erro ao buscar configurações globais' });
        }
    }

    // Atualiza as configurações (com whitelist de campos)
    async updateSettings(req, res) {
        try {
            const payload = pickAllowed(req.body, SETTINGS_ALLOWED_FIELDS);

            if (Object.keys(payload).length === 0) {
                return res.status(400).json({ error: 'Nenhum campo válido para atualizar' });
            }

            const { data, error } = await supabase
                .from('system_settings')
                .upsert({ id: 1, ...payload, updated_at: new Date() })
                .select()
                .single();

            if (error) throw error;

            res.json({ success: true, message: 'Configurações atualizadas com sucesso', data });
        } catch (error) {
            logger.error('Erro ao atualizar system_settings no Supabase:', error);
            res.status(500).json({ error: 'Erro ao atualizar configurações' });
        }
    }

    // --- API KEYS ---
    async getApiKeys(req, res) {
        try {
            const { data, error } = await supabase
                .from('system_api_keys')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            res.json({ success: true, count: data.length, data });
        } catch (error) {
            logger.error('Erro ao buscar api_keys no Supabase:', error);
            res.status(500).json({ error: 'Erro ao buscar chaves de API' });
        }
    }

    async createApiKey(req, res) {
        try {
            const { name, expires_in_days } = req.body;
            if (!name) return res.status(400).json({ error: 'Nome obrigatório' });

            const token = crypto.randomBytes(32).toString('hex');
            const expires_at = new Date();
            expires_at.setDate(expires_at.getDate() + (expires_in_days || 365));

            const { data, error } = await supabase
                .from('system_api_keys')
                .insert([{ name, token, expires_at: expires_at.toISOString() }])
                .select()
                .single();

            if (error) throw error;
            res.json({ success: true, data });
        } catch (error) {
            logger.error('Erro ao criar api_key no Supabase:', error);
            res.status(500).json({ error: 'Erro ao criar chave de API' });
        }
    }

    async deleteApiKey(req, res) {
        try {
            const { id } = req.params;
            const { error } = await supabase
                .from('system_api_keys')
                .delete()
                .eq('id', id);

            if (error) throw error;
            res.json({ success: true, message: 'Chave revogada com sucesso' });
        } catch (error) {
            logger.error('Erro ao excluir api_key no Supabase:', error);
            res.status(500).json({ error: 'Erro ao revogar chave de API' });
        }
    }

    // --- WEBHOOKS ---
    async getWebhooks(req, res) {
        try {
            const { data, error } = await supabase
                .from('system_webhooks')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            res.json({ success: true, count: data.length, data });
        } catch (error) {
            logger.error('Erro ao buscar webhooks no Supabase:', error);
            res.status(500).json({ error: 'Erro ao buscar webhooks' });
        }
    }

    async createWebhook(req, res) {
        try {
            const { trigger_event, target_url, is_active } = req.body;
            if (!trigger_event || !target_url) return res.status(400).json({ error: 'Evento e URL são obrigatórios' });

            const { data, error } = await supabase
                .from('system_webhooks')
                .insert([{ trigger_event, target_url, is_active: is_active !== false }])
                .select()
                .single();

            if (error) throw error;
            res.json({ success: true, data });
        } catch (error) {
            logger.error('Erro ao criar webhook no Supabase:', error);
            res.status(500).json({ error: 'Erro ao criar webhook' });
        }
    }

    async deleteWebhook(req, res) {
        try {
            const { id } = req.params;
            const { error } = await supabase
                .from('system_webhooks')
                .delete()
                .eq('id', id);

            if (error) throw error;
            res.json({ success: true, message: 'Webhook excluído com sucesso' });
        } catch (error) {
            logger.error('Erro ao excluir webhook no Supabase:', error);
            res.status(500).json({ error: 'Erro ao remover webhook' });
        }
    }

    // Auditoria de Conexão Supabase
    async testConnection(req, res) {
        try {
            const { count, error } = await supabase.from('eventos').select('*', { count: 'exact', head: true });
            if (error) throw error;
            res.json({ success: true, message: 'Conexão com Supabase Nexus estabelecida!' });
        } catch (error) {
            res.status(503).json({ success: false, error: error.message });
        }
    }

    // --- COMUNICAÇÃO & AUDITORIA (v27.5) ---

    // Retorna o histórico de sincronização (logs da nuvem)
    async getSyncHistory(req, res) {
        try {
            const { data, error } = await supabase
                .from('logs_sync')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(50);

            if (error) {
                // Tenta tabela alternativa se a de cima falhar por não existir no schema atual
                const { data: altData, error: altError } = await supabase
                    .from('system_sync_logs')
                    .select('*')
                    .order('created_at', { ascending: false })
                    .limit(50);

                if (altError) return res.json({ success: true, count: 0, data: [] });
                return res.json({ success: true, count: altData.length, data: altData });
            }

            res.json({ success: true, count: data.length, data });
        } catch (error) {
            logger.error('Erro ao buscar histórico de sincronização:', error);
            res.status(500).json({ error: 'Erro ao processar auditoria de sincronização' });
        }
    }

    // Verifica o status do servidor SMTP com credenciais do request ou do banco
    async verifySmtp(req, res) {
        try {
            logger.info('[SMTP Test] Body recebido:', req.body);
            const nodemailer = require('nodemailer');
            let { 
                host: h, smtp_host, 
                port: p, smtp_port, 
                user: u, smtp_user, 
                pass: pw, smtp_pass 
            } = req.body;

            let host = h || smtp_host;
            let port = p || smtp_port;
            let user = u || smtp_user;
            let pass = pw || smtp_pass;

            // Se nao veio nada no body, busca do banco de dados (id 1)
            if (!host || !port || !user || !pass) {
                const { data: currentSettings } = await supabase
                    .from('system_settings')
                    .select('smtp_host, smtp_port, smtp_user, smtp_pass')
                    .eq('id', 1)
                    .single();
                
                if (currentSettings) {
                    host = host || currentSettings.smtp_host;
                    port = port || currentSettings.smtp_port;
                    user = user || currentSettings.smtp_user;
                    pass = pass || currentSettings.smtp_pass;
                }
            }

            logger.info(`[SMTP Test] Iniciando verificação: host=${host}, port=${port}, user=${user}`);

            if (!host || !port || !user || !pass) {
                logger.warn('[SMTP Test] Parâmetros obrigatórios faltando mesmo após fallback');
                return res.status(400).json({
                    success: false,
                    error: 'Configurações de SMTP não encontradas ou incompletas.'
                });
            }


            // Criar transporter temporário com credenciais do request
            const testTransporter = nodemailer.createTransport({
                host,
                port: parseInt(port, 10),
                secure: parseInt(port, 10) === 465, // TLS para porta 465, STARTTLS para outras
                auth: {
                    user,
                    pass
                },
                tls: {
                    rejectUnauthorized: false // Para servidores com certificados auto-assinados
                }
            });

            logger.info('[SMTP Test] Transporter criado, testando conexão...');
            // Testar conexão
            const result = await testTransporter.verify();

            logger.info(`[SMTP Test] Resultado da verificação: ${result}`);

            if (result) {
                res.json({
                    success: true,
                    message: 'Conexão SMTP estabelecida e autenticada com sucesso.',
                    detail: host
                });
            } else {
                throw new Error('Servidor recusou a conexão.');
            }
        } catch (error) {
            logger.error(`[SMTP Test] Falha na verificação SMTP: ${error.message}`, {
                code: error.code,
                errno: error.errno,
                syscall: error.syscall,
                hostname: error.hostname,
                stack: error.stack
            });

            let userFriendlyError = 'Falha na conexão SMTP.';
            if (error.code === 'EAUTH') {
                userFriendlyError = 'Usuário ou senha (App Password) incorretos/rejeitados pelo servidor.';
            } else if (error.code === 'ESOCKET') {
                userFriendlyError = 'Timeout ou porta bloqueada (Verifique HOST e PORTA).';
            } else if (error.code === 'ENOTFOUND') {
                userFriendlyError = 'Host SMTP não encontrado (Verifique o endereço do servidor).';
            } else if (error.message?.includes('STARTTLS')) {
                userFriendlyError = 'Erro no protocolo TLS. Tente mudar a porta (587 para STARTTLS, 465 para TLS).';
            }

            res.status(503).json({
                success: false,
                error: userFriendlyError,
                detail: error.message
            });
        }
    }

    // Verifica o status do gateway de WhatsApp
    async verifyWpp(req, res) {
        try {
            res.json({ success: false, message: 'Gateway WhatsApp não configurado neste ambiente.' });
        } catch (error) {
            res.status(500).json({ error: 'Erro ao verificar WhatsApp' });
        }
    }

    // --- NOVOS ENDPOINTS (CONSOLIDAÇÃO) ---

    /**
     * Gerar API Key — CONSOLIDADO: usa tabela system_api_keys
     * (mesmo destino que createApiKey, mas com prefixo nzt_ e nome automático)
     */
    async generateApiKey(req, res) {
        try {
            const token = 'nzt_' + crypto.randomBytes(32).toString('hex');
            const name = `Gerado por ${req.user?.email || 'sistema'}`;
            const expires_at = new Date();
            expires_at.setDate(expires_at.getDate() + 365);

            const { data, error } = await supabase
                .from('system_api_keys')
                .insert([{
                    name,
                    token,
                    expires_at: expires_at.toISOString(),
                    created_by: req.user?.email
                }])
                .select()
                .single();

            if (error) throw error;

            res.json({ success: true, key: token, data });
        } catch (error) {
            logger.error('Erro ao gerar API Key:', error);
            res.status(500).json({ error: 'Erro ao gerar chave de API' });
        }
    }

    async testEmail(req, res) {
        try {
            const emailService = require('../../services/emailService');
            await emailService.sendMail({
                to: req.user.email,
                subject: 'Teste de Email — NZT Eventos',
                text: `Email de teste enviado com sucesso em ${new Date().toLocaleString('pt-BR')}`
            });
            res.json({ success: true, message: `Email enviado para ${req.user.email}` });
        } catch (error) {
            logger.error('Erro ao enviar email de teste:', error);
            res.status(500).json({ error: 'Falha ao enviar email de teste' });
        }
    }

    async forceLogoutAll(req, res) {
        try {
            const { data: users } = await supabase
                .from('perfis')
                .select('id')
                .neq('id', req.user.id)
                .eq('ativo', true);

            if (users && users.length > 0) {
                // Banir temporariamente por 1 hora (isso invalida sessões)
                for (const u of users) {
                    await supabase.auth.admin.updateUserById(u.id, {
                        ban_duration: '1h'
                    });
                }

                // Remover o ban após 5 segundos
                setTimeout(async () => {
                    for (const u of users) {
                        try {
                            await supabase.auth.admin.updateUserById(u.id, {
                                ban_duration: 'none'
                            });
                        } catch (err) {
                            logger.error(`Erro ao remover ban de ${u.id}:`, err);
                        }
                    }
                }, 5000);
            }

            logger.info(`[SECURITY] Force logout executado por ${req.user.email}`);
            res.json({ success: true, message: `${users?.length || 0} usuários desconectados.` });
        } catch (error) {
            logger.error('Erro ao forçar logout:', error);
            res.status(500).json({ error: 'Erro ao forçar logout global' });
        }
    }
}

module.exports = new SettingsController();
