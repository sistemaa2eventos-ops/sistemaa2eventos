const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');
const websocketService = require('../../services/websocketService');

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

    /**
     * Registrar fechamento de sessão do operador ao deslogar
     * Consolida tudo o que foi feito na sessão: pessoas criadas, empresas criadas,
     * itens apagados, checkins, notas e tempos online.
     */
    async registrarLogoutSessao(req, res) {
        try {
            const user = req.user || {};
            const {
                operador_id = user.id,
                operador_nome = user.nome_completo || user.nome || 'Operador',
                operador_email = user.email,
                nivel_acesso = user.nivel_acesso || 'operador',
                evento_id = req.event?.id || user.evento_id || req.body.evento_id || null,
                login_at,
                logout_at = new Date().toISOString(),
                tempo_online_segundos = 0,
                tempo_online_formatado = '00h 00m 00s',
                notas = '',
                metricas_locais = {}
            } = req.body;

            const inicioSessao = login_at || new Date(Date.now() - (tempo_online_segundos || 60) * 1000).toISOString();

            // Buscar contagens de ações executadas pelo operador nesta janela de tempo em audit_logs
            let pessoasCriadas = Number(metricas_locais.pessoas_criadas || 0);
            let empresasCriadas = Number(metricas_locais.empresas_criadas || 0);
            let itensApagados = Number(metricas_locais.itens_apagados || 0);
            let checkinsRealizados = Number(metricas_locais.checkins_realizados || 0);
            let totalAcoes = Number(metricas_locais.total_acoes || 0);
            let listaAcoes = [];

            if (operador_id) {
                try {
                    const { data: logsSessao } = await supabase
                        .from('audit_logs')
                        .select('acao, recurso, detalhes, created_at')
                        .eq('user_id', operador_id)
                        .gte('created_at', inicioSessao)
                        .lte('logout_at', logout_at)
                        .order('created_at', { ascending: false })
                        .limit(100);

                    if (logsSessao && logsSessao.length > 0) {
                        listaAcoes = logsSessao;
                        const dbPessoas = logsSessao.filter(l => (l.acao === 'INSERT' || l.acao === 'CREATE_PERSON') && (l.recurso === 'PESSOAS' || l.recurso === 'PARTICIPANTES')).length;
                        const dbEmpresas = logsSessao.filter(l => (l.acao === 'INSERT' || l.acao === 'CREATE_COMPANY') && l.recurso === 'EMPRESAS').length;
                        const dbApagados = logsSessao.filter(l => l.acao === 'DELETE' || l.acao.includes('DELETE')).length;
                        const dbCheckins = logsSessao.filter(l => l.acao === 'CHECKIN' || l.recurso === 'CHECKIN' || l.recurso === 'ACESSO').length;

                        pessoasCriadas = Math.max(pessoasCriadas, dbPessoas);
                        empresasCriadas = Math.max(empresasCriadas, dbEmpresas);
                        itensApagados = Math.max(itensApagados, dbApagados);
                        checkinsRealizados = Math.max(checkinsRealizados, dbCheckins);
                        totalAcoes = Math.max(totalAcoes, logsSessao.length);
                    }
                } catch (errDb) {
                    logger.warn('Aviso: Não foi possível computar audit_logs detalhados da sessão:', errDb.message);
                }
            }

            const sessaoData = {
                operador_id,
                operador_nome,
                operador_email,
                nivel_acesso,
                evento_id,
                login_at: inicioSessao,
                logout_at,
                tempo_online_segundos: Number(tempo_online_segundos),
                tempo_online_formatado,
                pessoas_criadas: pessoasCriadas,
                empresas_criadas: empresasCriadas,
                itens_apagados: itensApagados,
                checkins_realizados: checkinsRealizados,
                total_acoes: totalAcoes,
                notas: notas || '',
                resumo_acoes: listaAcoes.slice(0, 30)
            };

            // 1. Tentar salvar na tabela dedicada sessoes_login_operador
            let gravouTabela = false;
            try {
                const { error: insError } = await supabase
                    .from('sessoes_login_operador')
                    .insert([sessaoData]);
                if (!insError) gravouTabela = true;
            } catch (errTable) {
                logger.warn('Tabela sessoes_login_operador ausente ou com erro, persistindo via audit_logs:', errTable.message);
            }

            // 2. Sempre registrar também em audit_logs para garantia total de auditoria
            try {
                await supabase
                    .from('audit_logs')
                    .insert([{
                        evento_id,
                        user_id: operador_id,
                        nivel_acesso,
                        acao: 'LOGOUT',
                        recurso: 'SESSAO_OPERADOR',
                        recurso_id: operador_id,
                        detalhes: {
                            ...sessaoData,
                            _origem: 'fechamento_sessao_operador',
                            gravou_tabela_sessoes: gravouTabela
                        }
                    }]);
            } catch (errAudit) {
                logger.warn('Falha secundária ao inserir audit_log de fechamento de sessão:', errAudit.message);
            }

            logger.info(`✅ Fechamento de turno salvo: Operador ${operador_nome} (${tempo_online_formatado}, ${pessoasCriadas} pessoas, ${empresasCriadas} empresas)`);

            res.json({
                success: true,
                message: 'Relatório da sessão registrado com sucesso.',
                data: sessaoData
            });

        } catch (error) {
            logger.error('Erro ao registrar logout de sessão:', error);
            res.status(500).json({ error: 'Erro ao processar encerramento da sessão do operador.' });
        }
    }

    /**
     * Listar histórico de sessões dos operadores para a tela de Relatórios
     */
    async listarSessoesOperadores(req, res) {
        try {
            const user = req.user || {};
            const isMasterOrSupervisor = ['master', 'admin_master', 'admin', 'supervisor'].includes(user.nivel_acesso);
            const { page = 1, limit = 50, operador_id, data_inicio, data_fim } = req.query;
            const evento_id = req.event?.id || req.query.evento_id || null;
            const offset = (page - 1) * limit;

            // Se for operador comum, só pode ver suas próprias sessões
            const targetOperadorId = isMasterOrSupervisor ? (operador_id || null) : user.id;

            // 1. Tentar ler da tabela sessoes_login_operador
            try {
                let query = supabase
                    .from('sessoes_login_operador')
                    .select('*', { count: 'exact' });

                if (evento_id) query = query.eq('evento_id', evento_id);
                if (targetOperadorId) query = query.eq('operador_id', targetOperadorId);
                if (data_inicio) query = query.gte('login_at', data_inicio);
                if (data_fim) query = query.lte('logout_at', data_fim);

                query = query.order('created_at', { ascending: false });

                const { data, error, count } = await query.range(offset, offset + limit - 1);

                if (!error && data && data.length > 0) {
                    return res.json({
                        success: true,
                        data: data,
                        pagination: {
                            total: count || data.length,
                            page: parseInt(page),
                            limit: parseInt(limit),
                            pages: Math.ceil((count || data.length) / limit)
                        }
                    });
                }
            } catch (errTable) {
                logger.warn('Fallback: lendo sessoes de audit_logs:', errTable.message);
            }

            // 2. Fallback resiliente: extrair de audit_logs onde recurso = 'SESSAO_OPERADOR'
            let auditQuery = supabase
                .from('audit_logs')
                .select('*', { count: 'exact' })
                .eq('recurso', 'SESSAO_OPERADOR')
                .order('created_at', { ascending: false });

            if (evento_id) auditQuery = auditQuery.eq('evento_id', evento_id);
            if (targetOperadorId) auditQuery = auditQuery.eq('user_id', targetOperadorId);
            if (data_inicio) auditQuery = auditQuery.gte('created_at', data_inicio);
            if (data_fim) auditQuery = auditQuery.lte('created_at', data_fim);

            const { data: fallbackLogs, error: fbError, count: fbCount } = await auditQuery.range(offset, offset + limit - 1);

            if (fbError) throw fbError;

            const sessoesMapeadas = (fallbackLogs || []).map(item => {
                const det = item.detalhes || {};
                return {
                    id: item.id,
                    operador_id: item.user_id || det.operador_id,
                    operador_nome: det.operador_nome || 'Operador',
                    operador_email: det.operador_email || '',
                    nivel_acesso: item.nivel_acesso || det.nivel_acesso || 'operador',
                    evento_id: item.evento_id,
                    login_at: det.login_at || item.created_at,
                    logout_at: det.logout_at || item.created_at,
                    tempo_online_segundos: det.tempo_online_segundos || 0,
                    tempo_online_formatado: det.tempo_online_formatado || '00h 00m 00s',
                    pessoas_criadas: det.pessoas_criadas || 0,
                    empresas_criadas: det.empresas_criadas || 0,
                    itens_apagados: det.itens_apagados || 0,
                    checkins_realizados: det.checkins_realizados || 0,
                    total_acoes: det.total_acoes || 0,
                    notas: det.notas || '',
                    resumo_acoes: det.resumo_acoes || [],
                    created_at: item.created_at
                };
            });

            return res.json({
                success: true,
                data: sessoesMapeadas,
                pagination: {
                    total: fbCount || sessoesMapeadas.length,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    pages: Math.ceil((fbCount || sessoesMapeadas.length) / limit)
                }
            });

        } catch (error) {
            logger.error('Erro ao listar sessões de operadores:', error);
            res.status(500).json({ error: 'Falha ao recuperar histórico de sessões dos operadores.' });
        }
    }

    /**
     * Chamar Administrador Master (Alerta de Emergência / Suporte no Ponto)
     */
    async chamarMaster(req, res) {
        try {
            const user = req.user || {};
            const {
                operador_id = user.id,
                operador_nome = user.nome_completo || user.nome || 'Operador',
                evento_id = req.event?.id || user.evento_id || req.body.evento_id,
                motivo = 'Solicitação de suporte urgente pelo operador',
                urgencia = 'ALTA',
                ponto = 'Posto de Credenciamento / Painel Web'
            } = req.body;

            const alerta = {
                id: `alt_${Date.now()}`,
                tipo: 'CHAMADA_MASTER',
                operador_id,
                operador_nome,
                operador_email: user.email,
                evento_id,
                motivo,
                urgencia,
                ponto,
                timestamp: new Date().toISOString()
            };

            // Disparar WebSocket para a sala system_admin (Master) e para o evento
            try {
                websocketService.emit('alerta_master', alerta, 'system_admin');
                if (evento_id) {
                    websocketService.emit('alerta_master', alerta, evento_id);
                }
            } catch (wsErr) {
                logger.warn('Erro ao emitir WebSocket alerta_master:', wsErr.message);
            }

            // Registrar em audit_logs
            try {
                await supabase
                    .from('audit_logs')
                    .insert([{
                        evento_id: evento_id || null,
                        user_id: operador_id || null,
                        nivel_acesso: user.nivel_acesso || 'operador',
                        acao: 'ALERTA_MASTER',
                        recurso: 'SISTEMA',
                        detalhes: alerta
                    }]);
            } catch (dbErr) {
                logger.warn('Erro ao registrar alerta_master em audit_logs:', dbErr.message);
            }

            logger.info(`🚨 Chamada Master disparada por ${operador_nome} (${motivo})`);

            res.json({
                success: true,
                message: 'Alerta emitido ao Administrador Master com prioridade máxima.',
                alerta
            });

        } catch (error) {
            logger.error('Erro ao processar chamada do master:', error);
            res.status(500).json({ error: 'Erro ao emitir alerta para o Administrador Master.' });
        }
    }
}

module.exports = new AuditController();
