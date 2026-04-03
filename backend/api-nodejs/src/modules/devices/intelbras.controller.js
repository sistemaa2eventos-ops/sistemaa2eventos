const accessController = require('../checkin/checkin.controller');
const logger = require('../../services/logger');
const { supabase } = require('../../config/supabase');

class IntelbrasController {
    /**
     * Receber eventos via HTTP Push do dispositivo
     * O dispositivo deve ser configurado para enviar eventos para este endpoint.
     */
    async handleEventPush(req, res) {
        try {
            let eventData = req.body;

            // Suporte para multipart/form-data (Quando "Captura de fotos" está ativada no leitor)
            if (req.body && req.body.info && typeof req.body.info === 'string') {
                try {
                    eventData = JSON.parse(req.body.info);
                    logger.debug(`[Intelbras] Payload extraído do campo multipart 'info'`);
                } catch (e) {
                    logger.error(`[Intelbras] Falha ao fazer parse do JSON no campo 'info': ${e.message}`);
                }
            } else if (req.body && typeof req.body === 'object' && Object.keys(req.body)[0] === '0') {
                // Prevenção contra body-parser corrompendo string JSON recebida com header form-urlencoded
                logger.warn(`[Intelbras] Recebido array corrompido de indices. Tentando restaurar...`);
                return res.json({ success: true, message: 'Formato ignorado ou malformado' });
            }

            logger.info(`🔔 [Intelbras] Evento recebido: ${JSON.stringify(eventData).substring(0, 500)}...`);

            // 1. Normalizar estrutura (Intelbras pode enviar { Events: [...] } ou evento único)
            let events = [];
            if (eventData.Events && Array.isArray(eventData.Events)) {
                events = eventData.Events;
            } else if (eventData.Action && eventData.Code && eventData.Data) {
                // Formato evento único (V3/New Firmware)
                events = [eventData];
            } else {
                logger.warn('[Intelbras] Formato de evento desconhecido ou heartbeat:', JSON.stringify(eventData));
                return res.json({ success: true, message: 'Formato ignorado ou heartbeat' });
            }

            for (const event of events) {
                const { Action, Code, Data } = event;

                // Focamos em eventos de controle de acesso (AccessControl)
                if (Code === 'AccessControl') {
                    const { UserID, Event, Method, ReaderID, Time, Similarity } = Data;

                    logger.info(`[Intelbras] Processando AccessControl: UserID=${UserID}, Event=${Event}, Method=${Method}, Similarity=${Similarity}`);

                    // 2. Tentar encontrar a pessoa pelo UserID
                    // Lógica de busca robusta por tipo de identificador:
                    // a) 11 dígitos numéricos → CPF
                    // b) UUID completo (36 chars) → ID direto
                    // c) 8 chars hex → Início do UUID (comum em firmware Intelbras)
                    //    ⚠️ NOTA: ilike não funciona em coluna UUID no PostgreSQL.
                    //    Convertemos com CAST para text usando filter RPC ou buscamos via text query.
                    // d) Qualquer outro → busca por CPF apenas (para evitar erros de tipo)

                    let pessoa = null;
                    let searchError = null;

                    // 2. Tentar resolver o dispositivo logado PRIMEIRO (Para pegar evento_id de contexto)
                    let eventoContexto = null;
                    let dispositivoNome = req.ip;
                    let dispositivoId = req.ip;
                    let dispositivoConfig = null;

                    try {
                        const devIp = req.ip.replace('::ffff:', '');
                        const { data: dispositivo } = await supabase
                            .from('dispositivos_acesso')
                            .select('id, evento_id, nome, config')
                            .ilike('ip_address', `%${devIp}%`)
                            .order('created_at', { ascending: false })
                            .limit(1);

                        if (dispositivo && dispositivo.length > 0) {
                            eventoContexto = dispositivo[0].evento_id;
                            dispositivoNome = dispositivo[0].nome;
                            dispositivoId = dispositivo[0].id;
                            dispositivoConfig = dispositivo[0].config || {};
                        }
                    } catch (devErr) {
                        logger.warn(`[Intelbras] Problema não crítico na resolução do IP ${req.ip}: ${devErr.message}`);
                    }

                    // 3. Buscar a pessoa com tratamento para N registros usando limit(1) em vez de maybeSingle()
                    const buscarPessoa = async (campo, valor) => {
                        let query = supabase
                            .from('pessoas')
                            .select('id, evento_id, nome, empresa_id, foto_url, empresas(nome)')
                            .eq(campo, valor);
                        
                        if (eventoContexto) {
                            query = query.eq('evento_id', eventoContexto);
                        }
                        
                        // Garante que só traga 1 sem crashar caso haja duplicados
                        const { data, error } = await query.order('created_at', { ascending: false }).limit(1);
                        
                        if (error) return { data: null, error };
                        
                        // Fallback: Se não achou com evento_id, tenta global (mesmo CPF noutro evento)
                        if ((!data || data.length === 0) && eventoContexto) {
                            const { data: fallbackData, error: fallbackError } = await supabase
                                .from('pessoas')
                                .select('id, evento_id, nome, empresa_id, foto_url, empresas(nome)')
                                .eq(campo, valor)
                                .order('created_at', { ascending: false })
                                .limit(1);
                            
                            if (fallbackError) return { data: null, error: fallbackError };
                            if (fallbackData && fallbackData.length > 0) return { data: fallbackData[0], error: null };
                        }
                        
                        return { data: data && data.length > 0 ? data[0] : null, error: null };
                    };

                    if (/^\d{11}$/.test(UserID)) {
                        logger.debug(`[Intelbras] Buscando por CPF: ${UserID}`);
                        const res2 = await buscarPessoa('cpf', UserID);
                        pessoa = res2.data; searchError = res2.error;
                    } else if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(UserID)) {
                        logger.debug(`[Intelbras] Buscando por UUID completo: ${UserID}`);
                        const res2 = await buscarPessoa('id', UserID);
                        pessoa = res2.data; searchError = res2.error;
                    } else if (/^[0-9a-f]{6,8}$/i.test(UserID)) {
                        logger.debug(`[Intelbras] Buscando por ID truncado: ${UserID}`);
                        const { data: rpcData, error: rpcError } = await supabase.rpc('buscar_pessoa_por_id_prefixo', {
                            prefixo: UserID.toLowerCase()
                        });
                        if (rpcError || !rpcData || rpcData.length === 0) {
                            const res2 = await buscarPessoa('cpf', UserID);
                            pessoa = res2.data; searchError = res2.error;
                        } else {
                            pessoa = rpcData[0];
                        }
                    } else {
                        logger.debug(`[Intelbras] UserID formato genérico, tentando CPF: ${UserID}`);
                        const res2 = await buscarPessoa('cpf', UserID);
                        pessoa = res2.data; searchError = res2.error;
                    }

                    if (searchError) {
                        logger.error(`[Intelbras] Erro severo na query do DB para ${UserID}: ${searchError.message}`);
                        continue;
                    }

                    if (!pessoa) {
                        logger.warn(`[Intelbras] Ninguém encontrado para o ID fornecido pela câmera: ${UserID}`);
                        // Envia notificação global de acesso NEGADO (ROSTO DESCONHECIDO NO EQUIPAMENTO)
                        const websocketService = require('../../services/websocketService');
                        // Tenta mandar pra sala restrita do evento da camera se tivermos, senao manda global em ultimo caso
                        const evt = eventoContexto || 'global';
                        
                        websocketService.emit('new_access', {
                            tipo: 'negado',
                            metodo: 'face',
                            dispositivo_id: dispositivoNome || req.ip,
                            created_at: new Date(),
                            observacao: `Acesso negado: Perfil ${UserID} não confere com a base.`,
                            pessoas: { nome: 'DESCONHECIDO' }
                        }, eventoContexto); // eventoContexto resolve room, pass under fallback
                        continue;
                    }

                    logger.info(`[Intelbras] Pessoa identificada com precisão: ${pessoa.nome} (${pessoa.id}) na câmera ${dispositivoNome}`);

                    const tipo = dispositivoConfig?.fluxo || 'checkin';
                    const metodoMapeado = this._mapMethod(Method);

                    // 4. Nova Lógica: Verificar se dispositivo está em "Modo Identidade"
                    if (dispositivoConfig?.modo_identificacao) {
                        logger.info(`[Modo Identidade Ativo] Dispositivo ${dispositivoNome} apenas reconheceu ${pessoa.nome}. Enviando para o painel do operador...`);

                        // Notificar apenas o painel Web via WebSocket para prosseguir com Check-in guiado
                        const websocketService = require('../../services/websocketService');
                        websocketService.emit('face_identified', {
                            pessoa_id: pessoa.id,
                            evento_id: pessoa.evento_id,
                            metodo: metodoMapeado,
                            dispositivo_id: dispositivoId,
                            dispositivo_nome: dispositivoNome,
                            confianca: Similarity,
                            pessoas: pessoa,
                            timestamp: new Date()
                        }, pessoa.evento_id);

                        // Não registra check-in autônomo, o fluxo termina aqui neste terminal
                        continue;
                    }

                    // 5. Registrar o acesso via controlador central (Fluxo Standalone Padrão)

                    try {
                        const result = await accessController.registrarAcesso({
                            pessoa_id: pessoa.id,
                            evento_id: pessoa.evento_id,
                            tipo: tipo,
                            metodo: metodoMapeado,
                            dispositivo_id: dispositivoNome, // Nome legível do leitor
                            confianca: Similarity,
                            data_hora: Time || new Date(),
                            created_by: null
                        });

                        if (result && result.success) {
                            logger.info(`✅ [Intelbras] Acesso registrado: ${pessoa.nome} (${tipo}) via ${metodoMapeado} — Leitor: ${dispositivoNome}`);
                        } else {
                            logger.warn(`⚠️ [Intelbras] registrarAcesso retornou sem sucesso para ${pessoa.nome}`);
                        }
                    } catch (accessError) {
                        // Acesso negado pelas regras de negócio (fase, data, bloqueio, etc.)
                        logger.warn(`🛑 [Intelbras] Acesso negado para ${pessoa.nome}: ${accessError.message}`);
                        // O WebSocket de negado já é emitido dentro de registrarLogNegado() chamado por registrarAcesso()
                    }
                }
            }

            res.json({ success: true });
        } catch (error) {
            logger.error('❌ [Intelbras] Erro ao processar push de eventos:', error);
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
