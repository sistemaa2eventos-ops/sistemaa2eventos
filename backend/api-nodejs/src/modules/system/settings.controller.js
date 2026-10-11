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
    'block_unauthorized_days', 'cooldown_pulseira',
    // Regras de acesso
    'anti_passback_cooldown_min', 'auto_checkout_timeout_min',
    'capacity_hard_block_enabled', 'capacity_vip_bypass',
    // Credenciamento
    'invite_expiry_days', 'auto_aprovacao', 'lgpd_text',
    // Automação
    'cron_sync_interval', 'reset_hora',
    // Comunicação
    'alert_email', 'relatorio_emails', 'telegram_bot_token',
    'whatsapp_api_url', 'whatsapp_api_key', 'email_from', 'email_from_name',
    // Gamificação
    'gamification_enabled', 'gamification_points_scan',
    'gamification_points_earlybird', 'gamification_points_checkin',
    // Retenção de logs
    'syslog_retention_edge_days', 'syslog_retention_admin_days',
    // LPR/ANPR
    'anpr_enabled', 'anpr_endpoint', 'anpr_confidence_min', 'anpr_log_retention_days',
    // Segurança (painel)
    'jwt_expiration_hours', 'force_2fa_admin', 'ddos_shield_enabled'
];

// Campos enviados pelo frontend que ainda não possuem coluna própria em system_settings.
// São persistidos em system_settings.config (JSONB) para o upsert não falhar com 42703.
const SETTINGS_LEGACY_CONFIG_FIELDS = [
    'biometric_login_enabled', 'alert_operator_login', 'alert_event_peak',
    'anpr_enabled', 'anpr_endpoint', 'anpr_confidence_min', 'anpr_log_retention_days'
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
                    api_url: process.env.API_URL ? `${process.env.API_URL}/api` : 'https://api.nzt.app.br/api',
                    alert_operator_login: false,
                    alert_event_peak: true,
                    biometric_sensitivity: 85,
                    liveness_check_enabled: true,
                    anti_passback_enabled: true,
                    anti_passback_cooldown_min: 15,
                    auto_checkout_timeout_min: 300,
                    capacity_hard_block_enabled: true,
                    gamification_enabled: false,
                    checkin_cooldown_min: 15,
                    biometric_confidence: 75,
                    jwt_expiry: '8h',
                    cron_reset_hora: '03:00',
                    cron_relatorio_hora: '03:30',
                    log_retention_days: 90,
                    config: {}
                };
            } else {
                // Campos legados persistidos em config (JSONB) voltam no mesmo nível da resposta
                settings = { ...(settings.config || {}), ...settings };
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

            // Separa campos sem coluna própria → persiste em config (JSONB)
            const legacy = {};
            for (const field of SETTINGS_LEGACY_CONFIG_FIELDS) {
                if (payload[field] !== undefined) {
                    legacy[field] = payload[field];
                    delete payload[field];
                }
            }

            if (Object.keys(payload).length === 0 && Object.keys(legacy).length === 0) {
                return res.status(400).json({ error: 'Nenhum campo válido para atualizar' });
            }

            // config é mesclado com o que está no banco (nunca substituído por uma cópia antiga do
            // navegador) e os modelos de Perfis de Acesso só mudam pela própria tela deles.
            if (Object.keys(legacy).length > 0 || payload.config !== undefined) {
                const { data: currentRow } = await supabase
                    .from('system_settings')
                    .select('config')
                    .eq('id', 1)
                    .maybeSingle();
                const atual = currentRow?.config || {};
                const enviado = (payload.config && typeof payload.config === 'object') ? payload.config : {};
                payload.config = { ...atual, ...enviado, ...legacy };
                if (atual.perfis_acesso) payload.config.perfis_acesso = atual.perfis_acesso;
                else delete payload.config.perfis_acesso;
            }

            const { data, error } = await supabase
                .from('system_settings')
                .upsert({ id: 1, ...payload, updated_at: new Date() })
                .select()
                .single();

            if (error) throw error;

            // Reagendar cron jobs configuráveis se os horários mudaram (sem precisar reiniciar o servidor)
            if (payload.cron_reset_hora || payload.cron_relatorio_hora) {
                try {
                    const cronController = require('../events/cron.controller');
                    if (typeof cronController.reschedule === 'function') {
                        cronController.reschedule(
                            data.cron_reset_hora    || '03:00',
                            data.cron_relatorio_hora || '03:30'
                        );
                    }
                } catch (cronErr) {
                    logger.warn('Cron reschedule falhou (não crítico):', cronErr.message);
                }
            }

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
            const { trigger_event, target_url, is_active, descricao } = req.body;
            if (!trigger_event || !target_url) {
                return res.status(400).json({ error: 'Evento e URL são obrigatórios' });
            }

            try { new URL(target_url); } catch {
                return res.status(400).json({ error: 'URL inválida. Use o formato https://dominio.com/endpoint' });
            }

            const VALID_EVENTS = ['CHECKIN', 'CHECKOUT', 'NOVO_CADASTRO', 'PESSOA_BLOQUEADA', 'ALERTA'];
            if (!VALID_EVENTS.includes(trigger_event)) {
                return res.status(400).json({ error: `Evento inválido. Use: ${VALID_EVENTS.join(', ')}` });
            }

            const { data, error } = await supabase
                .from('system_webhooks')
                .insert([{ trigger_event, target_url, is_active: is_active !== false, descricao: descricao || null }])
                .select()
                .single();

            if (error) throw error;
            res.json({ success: true, data });
        } catch (error) {
            logger.error('Erro ao criar webhook:', error);
            res.status(500).json({ error: 'Erro ao criar webhook' });
        }
    }

    async updateWebhook(req, res) {
        try {
            const { id } = req.params;
            const { is_active, descricao } = req.body;

            const updateData = {};
            if (is_active !== undefined) updateData.is_active = is_active;
            if (descricao !== undefined) updateData.descricao = descricao;

            const { data, error } = await supabase
                .from('system_webhooks')
                .update(updateData)
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            res.json({ success: true, data });
        } catch (error) {
            logger.error('Erro ao atualizar webhook:', error);
            res.status(500).json({ error: 'Erro ao atualizar webhook' });
        }
    }

    async testWebhook(req, res) {
        try {
            const { id } = req.params;
            const { data: webhook, error } = await supabase
                .from('system_webhooks')
                .select('target_url, trigger_event')
                .eq('id', id)
                .single();

            if (error || !webhook) return res.status(404).json({ error: 'Webhook não encontrado' });

            const webhookDispatcher = require('../../services/webhookDispatcher');
            const result = await webhookDispatcher.testDispatch(webhook.target_url, webhook.trigger_event);

            res.json({ success: result.success, ...result });
        } catch (error) {
            logger.error('Erro ao testar webhook:', error);
            res.status(500).json({ error: 'Erro ao testar webhook' });
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
            logger.error('Erro ao excluir webhook:', error);
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
            const nodemailer = require('nodemailer');
            const { data: currentSettings } = await supabase
                .from('system_settings')
                .select('smtp_host, smtp_port, smtp_user, smtp_pass, smtp_email')
                .eq('id', 1)
                .single();

            if (!currentSettings || !currentSettings.smtp_host || !currentSettings.smtp_user || !currentSettings.smtp_pass) {
                return res.status(400).json({ error: 'Configurações de SMTP não encontradas ou incompletas.' });
            }

            const transporter = nodemailer.createTransport({
                host: currentSettings.smtp_host,
                port: parseInt(currentSettings.smtp_port, 10),
                secure: parseInt(currentSettings.smtp_port, 10) === 465,
                auth: {
                    user: currentSettings.smtp_user,
                    pass: currentSettings.smtp_pass
                },
                tls: { rejectUnauthorized: false }
            });

            await transporter.sendMail({
                from: currentSettings.smtp_email || currentSettings.smtp_user,
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
                .eq('ativo', true)
                .or('status.is.null,status.neq.inativo'); // inativos já estão bloqueados e não podem ser desbloqueados aqui

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

            require('../../services/authCache').invalidarTodos();
            logger.info(`[SECURITY] Force logout executado por ${req.user.email}`);
            res.json({ success: true, message: `${users?.length || 0} usuários desconectados.` });
        } catch (error) {
            logger.error('Erro ao forçar logout:', error);
            res.status(500).json({ error: 'Erro ao forçar logout global' });
        }
    }
}

module.exports = new SettingsController();
