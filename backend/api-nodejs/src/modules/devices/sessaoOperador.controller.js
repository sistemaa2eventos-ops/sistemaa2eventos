const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');
const websocketService = require('../../services/websocketService');

// Banco sem a migration 20261111c (coluna camera_ids): a estação segue só com leitor facial
const semColunaCameras = (error) => error?.code === '42703' || error?.code === 'PGRST204' || /camera_ids/.test(error?.message || '');
const CAMPOS_SESSAO = `
    id, operador_id, dispositivo_id, evento_id, estacao_nome, ativo, created_at,
    dispositivos_acesso ( id, nome, tipo, marca, modelo, ip_address, status_online, config )`;

/** Nomes das câmeras da estação, para o painel mostrar o que está vinculado */
async function comCameras(sessao) {
    if (!sessao) return sessao;
    const ids = Array.isArray(sessao.camera_ids) ? sessao.camera_ids : [];
    if (!ids.length) return { ...sessao, camera_ids: [], cameras: [] };
    const { data } = await supabase.from('cameras_ip').select('id, nome, ia_ativa').in('id', ids);
    return { ...sessao, cameras: data || [] };
}

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

            // Só a estação do evento em foco: uma estação antiga de OUTRO evento (com o leitor de lá)
            // voltava como ativa e o painel tentava religar aquele leitor neste evento
            const eventoId = req.event?.id || null;
            const consultar = (campos) => {
                let q = supabase
                    .from('sessoes_operador')
                    .select(campos)
                    .eq('operador_id', operadorId)
                    .eq('ativo', true);
                if (eventoId) q = q.eq('evento_id', eventoId);
                return q.order('created_at', { ascending: false }).limit(1).maybeSingle();
            };
            let { data, error } = await consultar(`${CAMPOS_SESSAO}, camera_ids`);
            if (semColunaCameras(error)) ({ data, error } = await consultar(CAMPOS_SESSAO));

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
                data: await comCameras(data || null)
            });
        } catch (err) {
            logger.error('❌ [SessaoOperador] Erro ao obter sessão ativa:', err.message);
            return res.status(500).json({ success: false, error: 'Erro ao consultar sessão ativa' });
        }
    }

    /**
     * Vincular a estação do operador logado a um leitor facial e/ou a câmeras com IA.
     * Corpo: { dispositivo_id?, camera_ids?: [], estacao_nome } — pelo menos um dos dois.
     */
    async vincularLeitor(req, res) {
        try {
            const operadorId = req.user?.id;
            const { estacao_nome } = req.body;
            const dispositivo_id = req.body.dispositivo_id || null;
            const cameraIds = [...new Set((Array.isArray(req.body.camera_ids) ? req.body.camera_ids : []).filter(Boolean).map(String))];
            const eventoId = req.event?.id || req.tenantId || req.body.evento_id || req.user?.evento_id;

            if (!dispositivo_id && !cameraIds.length) {
                return res.status(400).json({ success: false, error: 'Escolha um leitor facial ou pelo menos uma câmera com IA.' });
            }

            if (!eventoId) {
                return res.status(400).json({ success: false, error: 'Contexto de evento não identificado' });
            }

            // Leitor (opcional): precisa ser leitor facial deste evento
            let dispositivo = null;
            if (dispositivo_id) {
                const { data, error: devErr } = await supabase
                    .from('dispositivos_acesso')
                    .select('id, nome, ip_address, status_online, config')
                    .eq('id', dispositivo_id)
                    .eq('evento_id', eventoId)
                    .eq('tipo', 'terminal_facial')
                    .maybeSingle();
                if (devErr || !data) {
                    return res.status(404).json({ success: false, error: 'Leitor facial não encontrado neste evento' });
                }
                dispositivo = data;
            }

            // Câmeras (opcionais): deste evento, ativas e com IA ligada
            let cameras = [];
            if (cameraIds.length) {
                const { data, error: camErr } = await supabase
                    .from('cameras_ip')
                    .select('id, nome, status, ia_ativa')
                    .eq('evento_id', eventoId)
                    .in('id', cameraIds);
                if (camErr) throw camErr;
                cameras = data || [];
                const invalidas = cameraIds.filter(id => {
                    const c = cameras.find(x => x.id === id);
                    return !c || c.ia_ativa !== true || c.status === 'desativada' || c.status === 'inativa';
                });
                if (invalidas.length) {
                    return res.status(400).json({ success: false, error: 'Só câmeras ativas e com IA ligada podem identificar pessoas na estação. Ligue a IA da câmera em Câmeras e IA facial.' });
                }
                // Uma câmera abre conferência em uma estação só (senão duas baias abririam a mesma pessoa)
                const { data: outras, error: ocErr } = await supabase
                    .from('sessoes_operador')
                    .select('operador_id, estacao_nome, camera_ids')
                    .eq('evento_id', eventoId)
                    .eq('ativo', true)
                    .overlaps('camera_ids', cameraIds)
                    .neq('operador_id', operadorId);
                if (semColunaCameras(ocErr)) {
                    return res.status(409).json({ success: false, error: 'Para vincular câmeras à estação, aplique a migration 20261111c_sessao_cameras.sql no Supabase.' });
                }
                if (ocErr) throw ocErr;
                if (outras?.length) {
                    const nome = cameras.find(c => outras[0].camera_ids.includes(c.id))?.nome || 'Uma câmera';
                    return res.status(409).json({ success: false, error: `${nome} já está na estação "${outras[0].estacao_nome || 'outro operador'}".` });
                }
            }

            // 1. Desativar qualquer sessão ativa anterior deste operador
            await supabase
                .from('sessoes_operador')
                .update({ ativo: false, updated_at: new Date().toISOString() })
                .eq('operador_id', operadorId)
                .eq('ativo', true);

            // 2. Desativar qualquer operador anterior vinculado a este leitor
            if (dispositivo_id) {
                await supabase
                    .from('sessoes_operador')
                    .update({ ativo: false, updated_at: new Date().toISOString() })
                    .eq('dispositivo_id', dispositivo_id)
                    .eq('ativo', true);
            }

            // 3. Criar a nova sessão ativa
            const linha = {
                operador_id: operadorId,
                dispositivo_id,
                evento_id: eventoId,
                estacao_nome: estacao_nome || dispositivo?.nome || 'Baia Operador',
                ativo: true,
                ...(cameraIds.length ? { camera_ids: cameraIds } : {})
            };
            const { data: criada, error: insErr } = await supabase
                .from('sessoes_operador')
                .insert(linha)
                .select(CAMPOS_SESSAO)
                .single();

            if (insErr) {
                if (insErr.code === 'PGRST205' || insErr.message?.includes('schema cache')) {
                    return res.status(500).json({
                        success: false,
                        error: 'Tabela sessoes_operador precisa ser criada no banco antes do vínculo.',
                        dica: 'Execute a migration 20261001_sessoes_operador.sql no SQL Editor do Supabase.'
                    });
                }
                if (semColunaCameras(insErr) || insErr.code === '23502') {
                    return res.status(409).json({ success: false, error: 'Para usar câmeras (ou estação sem leitor), aplique a migration 20261111c_sessao_cameras.sql no Supabase.' });
                }
                throw insErr;
            }
            const novaSessao = await comCameras({ ...criada, camera_ids: cameraIds });

            logger.info(`✅ [SessaoOperador] Operador ${operadorId} na estação "${novaSessao.estacao_nome}"${dispositivo ? ` (leitor ${dispositivo.nome})` : ''}${cameras.length ? ` (câmeras: ${cameras.map(c => c.nome).join(', ')})` : ''}`);

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
                message: 'Estação vinculada com sucesso',
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
                const consultar = (campos) => supabase
                    .from('sessoes_operador')
                    .select(campos)
                    .eq('evento_id', eventoId)
                    .eq('ativo', true);
                let { data: sessoes, error: sessErr } = await consultar('id, operador_id, dispositivo_id, estacao_nome, ativo, camera_ids');
                if (semColunaCameras(sessErr)) ({ data: sessoes, error: sessErr } = await consultar('id, operador_id, dispositivo_id, estacao_nome, ativo'));

                if (!sessErr && sessoes) {
                    sessoesAtivas = sessoes;
                }
            } catch (_) {}

            const sessoesMap = new Map();
            sessoesAtivas.forEach(s => { if (s.dispositivo_id) sessoesMap.set(s.dispositivo_id, s); });

            // Câmeras com IA ligada do evento (podem identificar a pessoa na estação)
            const { data: camerasIa } = await supabase
                .from('cameras_ip')
                .select('id, nome, status, ia_ativa, vigilancia_ativa, area:evento_areas(nome_area)')
                .eq('evento_id', eventoId)
                .eq('ia_ativa', true)
                .order('nome', { ascending: true });
            const cameras = (camerasIa || [])
                .filter(c => c.status !== 'desativada' && c.status !== 'inativa')
                .map((c) => {
                    const sessao = sessoesAtivas.find(s => Array.isArray(s.camera_ids) && s.camera_ids.includes(c.id));
                    const minha = sessao?.operador_id === operadorId;
                    return {
                        id: c.id,
                        nome: c.nome,
                        area_nome: c.area?.nome_area || null,
                        ia_24h: c.vigilancia_ativa === true,
                        vinculada_a_mim: minha,
                        ocupada: !!sessao && !minha,
                        estacao_nome: sessao && !minha ? sessao.estacao_nome : null
                    };
                });

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
                data: resultado,
                cameras
            });
        } catch (err) {
            logger.error('❌ [SessaoOperador] Erro ao listar dispositivos para vínculo:', err.message);
            return res.status(500).json({ success: false, error: 'Erro ao listar dispositivos' });
        }
    }
}

module.exports = new SessaoOperadorController();
