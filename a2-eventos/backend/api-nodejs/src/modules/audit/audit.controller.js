const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');

class AuditController {
    /**
     * Listar logs de auditoria com filtros
     */
    async list(req, res) {
        try {
            const { page = 1, limit = 50, acao, recurso, user_id, data_inicio, data_fim } = req.query;
            const evento_id = req.event?.id;
            const offset = (page - 1) * limit;

            let query = supabase
                .from('audit_logs')
                .select('*', { count: 'exact' });

            if (evento_id) query = query.eq('evento_id', evento_id);
            query = query.order('created_at', { ascending: false });

            if (acao) query = query.eq('acao', acao.toUpperCase());
            if (recurso) query = query.eq('recurso', recurso.toUpperCase());
            if (user_id) query = query.eq('user_id', user_id);
            if (data_inicio) query = query.gte('created_at', data_inicio);
            if (data_fim) query = query.lte('created_at', data_fim);

            const { data, error, count } = await query.range(offset, offset + limit - 1);

            if (error) throw error;

            // Enriquecer com nomes dos perfis
            const userIds = [...new Set((data || []).map(l => l.user_id).filter(Boolean))];
            let perfisMap = {};
            if (userIds.length > 0) {
                const { data: perfis } = await supabase
                    .from('perfis')
                    .select('id, nome_completo')
                    .in('id', userIds);
                perfisMap = (perfis || []).reduce((acc, p) => { acc[p.id] = p.nome_completo; return acc; }, {});
            }

            const logs = (data || []).map(log => ({
                id: log.id,
                acao: log.acao || log.tabela_nome,
                recurso: log.recurso || log.tabela_nome,
                recurso_id: log.recurso_id || log.registro_id,
                detalhes: log.detalhes || log.new_data,
                created_at: log.created_at || log.changed_at,
                usuario_nome: perfisMap[log.user_id || log.changed_by] || 'Sistema'
            }));

            res.json({
                success: true,
                data: logs,
                pagination: {
                    total: count,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    pages: Math.ceil(count / limit)
                }
            });

        } catch (error) {
            logger.error('Erro ao listar logs de auditoria:', error);
            res.status(500).json({ error: 'Falha ao recuperar trilhas de auditoria.' });
        }
    }
}

module.exports = new AuditController();
