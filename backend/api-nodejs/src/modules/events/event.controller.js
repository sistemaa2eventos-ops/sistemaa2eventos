const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');

class EventoController {
    async list(req, res) {
        try {
            // Buscar todos os eventos
            const { data: eventos, error: eventError } = await supabase
                .from('eventos')
                .select('*')
                .order('data_inicio', { ascending: false });

            if (eventError) throw eventError;

            // Buscar contagens em batch (evita N+1 queries)
            const eventoIds = eventos.map(e => e.id);

            const [empResult, pesResult] = await Promise.all([
                supabase.from('empresas')
                    .select('evento_id')
                    .in('evento_id', eventoIds),
                supabase.from('pessoas')
                    .select('evento_id')
                    .in('evento_id', eventoIds)
            ]);

            // Agrupar contagens por evento_id
            const empCounts = {};
            const pesCounts = {};
            (empResult.data || []).forEach(e => { empCounts[e.evento_id] = (empCounts[e.evento_id] || 0) + 1; });
            (pesResult.data || []).forEach(p => { pesCounts[p.evento_id] = (pesCounts[p.evento_id] || 0) + 1; });

            const eventosComStats = eventos.map(evento => ({
                ...evento,
                total_empresas: empCounts[evento.id] || 0,
                total_pessoas: pesCounts[evento.id] || 0
            }));

            res.json({ success: true, data: eventosComStats });
        } catch (error) {
            logger.error('Erro ao listar eventos:', error.message);
            res.status(500).json({ error: error.message });
        }
    }

    async getById(req, res) {
        try {
            const { id } = req.params;

            // Buscar evento e módulos em queries separadas para evitar problema de
            // cache de schema do Supabase com a relação event_modules
            const [eventoResult, modulesResult] = await Promise.all([
                supabase.from('eventos').select('*, empresas(*)').eq('id', id).single(),
                supabase.from('event_modules').select('*').eq('evento_id', id)
            ]);

            if (eventoResult.error) throw eventoResult.error;

            const data = {
                ...eventoResult.data,
                event_modules: modulesResult.data || []
            };

            res.json({ success: true, data });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async create(req, res) {
        try {
            const {
                nome,
                descricao,
                local,
                data_inicio,
                data_fim,
                capacidade_total,
                datas_montagem,
                datas_evento,
                datas_desmontagem,
                horario_reset,
                tipos_checkin,
                tipos_checkout,
                impressao_etiquetas
            } = req.body;

            if (!nome || !data_inicio) {
                return res.status(400).json({ error: 'Nome e data de início são obrigatórios' });
            }

            const slugify = (text) => {
                return text
                    .toString()
                    .toLowerCase()
                    .trim()
                    .replace(/\s+/g, '-')
                    .replace(/[^\w-]+/g, '')
                    .replace(/--+/g, '-');
            };

            const slug = `${slugify(nome)}-${Date.now().toString(36)}`;

            // Usar service-role client (admin bypass RLS) — authorize('admin') já validou RBAC
            const { data, error } = await supabase
                .from('eventos')
                .insert([{
                    nome,
                    slug,
                    descricao: descricao || '',
                    local: local || '',
                    data_inicio,
                    data_fim: data_fim || null,
                    capacidade_total: capacidade_total || 0,
                    datas_montagem: datas_montagem || [],
                    datas_evento: datas_evento || [],
                    datas_desmontagem: datas_desmontagem || [],
                    horario_reset: horario_reset || '00:00:00',
                    tipos_checkin: tipos_checkin || ['qrcode', 'barcode', 'manual'],
                    tipos_checkout: tipos_checkout || ['qrcode', 'barcode', 'manual'],
                    impressao_etiquetas: !!impressao_etiquetas,
                    status: 'rascunho', // Inicia como rascunho até ativação manual
                    created_by: req.user?.id
                }])
                .select()
                .single();

            if (error) throw error;
            logger.info(`🎉 Evento criado: ${nome}`);
            res.status(201).json({ success: true, data });
        } catch (error) {
            logger.error('Erro ao criar evento:', error.message);
            res.status(500).json({ error: error.message });
        }
    }

    async update(req, res) {
        try {
            const { id } = req.params;
            const updates = req.body;

            const { data, error } = await supabase
                .from('eventos')
                .update({
                    ...updates,
                    updated_at: new Date()
                })
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            res.json({ success: true, data });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async activate(req, res) {
        try {
            const { id } = req.params;
            const { data, error } = await supabase
                .from('eventos')
                .update({ status: 'ativo', updated_at: new Date() })
                .eq('id', id)
                .select()
                .single();
            if (error) throw error;
            res.json({ success: true, message: 'Evento ativado!', data });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async deactivate(req, res) {
        try {
            const { id } = req.params;
            const { data, error } = await supabase
                .from('eventos')
                .update({ status: 'encerrado', updated_at: new Date() })
                .eq('id', id)
                .select()
                .single();
            if (error) throw error;
            res.json({ success: true, message: 'Evento desativado!', data });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async delete(req, res) {
        try {
            const { id } = req.params;
            const { error } = await supabase.from('eventos').delete().eq('id', id);
            if (error) throw error;
            res.json({ success: true, message: 'Evento deletado com sucesso' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getQuotas(req, res) {
        try {
            const db = req.supabase || supabase;
            const { id, empresa_id } = req.params;
            const { data, error } = await db
                .from('quotas_diarias')
                .select('*')
                .eq('evento_id', id)
                .eq('empresa_id', empresa_id);

            if (error) throw error;
            res.json({ success: true, data });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getStats(req, res) {
        try {
            const db = req.supabase || supabase;
            const { id } = req.params;

            // Buscar contagem de funcionários e empresas
            const [funcCount, empCount] = await Promise.all([
                db.from('pessoas').select('id', { count: 'exact', head: true }).eq('evento_id', id),
                db.from('empresas').select('id', { count: 'exact', head: true }).eq('evento_id', id)
            ]);

            res.json({
                success: true,
                stats: {
                    total_pessoas: funcCount.count || 0,
                    total_empresas: empCount.count || 0
                }
            });
        } catch (error) {
            logger.error('Erro ao buscar stats do evento:', error.message);
            res.status(500).json({ error: error.message });
        }
    }

    async updateQuotas(req, res) {
        try {
            const { id, empresa_id } = req.params;
            const { quotas } = req.body; // { '2023-10-01': 10, '2023-10-02': 15 }

            const insertData = Object.entries(quotas).map(([date, quotaVal]) => ({
                evento_id: id,
                empresa_id,
                data: date,
                quota: quotaVal
            }));

            // Upsert quotas para cada data
            const db = req.supabase || supabase;
            const { error } = await db
                .from('quotas_diarias')
                .upsert(insertData, { onConflict: 'evento_id, empresa_id, data' });

            if (error) throw error;
            res.json({ success: true, message: 'Cotas atualizadas!' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async toggleModule(req, res) {
        try {
            const { id: evento_id } = req.params;
            const { module_key, is_enabled } = req.body;

            if (!module_key) {
                return res.status(400).json({ error: 'module_key é obrigatório' });
            }

            const db = req.supabase || supabase;
            const { data, error } = await db
                .from('event_modules')
                .upsert({
                    evento_id,
                    module_key,
                    is_enabled,
                    updated_at: new Date()
                }, { onConflict: 'evento_id, module_key' })
                .select()
                .single();

            if (error) throw error;
            res.json({ success: true, data });
        } catch (error) {
            logger.error('Erro ao alternar módulo:', error.message);
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = new EventoController();
