const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');

class ConfigController {
    constructor() {
        this.getAreas = this.getAreas.bind(this);
        this.createArea = this.createArea.bind(this);
        this.deleteArea = this.deleteArea.bind(this);

        this.getPulseiras = this.getPulseiras.bind(this);
        this.createPulseira = this.createPulseira.bind(this);
        this.deletePulseira = this.deletePulseira.bind(this);

        this.getEtiquetas = this.getEtiquetas.bind(this);
        this.saveEtiquetas = this.saveEtiquetas.bind(this);
        this.clearCache = this.clearCache.bind(this);
    }

    // ==========================================
    // ÁREAS DO EVENTO
    // ==========================================
    async getAreas(req, res) {
        try {
            const evento_id = req.event?.id || req.query.evento_id;
            if (!evento_id) return res.status(400).json({ error: 'Contexto de evento não identificado' });

            const { data, error } = await supabase
                .from('evento_areas')
                .select('*')
                .eq('evento_id', evento_id)
                .order('nome_area', { ascending: true });

            if (error) throw error;
            res.json({ success: true, data });
        } catch (error) {
            logger.error('Erro ao listar áreas:', error);
            res.status(500).json({ error: 'Erro ao buscar áreas', details: error.message });
        }
    }

    async createArea(req, res) {
        try {
            const evento_id = req.event?.id || req.body.evento_id;
            const { nome_area } = req.body;

            if (!nome_area) return res.status(400).json({ error: 'Nome da área é obrigatório' });
            if (!evento_id) return res.status(400).json({ error: 'Contexto de evento não identificado' });

            const { data, error } = await supabase
                .from('evento_areas')
                .insert([{ evento_id, nome_area }])
                .select()
                .single();

            if (error) throw error;
            logger.info(`Nova área criada: ${nome_area} para o evento ${evento_id}`);
            res.status(201).json({ success: true, data });
        } catch (error) {
            logger.error('Erro ao criar área:', error);
            res.status(500).json({ error: 'Erro ao criar área', details: error.message });
        }
    }

    async deleteArea(req, res) {
        try {
            const { id } = req.params;
            const { error } = await supabase.from('evento_areas').delete().eq('id', id);

            if (error) throw error;
            res.json({ success: true, message: 'Área excluída com sucesso' });
        } catch (error) {
            logger.error('Erro ao excluir área:', error);
            res.status(500).json({ error: 'Erro ao excluir área. Ela pode estar em uso por pulseiras ou regras de acesso.' });
        }
    }

    // ==========================================
    // TIPOS DE PULSEIRAS E REGRAS
    // ==========================================
    async getPulseiras(req, res) {
        try {
            const evento_id = req.event?.id || req.query.evento_id;
            const { data, error } = await supabase
                .from('evento_tipos_pulseira')
                .select(`
                    *,
                    pulseira_areas_permitidas (
                        area_id, 
                        evento_areas (nome_area)
                    )
                `)
                .eq('evento_id', evento_id)
                .order('numero_inicial', { ascending: true });

            if (error) throw error;
            res.json({ success: true, data });
        } catch (error) {
            logger.error('Erro ao listar tipos de pulseira:', error);
            res.status(500).json({ error: 'Erro ao buscar pulseiras' });
        }
    }

    async createPulseira(req, res) {
        try {
            const evento_id = req.event?.id || req.body.evento_id;
            const { nome_tipo, cor_hex, numero_inicial, numero_final, areas_permitidas, tipo_leitura } = req.body;

            if (!nome_tipo || typeof numero_inicial !== 'number' || typeof numero_final !== 'number') {
                return res.status(400).json({ error: 'Dados incompletos para a pulseira' });
            }

            if (numero_inicial > numero_final) {
                return res.status(400).json({ error: 'O número inicial não pode ser maior que o final' });
            }

            // Inserir a Pulseira Base
            const { data: pulseira, error: pulseiraErr } = await supabase
                .from('evento_tipos_pulseira')
                .insert([{ evento_id, nome_tipo, cor_hex, numero_inicial, numero_final, tipo_leitura: tipo_leitura || 'qr_code' }])
                .select()
                .single();

            if (pulseiraErr) throw pulseiraErr;

            // Inserir as Associações com Áreas Permitidas
            if (areas_permitidas && Array.isArray(areas_permitidas) && areas_permitidas.length > 0) {
                const permits = areas_permitidas.map(area_id => ({
                    pulseira_id: pulseira.id,
                    area_id: area_id
                }));
                const { error: areaErr } = await supabase.from('pulseira_areas_permitidas').insert(permits);
                if (areaErr) logger.error('Erro ao vincular pulseira às áreas:', areaErr);
            }

            res.status(201).json({ success: true, message: 'Pulseira configurada com sucesso', data: pulseira });
        } catch (error) {
            logger.error('Erro ao criar pulseira:', error.message || error);
            res.status(500).json({ error: 'Erro ao criar tipo de pulseira', details: error.message });
        }
    }

    // ==========================================
    // CONFIGURAÇÕES DE CREDENCIAMENTO DINÂMICO
    // ==========================================

    async getRegistrationSettings(req, res) {
        try {
            const evento_id = req.event.id;
            const { data: evento, error } = await supabase
                .from('eventos')
                .select('config')
                .eq('id', evento_id)
                .single();

            if (error) throw error;

            // Fallback for fields
            const defaultFields = [
                { id: 'nome', label: 'Nome Completo', active: true, required: true },
                { id: 'cpf', label: 'CPF / Passaporte', active: true, required: true },
                { id: 'email', label: 'E-mail', active: true, required: true },
                { id: 'funcao', label: 'Cargo / Função', active: true, required: false },
                { id: 'empresa_id', label: 'Empresa', active: true, required: true },
                { id: 'data_nascimento', label: 'Data de Nascimento', active: false, required: false },
                { id: 'nome_mae', label: 'Nome da Mãe', active: false, required: false },
                { id: 'foto_url', label: 'Foto Biométrica', active: true, required: true }
            ];

            const registration = evento.config?.registration || {
                fields: {
                    Participante: [...defaultFields],
                    Expositor: [...defaultFields],
                    Staff: [...defaultFields]
                },
                auto_approve: true,
                double_optin: false,
                lgpd_text: 'Eu concordo com os termos de uso e política de privacidade.'
            };

            res.json({ success: true, data: registration });
        } catch (error) {
            logger.error('Erro ao buscar settings de credenciamento:', error);
            res.status(500).json({ error: 'Erro ao buscar configurações' });
        }
    }

    async updateRegistrationSettings(req, res) {
        try {
            const evento_id = req.event.id;
            const registration = req.body;

            // Buscar config atual
            const { data: evento, error: fetchErr } = await supabase
                .from('eventos')
                .select('config')
                .eq('id', evento_id)
                .single();

            if (fetchErr) throw fetchErr;

            const newConfig = {
                ...(evento.config || {}),
                registration: registration
            };

            const { error: updateErr } = await supabase
                .from('eventos')
                .update({ config: newConfig })
                .eq('id', evento_id);

            if (updateErr) throw updateErr;

            res.json({ success: true, message: 'Configurações de credenciamento salvas!' });
        } catch (error) {
            logger.error('Erro ao salvar settings de credenciamento:', error);
            res.status(500).json({ error: 'Erro ao salvar configurações' });
        }
    }

    async deletePulseira(req, res) {
        try {
            const { id } = req.params;
            const { error } = await supabase.from('evento_tipos_pulseira').delete().eq('id', id);

            if (error) throw error;
            res.json({ success: true, message: 'Pulseira excluída com sucesso' });
        } catch (error) {
            logger.error('Erro ao excluir pulseira:', error);
            res.status(500).json({ error: 'Erro ao excluir pulseira.' });
        }
    }

    // ==========================================
    // ETIQUETAS E CRACHÁS (LAYOUT)
    // ==========================================
    async getEtiquetas(req, res) {
        try {
            const evento_id = req.event?.id || req.query.evento_id;
            const { data, error } = await supabase
                .from('evento_etiqueta_layouts')
                .select('*')
                .eq('evento_id', evento_id)
                .maybeSingle();

            if (error) {
                // Se a tabela não existir ou outro erro, retornar null graciosamente
                logger.warn('Aviso ao buscar layout da etiqueta:', error.message);
                return res.json({ success: true, data: null });
            }

            res.json({ success: true, data: data || null });
        } catch (error) {
            logger.error('Erro ao buscar layout da etiqueta:', error);
            res.json({ success: true, data: null }); // Não crashar por falta de layout
        }
    }

    async saveEtiquetas(req, res) {
        try {
            const evento_id = req.event?.id || req.body.evento_id;
            const { papel_config, elementos } = req.body;

            if (!papel_config || !elementos) {
                return res.status(400).json({ error: 'Dados insuficientes para layout' });
            }

            // Upsert (atualiza se existe, cria se nao)
            const { data, error } = await supabase
                .from('evento_etiqueta_layouts')
                .upsert(
                    { evento_id, papel_config, elementos, updated_at: new Date() },
                    { onConflict: 'evento_id' }
                )
                .select()
                .single();

            if (error) throw error;

            res.json({ success: true, message: 'Layout de etiqueta salvo!', data });
        } catch (error) {
            logger.error('Erro ao salvar layout de etiqueta:', error.message || error);
            res.status(500).json({ error: `Falha ao salvar configuração: ${error.message || 'Verifique se a tabela evento_etiqueta_layouts existe no Supabase'}` });
        }
    }

    // ==========================================
    // MANUTENÇÃO E CACHE
    // ==========================================
    async clearCache(req, res) {
        try {
            const cacheService = require('../../services/cacheService');
            cacheService.clear();

            logger.info(`🧹 Cache limpo via Admin por ${req.user?.email || 'Sistema'}`);
            res.json({ success: true, message: 'Fila de cache invalidada com sucesso. Os dados serão recarregados do banco no próximo acesso.' });
        } catch (error) {
            logger.error('Erro ao limpar cache:', error);
            res.status(500).json({ error: 'Falha ao processar limpeza de cache' });
        }
    }
}

module.exports = new ConfigController();
