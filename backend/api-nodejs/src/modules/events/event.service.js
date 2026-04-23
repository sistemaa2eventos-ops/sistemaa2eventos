const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');

class EventService {
    /**
     * Lista todos os eventos com contagens de empresas e pessoas (otimizado)
     */
    async listAll(supabaseClient) {
        // Buscar todos os eventos
        const { data: eventos, error: eventError } = await supabaseClient
            .from('eventos')
            .select('*')
            .order('data_inicio', { ascending: false });

        if (eventError) throw eventError;
        if (!eventos || eventos.length === 0) return [];

        const eventoIds = eventos.map(e => e.id);

        // Buscar contagens em batch para evitar N+1
        const [empResult, pesResult] = await Promise.all([
            supabaseClient.from('empresas').select('evento_id').in('evento_id', eventoIds),
            supabaseClient.from('pessoas').select('evento_id').in('evento_id', eventoIds)
        ]);

        const empCounts = {};
        const pesCounts = {};
        (empResult.data || []).forEach(e => { empCounts[e.evento_id] = (empCounts[e.evento_id] || 0) + 1; });
        (pesResult.data || []).forEach(p => { pesCounts[p.evento_id] = (pesCounts[p.evento_id] || 0) + 1; });

        return eventos.map(evento => ({
            ...evento,
            total_empresas: empCounts[evento.id] || 0,
            total_pessoas: pesCounts[evento.id] || 0
        }));
    }

    /**
     * Busca um evento detalhado incluindo seus módulos
     */
    async getById(supabaseClient, id) {
        const [eventoResult, modulesResult] = await Promise.all([
            supabaseClient.from('eventos').select('*, empresas(*)').eq('id', id).single(),
            supabaseClient.from('event_modules').select('*').eq('evento_id', id)
        ]);

        if (eventoResult.error) throw eventoResult.error;

        return {
            ...eventoResult.data,
            event_modules: modulesResult.data || []
        };
    }

    /**
     * Cria um novo evento com slug automático
     */
    async createEvent(supabaseClient, eventData, creatorId) {
        const { nome, ...otherData } = eventData;

        if (!nome) throw new Error('Nome do evento é obrigatório.');

        const slugify = (text) => {
            return text.toString().toLowerCase().trim()
                .replace(/\s+/g, '-')
                .replace(/[^\w-]+/g, '')
                .replace(/--+/g, '-');
        };

        const slug = `${slugify(nome)}-${Date.now().toString(36)}`;

        const { data, error } = await supabaseClient
            .from('eventos')
            .insert([{
                ...otherData,
                nome,
                slug,
                status: 'rascunho',
                created_by: creatorId
            }])
            .select()
            .single();

        if (error) throw error;
        logger.info(`🎉 Evento [${data.id}] criado: ${nome}`);
        return data;
    }

    async updateEvent(supabaseClient, id, updates) {
        const { data, error } = await supabaseClient
            .from('eventos')
            .update({
                ...updates,
                updated_at: new Date()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    async setStatus(supabaseClient, id, status) {
        const { data, error } = await supabaseClient
            .from('eventos')
            .update({ status, updated_at: new Date() })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    async deleteEvent(supabaseClient, id) {
        const { error } = await supabaseClient.from('eventos').delete().eq('id', id);
        if (error) throw error;
        return true;
    }

    async getQuotas(supabaseClient, eventoId, empresaId) {
        const { data, error } = await supabaseClient
            .from('quotas_diarias')
            .select('*')
            .eq('evento_id', eventoId)
            .eq('empresa_id', empresaId);

        if (error) throw error;
        return data;
    }

    async updateQuotas(supabaseClient, eventoId, empresaId, quotas) {
        const insertData = Object.entries(quotas).map(([date, quotaVal]) => ({
            evento_id: eventoId,
            empresa_id: empresaId,
            data: date,
            quota: quotaVal
        }));

        const { error } = await supabaseClient
            .from('quotas_diarias')
            .upsert(insertData, { onConflict: 'evento_id, empresa_id, data' });

        if (error) throw error;
        return true;
    }

    async toggleModule(supabaseClient, eventoId, moduleKey, isEnabled) {
        const { data, error } = await supabaseClient
            .from('event_modules')
            .upsert({
                evento_id: eventoId,
                module_key: moduleKey,
                is_enabled: isEnabled,
                updated_at: new Date()
            }, { onConflict: 'evento_id, module_key' })
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    async getStats(supabaseClient, eventoId) {
        const [funcCount, empCount] = await Promise.all([
            supabaseClient.from('pessoas').select('id', { count: 'exact', head: true }).eq('evento_id', eventoId),
            supabaseClient.from('empresas').select('id', { count: 'exact', head: true }).eq('evento_id', eventoId)
        ]);

        return {
            total_pessoas: funcCount.count || 0,
            total_empresas: empCount.count || 0
        };
    }

    /**
     * Retorna os presets de configuração estáticos
     */
    getPresets() {
        return {
            'show': {
                nome: 'Show / Concerto',
                description: 'Foco em alta rotatividade e segurança rápida.',
                config: {
                    anti_passback_min: 10,
                    threshold_bio: 80,
                    liveliness_enabled: true,
                    watchdog_timeout_min: 2,
                    sync_delay_threshold_min: 5,
                    modo_checkout: 'manual'
                }
            },
            'exposicao': {
                nome: 'Exposição / Feira',
                description: 'Foco em experiência fluida e coleta de leads.',
                config: {
                    anti_passback_min: 2,
                    threshold_bio: 75,
                    liveliness_enabled: false,
                    watchdog_timeout_min: 5,
                    sync_delay_threshold_min: 15,
                    modo_checkout: 'automatico'
                }
            },
            'congresso': {
                nome: 'Congresso / Corporativo',
                description: 'Foco em controle de acesso rigoroso e permanência.',
                config: {
                    anti_passback_min: 60,
                    threshold_bio: 85,
                    liveliness_enabled: true,
                    watchdog_timeout_min: 10,
                    sync_delay_threshold_min: 30,
                    modo_checkout: 'manual'
                }
            }
        };
    }

    /**
     * Aplica um preset a um evento
     */
    async applyPreset(supabaseClient, eventoId, presetKey) {
        const presets = this.getPresets();
        const preset = presets[presetKey];
        if (!preset) throw new Error('Preset não encontrado.');

        const { data, error } = await supabaseClient
            .from('eventos')
            .update({ 
                config: preset.config,
                updated_at: new Date()
            })
            .eq('id', eventoId)
            .select()
            .single();

        if (error) throw error;
        logger.info(`🛠️ Preset [${preset.nome}] aplicado ao evento ${eventoId}`);
        return data;
    }
}

module.exports = new EventService();
