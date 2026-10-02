const accessController = require('../checkin/checkin.controller');
const checkinService = require('../checkin/checkin.service');
const logger = require('../../services/logger');
const { supabase } = require('../../config/supabase');
const websocketService = require('../../services/websocketService');

class IntelbrasController {
    /**
     * Receber eventos via HTTP Push do dispositivo
     */
    async handleEventPush(req, res) {
        try {
            let eventData = req.body;

            if (typeof eventData === 'string') {
                const parsedMixed = this._parseMultipartMixedPayload(eventData);
                if (parsedMixed) eventData = parsedMixed;
            }

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

                        // Atualizar metadata de segurança e STATUS ONLINE do dispositivo
                        await supabase
                            .from('dispositivos_acesso')
                            .update({ 
                                last_push_ip: devIp,
                                last_push_at: new Date().toISOString(),
                                status_online: 'online',
                                ultimo_ping: new Date().toISOString()
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

                // 2.1 Verificar se o dispositivo está vinculado a um operador de credenciamento
                const sessaoOperador = await this._buscarSessaoOperador(dispositivoId);
                const isEstacaoExclusivaCredenciamento = dispositivoConfig?.modo === 'credenciamento' && !dispositivoConfig?.controla_rele;

                if (sessaoOperador || dispositivoConfig?.modo === 'credenciamento') {
                    logger.info(`🎯 [Intelbras Push] Pessoa identificada na estação de credenciamento: ${pessoa.nome_completo || pessoa.nome}`);

                    const payloadCredenciamento = {
                        dispositivo_id: dispositivoId,
                        dispositivo_nome: dispositivoNome,
                        estacao_nome: sessaoOperador?.estacao_nome || dispositivoNome,
                        operador_id: sessaoOperador?.operador_id || null,
                        confianca: Similarity || 100,
                        timestamp: new Date().toISOString(),
                        pessoa: {
                            id: pessoa.id,
                            nome_completo: pessoa.nome_completo || pessoa.nome,
                            cpf: pessoa.cpf,
                            foto_url: pessoa.foto_url,
                            funcao: pessoa.funcao || pessoa.cargo,
                            status_documentos: pessoa.status_documentos || 'pendente',
                            status_acesso: pessoa.status_acesso,
                            empresa_nome: pessoa.empresas?.nome || pessoa.empresa_nome || 'Empresa não informada',
                            empresa_id: pessoa.empresa_id,
                            numero_pulseira: pessoa.numero_pulseira || null,
                            areas_autorizadas: pessoa.areas_autorizadas || []
                        }
                    };

                    if (sessaoOperador?.operador_id) {
                        websocketService.emitToOperador(sessaoOperador.operador_id, 'credenciamento_abrir', payloadCredenciamento);
                    }
                    if (dispositivoId) {
                        websocketService.emitToDispositivo(dispositivoId, 'credenciamento_abrir', payloadCredenciamento);
                    }
                    if (eventoContexto) {
                        websocketService.emit('credenciamento_abrir', payloadCredenciamento, eventoContexto);
                    }

                    if (isEstacaoExclusivaCredenciamento) {
                        if (deviceAuth) {
                            try {
                                const IntelbrasService = require('./intelbras.service');
                                const service = new IntelbrasService(deviceAuth);
                                const primeiroNome = (pessoa.nome_completo || pessoa.nome || '').split(' ')[0] || 'COLABORADOR';
                                await service.displayMessage(`AGUARDE ATENDIMENTO\n${primeiroNome}`);
                            } catch (_) {}
                        }
                        continue;
                    }
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

    /**
     * Endpoint Modo Online (Intelbras_ModeCfg.DeviceMode=1)
     * O dispositivo detecta a face e pergunta ao servidor: "pode entrar?"
     * O servidor responde com auth:true/false e o dispositivo controla o relé sozinho.
     *
     * Formato da resposta esperado pelo firmware:
     *   {"message":"Acesso Liberado","code":200,"auth":"true"}
     *   {"message":"Acesso Negado","code":200,"auth":"false"}
     */
    async handleOnlineMode(req, res) {
        const deny = (motivo) => {
            logger.warn(`[Online] Acesso NEGADO: ${motivo}`);
            return res.json({ message: motivo, code: 200, auth: 'false' });
        };

        try {
            // 1. Parse do body (pode vir como JSON ou multipart)
            let body = req.body;
            const rawBody = typeof req.body === 'string' ? req.body : null;

            if (typeof body === 'string') {
                const parsedMixed = this._parseMultipartMixedPayload(body);
                if (parsedMixed) body = parsedMixed;
                else {
                    try { body = JSON.parse(body); } catch (_) { body = {}; }
                }
            }

            // Suporte ao formato de envio de eventos (multipart/mixed)
            const userID = body?.UserID || body?.userId || body?.card_no
                || body?.cardNo || body?.Data?.UserID
                || this._extractUserIdFromRaw(rawBody);

            // 🔍 DEBUG: Log completo do que foi recebido
            logger.info(`[Online] REQUEST DEBUG:`, {
                contentType: req.headers['content-type'],
                bodyKeys: Object.keys(body || {}),
                bodyFull: JSON.stringify(body),
                rawBodyLength: rawBody?.length,
                extractedUserID: userID,
                queryToken: req.query.token
            });

            if (!userID) {
                logger.error(`[Online] ❌ ID NÃO IDENTIFICADO - Body recebido:`, { body, rawBody: rawBody?.substring(0, 500) });
                return res.json({ message: 'ID não identificado', code: 200, auth: 'false' });
            }

            logger.info(`[Online] Verificação de acesso: UserID=${userID}, IP=${req.ip}`);

            // 2. Identificar dispositivo pelo token ou IP
            const pushToken = req.query.token;
            const devIp = req.ip?.replace('::ffff:', '');

            let dispositivo = null;
            {
                let q = supabase.from('dispositivos_acesso').select('*');
                if (pushToken) q = q.eq('control_token', pushToken);
                else q = q.ilike('ip_address', `%${devIp}%`);
                const { data } = await q.order('created_at', { ascending: false }).limit(1).single();
                dispositivo = data;
            }

            if (!dispositivo) return deny('Dispositivo não registrado');

            const config = dispositivo.config || {};
            const eventoId = dispositivo.evento_id;

            // 3. Buscar pessoa por CPF (11 dígitos) ou UUID
            let pessoa = null;
            {
                let q = supabase.from('pessoas').select('id, nome_completo, cpf, foto_url, status_acesso, status_documentos, cargo, funcao, numero_pulseira, empresa_id, empresas(nome)');
                if (eventoId) q = q.eq('evento_id', eventoId);

                if (/^\d{11}$/.test(userID)) {
                    q = q.eq('cpf', userID);
                } else if (/^[0-9a-f]{8}-/i.test(userID)) {
                    q = q.eq('id', userID);
                } else {
                    q = q.eq('cpf', userID);
                }

                const { data } = await q.limit(1).single();
                pessoa = data;
            }

            if (!pessoa) return deny(`Pessoa não encontrada: ${userID}`);

            // 3.1 Verificar se o dispositivo está vinculado a uma estação/operador de credenciamento
            const sessaoOperador = await this._buscarSessaoOperador(dispositivo.id);
            const isEstacaoExclusivaCredenciamento = config.modo === 'credenciamento' && !config.controla_rele;

            if (sessaoOperador || config.modo === 'credenciamento') {
                logger.info(`🎯 [Intelbras Online] Pessoa identificada na estação de credenciamento: ${pessoa.nome_completo}`);

                const payloadCredenciamento = {
                    dispositivo_id: dispositivo.id,
                    dispositivo_nome: dispositivo.nome,
                    estacao_nome: sessaoOperador?.estacao_nome || dispositivo.nome,
                    operador_id: sessaoOperador?.operador_id || null,
                    confianca: body?.Similarity || 100,
                    timestamp: new Date().toISOString(),
                    pessoa: {
                        id: pessoa.id,
                        nome_completo: pessoa.nome_completo,
                        cpf: pessoa.cpf,
                        foto_url: pessoa.foto_url,
                        funcao: pessoa.funcao || pessoa.cargo,
                        status_documentos: pessoa.status_documentos || 'pendente',
                        status_acesso: pessoa.status_acesso,
                        empresa_nome: pessoa.empresas?.nome || 'Empresa não informada',
                        empresa_id: pessoa.empresa_id,
                        numero_pulseira: pessoa.numero_pulseira || null
                    }
                };

                if (sessaoOperador?.operador_id) {
                    websocketService.emitToOperador(sessaoOperador.operador_id, 'credenciamento_abrir', payloadCredenciamento);
                }
                if (dispositivo.id) {
                    websocketService.emitToDispositivo(dispositivo.id, 'credenciamento_abrir', payloadCredenciamento);
                }
                if (eventoId) {
                    websocketService.emit('credenciamento_abrir', payloadCredenciamento, eventoId);
                }

                if (isEstacaoExclusivaCredenciamento) {
                    const primeiroNome = (pessoa.nome_completo || '').split(' ')[0] || 'COLABORADOR';
                    return res.json({ message: `Aguarde Atendimento ${primeiroNome}`, code: 200, auth: 'false' });
                }
            }

            // 4. Validar políticas de acesso via ValidationService
            const validation = require('../checkin/services/validation.service');
            const tipoFluxo = config.fluxo || 'checkin';
            const timestamp = new Date();

            await validation.validateAccessRules(
                eventoId, 
                pessoa, 
                tipoFluxo === 'toggle' ? 'checkin' : tipoFluxo, 
                'facial', 
                timestamp, 
                body?.Similarity || 100, 
                config.area_id
            );

            // 5. Registrar log de acesso (não-bloqueante)
            const nome = pessoa.nome_completo || 'Desconhecido';

            checkinService.registrarAcesso(supabase, {
                pessoa_id: pessoa.id,
                pessoa,
                evento_id: eventoId,
                tipo: tipoFluxo === 'toggle' ? null : tipoFluxo,
                metodo: 'facial',
                dispositivo_id: dispositivo.id,
                area_id: config.area_id,
                confianca: body?.Similarity || null,
                offline_timestamp: new Date().toISOString()
            }).catch(e => logger.error(`[Online] Erro ao registrar log: ${e.message}`));

            logger.info(`[Online] ✅ Acesso LIBERADO: ${nome} (${pessoa.status_acesso}) → ${dispositivo.nome}`);
            return res.json({ message: `BEM-VINDO ${nome.split(' ')[0]}`, code: 200, auth: 'true' });

        } catch (error) {
            const motivo = error.message || 'Acesso Não Autorizado';
            logger.warn(`[Online] 🛑 Acesso RECUSADO para ${pessoa?.nome_completo || userID}: ${motivo}`);
            return res.json({ message: motivo.toUpperCase(), code: 200, auth: 'false' });
        }
    }

    /**
     * Keepalive — dispositivo confirma que está online
     */
    async handleKeepalive(req, res) {
        const devIp = req.ip?.replace('::ffff:', '');
        const pushToken = req.query.token;

        try {
            const updateData = { 
                status_online: 'online', 
                ultimo_ping: new Date().toISOString(),
                last_push_at: new Date().toISOString() 
            };
            
            let q = supabase.from('dispositivos_acesso').update(updateData);
            if (pushToken) q = q.eq('control_token', pushToken);
            else q = q.ilike('ip_address', `%${devIp}%`);
            await q;
        } catch (_) {}

        res.json({ code: 200, message: 'OK' });
    }

    _mapMethod(intelbrasMethod) {
        const map = {
            'Face': 'facial',
            'Card': 'pulseira',
            'Password': 'manual',
            'Fingerprint': 'facial',
            'QRCode': 'qrcode'
        };
        return map[intelbrasMethod] || 'facial';
    }

    _parseMultipartMixedPayload(rawBody) {
        if (!rawBody || typeof rawBody !== 'string') return null;

        const start = rawBody.indexOf('{');
        const end = rawBody.lastIndexOf('}');
        if (start !== -1 && end > start) {
            const jsonChunk = rawBody.slice(start, end + 1);
            try {
                return JSON.parse(jsonChunk);
            } catch (_) {
                // continua para fallback por regex
            }
        }

        const fallbackUserId = this._extractUserIdFromRaw(rawBody);
        if (fallbackUserId) return { UserID: fallbackUserId };

        return null;
    }

    _extractUserIdFromRaw(rawBody) {
        if (!rawBody || typeof rawBody !== 'string') return null;

        const patterns = [
            /"UserID"\s*:\s*"([^"\r\n]+)"/i,
            /"card_no"\s*:\s*"([^"\r\n]+)"/i,
            /UserID\s*=\s*([^\r\n;]+)/i,
            /name="UserID"\s*\r?\n\r?\n([^\r\n-]+)/i,
            /name="card_no"\s*\r?\n\r?\n([^\r\n-]+)/i
        ];

        for (const pattern of patterns) {
            const match = rawBody.match(pattern);
            if (match && match[1]) {
                const value = String(match[1]).trim().replace(/^"|"$/g, '');
                if (value) return value;
            }
        }

        return null;
    }

    /**
     * Busca sessão ativa de operador vinculada ao dispositivo
     */
    async _buscarSessaoOperador(dispositivoId) {
        if (!dispositivoId) return null;
        try {
            const { data, error } = await supabase
                .from('sessoes_operador')
                .select('id, operador_id, dispositivo_id, evento_id, estacao_nome, ativo')
                .eq('dispositivo_id', dispositivoId)
                .eq('ativo', true)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (error || !data) return null;
            return data;
        } catch (_) {
            return null;
        }
    }
}

module.exports = new IntelbrasController();
