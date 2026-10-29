const checkinService = require('../checkin/checkin.service');
const logger = require('../../services/logger');
const { supabase } = require('../../config/supabase');
const websocketService = require('../../services/websocketService');
const IntelbrasService = require('./intelbras.service');

const DISPOSITIVO_CACHE_MS = 15 * 1000;
const CACHE_DISPOSITIVO = new Map(); // token/IP → { dispositivo, expiraEm }
const ONLINE_INTERVALO_MS = 30 * 1000;
const ULTIMO_ONLINE = new Map(); // id/token/IP do leitor → última gravação de "online"
const { COLUNAS_PESSOA_ACESSO } = require('../checkin/services/colunasPessoa');

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

            // Relé e display rodam DEPOIS de responder: o leitor não fica esperando o hardware
            // (o nginx corta em 15 s e o firmware pode reenviar o push → acesso em dobro).
            const feedbacks = [];

            for (const event of events) {
                const { Code, Data } = event;
                if (Code !== 'AccessControl') continue;

                const { UserID, Method, Similarity, Time } = Data;
                logger.info(`🔔 [Intelbras] Identificação: UserID=${UserID}, Method=${Method}, Confiança=${Similarity}`);

                // 1. Resolver Dispositivo e Contexto do Evento
                let eventoContexto = null;
                let dispositivoNome = req.ip;
                let dispositivoId = null;
                let dispositivoConfig = {};
                let deviceAuth = null;
                let sessaoOperador = null;

                const pushToken = req.query.token;

                try {
                    const devIp = req.ip.replace('::ffff:', '');
                    const dispositivo = await this._findDevice(pushToken, req.ip);

                    if (dispositivo) {
                        eventoContexto = dispositivo.evento_id;
                        dispositivoNome = dispositivo.nome;
                        dispositivoId = dispositivo.id;
                        dispositivoConfig = dispositivo.config || {};
                        deviceAuth = dispositivo;

                        // Metadata de segurança e STATUS ONLINE do dispositivo (sem segurar o acesso)
                        this._marcarOnline({ id: dispositivo.id }, devIp);

                    } else if (pushToken) {
                        logger.error(`🚨 [Intelbras] PUSH SUSPEITO: Token informado (${pushToken}) não corresponde a nenhum dispositivo. IP: ${devIp}`);
                        continue;
                    }
                } catch (devErr) {
                    logger.debug(`[Intelbras] Dispositivo não identificado para o push (IP: ${req.ip}, Token: ${pushToken || 'N/A'})`);
                }

                // 2. Resolver Pessoa (CPF ou UUID)
                let pessoa = null;
                let searchError = null;
                const buscarPessoa = async (campo, valor) => {
                    let query = supabase.from('pessoas').select(`${COLUNAS_PESSOA_ACESSO}, empresas(nome, ativo)`).eq(campo, valor);
                    if (eventoContexto) query = query.eq('evento_id', eventoContexto);
                    const { data, error } = await query.order('created_at', { ascending: false }).limit(1);
                    if (error) return { data: null, error };

                    if ((!data || data.length === 0) && eventoContexto) {
                        // Fallback: pessoa pode estar cadastrada em outro evento
                        const { data: fallbackData, error: fallbackError } = await supabase
                            .from('pessoas')
                            .select(`${COLUNAS_PESSOA_ACESSO}, empresas(nome, ativo)`)
                            .eq(campo, valor)
                            .order('created_at', { ascending: false })
                            .limit(1);
                        if (fallbackError) return { data: null, error: fallbackError };
                        if (fallbackData && fallbackData.length > 0) return { data: fallbackData[0], error: null };
                    }

                    return { data: data && data.length > 0 ? data[0] : null, error: null };
                };

                if (/^\d{11}$/.test(UserID)) {
                    const res2 = await buscarPessoa('cpf', UserID);
                    pessoa = res2.data; searchError = res2.error;
                } else if (/^[0-9a-f]{8}-/i.test(UserID)) {
                    const res2 = await buscarPessoa('id', UserID);
                    pessoa = res2.data; searchError = res2.error;
                } else {
                    // Busca por prefixo se o firmware truncar
                    const { data: rpcData } = await supabase.rpc('buscar_pessoa_por_id_prefixo', { prefixo: UserID.toLowerCase() });
                    if (rpcData && rpcData.length > 0) pessoa = rpcData[0];
                    else {
                        const res2 = await buscarPessoa('cpf', UserID);
                        pessoa = res2.data; searchError = res2.error;
                    }
                }

                if (searchError) {
                    logger.error(`[Intelbras] Erro na consulta para ${UserID}: ${searchError.message}`);
                }

                if (!pessoa) {
                    logger.warn(`[Intelbras] Identidade desconhecida: ${UserID}`);
                    websocketService.emit('new_access', {
                        tipo: 'negado',
                        metodo: this._mapMethod(Method),
                        dispositivo_id: dispositivoNome || req.ip,
                        created_at: new Date().toISOString(),
                        observacao: `Acesso negado: Perfil ${UserID} não confere com a base.`,
                        pessoas: { nome: 'DESCONHECIDO' }
                    }, eventoContexto);
                    continue;
                }

                // 2.1 Verificar se o dispositivo está vinculado a um operador de credenciamento
                sessaoOperador = await this._buscarSessaoOperador(dispositivoId);
                const modoDispositivo = deviceAuth?.modo || dispositivoConfig?.modo;
                const isEstacaoCredenciamento = sessaoOperador || modoDispositivo === 'credenciamento';
                const isEstacaoExclusivaCredenciamento = modoDispositivo === 'credenciamento' && !dispositivoConfig?.controla_rele;

                if (isEstacaoCredenciamento) {
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
                            const primeiroNome = (pessoa.nome_completo || pessoa.nome || '').split(' ')[0] || 'COLABORADOR';
                            feedbacks.push(() => IntelbrasService.paraDispositivo(deviceAuth).displayMessage(`ACESSO LIBERADO\n${primeiroNome}`));
                        }
                        continue;
                    }
                }

                // 2.2 Dispositivo em "Modo Identificação": apenas reconhece, não libera
                if (dispositivoConfig?.modo_identificacao) {
                    logger.info(`[Modo Identificação] ${dispositivoNome} reconheceu ${pessoa.nome_completo || pessoa.nome}. Enviando para o painel do operador...`);

                    websocketService.emit('face_identified', {
                        pessoa_id: pessoa.id,
                        evento_id: pessoa.evento_id || eventoContexto,
                        metodo: this._mapMethod(Method),
                        dispositivo_id: dispositivoId,
                        dispositivo_nome: dispositivoNome,
                        confianca: Similarity,
                        pessoas: pessoa,
                        timestamp: new Date()
                    }, pessoa.evento_id || eventoContexto);

                    // Não registra check-in autônomo: o fluxo termina neste terminal
                    continue;
                }

                // 3. Registrar o acesso no controlador central (Smart Access Logic)
                const metodoMapeado = this._mapMethod(Method);
                const parsedTime = Time ? new Date(Time) : null;
                const offlineTimestamp = (parsedTime && !Number.isNaN(parsedTime.getTime()))
                    ? parsedTime.toISOString()
                    : new Date().toISOString();

                try {
                    const result = await checkinService.registrarAcesso(supabase, {
                        pessoa_id: pessoa.id,
                        pessoa: pessoa,
                        evento_id: pessoa.evento_id || eventoContexto,
                        tipo: dispositivoConfig?.fluxo === 'toggle' ? null : (dispositivoConfig?.fluxo || 'checkin'),
                        metodo: metodoMapeado,
                        dispositivo_id: dispositivoNome,
                        area_id: deviceAuth?.area_id || dispositivoConfig?.area_id || null,
                        area_nome: deviceAuth?.area_nome,
                        confianca: Similarity,
                        offline_timestamp: offlineTimestamp
                    });

                    // 4. Feedback no Hardware (Relé e Display), depois da resposta ao leitor
                    if (deviceAuth) feedbacks.push(async () => {
                        const service = IntelbrasService.paraDispositivo(deviceAuth);

                        const nomePessoa = pessoa.nome_completo || pessoa.nome || 'COLABORADOR';
                        const primeiroNome = nomePessoa.split(' ')[0] || 'COLABORADOR';

                        if (result.action === 'allow') {
                            // SUCESSO: Abre a catraca se configurado
                            if (dispositivoConfig?.controla_rele !== false) {
                                try {
                                    const opened = await service.openDoor();
                                    if (!opened) throw new Error('Terminal não confirmou abertura da porta');
                                    logger.info(`🔌 [Intelbras] Relé acionado para ${nomePessoa}`);
                                    await service.displayMessage(`BEM-VINDO ${primeiroNome}`);
                                } catch (hwError) {
                                    logger.error(`🚨 [Intelbras] FALHA CRÍTICA DE HARDWARE: ${hwError.message}. Iniciando ROLLBACK.`);
                                    
                                    // B-02: ROLLBACK - Reverter o registro no banco para não queimar o acesso
                                    await checkinService.reverterAcesso(supabase, {
                                        pessoa_id: pessoa.id,
                                        log_id: result.details?.id || result.id,
                                        motivo: `Falha técnica no hardware: ${hwError.message}`,
                                        status_anterior: pessoa.status_acesso
                                    });

                                    await service.displayMessage(`ERRO HARDWARE`);
                                }
                            } else {
                                await service.displayMessage(`BEM-VINDO ${primeiroNome}`);
                            }
                        } else {
                            // NEGADO: Apenas feedback visual/sonoro
                            await service.displayMessage(`NEGADO: ${result.error || 'ERRO'}`);
                            logger.warn(`🛑 [Intelbras] Acesso Negado para ${nomePessoa}: ${result.error}`);
                        }
                    });

                } catch (accessError) {
                    logger.error(`[Intelbras] Crítico ao processar registrarAcesso: ${accessError.message}`);
                }
            }

            res.json({ success: true });

            for (const feedback of feedbacks) {
                await feedback().catch(e => logger.error(`[Intelbras] Falha no feedback do hardware: ${e.message}`));
            }
        } catch (error) {
            logger.error('❌ [Intelbras] Erro ao processar push:', error);
            res.status(500).json({ error: 'Erro interno' });
        }
    }

    /**
     * Endpoint Modo Online (Intelbras_ModeCfg.DeviceMode=1)
     * O dispositivo detecta a face e pergunta ao servidor: "pode entrar?"
     * O servidor responde e o dispositivo controla o relé sozinho.
     *
     * Formato da resposta esperado pelo firmware Intelbras:
     *   {"message":"Acesso Liberado","code":"200","auth":"true"}
     *   {"message":"Acesso Negado","code":"200","auth":"false"}
     */
    async handleOnlineMode(req, res) {
        // Declaradas fora do try para ficarem acessíveis no catch
        let pessoa = null;
        let userID = null;

        let reqId = 1;
        const respond = (allowed, message) => res.json(this._buildOnlineResponse(allowed, message, reqId));

        try {
            const rawBody = typeof req.body === 'string' ? req.body : null;
            const body = this._normalizeOnlineBody(req.body);

            // Firmware Bio-T novo exige "id" na resposta (manual: campos id, auth e message)
            reqId = body?.id ?? body?.ID ?? body?.Id ?? req.query?.id ?? 1;

            const event0 = body?.Events?.[0] || body?.events?.[0];
            const eventCode = event0?.Code || event0?.code || null;
            const eventData = event0?.Data || event0?.data || {};

            userID = this._extractOnlineUserId(body, eventData, rawBody);

            logger.debug(`[Online] REQUEST DEBUG:`, {
                contentType: req.headers['content-type'],
                eventCode,
                bodyKeys: Object.keys(body || {}),
                dataKeys: Object.keys(eventData || {}),
                reqId,
                extractedUserID: userID,
                errorCode: eventData?.ErrorCode,
                similarity: eventData?.Similarity,
                rawBodyLength: rawBody?.length,
                queryToken: req.query.token
            });

            if (!userID) {
                // Alarmes/eventos de sistema (ChassisIntruded, DoorStatus...) só precisam de ACK.
                if (eventCode && eventCode !== 'AccessControl') {
                    logger.info(`[Online] Evento de sistema do terminal (${eventCode}) — ACK enviado.`);
                    return respond(true, 'OK');
                }
                // AccessControl sem UserID = rosto/cartão NÃO reconhecido pelo terminal → NUNCA liberar.
                logger.warn(`[Online] 🛑 Identificação sem UserID (ErrorCode=${eventData?.ErrorCode ?? 'N/A'}) — acesso negado.`, {
                    ip: req.ip,
                    rawBody: rawBody ? rawBody.substring(0, 300) : undefined
                });
                return respond(false, 'NAO IDENTIFICADO');
            }

            logger.debug(`[Online] Verificação de acesso: UserID=${userID}, IP=${req.ip}`);

            // 2. Identificar dispositivo pelo token (ou IP exato, para legados)
            const dispositivo = await this._findDevice(req.query.token, req.ip);
            if (!dispositivo) {
                logger.warn(`[Online] Dispositivo não registrado (token=${req.query.token || 'N/A'}, IP=${req.ip})`);
                return respond(false, 'DISPOSITIVO NAO REGISTRADO');
            }
            this._marcarOnline({ id: dispositivo.id }, (req.ip || '').replace('::ffff:', ''));

            const config = dispositivo.config || {};
            const eventoId = dispositivo.evento_id;

            // 3. Buscar pessoa (CPF ou UUID) e sessão de operador do leitor em paralelo
            let q = supabase.from('pessoas').select(`${COLUNAS_PESSOA_ACESSO}, empresas(nome, ativo)`);
            if (eventoId) q = q.eq('evento_id', eventoId);
            if (/^[0-9a-f]{8}-/i.test(userID)) q = q.eq('id', userID);
            else q = q.eq('cpf', userID);

            const [{ data: pessoaData }, sessaoOperador] = await Promise.all([
                q.order('created_at', { ascending: false }).limit(1).maybeSingle(),
                this._buscarSessaoOperador(dispositivo.id)
            ]);
            pessoa = pessoaData;

            if (!pessoa) {
                logger.warn(`[Online] 🛑 Pessoa não encontrada no evento: ${userID} → ${dispositivo.nome}`);
                return respond(false, 'NAO CADASTRADO NO EVENTO');
            }

            const primeiroNome = (pessoa.nome_completo || '').split(' ')[0] || 'COLABORADOR';
            const similarity = eventData?.Similarity ?? body?.Similarity ?? null;

            // 3.1 Estação de credenciamento: identifica e abre o modal do operador (não registra acesso)
            const modoDispositivo = dispositivo.modo || config.modo;
            // As duas telas de cadastro marcam a estação de formas diferentes:
            // modo='credenciamento' (Dispositivos) ou config.modo_identificacao (Leitor Facial)
            const isEstacaoCredenciamento = modoDispositivo === 'credenciamento'
                || config.modo_identificacao === true
                || (sessaoOperador && dispositivo.tipo === 'terminal_facial');

            if (isEstacaoCredenciamento) {
                logger.info(`🎯 [Intelbras Online] Pessoa identificada na estação de credenciamento: ${pessoa.nome_completo}`);
                this._emitCredenciamento(dispositivo, sessaoOperador, pessoa, similarity, eventoId);
                return respond(true, `IDENTIFICADO ${primeiroNome}`);
            }

            // 4. Validar + registrar em uma única etapa (Smart Access por área)
            const areaId = dispositivo.area_id || config.area_id || null;
            const tipoFluxo = config.fluxo || 'checkin';

            const result = await checkinService.registrarAcesso(supabase, {
                pessoa_id: pessoa.id,
                pessoa,
                evento_id: eventoId,
                tipo: tipoFluxo === 'toggle' ? null : tipoFluxo,
                metodo: 'facial',
                dispositivo_id: dispositivo.id,
                dispositivo_nome: dispositivo.nome,
                area_id: areaId,
                area_nome: dispositivo.area_nome,
                confianca: similarity
            });

            if (result.action !== 'allow') {
                logger.warn(`[Online] 🛑 Acesso RECUSADO para ${pessoa.nome_completo}: ${result.error}`);
                return respond(false, result.error || 'ACESSO NEGADO');
            }

            const saudacao = result.tipo === 'checkout' ? `ATE LOGO ${primeiroNome}` : `BEM-VINDO ${primeiroNome}`;
            logger.info(`[Online] ✅ Acesso LIBERADO (${result.tipo}): ${pessoa.nome_completo} → ${dispositivo.nome}`);
            return respond(true, saudacao);

        } catch (error) {
            const motivo = error.message || 'Acesso Não Autorizado';
            logger.warn(`[Online] 🛑 Acesso RECUSADO para ${pessoa?.nome_completo || userID}: ${motivo}`);
            return respond(false, motivo);
        }
    }

    /**
     * Resposta no formato do firmware Intelbras: id, auth e message (valores como string).
     */
    _buildOnlineResponse(allowed, message, id = 1) {
        const msg = String(message || (allowed ? 'ACESSO LIBERADO' : 'ACESSO NEGADO'))
            .normalize('NFD').replace(/\p{M}/gu, '')
            .toUpperCase()
            .substring(0, 64);
        return { id, message: msg, code: '200', auth: allowed ? 'true' : 'false' };
    }

    _normalizeOnlineBody(reqBody) {
        if (typeof reqBody === 'string') {
            const parsed = this._parseMultipartMixedPayload(reqBody);
            if (parsed) return parsed;
            try { return JSON.parse(reqBody); } catch (_) { return {}; }
        }
        return reqBody || {};
    }

    /**
     * Extrai o UserID. CardName (nome) NÃO é usado como ID: um rosto desconhecido
     * chega com CardName vazio e não pode ser confundido com identificação.
     */
    _extractOnlineUserId(body, eventData, rawBody) {
        const candidates = [
            eventData?.UserID, eventData?.userId, eventData?.CardNo,
            body?.UserID, body?.userId, body?.card_no, body?.cardNo, body?.CardNo,
            body?.Data?.UserID, body?.data?.UserID, body?.data?.userId, body?.data?.card_no,
            body?.UserList?.[0]?.UserID, body?.UserList?.[0]?.CardNo, body?.card_number
        ];
        const found = candidates.find(v => v !== undefined && v !== null && String(v).trim() !== '');
        if (found) return String(found).trim();
        return this._extractUserIdFromRaw(rawBody);
    }

    /**
     * Localiza o dispositivo por control_token; sem token, por IP exato (dispositivos legados).
     */
    async _findDevice(token, reqIp) {
        // Cache curto: cada passagem buscava a linha inteira do leitor. Mudança feita no painel
        // (modo, área, fluxo) vale em até 15 s.
        const chave = token ? `t:${token}` : `ip:${(reqIp || '').replace('::ffff:', '')}`;
        const item = CACHE_DISPOSITIVO.get(chave);
        if (item && item.expiraEm > Date.now()) return item.dispositivo;

        let q = supabase.from('dispositivos_acesso').select('*');
        if (token) q = q.eq('control_token', token);
        else q = q.eq('ip_address', (reqIp || '').replace('::ffff:', ''));
        const { data, error } = await q.order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (error) throw error;
        if (data) {
            if (CACHE_DISPOSITIVO.size > 500) CACHE_DISPOSITIVO.clear();
            CACHE_DISPOSITIVO.set(chave, { dispositivo: data, expiraEm: Date.now() + DISPOSITIVO_CACHE_MS });
        }
        return data || null;
    }

    /**
     * Marca o leitor como online sem segurar a resposta, no máximo 1x a cada 30 s
     * por leitor (antes: uma gravação no banco por passagem e por keepalive).
     * @param {{id?: string, token?: string, ip?: string}} alvo
     */
    _marcarOnline(alvo, devIp) {
        const chave = alvo.id || alvo.token || alvo.ip;
        if (!chave) return;
        const ultima = ULTIMO_ONLINE.get(chave) || 0;
        if (Date.now() - ultima < ONLINE_INTERVALO_MS) return;
        if (ULTIMO_ONLINE.size > 1000) ULTIMO_ONLINE.clear();
        ULTIMO_ONLINE.set(chave, Date.now());

        const agora = new Date().toISOString();
        let q = supabase.from('dispositivos_acesso').update({
            status: 'online',
            status_online: 'online',
            ultimo_ping: agora,
            last_push_at: agora,
            last_push_ip: devIp
        });
        if (alvo.id) q = q.eq('id', alvo.id);
        else if (alvo.token) q = q.eq('control_token', alvo.token);
        else q = q.eq('ip_address', alvo.ip);
        q.then(({ error }) => {
            if (error) {
                ULTIMO_ONLINE.delete(chave);
                logger.warn(`[Intelbras] Falha ao marcar leitor online (${devIp}): ${error.message}`);
            }
        }, (e) => {
            ULTIMO_ONLINE.delete(chave);
            logger.warn(`[Intelbras] Falha ao marcar leitor online (${devIp}): ${e.message}`);
        });
    }

    /**
     * Notifica a estação de credenciamento. Com operador vinculado, vai só para ele;
     * sem operador, vai para a sala do evento.
     */
    _emitCredenciamento(dispositivo, sessaoOperador, pessoa, similarity, eventoId) {
        const payload = {
            dispositivo_id: dispositivo.id,
            dispositivo_nome: dispositivo.nome,
            estacao_nome: sessaoOperador?.estacao_nome || dispositivo.nome,
            operador_id: sessaoOperador?.operador_id || null,
            confianca: similarity ?? 100,
            timestamp: new Date().toISOString(),
            pessoa: {
                id: pessoa.id,
                nome_completo: pessoa.nome_completo || pessoa.nome,
                cpf: pessoa.cpf,
                foto_url: pessoa.foto_url,
                funcao: pessoa.funcao || pessoa.cargo || 'Participante',
                status_documentos: pessoa.status_documentos || 'pendente',
                status_acesso: pessoa.status_acesso,
                empresa_nome: pessoa.empresas?.nome || pessoa.empresa_nome || 'Empresa não informada',
                empresa_id: pessoa.empresa_id,
                numero_pulseira: pessoa.numero_pulseira || null,
                areas_autorizadas: pessoa.areas_autorizadas || []
            }
        };

        if (sessaoOperador?.operador_id) {
            websocketService.emitToOperador(sessaoOperador.operador_id, 'credenciamento_abrir', payload);
        } else if (eventoId) {
            websocketService.emit('credenciamento_abrir', payload, eventoId);
        }
    }

    /**
     * Keepalive — dispositivo confirma que está online
     */
    async handleKeepalive(req, res) {
        const devIp = req.ip?.replace('::ffff:', '');
        const pushToken = req.query.token;

        this._marcarOnline(pushToken ? { token: pushToken } : { ip: devIp }, devIp);

        res.json({ success: true, code: 200, message: 'OK' });
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

        // 1. Tentar separar por boundaries para isolar a parte JSON da parte binária da foto
        const parts = rawBody.split(/--[^\r\n]+/);
        for (const part of parts) {
            const start = part.indexOf('{');
            const end = part.lastIndexOf('}');
            if (start !== -1 && end > start) {
                const jsonChunk = part.slice(start, end + 1);
                try {
                    return JSON.parse(jsonChunk);
                } catch (_) {}
            }
        }

        // 2. Fallback geral
        const start = rawBody.indexOf('{');
        const end = rawBody.lastIndexOf('}');
        if (start !== -1 && end > start) {
            const jsonChunk = rawBody.slice(start, end + 1);
            try {
                return JSON.parse(jsonChunk);
            } catch (_) {}
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
            /"CardNo"\s*:\s*"([^"\r\n]+)"/i,
            /"CardName"\s*:\s*"([^"\r\n]+)"/i,
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
