const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');
const veiculoService = require('./veiculo.service');

const veiculoController = {
    /**
     * Listar todos os veículos vinculados às empresas do evento atual com paginação
     */
    list: async (req, res) => {
        try {
            const evento_id = req.tenantId || req.event?.id || req.query.evento_id;
            const { busca, page = 1, limit = 20 } = req.query;

            const { data, total } = await veiculoService.list(
                supabase, 
                evento_id, 
                busca, 
                parseInt(page), 
                parseInt(limit)
            );
            
            res.json({ success: true, data, total });
        } catch (error) {
            logger.error('Erro inesperado em veiculoController.list:', error);
            res.status(500).json({ error: 'Erro interno no servidor', details: error.message });
        }
    },

    /**
     * Buscar um veículo específico
     */
    getById: async (req, res) => {
        try {
            const { id } = req.params;
            const evento_id = req.tenantId || req.event?.id || req.query.evento_id;

            const data = await veiculoService.getById(supabase, id, evento_id);
            res.json({ success: true, data });
        } catch (error) {
            logger.error('Erro ao buscar veículo:', error);
            res.status(error.message.includes('encontrado') ? 404 : 500).json({ error: error.message });
        }
    },

    /**
     * Criar veículo (Agora via Service)
     */
    create: async (req, res) => {
        try {
            const evento_id = req.tenantId || req.event?.id || req.body?.evento_id || req.query.evento_id;
            const { placa, marca, modelo, empresa_id, motorista_id } = req.body;

            if (!placa || !empresa_id) {
                return res.status(400).json({ error: 'Placa e empresa são obrigatórios' });
            }

            const data = await veiculoService.createVeiculo(supabase, {
                placa, marca, modelo, empresa_id, motorista_id
            }, evento_id);

            res.status(201).json({ success: true, data, message: 'Veículo cadastrado com sucesso' });
        } catch (error) {
            logger.error('Erro inesperado em veiculoController.create:', error);
            res.status(error.message.includes('Já existe') ? 400 : 500).json({ error: error.message });
        }
    },

    /**
     * Atualizar veículo
     */
    update: async (req, res) => {
        try {
            const { id } = req.params;
            const evento_id = req.tenantId || req.event?.id || req.body?.evento_id || req.query.evento_id;
            const { placa, marca, modelo, empresa_id, motorista_id } = req.body;

            const data = await veiculoService.updateVeiculo(supabase, id, { 
                placa, marca, modelo, empresa_id, motorista_id 
            }, evento_id);

            res.json({ success: true, data, message: 'Veículo atualizado com sucesso' });
        } catch (error) {
            logger.error('Erro ao atualizar veículo:', error);
            res.status(500).json({ error: error.message });
        }
    },

    /**
     * Atualizar status (Bloquear/Liberar)
     */
    updateStatus: async (req, res) => {
        try {
            const { id } = req.params;
            const { status, motivo } = req.body;
            const evento_id = req.tenantId || req.event?.id || req.body?.evento_id || req.query.evento_id;

            if (!['liberado', 'bloqueado'].includes(status)) {
                return res.status(400).json({ error: 'Status inválido.' });
            }

            if (status === 'bloqueado' && (!motivo || !motivo.trim())) {
                return res.status(400).json({ error: 'A justificativa do bloqueio é obrigatória.' });
            }

            // Validar propriedade antes de atualizar
            const { data: veiculo, error: vError } = await supabase
                .from('veiculos')
                .select('id, placa, evento_id')
                .eq('id', id)
                .single();

            if (vError || !veiculo) return res.status(404).json({ error: 'Veículo não encontrado.' });
            if (veiculo.evento_id !== evento_id) return res.status(403).json({ error: 'Acesso negado ao veículo.' });

            const { data, error } = await supabase
                .from('veiculos')
                .update({ status })
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;

            // Gravar log de auditoria do bloqueio/desbloqueio
            await supabase
                .from('logs_veiculos')
                .insert({
                    veiculo_id: id,
                    evento_id,
                    placa: veiculo.placa,
                    tipo: status === 'bloqueado' ? 'bloqueio' : 'desbloqueio',
                    metodo: 'manual',
                    operador_id: req.user?.id,
                    observacao: (motivo && motivo.trim()) || (status === 'bloqueado' ? 'Bloqueio operacional sem motivo informado' : 'Desbloqueio manual')
                });

            res.json({ success: true, data, message: `Veículo ${status === 'bloqueado' ? 'bloqueado' : 'liberado'} com sucesso.` });
        } catch (error) {
            logger.error('Erro ao atualizar status:', error);
            res.status(500).json({ error: error.message || 'Erro ao atualizar status.' });
        }
    },

    /**
     * Consulta rápida de placa para o dashboard e portaria
     */
    consultarPlaca: async (req, res) => {
        try {
            const { placa } = req.params;
            const evento_id = req.tenantId || req.event?.id || req.query.evento_id;

            if (!placa) return res.status(400).json({ error: 'Placa não informada.' });
            const placaLimpa = placa.toUpperCase().trim().replace(/\s/g, '');

            // 1. Buscar veículo pela placa
            const { data: veiculo, error: vError } = await supabase
                .from('veiculos')
                .select('*')
                .eq('placa', placaLimpa)
                .maybeSingle();

            if (vError || !veiculo) {
                return res.status(404).json({
                    success: false,
                    autorizado: false,
                    motivo: 'NAO_CADASTRADO',
                    error: 'Placa não cadastrada na base de dados.'
                });
            }

            // 2. Buscar empresa vinculada
            let empresa = null;
            if (veiculo.empresa_id) {
                const { data: empData } = await supabase
                    .from('empresas')
                    .select('id, nome, evento_id')
                    .eq('id', veiculo.empresa_id)
                    .maybeSingle();
                empresa = empData;
            }

            // Validar tenant/evento se evento_id foi fornecido
            if (evento_id && veiculo.evento_id && veiculo.evento_id !== evento_id) {
                if (!empresa || empresa.evento_id !== evento_id) {
                    return res.status(404).json({
                        success: false,
                        autorizado: false,
                        motivo: 'OUTRO_EVENTO',
                        error: 'Veículo registrado para outro evento.'
                    });
                }
            }

            // 3. Buscar dados completos do motorista (Pessoa) incluindo FOTO
            const motoristaId = veiculo.motorista_id || veiculo.pessoa_id;
            let motorista = null;
            if (motoristaId) {
                const { data: pData } = await supabase
                    .from('pessoas')
                    .select('id, nome_completo, cpf, foto_url, funcao, telefone, email')
                    .eq('id', motoristaId)
                    .maybeSingle();
                if (pData) {
                    motorista = {
                        ...pData,
                        nome_completo: pData.nome_completo || 'Motorista'
                    };
                }
            }

            // 4. Se o veículo estiver bloqueado, buscar justificativa no histórico de logs
            let motivoBloqueio = null;
            let bloqueadoEm = null;
            let bloqueadoPor = null;
            if (veiculo.status === 'bloqueado') {
                const { data: logBloqueio } = await supabase
                    .from('logs_veiculos')
                    .select('observacao, created_at, operador_id, usuarios:operador_id(nome_completo)')
                    .eq('veiculo_id', veiculo.id)
                    .eq('tipo', 'bloqueio')
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                motivoBloqueio = logBloqueio?.observacao || 'Veículo com restrição cadastrada.';
                bloqueadoEm = logBloqueio?.created_at || null;
                bloqueadoPor = logBloqueio?.usuarios?.nome_completo || 'Operador do Sistema';
            }

            const veiculoCompleto = {
                ...veiculo,
                empresas: empresa,
                pessoas: motorista,
                motivo_bloqueio: motivoBloqueio,
                bloqueado_em: bloqueadoEm,
                bloqueado_por: bloqueadoPor
            };

            if (veiculo.status === 'bloqueado') {
                return res.json({
                    success: true,
                    autorizado: false,
                    motivo: 'BLOQUEADO',
                    justificativa: motivoBloqueio,
                    bloqueado_em: bloqueadoEm,
                    bloqueado_por: bloqueadoPor,
                    veiculo: veiculoCompleto
                });
            }

            res.json({
                success: true,
                autorizado: true,
                veiculo: veiculoCompleto
            });
        } catch (error) {
            logger.error('Erro ao consultar placa:', error);
            res.status(500).json({ error: 'Erro interno ao consultar placa.' });
        }
    },

    /**
     * Registrar foto / vistoria do veículo com observação e áudio transcrito
     */
    registrarFoto: async (req, res) => {
        try {
            const { veiculo_id, placa, foto_base64, foto_url, observacao, tipo = 'vistoria' } = req.body;
            const evento_id = req.tenantId || req.event?.id || req.body?.evento_id || req.query.evento_id;

            if (!placa) return res.status(400).json({ error: 'Placa é obrigatória.' });

            let finalFotoUrl = foto_url || null;

            // Se recebeu foto em base64, fazer upload para o bucket 'snapshots'
            if (foto_base64) {
                try {
                    const base64Data = foto_base64.replace(/^data:image\/\w+;base64,/, '');
                    const buffer = Buffer.from(base64Data, 'base64');
                    const fileName = `veiculos/${evento_id || 'geral'}/${placa.toUpperCase()}_${Date.now()}.jpg`;

                    const { error: uploadError } = await supabase
                        .storage
                        .from('snapshots')
                        .upload(fileName, buffer, {
                            contentType: 'image/jpeg',
                            upsert: true
                        });

                    if (uploadError) {
                        logger.error('Erro ao enviar foto para storage:', uploadError);
                    } else {
                        const { data: publicData } = supabase
                            .storage
                            .from('snapshots')
                            .getPublicUrl(fileName);
                        finalFotoUrl = publicData?.publicUrl;
                    }
                } catch (imgErr) {
                    logger.error('Falha ao processar base64 da foto:', imgErr);
                }
            }

            // Buscar veículo para associar ID se não informado
            let vId = veiculo_id;
            if (!vId) {
                const { data: veiculoDb } = await supabase
                    .from('veiculos')
                    .select('id')
                    .eq('placa', placa.toUpperCase().trim().replace(/\s/g, ''))
                    .maybeSingle();
                vId = veiculoDb?.id || null;
            }

            // Salvar no logs_veiculos
            const { data, error } = await supabase
                .from('logs_veiculos')
                .insert({
                    veiculo_id: vId,
                    evento_id,
                    placa: placa.toUpperCase().replace(/\s/g, ''),
                    tipo: tipo || 'vistoria',
                    metodo: 'foto',
                    operador_id: req.user?.id,
                    observacao: JSON.stringify({
                        texto: observacao || '',
                        foto_url: finalFotoUrl,
                        metodo: 'foto_vistoria'
                    })
                })
                .select()
                .single();

            if (error) throw error;

            res.json({
                success: true,
                data: {
                    ...data,
                    foto_url: finalFotoUrl,
                    observacao_texto: observacao
                },
                message: 'Foto e vistoria registradas com sucesso.'
            });
        } catch (error) {
            logger.error('Erro ao registrar foto do veículo:', error);
            res.status(500).json({ error: error.message || 'Erro ao registrar foto do veículo.' });
        }
    },

    /**
     * Registrar passagem manual (Entrada/Saída)
     */
    registrarPassagem: async (req, res) => {
        try {
            const { placa, tipo, metodo = 'manual', observacao } = req.body;
            const evento_id = req.tenantId || req.event?.id || req.body?.evento_id || req.query.evento_id;

            // Buscar veículo para validar status e pegar ID
            const { data: veiculo } = await supabase
                .from('veiculos')
                .select('id, status, evento_id')
                .eq('placa', placa.toUpperCase().replace(/\s/g, ''))
                .eq('evento_id', evento_id)
                .single();

            if (!veiculo) {
                return res.status(404).json({ error: 'Veículo não cadastrado neste evento.' });
            }

            if (veiculo.status === 'bloqueado') {
                return res.status(403).json({ error: 'Veículo bloqueado.' });
            }

            const { data, error } = await supabase
                .from('logs_veiculos')
                .insert({
                    veiculo_id: veiculo.id,
                    evento_id,
                    placa: placa.toUpperCase().replace(/\s/g, ''),
                    tipo,
                    metodo,
                    operador_id: req.user?.id,
                    observacao
                })
                .select()
                .single();

            if (error) throw error;
            res.json({ success: true, data });
        } catch (error) {
            logger.error('Erro ao registrar passagem:', error);
            res.status(500).json({ error: 'Erro ao registrar passagem.' });
        }
    },

    /**
     * Listagem histórica de passagens de um veículo
     */
    historico: async (req, res) => {
        try {
            const { id } = req.params;
            const { page = 1, limit = 20 } = req.query;
            const from = (page - 1) * limit;

            const { data, error, count } = await supabase
                .from('logs_veiculos')
                .select('*, usuarios:operador_id(nome_completo)', { count: 'exact' })
                .eq('veiculo_id', id)
                .order('created_at', { ascending: false })
                .range(from, from + limit - 1);

            if (error) throw error;
            res.json({ success: true, data, total: count });
        } catch (error) {
            logger.error('Erro ao buscar histórico:', error);
            res.status(500).json({ error: 'Erro ao buscar histórico.' });
        }
    },

    /**
     * Endpoint PÚBLICO para integração LPR (External Hardware)
     */
    consultarPlacaLPR: async (req, res) => {
        try {
            const { placa } = req.params;
            const { evento_id, tipo = 'entrada' } = req.query;

            if (!placa || !evento_id) {
                return res.status(400).json({ autorizado: false, motivo: 'DADOS_INCOMPLETOS' });
            }

            const { data: veiculo, error } = await supabase
                .from('veiculos')
                .select('*, empresas(nome, evento_id), pessoas(nome_completo)')
                .eq('placa', placa.toUpperCase().replace(/\s/g, ''))
                .eq('evento_id', evento_id)
                .single();

            if (error || !veiculo) {
                return res.json({ autorizado: false, motivo: 'NAO_CADASTRADO' });
            }

            if (veiculo.status === 'bloqueado') {
                return res.json({ autorizado: false, motivo: 'BLOQUEADO' });
            }

            // Registrar passagem AUTOMÁTICA via LPR
            await supabase.from('logs_veiculos').insert({
                veiculo_id: veiculo.id,
                evento_id,
                placa: placa.toUpperCase(),
                tipo,
                metodo: 'lpr'
            });

            res.json({
                autorizado: true,
                veiculo: {
                    placa: veiculo.placa,
                    empresa: veiculo.empresas?.nome,
                    motorista: veiculo.pessoas?.nome_completo
                }
            });
        } catch (error) {
            logger.error('Erro em consultarPlacaLPR:', error);
            res.status(500).json({ autorizado: false, motivo: 'ERRO_INTERNO' });
        }
    },

    /**
     * Deletar veículo
     */
    delete: async (req, res) => {
        try {
            const { id } = req.params;
            const evento_id = req.tenantId || req.event?.id || req.query.evento_id;

            await veiculoService.deleteVeiculo(supabase, id, evento_id);
            res.json({ success: true, message: 'Veículo removido com sucesso' });
        } catch (error) {
            logger.error('Erro ao excluir veículo:', error);
            res.status(500).json({ error: error.message });
        }
    }
};

module.exports = veiculoController;
