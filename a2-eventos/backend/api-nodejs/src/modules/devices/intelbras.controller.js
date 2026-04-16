const accessController = require('../checkin/checkin.controller');
const checkinService = require('../checkin/checkin.service');
const logger = require('../../services/logger');
const { supabase } = require('../../config/supabase');

class IntelbrasController {
    /**
     * Receber eventos via HTTP Push do dispositivo
     */
    async handleEventPush(req, res) {
        try {
            let eventData = req.body;

            // Normalização de multipart/form-data
            if (req.body && req.body.info && typeof req.body.info === 'string') {
                try { eventData = JSON.parse(req.body.info); } catch (e) { logger.error(`[Intelbras] JSON parse error: ${e.message}`); }
            } else if (req.body && typeof req.body === 'object' && Object.keys(req.body)[0] === '0') {
                return res.json({ success: true });
            }

            // Normalização de eventos múltiplos ou únicos
            let events = [];
            if (eventData.Events && Array.isArray(eventData.Events)) events = eventData.Events;
            else if (eventData.Action && eventData.Code && eventData.Data) events = [eventData];
            else return res.json({ success: true });

            for (const event of events) {
                const { Code, Data } = event;
                if (Code !== 'AccessControl') continue;

                const { UserID, Method, Similarity } = Data;
                logger.info(`🔔 [Intelbras] Identificação: UserID=${UserID}, Method=${Method}, Confiança=${Similarity}`);

                // 1. Resolver Dispositivo e Contexto do Evento
                let eventoContexto = null;
                let dispositivoNome = req.ip;
                let dispositivoId = null;
                let dispositivoConfig = {};
                let deviceAuth = null;

                const pushToken = req.query.token;

                try {
                    const devIp = req.ip.replace('::ffff:', '');
                    let query = supabase.from('dispositivos_acesso').select('*');
                    
                    if (pushToken) {
                        query = query.eq('control_token', pushToken);
                    } else {
                        query = query.ilike('ip_address', `%${devIp}%`);
                    }

                    const { data: dispositivo } = await query
                        .order('created_at', { ascending: false })
                        .limit(1)
                        .single();

                    if (dispositivo) {
                        eventoContexto = dispositivo.evento_id;
                        dispositivoNome = dispositivo.nome;
                        dispositivoId = dispositivo.id;
                        dispositivoConfig = dispositivo.config || {};
                        deviceAuth = dispositivo;

                        // Atualizar metadata de segurança do dispositivo
                        await supabase
                            .from('dispositivos_acesso')
                            .update({ 
                                last_push_ip: devIp,
                                last_push_at: new Date().toISOString()
                            })
                            .eq('id', dispositivo.id);

                    } else if (pushToken) {
                        logger.error(`🚨 [Intelbras] PUSH SUSPEITO: Token informado (${pushToken}) não corresponde a nenhum dispositivo. IP: ${devIp}`);
                        continue;
                    }
                } catch (devErr) {
                    logger.debug(`[Intelbras] Dispositivo não identificado para o push (IP: ${req.ip}, Token: ${pushToken || 'N/A'})`);
                }

                // 2. Resolver Pessoa (CPF ou UUID)
                let pessoa = null;
                const buscarPessoa = async (campo, valor) => {
                    let query = supabase.from('pessoas').select('*, empresas(nome, ativo)').eq(campo, valor);
                    if (eventoContexto) query = query.eq('evento_id', eventoContexto);
                    const { data } = await query.limit(1).single();
                    return data;
                };

                if (/^\d{11}$/.test(UserID)) pessoa = await buscarPessoa('cpf', UserID);
                else if (/^[0-9a-f]{8}-/i.test(UserID)) pessoa = await buscarPessoa('id', UserID);
                else {
                    // Busca por prefixo se o firmware truncar
                    const { data: rpcData } = await supabase.rpc('buscar_pessoa_por_id_prefixo', { prefixo: UserID.toLowerCase() });
                    if (rpcData && rpcData.length > 0) pessoa = rpcData[0];
                    else pessoa = await buscarPessoa('cpf', UserID);
                }

                if (!pessoa) {
                    logger.warn(`[Intelbras] Identidade desconhecida: ${UserID}`);
                    continue;
                }

                // 3. Registrar o acesso no controlador central (Smart Access Logic)
                const metodoMapeado = this._mapMethod(Method);
                
                try {
                    const result = await checkinService.registrarAcesso(supabase, {
                        pessoa_id: pessoa.id,
                        pessoa: pessoa,
                        evento_id: pessoa.evento_id || eventoContexto,
                        tipo: dispositivoConfig?.fluxo === 'toggle' ? null : (dispositivoConfig?.fluxo || 'checkin'),
                        metodo: metodoMapeado,
                        dispositivo_id: dispositivoNome,
                        area_id: dispositivoConfig?.area_id,
                        confianca: Similarity,
                        offline_timestamp: new Date().toISOString()
                    });

                    // 4. Feedback no Hardware (Relé e Display)
                    if (deviceAuth) {
                        const IntelbrasService = require('./intelbras.service');
                        const service = new IntelbrasService(deviceAuth);

                        if (result.action === 'allow') {
                            // SUCESSO: Abre a catraca se configurado
                            if (dispositivoConfig?.controla_rele !== false) {
                                try {
                                    await service.openDoor();
                                    logger.info(`🔌 [Intelbras] Relé acionado para ${pessoa.nome}`);
                                    await service.displayMessage(`BEM-VINDO ${pessoa.nome.split(' ')[0]}`);
                                } catch (hwError) {
                                    logger.error(`🚨 [Intelbras] FALHA CRÍTICA DE HARDWARE: ${hwError.message}. Iniciando ROLLBACK.`);
                                    
                                    // B-02: ROLLBACK - Reverter o registro no banco para não queimar o acesso
                                    await checkinService.reverterAcesso(supabase, {
                                        pessoa_id: pessoa.id,
                                        log_id: result.details?.id,
                                        motivo: `Falha técnica no hardware: ${hwError.message}`
                                    });

                                    await service.displayMessage(`ERRO HARDWARE`);
                                }
                            } else {
                                await service.displayMessage(`BEM-VINDO ${pessoa.nome.split(' ')[0]}`);
                            }
                        } else {
                            // NEGADO: Apenas feedback visual/sonoro
                            await service.displayMessage(`NEGADO: ${result.error || 'ERRO'}`);
                            logger.warn(`🛑 [Intelbras] Acesso Negado para ${pessoa.nome}: ${result.error}`);
                        }
                    }

                } catch (accessError) {
                    logger.error(`[Intelbras] Crítico ao processar registrarAcesso: ${accessError.message}`);
                }
            }

            res.json({ success: true });
        } catch (error) {
            logger.error('❌ [Intelbras] Erro ao processar push:', error);
            res.status(500).json({ error: 'Erro interno' });
        }
    }

    _mapMethod(intelbrasMethod) {
        const map = {
            'Face': 'face',
            'Card': 'rfid',
            'Password': 'manual',
            'Fingerprint': 'biometry',
            'QRCode': 'qrcode'
        };
        return map[intelbrasMethod] || 'face';
    }
}

module.exports = new IntelbrasController();
