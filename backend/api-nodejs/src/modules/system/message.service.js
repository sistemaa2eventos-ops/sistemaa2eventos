const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');


class MessageTemplateService {
    /**
     * Busca um template com fallback (Evento -> Global)
     */
    async getTemplate(slug, canal, eventoId = null) {
        try {
            // 1. Tentar buscar o template específico do evento
            if (eventoId) {
                const { data: eventTemplate } = await supabase
                    .from('mensagem_templates')
                    .select('*')
                    .eq('slug', slug)
                    .eq('canal', canal)
                    .eq('evento_id', eventoId)
                    .maybeSingle();

                if (eventTemplate) return eventTemplate;
            }

            // 2. Se não houver ou não houver eventoId, buscar o padrão global
            const { data: globalTemplate } = await supabase
                .from('mensagem_templates')
                .select('*')
                .eq('slug', slug)
                .eq('canal', canal)
                .is('evento_id', null)
                .maybeSingle();

            return globalTemplate;
        } catch (error) {
            logger.error(`Erro ao buscar template ${slug}:${canal}:`, error);
            return null;
        }
    }

    /**
     * Substitui variáveis {{var}} pelos valores reais
     */
    render(templateContent, variables) {
        if (!templateContent) return '';
        
        let rendered = templateContent;
        Object.entries(variables).forEach(([key, value]) => {
            const regex = new RegExp(`{{${key}}}`, 'g');
            rendered = rendered.replace(regex, value || '');
        });
        
        return rendered;
    }

    /**
     * Salva ou atualiza um template específico para um evento
     */
    async saveTemplate(templateData) {
        const { slug, canal, titulo, conteudo, evento_id } = templateData;
        
        const { data, error } = await supabase
            .from('mensagem_templates')
            .upsert({
                slug,
                canal,
                titulo,
                conteudo,
                evento_id,
                updated_at: new Date()
            }, { onConflict: 'slug, canal, evento_id' })
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    /**
     * Lista templates disponíveis para edição no menu de configurações
     */
    async listAvailableTemplates(eventoId) {
        // Busca todos os globais e sobrescreve com os do evento se existirem
        const { data: all, error } = await supabase
            .from('mensagem_templates')
            .select('*')
            .or(`evento_id.is.null,evento_id.eq.${eventoId}`);

        if (error || !all) {
            logger.warn('Falha ao buscar templates de mensagem:', error?.message);
            return [];
        }

        // Agrupar por slug+canal para garantir que o do evento vença o global
        const map = new Map();
        for (const t of all) {
            const key = `${t.slug}:${t.canal}`;
            if (!map.has(key) || t.evento_id !== null) {
                map.set(key, t);
            }
        }

        return Array.from(map.values());
    }
}

module.exports = new MessageTemplateService();
