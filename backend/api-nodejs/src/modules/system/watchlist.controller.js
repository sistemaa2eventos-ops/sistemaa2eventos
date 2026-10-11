const { supabase } = require('../../config/supabase');
const watchlistService = require('./watchlist.service');
const logger = require('../../services/logger');
const emailService = require('../../services/emailService');
const websocketService = require('../../services/websocketService');

class WatchlistController {
    /**
     * Listar CPFs da Watchlist do Evento
     */
    async list(req, res) {
        try {
            const evento_id = req.query.evento_id || req.headers['x-evento-id'];
            if (!evento_id) return res.status(400).json({ error: 'evento_id obrigatório' });

            const { data, error } = await supabase
                .from('watchlist')
                .select('*')
                .eq('evento_id', evento_id)
                .eq('ativo', true)
                .order('created_at', { ascending: false });

            if (error) throw error;
            res.json({ success: true, data });
        } catch (error) {
            logger.error('Erro ao listar watchlist:', error);
            res.status(500).json({ error: 'Erro ao listar CPFs' });
        }
    }

    /**
     * Download do Modelo CSV para Importação
     */
    async downloadTemplateCSV(req, res) {
        try {
            const csvContent = "CPF,NOME,MOTIVO,NIVEL_ALERTA\n" +
                "01059674165,Wanderley Ferreira Adorno Filho,Restricao de Seguranca,alto\n" +
                "12345678901,Nome do Individuo,Suspeito de Fraude,critico\n";

            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', 'attachment; filename=modelo_watchlist.csv');
            res.send("\uFEFF" + csvContent); // BOM UTF-8 para Excel
        } catch (error) {
            logger.error('Erro ao baixar template CSV:', error);
            res.status(500).json({ error: 'Erro ao gerar modelo CSV' });
        }
    }

    /**
     * Upload de CSV
     */
    async upload(req, res) {
        try {
            const evento_id = req.body.evento_id || req.headers['x-evento-id'];
            if (!evento_id) return res.status(400).json({ error: 'evento_id obrigatório' });
            if (!req.file) return res.status(400).json({ error: 'Arquivo CSV não fornecido' });

            const result = await watchlistService.uploadCSV(evento_id, req.file.buffer);
            if (result.error) return res.status(400).json({ error: result.error });

            res.json(result);
        } catch (error) {
            logger.error('Erro no upload da watchlist:', error);
            res.status(500).json({ error: 'Erro no processamento do arquivo' });
        }
    }

    /**
     * Adicionar Manualmente (com bloqueio global em todos os eventos)
     */
    async addManual(req, res) {
        try {
            const evento_id = req.body.evento_id || req.headers['x-evento-id'];
            const { cpf, nome, motivo, nivel_alerta } = req.body;

            if (!evento_id || !cpf) return res.status(400).json({ error: 'Campos obrigatórios ausentes' });
            const cpfLimpo = String(cpf).replace(/\D/g, '');

            const { data, error } = await supabase
                .from('watchlist')
                .upsert([{
                    evento_id,
                    cpf: cpfLimpo,
                    nome: nome || 'Alvo Monitorado',
                    motivo: motivo || 'Adicionado manualmente',
                    nivel_alerta: nivel_alerta || 'alto',
                    ativo: true,
                    adicionado_por: req.user?.id
                }], { onConflict: 'evento_id,cpf' })
                .select()
                .single();

            if (error) throw error;

            // SIGILO OPERACIONAL: Alvos da Watchlist NÃO são bloqueados na tabela pessoas
            // para permitir rastreamento sigiloso sem alertar o indivíduo nos leitores/catracas.
            logger.info(`🔍 [Watchlist AddManual] CPF ${cpfLimpo} adicionado para monitoramento sigiloso.`);

            res.json({ success: true, data });
        } catch (error) {
            logger.error('Erro ao adicionar CPF manual:', error);
            res.status(500).json({ error: 'Erro ao salvar CPF' });
        }
    }

    /**
     * Desbloquear Indivíduo da Watchlist com Notificação Obrigatória ao ADMIN_MASTER
     * E liberação imediata para acesso e cadastro em todos os eventos
     */
    async desbloquear(req, res) {
        try {
            const { id } = req.params;
            const motivo_desbloqueio = req.body?.motivo_desbloqueio || req.query?.motivo_desbloqueio;

            if (!id) return res.status(400).json({ error: 'ID do alvo obrigatório' });
            if (!motivo_desbloqueio || String(motivo_desbloqueio).trim().length < 3) {
                return res.status(400).json({ error: 'Justificativa / Motivo do desbloqueio é obrigatório para registrar auditoria de segurança.' });
            }

            // 1. Obter registro do alvo
            let watchlistId = id;
            let { data: item } = await supabase
                .from('watchlist')
                .select('*')
                .eq('id', id)
                .maybeSingle();

            if (!item) {
                // Tentar por pessoa_id
                const { data: pessoa } = await supabase
                    .from('pessoas')
                    .select('cpf')
                    .eq('id', id)
                    .maybeSingle();

                if (pessoa && pessoa.cpf) {
                    const cpfLimpo = pessoa.cpf.replace(/\D/g, '');
                    const { data: wByCpf } = await supabase
                        .from('watchlist')
                        .select('*')
                        .eq('cpf', cpfLimpo)
                        .maybeSingle();
                    if (wByCpf) {
                        watchlistId = wByCpf.id;
                        item = wByCpf;
                    }
                }
            }

            if (!item) {
                return res.status(404).json({ error: 'Alvo não encontrado na watchlist' });
            }

            const cpfLimpo = item.cpf ? String(item.cpf).replace(/\D/g, '') : null;
            const operadorNome = req.user?.nome_completo || req.user?.nome || req.user?.email || 'Operador de Segurança';
            const horario = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
            const justificativaFinal = String(motivo_desbloqueio).trim();

            // 2. Desativar registro na Watchlist (sem updated_at)
            await supabase
                .from('watchlist')
                .update({ 
                    ativo: false
                })
                .eq('id', watchlistId);

            if (cpfLimpo) {
                await supabase
                    .from('watchlist')
                    .update({ ativo: false })
                    .eq('cpf', cpfLimpo);
            }

            // 3. LIBERAÇÃO IMEDIATA: Atualizar todas as ocorrências deste CPF na tabela pessoas em todos os eventos
            if (cpfLimpo) {
                await supabase
                    .from('pessoas')
                    .update({
                        bloqueado: false,
                        status_acesso: 'autorizado',
                        motivo_bloqueio: null,
                        updated_at: new Date()
                    })
                    .eq('cpf', cpfLimpo);
            }

            // 4. Limpar trava de rastreamento em memória se houver
            if (item.evento_id && cpfLimpo) {
                watchlistService.concluirRastreamento(item.evento_id, cpfLimpo, operadorNome);
            }

            // 5. NOTIFICAR O ADMIN_MASTER (E-MAIL + WEBSOCKET DE SEGURANÇA)
            const dadosNotificacao = {
                nome: item.nome || 'Alvo Monitorado',
                cpf: item.cpf,
                motivo_desbloqueio: justificativaFinal,
                operador_nome: operadorNome,
                horario
            };

            setImmediate(async () => {
                try {
                    // Buscar Administradores Master
                    const { data: masters } = await supabase
                        .from('perfis')
                        .select('id, nome_completo, email, nivel_acesso')
                        .eq('nivel_acesso', 'admin_master');

                    const emailDestinos = new Set();
                    emailDestinos.add('sistemaa2eventos@gmail.com');
                    if (process.env.ADMIN_ALERT_EMAIL) emailDestinos.add(process.env.ADMIN_ALERT_EMAIL);
                    (masters || []).forEach(m => {
                        if (m.email && m.email.includes('@')) emailDestinos.add(m.email);
                    });

                    for (const email of emailDestinos) {
                        await emailService.sendDesbloqueioAlert(email, dadosNotificacao).catch(e => logger.warn(`Falha email desbloqueio: ${e.message}`));
                    }

                    // WebSocket para operadores master logados
                    websocketService.emit('watchlist_unblocked', {
                        ...dadosNotificacao,
                        mensagem: `🔓 ALERTA: ${dadosNotificacao.nome} (CPF: ${dadosNotificacao.cpf}) foi DESBLOQUEADO por ${operadorNome}. Motivo: ${justificativaFinal}`
                    }, 'system_admin');

                    logger.info(`✅ [Watchlist Desbloqueio] ${dadosNotificacao.nome} (${dadosNotificacao.cpf}) desbloqueado por ${operadorNome}. Motivo: ${justificativaFinal}`);
                } catch (notifErr) {
                    logger.error('Erro no despacho de notificações de desbloqueio:', notifErr);
                }
            });

            res.json({ 
                success: true, 
                message: 'Indivíduo desbloqueado com sucesso! Liberado imediatamente para cadastro e acesso em todos os eventos. Notificação despachada aos Administradores Master.' 
            });
        } catch (error) {
            logger.error('Erro ao desbloquear CPF da watchlist:', error);
            res.status(500).json({ error: error.message || 'Erro ao processar desbloqueio' });
        }
    }

    /**
     * Deixar de monitorar um alvo (quando encontrado ou abordado pela equipe de segurança)
     */
    async deixarDeMonitorar(req, res) {
        try {
            const { id } = req.params;
            const evento_id = req.body.evento_id || req.headers['x-evento-id'] || req.query.evento_id;
            const motivo = req.body?.motivo || 'Alvo localizado e abordado pela equipe de segurança';

            let watchlistId = id;
            let item = null;

            const { data: wItem } = await supabase
                .from('watchlist')
                .select('*')
                .eq('id', id)
                .maybeSingle();

            if (wItem) {
                item = wItem;
            } else {
                const { data: wByCpf } = await supabase
                    .from('watchlist')
                    .select('*')
                    .eq('cpf', String(id).replace(/\D/g, ''))
                    .maybeSingle();
                if (wByCpf) {
                    watchlistId = wByCpf.id;
                    item = wByCpf;
                }
            }

            if (!item) {
                return res.status(404).json({ error: 'Alvo não encontrado na watchlist' });
            }

            const cpfLimpo = item.cpf ? String(item.cpf).replace(/\D/g, '') : null;
            const operadorNome = req.user?.nome_completo || req.user?.nome || req.user?.email || 'Operador de Segurança';

            // 1. Desativar da Watchlist (ativo: false)
            await supabase
                .from('watchlist')
                .update({ ativo: false })
                .eq('id', watchlistId);

            if (cpfLimpo) {
                await supabase
                    .from('watchlist')
                    .update({ ativo: false })
                    .eq('cpf', cpfLimpo);
            }

            // 2. Concluir rastreamento em memória se houver
            const evId = evento_id || item.evento_id;
            if (evId && cpfLimpo) {
                watchlistService.concluirRastreamento(evId, cpfLimpo, operadorNome);
            }

            // 3. Emitir encerramento de alarme no WebSocket
            const io = (req.app && typeof req.app.get === 'function') ? req.app.get('io') : global.io;
            const payload = {
                id: watchlistId,
                cpf: cpfLimpo,
                nome: item.nome,
                operador: operadorNome,
                motivo,
                timestamp: new Date().toISOString()
            };

            if (io) {
                io.to('system_watchlist').emit('watchlist_target_resolved', payload);
                io.to('system_watchlist').emit('watchlist_alert_concluido', payload);
            }

            logger.info(`✅ [Watchlist] Alvo localizado e monitoramento encerrado: ${item.nome} (${cpfLimpo}) por ${operadorNome}`);

            res.json({
                success: true,
                message: `Alvo ${item.nome || cpfLimpo} localizado! Monitoramento encerrado com sucesso.`,
                data: payload
            });
        } catch (error) {
            logger.error('Erro ao deixar de monitorar alvo:', error);
            res.status(500).json({ error: error.message || 'Erro ao processar encerramento de monitoramento' });
        }
    }

    /**
     * Remover/Desativar da Watchlist (Alias para deixar de monitorar)
     */
    async remove(req, res) {
        return this.deixarDeMonitorar(req, res);
    }

    /**
     * Contatos de Alerta
     */
    async listContatos(req, res) {
        try {
            const evento_id = req.query.evento_id || req.headers['x-evento-id'];
            const { data, error } = await supabase
                .from('watchlist_contatos')
                .select('*')
                .eq('evento_id', evento_id);
            if (error) throw error;
            res.json({ success: true, data });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async addContato(req, res) {
        try {
            const evento_id = req.body.evento_id || req.headers['x-evento-id'];
            const { nome, telefone, canal, bot_token } = req.body;
            const { data, error } = await supabase
                .from('watchlist_contatos')
                .insert([{ evento_id, nome, telefone, canal, bot_token, ativo: true }])
                .select()
                .single();
            if (error) throw error;
            res.json({ success: true, data });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async removeContato(req, res) {
        try {
            const { id } = req.params;
            const { error } = await supabase.from('watchlist_contatos').delete().eq('id', id);
            if (error) throw error;
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * Histórico de Alertas
     */
    async listAlertas(req, res) {
        try {
            const evento_id = req.query.evento_id || req.headers['x-evento-id'] || req.event?.id;
            const { data, error } = await supabase
                .from('watchlist_alertas')
                .select('*, watchlist(nome, cpf, motivo, nivel_alerta), pessoa:pessoas(id, nome_completo, cpf, foto_url, numero_pulseira, funcao), area:evento_areas(nome_area)')
                .eq('evento_id', evento_id)
                .order('hora', { ascending: false })
                .limit(50);
            if (error) throw error;
            res.json({ success: true, data: data || [] });
        } catch (error) {
            logger.error('Erro ao listar histórico de alertas:', error);
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * Lista completa de Alvos / Procurados no Evento
     * Cruza com a tabela pessoas e logs_acesso para trazer pulseira, check-in, check-out e status
     */
    async listProcurados(req, res) {
        try {
            const evento_id = req.query.evento_id || req.headers['x-evento-id'] || req.event?.id;
            if (!evento_id) return res.status(400).json({ error: 'evento_id obrigatório' });

            // 1. Buscar todos os itens ativos na watchlist para o evento
            const { data: watchItems, error: wErr } = await supabase
                .from('watchlist')
                .select('*')
                .eq('evento_id', evento_id)
                .eq('ativo', true)
                .order('created_at', { ascending: false });

            if (wErr) throw wErr;
            if (!watchItems || watchItems.length === 0) {
                return res.json({ success: true, data: [] });
            }

            // 2. Para cada item da watchlist, correlacionar com a tabela 'pessoas'
            const { data: pessoasEvent } = await supabase
                .from('pessoas')
                .select('id, nome_completo, cpf, funcao, numero_pulseira, foto_url, status_acesso, empresas(id, nome)')
                .eq('evento_id', evento_id);

            const pessoaMapByCpf = new Map();
            const pessoaMapByName = new Map();
            (pessoasEvent || []).forEach(p => {
                if (p.cpf) {
                    const limpo = p.cpf.replace(/\D/g, '');
                    pessoaMapByCpf.set(limpo, p);
                }
                if (p.nome_completo) {
                    pessoaMapByName.set(p.nome_completo.toLowerCase().trim(), p);
                }
            });

            // 3. Buscar os logs mais recentes de check-in e check-out
            const pessoaIds = (pessoasEvent || []).map(p => p.id);
            let logsMap = new Map();
            if (pessoaIds.length > 0) {
                const { data: logs } = await supabase
                    .from('logs_acesso')
                    .select('id, pessoa_id, tipo, created_at')
                    .eq('evento_id', evento_id)
                    .in('tipo', ['checkin', 'checkout'])
                    .in('pessoa_id', pessoaIds)
                    .order('created_at', { ascending: false });

                (logs || []).forEach(log => {
                    if (!logsMap.has(log.pessoa_id)) {
                        logsMap.set(log.pessoa_id, {
                            ultimo_tipo: log.tipo,
                            ultimo_log_at: log.created_at,
                            ultimo_checkin: log.tipo === 'checkin' ? log.created_at : null,
                            ultimo_checkout: log.tipo === 'checkout' ? log.created_at : null
                        });
                    } else {
                        const entry = logsMap.get(log.pessoa_id);
                        if (!entry.ultimo_checkin && log.tipo === 'checkin') {
                            entry.ultimo_checkin = log.created_at;
                        }
                        if (!entry.ultimo_checkout && log.tipo === 'checkout') {
                            entry.ultimo_checkout = log.created_at;
                        }
                    }
                });
            }

            // 4. Montar a lista enriquecida
            const result = watchItems.map(w => {
                const p = pessoaMapByCpf.get(w.cpf) || pessoaMapByName.get((w.nome || '').toLowerCase().trim());
                const logData = p ? logsMap.get(p.id) : null;
                const estaPresente = logData ? (logData.ultimo_tipo === 'checkin') : false;

                return {
                    id: w.id,
                    watchlist_id: w.id,
                    pessoa_id: p?.id || null,
                    nome: p?.nome_completo || w.nome,
                    cpf: p?.cpf || w.cpf,
                    funcao: p?.funcao || 'Não informada',
                    empresa_nome: p?.empresas?.nome || '—',
                    numero_pulseira: p?.numero_pulseira || 'Sem pulseira',
                    foto_url: p?.foto_url || null,
                    status_acesso: p?.status_acesso || 'pendente',
                    esta_presente: estaPresente,
                    ultimo_checkin: logData?.ultimo_checkin || null,
                    ultimo_checkout: logData?.ultimo_checkout || null,
                    motivo: w.motivo || 'Alvo em monitoramento de segurança',
                    nivel_alerta: w.nivel_alerta || 'alto',
                    ativo: w.ativo,
                    created_at: w.created_at
                };
            });

            return res.json({ success: true, data: result });
        } catch (error) {
            logger.error('Erro ao listar procurados:', error);
            res.status(500).json({ error: 'Erro ao listar pessoas com alerta' });
        }
    }

    /**
     * Adicionar pessoa à lista de alertas / procurados
     */
    async addProcurado(req, res) {
        try {
            const evento_id = req.body.evento_id || req.headers['x-evento-id'] || req.event?.id;
            const { pessoa_id, cpf, nome, motivo, nivel_alerta } = req.body;
            if (!evento_id) return res.status(400).json({ error: 'evento_id obrigatório' });

            let finalCpf = cpf ? String(cpf).replace(/\D/g, '') : null;
            let finalNome = nome;

            if (pessoa_id) {
                const { data: pessoa } = await supabase
                    .from('pessoas')
                    .select('id, nome_completo, cpf')
                    .eq('id', pessoa_id)
                    .single();
                if (pessoa) {
                    finalNome = pessoa.nome_completo;
                    finalCpf = pessoa.cpf ? pessoa.cpf.replace(/\D/g, '') : `ID-${pessoa.id.slice(0, 8)}`;
                }
            }

            if (!finalCpf) {
                return res.status(400).json({ error: 'É necessário informar uma pessoa ou CPF válido.' });
            }

            const { data, error } = await supabase
                .from('watchlist')
                .upsert([{
                    evento_id,
                    cpf: finalCpf,
                    nome: finalNome || 'Alvo Monitorado',
                    motivo: motivo || 'Monitoramento de Segurança',
                    nivel_alerta: nivel_alerta || 'alto',
                    ativo: true,
                    adicionado_por: req.user?.id
                }], { onConflict: 'evento_id,cpf' })
                .select()
                .single();

            if (error) throw error;
            res.json({ success: true, data });
        } catch (error) {
            logger.error('Erro ao adicionar alerta/procurado:', error);
            res.status(500).json({ error: 'Erro ao cadastrar alerta' });
        }
    }

    /**
     * Concluir / Finalizar rastreamento de um alvo localizado pela equipe de segurança
     */
    async concluirRastreamento(req, res) {
        try {
            const evento_id = req.body.evento_id || req.headers['x-evento-id'] || req.query.evento_id;
            const { cpf, motivo } = req.body;
            if (!evento_id || !cpf) {
                return res.status(400).json({ error: 'evento_id e cpf são obrigatórios' });
            }

            const operador_nome = req.user?.nome_completo || req.user?.nome || req.user?.email || 'Operador de Segurança';
            const cpfLimpo = String(cpf).replace(/\D/g, '');

            watchlistService.concluirRastreamento(evento_id, cpfLimpo, operador_nome);

            // Notificar consoles conectados via WebSocket para encerrar alarme
            const io = (req.app && typeof req.app.get === 'function') ? req.app.get('io') : global.io;
            const payload = {
                cpf: cpfLimpo,
                operador: operador_nome,
                motivo: motivo || 'Alvo localizado / abordado pela equipe',
                timestamp: new Date().toISOString()
            };

            if (io) {
                io.to('system_watchlist').emit('watchlist_alert_concluido', payload);
            }

            logger.info(`✅ [Watchlist Controller] Rastreamento finalizado: CPF ${cpfLimpo} por ${operador_nome}`);
            res.json({ success: true, message: 'Rastreamento concluído com sucesso.', data: payload });
        } catch (error) {
            logger.error('Erro ao concluir rastreamento:', error);
            res.status(500).json({ error: 'Erro ao concluir rastreamento' });
        }
    }
}

module.exports = new WatchlistController();
