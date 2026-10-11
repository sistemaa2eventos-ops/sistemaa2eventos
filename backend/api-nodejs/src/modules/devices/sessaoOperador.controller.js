const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');
const websocketService = require('../../services/websocketService');

class SessaoOperadorController {
    /**
     * Obter a sessão ativa do operador logado
     */
    async obterSessaoAtiva(req, res) {
        try {
            const operadorId = req.user?.id;
            if (!operadorId) {
                return res.status(401).json({ success: false, error: 'Usuário não autenticado' });
            }

            const { data, error } = await supabase
                .from('sessoes_operador')
                .select(`
                    id,
                    operador_id,
                    dispositivo_id,
                    evento_id,
                    estacao_nome,
                    ativo,
                    created_at,
                    dispositivos_acesso (
                        id,
                        nome,
                        tipo,
                        marca,
                        modelo,
                        ip_address,
                        status_online,
                        config
                    )
                `)
                .eq('operador_id', operadorId)
                .eq('ativo', true)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (error) {
                if (error.code === 'PGRST205' || error.message?.includes('schema cache')) {
                    logger.warn('⚠️ [SessaoOperador] Tabela sessoes_operador ainda não criada no Supabase');
                    return res.json({
                        success: true,
                        data: null,
                        aviso: 'Tabela sessoes_operador pendente de execução de migração no Supabase.'
                    });
                }
                throw error;
            }

            return res.json({
                success: true,
                data: data || null
            });
        } catch (err) {
            logger.error('❌ [SessaoOperador] Erro ao obter sessão ativa:', err.message);
            return res.status(500).json({ success: false, error: 'Erro ao consultar sessão ativa' });
        }
    }

    /**
     * Vincular o operador logado a um leitor facial / dispositivo
     */
    async vincularLeitor(req, res) {
        try {
            const operadorId = req.user?.id;
            const { dispositivo_id, estacao_nome } = req.body;
            const eventoId = req.event?.id || req.tenantId || req.body.evento_id || req.user?.evento_id;

            if (!dispositivo_id) {
                return res.status(400).json({ success: false, error: 'dispositivo_id é obrigatório' });
            }

            if (!eventoId) {
                return res.status(400).json({ success: false, error: 'Contexto de evento não identificado' });
            }

            // Verificar se o dispositivo existe
            const { data: dispositivo, error: devErr } = await supabase
                .from('dispositivos_acesso')
                .select('id, nome, ip_address, status_online, config')
                .eq('id', dispositivo_id)
                .eq('evento_id', eventoId)
                .eq('tipo', 'terminal_facial')
                .single();

            if (devErr || !dispositivo) {
                return res.status(404).json({ success: false, error: 'Dispositivo não encontrado' });
            }

            // 1. Desativar qualquer sessão ativa anterior deste operador
            await supabase
                .from('sessoes_operador')
                .update({ ativo: false, updated_at: new Date().toISOString() })
                .eq('operador_id', operadorId)
                .eq('ativo', true);

            // 2. Desativar qualquer operador anterior vinculado a este dispositivo
            await supabase
                .from('sessoes_operador')
                .update({ ativo: false, updated_at: new Date().toISOString() })
                .eq('dispositivo_id', dispositivo_id)
                .eq('ativo', true);

            // 3. Criar a nova sessão ativa
            const { data: novaSessao, error: insErr } = await supabase
                .from('sessoes_operador')
                .insert({
                    operador_id: operadorId,
                    dispositivo_id: dispositivo_id,
                    evento_id: eventoId,
                    estacao_nome: estacao_nome || dispositivo.nome || 'Baia Operador',
                    ativo: true
                })
                .select(`
                    id,
                    operador_id,
                    dispositivo_id,
                    evento_id,
                    estacao_nome,
                    ativo,
                    created_at,
                    dispositivos_acesso (
                        id,
                        nome,
                        tipo,
                        marca,
                        modelo,
                        ip_address,
                        status_online,
                        config
                    )
                `)
                .single();

            if (insErr) {
                if (insErr.code === 'PGRST205' || insErr.message?.includes('schema cache')) {
                    return res.status(500).json({
                        success: false,
                        error: 'Tabela sessoes_operador precisa ser criada no banco antes do vínculo.',
                        dica: 'Execute a migration 20261001_sessoes_operador.sql no SQL Editor do Supabase.'
                    });
                }
                throw insErr;
            }

            logger.info(`✅ [SessaoOperador] Operador ${operadorId} vinculado ao leitor ${dispositivo.nome} (${dispositivo_id})`);

            // Notificar via WebSocket
            websocketService.emitToOperador(operadorId, 'sessao_operador_atualizada', novaSessao);
            websocketService.emit('estacao_status_mudou', {
                dispositivo_id,
                operador_id: operadorId,
                ativo: true,
                estacao_nome: novaSessao.estacao_nome
            }, `evento_${eventoId}`);

            return res.json({
                success: true,
                message: 'Operador vinculado ao leitor facial com sucesso',
                data: novaSessao
            });
        } catch (err) {
            logger.error('❌ [SessaoOperador] Erro ao vincular leitor:', err.message);
            return res.status(500).json({ success: false, error: 'Erro ao vincular operador ao leitor facial' });
        }
    }

    /**
     * Desvincular operador do leitor facial ativo
     */
    async desvincularLeitor(req, res) {
        try {
            const operadorId = req.user?.id;
            const eventoId = req.event?.id || req.tenantId || req.user?.evento_id;

            const { data: sessoesAnteriores, error: selErr } = await supabase
                .from('sessoes_operador')
                .select('id, dispositivo_id')
                .eq('operador_id', operadorId)
                .eq('ativo', true);

            if (selErr && (selErr.code === 'PGRST205' || selErr.message?.includes('schema cache'))) {
                return res.json({ success: true, message: 'Nenhuma sessão ativa encontrada' });
            }

            await supabase
                .from('sessoes_operador')
                .update({ ativo: false, updated_at: new Date().toISOString() })
                .eq('operador_id', operadorId)
                .eq('ativo', true);

            logger.info(`🔌 [SessaoOperador] Operador ${operadorId} desvinculou sua sessão`);

            websocketService.emitToOperador(operadorId, 'sessao_operador_atualizada', null);

            if (eventoId && sessoesAnteriores?.length > 0) {
                sessoesAnteriores.forEach(s => {
                    websocketService.emit('estacao_status_mudou', {
                        dispositivo_id: s.dispositivo_id,
                        operador_id: operadorId,
                        ativo: false
                    }, `evento_${eventoId}`);
                });
            }

            return res.json({
                success: true,
                message: 'Leitor desvinculado com sucesso'
            });
        } catch (err) {
            logger.error('❌ [SessaoOperador] Erro ao desvincular leitor:', err.message);
            return res.status(500).json({ success: false, error: 'Erro ao desvincular leitor' });
        }
    }

    /**
     * Listar dispositivos disponíveis para vínculo no evento
     */
    async listarDispositivosParaVinculo(req, res) {
        try {
            const operadorId = req.user?.id;
            const eventoId = req.event?.id || req.tenantId || req.query.evento_id || req.user?.evento_id;

            if (!eventoId) {
                return res.status(400).json({ success: false, error: 'Contexto de evento não identificado' });
            }

            // 1. Buscar todos os dispositivos do evento
            const { data: dispositivos, error: devErr } = await supabase
                .from('dispositivos_acesso')
                .select('id, nome, tipo, marca, modelo, ip_address, status_online, config, created_at')
                .eq('evento_id', eventoId)
                .eq('tipo', 'terminal_facial') // só leitores faciais podem ser estação de credenciamento
                .order('nome', { ascending: true });

            if (devErr) throw devErr;

            // 2. Buscar sessões ativas para esses dispositivos
            let sessoesAtivas = [];
            try {
                const { data: sessoes, error: sessErr } = await supabase
                    .from('sessoes_operador')
                    .select('id, operador_id, dispositivo_id, estacao_nome, ativo')
                    .eq('evento_id', eventoId)
                    .eq('ativo', true);

                if (!sessErr && sessoes) {
                    sessoesAtivas = sessoes;
                }
            } catch (_) {}

            const sessoesMap = new Map();
            sessoesAtivas.forEach(s => sessoesMap.set(s.dispositivo_id, s));

            // 3. Montar lista enriquecida
            const resultado = (dispositivos || []).map(dev => {
                const sessao = sessoesMap.get(dev.id);
                const vinculadoAoUsuario = sessao?.operador_id === operadorId;
                const ocupadoPorOutro = sessao && !vinculadoAoUsuario;

                return {
                    ...dev,
                    sessao_ativa: sessao || null,
                    vinculado_a_mim: vinculadoAoUsuario,
                    ocupado: ocupadoPorOutro
                };
            });

            return res.json({
                success: true,
                data: resultado
            });
        } catch (err) {
            logger.error('❌ [SessaoOperador] Erro ao listar dispositivos para vínculo:', err.message);
            return res.status(500).json({ success: false, error: 'Erro ao listar dispositivos' });
        }
    }
}

module.exports = new SessaoOperadorController();
