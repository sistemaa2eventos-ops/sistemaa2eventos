const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');
const crypto = require('crypto');
const { extractRole } = require('../../middleware/auth');

// Só o admin_master vê e altera senhas e tokens (ele é quem os cadastra).
const souAdminMaster = (req) => extractRole(req.user) === 'admin_master';

// ── Whitelist de campos permitidos para system_settings (previne mass-assignment)
const SETTINGS_ALLOWED_FIELDS = [
    'system_name', 'theme_neon_enabled', 'language',
    'biometric_login_enabled', 'cloud_sync_enabled', 'api_url',
    'alert_operator_login', 'alert_event_peak', 'alert_peak_threshold',
    'biometric_sensitivity', 'liveness_check_enabled',
    'anti_passback_enabled', 'checkin_cooldown_min',
    'biometric_confidence', 'biometric_confianca_baixa',
    'jwt_expiry', 'cron_reset_hora', 'cron_relatorio_hora',
    'log_retention_days', 'logo_url', 'emblem_url',
    'pwa_icon_general_url', 'pwa_icon_producao_url', 'pwa_icon_monitoramento_url',
    'audio_feedback_enabled', 'performance_mode_enabled', 'offline_cache_enabled',
    'config',
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
    'telegram_chat_id', 'telegram_alerts_enabled', 'email_relatorio_ativo', 'relatorio_telegram_ativo',
    'telegram_chat_id_sistema', 'telegram_alertas_sistema',
    'whatsapp_api_url', 'whatsapp_api_key', 'email_from', 'email_from_name',
    // Gamificação
    'gamification_enabled', 'gamification_points_scan',
    'gamification_points_earlybird', 'gamification_points_checkin',
    // Retenção de logs
    'syslog_retention_edge_days', 'syslog_retention_admin_days',
    // LPR/ANPR
    'anpr_enabled', 'anpr_endpoint', 'anpr_confidence_min', 'anpr_log_retention_days',
    'telegram_chat_id', 'telegram_alerts_enabled', 'email_relatorio_ativo', 'relatorio_telegram_ativo',
    'email_from', 'email_from_name', 'whatsapp_api_url', 'whatsapp_api_key',
    // Segurança (painel)
    'jwt_expiration_hours', 'force_2fa_admin', 'ddos_shield_enabled'
];

// Campos enviados pelo frontend que ainda não possuem coluna própria em system_settings.
// São persistidos em system_settings.config (JSONB) para o upsert não falhar com 42703.
const SETTINGS_LEGACY_CONFIG_FIELDS = [
    'biometric_login_enabled', 'alert_operator_login', 'alert_event_peak', 'alert_peak_threshold',
    'emblem_url', 'pwa_icon_general_url', 'pwa_icon_producao_url', 'pwa_icon_monitoramento_url',
    'audio_feedback_enabled', 'performance_mode_enabled', 'offline_cache_enabled',
    'anpr_enabled', 'anpr_endpoint', 'anpr_confidence_min', 'anpr_log_retention_days',
    'telegram_chat_id', 'telegram_alerts_enabled', 'email_relatorio_ativo', 'relatorio_telegram_ativo',
    'telegram_chat_id_sistema', 'telegram_alertas_sistema',
    'email_from', 'email_from_name', 'whatsapp_api_url', 'whatsapp_api_key'
];

/**
 * Promove chaves salvas em config (JSONB) para o primeiro nível da resposta sem cobrir colunas preenchidas.
 * Usado tanto na leitura (GET) quanto no retorno do salvamento (PUT) para a tela não perder valores legados.
 */
function mesclarConfigLegado(registro) {
    if (!registro || typeof registro !== 'object') return registro;
    const config = registro.config && typeof registro.config === 'object' ? registro.config : {};
    const saida = { ...registro };
    for (const [campo, valor] of Object.entries(config)) {
        if (saida[campo] === null || saida[campo] === undefined || saida[campo] === '') {
            saida[campo] = valor;
        }
    }
    if (saida.alert_peak_threshold === null || saida.alert_peak_threshold === undefined || saida.alert_peak_threshold === '') {
        saida.alert_peak_threshold = 90;
    }
    if (!saida.system_name) {
        saida.system_name = 'NZT Eventos';
    }
    if (saida.logo_url === null || saida.logo_url === undefined) {
        saida.logo_url = '';
    }
    if (saida.emblem_url === null || saida.emblem_url === undefined) {
        saida.emblem_url = '';
    }
    if (saida.pwa_icon_general_url === null || saida.pwa_icon_general_url === undefined) {
        saida.pwa_icon_general_url = '';
    }
    if (saida.pwa_icon_producao_url === null || saida.pwa_icon_producao_url === undefined) {
        saida.pwa_icon_producao_url = '';
    }
    if (saida.pwa_icon_monitoramento_url === null || saida.pwa_icon_monitoramento_url === undefined) {
        saida.pwa_icon_monitoramento_url = '';
    }
    saida.audio_feedback_enabled = saida.audio_feedback_enabled !== false;
    saida.performance_mode_enabled = Boolean(saida.performance_mode_enabled);
    saida.offline_cache_enabled = saida.offline_cache_enabled !== false;
    return saida;
}

function invalidarCachesSistema() {
    try { require('../../services/cacheService').del('system_branding_public'); } catch (_) { /* opcional */ }
    try {
        const op = require('./operacao.service');
        if (typeof op.limparCacheConfig === 'function') op.limparCacheConfig();
    } catch (_) { /* opcional */ }
}

// Segredos: só o admin_master recebe os valores. Os demais recebem só se estão configurados.
// Campo vazio no PUT significa "manter o que já está gravado".
const CAMPOS_SECRETOS = ['smtp_pass', 'wpp_token', 'telegram_bot_token', 'whatsapp_api_key'];

function ocultarSegredos(registro, verValores = false) {
    if (!registro || typeof registro !== 'object') return registro;
    const saida = { ...registro };
    const config = saida.config && typeof saida.config === 'object' ? { ...saida.config } : null;
    for (const campo of CAMPOS_SECRETOS) {
        const gravado = saida[campo] || (config && config[campo]);
        saida[`${campo}_configurado`] = !!gravado;
        if (verValores) {
            if (gravado) saida[campo] = gravado;
        } else {
            saida[campo] = '';
            if (config) delete config[campo];
        }
    }
    if (config) saida.config = config;
    return saida;
}

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
                    logo_url: '',
                    theme_neon_enabled: true,
                    language: 'pt-BR',
                    biometric_login_enabled: true,
                    cloud_sync_enabled: true,
                    api_url: process.env.API_URL ? `${process.env.API_URL}/api` : 'https://api.nzt.app.br/api',
                    alert_operator_login: false,
                    alert_event_peak: true,
                    alert_peak_threshold: 90,
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
                settings = mesclarConfigLegado(settings);
            }

            res.json({ success: true, data: ocultarSegredos(settings, souAdminMaster(req)) });
        } catch (error) {
            logger.error('Erro ao buscar system_settings no Supabase:', error);
            res.status(500).json({ error: 'Erro ao buscar configurações globais' });
        }
    }

    // Atualiza as configurações (com whitelist de campos)
    async updateSettings(req, res) {
        try {
            const payload = pickAllowed(req.body, SETTINGS_ALLOWED_FIELDS);
            // Segredos: só o admin_master grava. Campo vazio ou de outro perfil não sobrescreve o valor gravado
            const podeGravarSegredos = souAdminMaster(req);
            for (const campo of CAMPOS_SECRETOS) {
                if (!podeGravarSegredos || payload[campo] === '' || payload[campo] === null) delete payload[campo];
            }
            if (payload.config && typeof payload.config === 'object') {
                payload.config = { ...payload.config };
                for (const campo of CAMPOS_SECRETOS) {
                    if (!podeGravarSegredos || payload.config[campo] === '' || payload.config[campo] === null) delete payload.config[campo];
                }
            }

            if (payload.system_name !== undefined) {
                const nomeLimpo = String(payload.system_name || '').trim().slice(0, 80);
                if (!nomeLimpo) {
                    return res.status(400).json({ error: 'Informe um nome válido para o sistema.' });
                }
                payload.system_name = nomeLimpo;
            }
            if (payload.alert_peak_threshold !== undefined) {
                const lim = parseInt(payload.alert_peak_threshold, 10);
                payload.alert_peak_threshold = Number.isFinite(lim) ? Math.max(50, Math.min(100, lim)) : 90;
            }

            // Sincronizar email_from e smtp_email para manter consistência
            if (payload.smtp_email && !payload.email_from) payload.email_from = payload.smtp_email;
            if (payload.email_from && !payload.smtp_email) payload.smtp_email = payload.email_from;

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

            let { data, error } = await supabase
                .from('system_settings')
                .upsert({ id: 1, ...payload, updated_at: new Date() })
                .select()
                .single();

            // Ambiente sem alguma coluna opcional (ex.: system_name / logo_url): migra para config JSONB automaticamente
            if (error && (error.code === '42703' || error.code === 'PGRST204')) {
                const matchCol = String(error.message || '').match(/['"]([a-z0-9_]+)['"]/i);
                const colAusente = matchCol?.[1];
                if (colAusente && payload[colAusente] !== undefined && colAusente !== 'id' && colAusente !== 'config') {
                    const { data: rowCfg } = await supabase.from('system_settings').select('config').eq('id', 1).maybeSingle();
                    const baseCfg = (payload.config && typeof payload.config === 'object') ? payload.config : (rowCfg?.config || {});
                    payload.config = { ...baseCfg, [colAusente]: payload[colAusente] };
                    delete payload[colAusente];
                    const retry = await supabase
                        .from('system_settings')
                        .upsert({ id: 1, ...payload, updated_at: new Date() })
                        .select()
                        .single();
                    data = retry.data;
                    error = retry.error;
                }
            }

            if (error) throw error;
            require('../../services/telegramSistema').limparCache(); // Chat ID/token novos valem na hora
            invalidarCachesSistema();

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

            res.json({ success: true, message: 'Configurações atualizadas com sucesso', data: ocultarSegredos(mesclarConfigLegado(data), souAdminMaster(req)) });
        } catch (error) {
            logger.error('Erro ao atualizar system_settings no Supabase:', error);
            res.status(500).json({ error: 'Erro ao atualizar configurações' });
        }
    }

    // Upload ou remoção de ativos visuais (logo, favicon e ícones de PWA específicos) via backend
    async uploadLogo(req, res) {
        try {
            const { tipo = 'logo', imagem_base64, remover } = req.body || {};

            const MAPA_TIPOS = {
                logo: { campo: 'logo_url', nome: 'Logo do painel', prefixo: 'system-logo' },
                emblem: { campo: 'emblem_url', nome: 'Emblema / Favicon', prefixo: 'system-emblem' },
                pwa_general: { campo: 'pwa_icon_general_url', nome: 'Ícone PWA Geral', prefixo: 'pwa-general' },
                pwa_producao: { campo: 'pwa_icon_producao_url', nome: 'Ícone PWA Produção', prefixo: 'pwa-producao' },
                pwa_monitoramento: { campo: 'pwa_icon_monitoramento_url', nome: 'Ícone PWA Monitoramento', prefixo: 'pwa-monitoramento' }
            };

            const configTipo = MAPA_TIPOS[tipo] || MAPA_TIPOS.logo;
            const campoAlvo = configTipo.campo;

            if (remover) {
                const { data: rowCfg } = await supabase.from('system_settings').select('config').eq('id', 1).maybeSingle();
                const cfgAtual = { ...(rowCfg?.config || {}) };
                delete cfgAtual[campoAlvo];

                const payloadUpsert = { id: 1, [campoAlvo]: '', config: cfgAtual, updated_at: new Date() };
                let { error } = await supabase.from('system_settings').upsert(payloadUpsert);
                if (error && (error.code === '42703' || error.code === 'PGRST204')) {
                    const fallbackPayload = { id: 1, config: { ...cfgAtual, [campoAlvo]: '' }, updated_at: new Date() };
                    ({ error } = await supabase.from('system_settings').upsert(fallbackPayload));
                }
                if (error) throw error;
                invalidarCachesSistema();
                return res.json({ success: true, tipo, campo: campoAlvo, url: '', message: `${configTipo.nome} padrão restaurado com sucesso.` });
            }

            const str = String(imagem_base64 || '').trim();
            const m = str.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=\s]+)$/i);
            if (!m) {
                return res.status(400).json({ error: 'Formato inválido. Envie uma imagem PNG, JPG ou WEBP.' });
            }

            const mime = m[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : m[1].toLowerCase();
            const ext = mime === 'image/png' ? 'png' : (mime === 'image/webp' ? 'webp' : 'jpg');
            const buffer = Buffer.from(m[2].replace(/\s+/g, ''), 'base64');

            if (!buffer.length || buffer.length > 2 * 1024 * 1024) {
                return res.status(400).json({ error: 'A imagem deve ter no máximo 2 MB.' });
            }

            const filePath = `branding/${configTipo.prefixo}-${Date.now()}.${ext}`;
            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, buffer, { contentType: mime, upsert: true });

            if (uploadError) {
                logger.error(`Erro ao enviar ${configTipo.nome} para o bucket avatars:`, uploadError);
                return res.status(500).json({ error: 'Não foi possível salvar o arquivo no armazenamento.' });
            }

            const { data: pubData } = supabase.storage.from('avatars').getPublicUrl(filePath);
            const publicUrl = pubData?.publicUrl || '';

            const { data: rowCfg } = await supabase.from('system_settings').select('config').eq('id', 1).maybeSingle();
            const cfgAtual = { ...(rowCfg?.config || {}), [campoAlvo]: publicUrl };

            const payloadUpsert = { id: 1, [campoAlvo]: publicUrl, config: cfgAtual, updated_at: new Date() };
            let { error: dbErr } = await supabase.from('system_settings').upsert(payloadUpsert);
            if (dbErr && (dbErr.code === '42703' || dbErr.code === 'PGRST204')) {
                ({ error: dbErr } = await supabase.from('system_settings').upsert({ id: 1, config: cfgAtual, updated_at: new Date() }));
            }
            if (dbErr) throw dbErr;

            invalidarCachesSistema();
            return res.json({ success: true, tipo, campo: campoAlvo, url: publicUrl, logo_url: publicUrl, message: `${configTipo.nome} atualizado com sucesso!` });
        } catch (error) {
            logger.error('Erro em uploadLogo/uploadAsset:', error);
            return res.status(500).json({ error: 'Erro ao atualizar o ativo do sistema.' });
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

    async testTelegram(req, res) {
        try {
            const axios = require('axios');
            let { token, chat_id } = req.body || {};

            if (!token || !chat_id) {
                const { data: currentSettings } = await supabase
                    .from('system_settings')
                    .select('telegram_bot_token, config')
                    .eq('id', 1)
                    .maybeSingle();

                token = token || currentSettings?.telegram_bot_token || currentSettings?.config?.telegram_bot_token || process.env.TELEGRAM_BOT_TOKEN;
                chat_id = chat_id || currentSettings?.config?.telegram_chat_id || process.env.TELEGRAM_CHAT_ID;
            }

            if (!token || !chat_id) {
                return res.status(400).json({
                    success: false,
                    error: 'Token do Bot e Chat ID são obrigatórios para testar o Telegram.'
                });
            }

            const dataHora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
            const msg = `🤖 <b>Teste de Conexão — NZT Eventos</b>\n\n` +
                        `✅ <b>Status:</b> Conexão com Telegram estabelecida com sucesso!\n` +
                        `⏰ <b>Horário:</b> ${dataHora}\n` +
                        `🔔 <b>Canal:</b> Alertas e Notificações do Sistema.\n\n` +
                        `<i>Este bot está pronto para receber alertas em tempo real da Watchlist/CFTV e relatórios diários.</i>`;

            await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
                chat_id: String(chat_id).trim(),
                text: msg,
                parse_mode: 'HTML'
            }, { timeout: 8000 });

            res.json({ success: true, message: 'Mensagem de teste enviada com sucesso no Telegram!' });
        } catch (error) {
            logger.error('Erro ao testar Telegram:', error.response?.data || error.message);
            const desc = error.response?.data?.description || error.message;
            res.status(500).json({
                success: false,
                error: `Falha no envio Telegram: ${desc}`
            });
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
