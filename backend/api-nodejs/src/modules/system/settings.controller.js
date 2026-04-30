const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');
const crypto = require('crypto');

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
                    theme_neon_enabled: true,
                    language: 'pt-BR',
                    biometric_login_enabled: true,
                    cloud_sync_enabled: true,
                    api_url: 'https://api.nzt.app.br/api',
                    alert_operator_login: false,
                    alert_event_peak: true,
                    biometric_sensitivity: 85,
                    liveness_check_enabled: true,
                    anti_passback_enabled: true,
                    anti_passback_cooldown_min: 15,
                    auto_checkout_timeout_min: 300,
                    capacity_hard_block_enabled: true,
                    gamification_enabled: false
                };
            }

            res.json({ success: true, data: settings });
        } catch (error) {
            logger.error('Erro ao buscar system_settings no Supabase:', error);
            res.status(500).json({ error: 'Erro ao buscar configurações globais' });
        }
    }

    // Atualiza as configurações
    async updateSettings(req, res) {
        try {
            const payload = req.body;
            delete payload.id;

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
            const { data, error } = await supabase.from('eventos').select('count').limit(1);
            if (error) throw error;
            res.json({ success: true, message: 'Conexão com Supabase Nexus estabelecida!' });
        } catch (error) {
            res.status(503).json({ success: false, error: error.message });
        }
    }
}

module.exports = new SettingsController();
