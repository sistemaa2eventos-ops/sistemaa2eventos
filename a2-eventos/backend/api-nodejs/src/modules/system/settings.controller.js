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

    // Verifica o status do servidor SMTP
    async verifySmtp(req, res) {
        try {
            const emailService = require('../../services/emailService');
            // O comando verify() testa a conexão e autenticação com o servidor SMTP
            const result = await emailService.transporter.verify();
            
            if (result) {
                res.json({ 
                    success: true, 
                    message: 'Conexão SMTP estabelecida e autenticada com sucesso.',
                    detail: process.env.SMTP_HOST 
                });
            } else {
                throw new Error('Servidor recusou a conexão.');
            }
        } catch (error) {
            logger.error('Falha na verificação SMTP:', error);
            res.status(503).json({ 
                success: false, 
                error: 'Falha na conexão SMTP.', 
                detail: error.message 
            });
        }
    }

    // Verifica o status do gateway de WhatsApp
    async verifyWpp(req, res) {
        try {
            // Por enquanto retornar falso ou não configurado
            res.json({ success: false, message: 'Gateway WhatsApp não configurado neste ambiente.' });
        } catch (error) {
            res.status(500).json({ error: 'Erro ao verificar WhatsApp' });
        }
    }

    // --- NOVOS ENDPOINTS (CONSOLIDAÇÃO) ---

    async generateApiKey(req, res) {
        try {
            const key = 'nzt_' + crypto.randomBytes(32).toString('hex');
            
            // Buscar config atual
            const { data } = await supabase
                .from('system_settings')
                .select('config')
                .eq('id', 1)
                .single();

            const config = data?.config || {};
            const keys = config.api_keys || [];
            keys.push({
                key,
                created_at: new Date().toISOString(),
                created_by: req.user?.email,
                active: true
            });

            await supabase.from('system_settings')
                .update({ config: { ...config, api_keys: keys } })
                .eq('id', 1);

            res.json({ success: true, key });
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
            // Buscar todos os usuários exceto o que executou
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

            logger.info(`🔐 Force logout executado por ${req.user.email}`);
            res.json({ success: true, message: `${users?.length || 0} usuários desconectados.` });
        } catch (error) {
            logger.error('Erro ao forçar logout:', error);
            res.status(500).json({ error: 'Erro ao forçar logout global' });
        }
    }
}

module.exports = new SettingsController();
