const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');
const checkinService = require('./checkin.service');
const validationService = require('./services/validation.service');
const ApiResponse = require('../../utils/apiResponse');
const webhookDispatcher = require('../../services/webhookDispatcher');
const websocketService = require('../../services/websocketService'); // FIX C-02: import ausente causava ReferenceError em runtime

class AccessController {
    constructor() {
        this.checkout = this.checkout.bind(this);
        this.processFaceRecognition = this.processFaceRecognition.bind(this);
        this.getLogs = this.getLogs.bind(this);
        this.getRealtimeStats = this.getRealtimeStats.bind(this);
        this.expulsar = this.expulsar.bind(this);
        this.vincularPulseiraFacial = this.vincularPulseiraFacial.bind(this);
        this.bloquearPessoa = this.bloquearPessoa.bind(this);
        this.consultarAreasPulseira = this.consultarAreasPulseira.bind(this);
        this.consultarPulseira = this.consultarPulseira.bind(this);
        this.ultimoCheckin = this.ultimoCheckin.bind(this);
        this.acionarCatraca = this.acionarCatraca.bind(this);
        this.checkinManual = this.checkinManual.bind(this);
        this.checkinQrcode = this.checkinQrcode.bind(this);
    }

    async checkout(req, res) {
        try {
            const { id } = req.params; // Support both body and param
            const pessoa_id = id || req.body.pessoa_id;
            const { dispositivoId, metodo } = req.body;
            const eventoId = req.event?.id;
            const supabaseClient = req.supabase || supabase;

            if (!pessoa_id) return ApiResponse.error(res, 'Participante ID é obrigatório.', 400);

            const result = await checkinService.registrarAcesso(supabaseClient, {
                pessoa_id, 
                evento_id: eventoId, 
                tipo: 'checkout', 
                metodo: metodo || 'manual',
                dispositivo_id: dispositivoId, 
                created_by: req.user?.id
            });

            if (result.error) return ApiResponse.error(res, result.error, 400);

            return ApiResponse.success(res, result);
        } catch (error) {
            logger.error(
                { err: error, person_id: pessoa_id, event_id: eventoId, method: metodo },
                'Error registering checkout'
            );
            return ApiResponse.error(res, 'Erro interno no servidor');
        }
    }

    async processFaceRecognition(req, res) {
        // FIX 4.4: Método em migração para pgvector (Fase 5.1)
        // Recebe requisições mas retorna 501 até que o novo motor biométrico esteja ativo
        // NÃO remover — rota já publicada em checkin.routes.js
        try {
            return ApiResponse.error(res, 'Reconhecimento facial em migração para motor de vetores. Use o terminal físico.', 501);
        } catch (error) {
            logger.error(
                { err: error, event_id: req.event?.id },
                'Error in face recognition processing'
            );
            return ApiResponse.error(res, 'Falha crítica no motor biométrico.');
        }
    }

    async getLogs(req, res) {
        try {
            const _s = (v) => (v && v !== 'undefined' && v !== 'null') ? v : null;
            const eventoId = _s(req.event?.id) || _s(req.query.evento_id) || _s(req.headers['x-evento-id']);
            const { limit = 50, start_date, end_date, tipo } = req.query;
            const supabaseClient = req.supabase || supabase;

            if (!eventoId) return ApiResponse.error(res, 'Evento não identificado.', 400);

            // Passo 1: Buscar os logs diretamente
            let query = supabaseClient.from('logs_acesso')
                .select('*')
                .eq('evento_id', eventoId)
                .order('created_at', { ascending: false })
                .limit(limit);

            if (start_date) query = query.gte('created_at', start_date);
            if (end_date) query = query.lte('created_at', end_date);
            if (tipo) query = query.eq('tipo_acesso', tipo);

            const { data: logs, error: logsError } = await query;
            if (logsError) throw logsError;

            if (!logs || logs.length === 0) return ApiResponse.success(res, []);

            // Passo 2: Coletar IDs de pessoas únicos para população manual
            const pessoaIds = [...new Set(logs.map(l => l.pessoa_id).filter(id => id))];
            
            if (pessoaIds.length > 0) {
                const { data: pessoasData } = await supabaseClient
                    .from('pessoas')
                    .select('id, nome_completo, cpf, foto_url, empresa_id, empresas(nome)')
                    .in('id', pessoaIds);

                // Passo 3: Mapear os dados para enriquecer os logs
                const pessoasMap = (pessoasData || []).reduce((acc, p) => {
                    acc[p.id] = p;
                    return acc;
                }, {});

                logs.forEach(log => {
                    if (log.pessoa_id && pessoasMap[log.pessoa_id]) {
                        log.pessoas = pessoasMap[log.pessoa_id];
                        log.pessoa_nome = pessoasMap[log.pessoa_id].nome_completo;
                    }
                });
            }

            // Passo 4: Coletar e mapear Dispositivos para obter o NOME
            const dispositivoIds = [...new Set(logs.map(l => l.dispositivo_id).filter(id => id))];
            if (dispositivoIds.length > 0) {
                const { data: dispData } = await supabaseClient
                    .from('dispositivos_acesso')
                    .select('id, nome')
                    .in('id', dispositivoIds);
                const dispMap = (dispData || []).reduce((acc, d) => { acc[d.id] = d.nome; return acc; }, {});
                logs.forEach(log => {
                    if (log.dispositivo_id && dispMap[log.dispositivo_id]) {
                        log.dispositivo_nome = dispMap[log.dispositivo_id];
                    }
                });
            }

            return ApiResponse.success(res, logs);
        } catch (error) {
            logger.error(
                { err: error, event_id: req.event?.id },
                'Error fetching access logs'
            );
            return ApiResponse.error(res, 'Erro ao buscar histórico de acessos (Resiliência Ativada).');
        }
    }

    async getRealtimeStats(req, res) {
        try {
            const eventoId = req.event?.id;
            const supabaseClient = req.supabase || supabase;

            const stats = await checkinService.getStats(supabaseClient, eventoId);

            return ApiResponse.success(res, stats);
        } catch (error) {
            logger.error(
                { err: error, event_id: req.event?.id },
                'Error fetching realtime stats'
            );
            return ApiResponse.error(res, 'Erro ao computar estatísticas.');
        }
    }

    async expulsar(req, res) {
        try {
            const { id: pessoa_id } = req.params;
            const { justificativa } = req.body;
            const eventoId = req.event?.id;
            const supabaseClient = req.supabase || supabase;

            if (!justificativa) return ApiResponse.error(res, 'Justificativa de expulsão é obrigatória.', 400);

            // 1. Atualizar status para expulso (bloqueado)
            const { data: pessoa, error } = await supabaseClient
                .from('pessoas')
                .update({ 
                    status_acesso: 'expulso', 
                    bloqueado: true,
                    motivo_bloqueio: `EXPULSÃO: ${justificativa}`,
                    updated_at: new Date()
                })
                .eq('id', pessoa_id)
                .select()
                .single();

            if (error) throw error;

            // 2. Registrar log de saída forçada
            await checkinService.registrarAcesso(supabaseClient, {
                pessoa_id, 
                evento_id: eventoId, 
                tipo: 'expulsao', 
                metodo: 'manual',
                created_by: req.user?.id
            });

            // Dispatch webhook
            webhookDispatcher.dispatchPessoaBloqueada(eventoId, pessoa, justificativa);

            return ApiResponse.success(res, { message: 'Participante expulso com sucesso.', data: pessoa });
        } catch (error) {
            logger.error(
                { err: error, person_id: pessoa_id, event_id: eventoId },
                'Error expelling participant'
            );
            return ApiResponse.error(res, 'Erro ao processar expulsão.');
        }
    }

    async vincularPulseiraFacial(req, res) {
        // Gerenciado pelo hardware externo via WebSocket
        // Ver: Monitor.jsx e websocketService.js
        // Não remover — pode ser necessário no futuro
        return ApiResponse.success(res, { message: 'Endpoint reservado para NFC + Facial Pairing.' });
    }

    async bloquearPessoa(req, res) {
        // Similar ao toggleBlock do PessoaController, mas via fluxo de Checkin
        return ApiResponse.error(res, 'Use o endpoint de entidades para bloqueio administrativo.', 301);
    }

    async consultarPulseira(req, res) {
        try {
          const { codigo } = req.params;
          const evento_id = req.headers['x-evento-id'] || req.query.evento_id || req.event?.id;
          const supabaseClient = req.supabase || supabase;
      
          // Converter código para número para comparação
          const numeroPulseira = parseInt(codigo, 10);
          if (isNaN(numeroPulseira)) {
            return ApiResponse.error(res, 'Código de pulseira inválido.', 400);
          }
      
          // Buscar pessoa pelo número da pulseira ou QR Code
          const { data: pessoa, error: pessoaErr } = await supabaseClient
            .from('pessoas')
            .select('*, empresas(nome)')
            .eq('evento_id', evento_id)
            .or(`numero_pulseira.eq.${codigo},qr_code.eq.${codigo}`)
            .single();
      
          if (pessoaErr || !pessoa) {
            return ApiResponse.error(res, 'Pulseira ou QR Code não encontrado.', 404);
          }
      
          // Buscar informações da pulseira (tipo, cor, áreas) baseado no número
          const { data: tipoPulseira } = await supabaseClient
            .from('evento_tipos_pulseira')
            .select(`
              id,
              nome_tipo,
              cor_hex,
              numero_inicial,
              numero_final,
              pulseira_areas_permitidas (
                area_id,
                evento_areas (id, nome_area)
              )
            `)
            .eq('evento_id', evento_id)
            .lte('numero_inicial', numeroPulseira)
            .gte('numero_final', numeroPulseira)
            .single();
      
          // Montar resposta com dados da pessoa + informações da pulseira
          const response = {
            ...pessoa,
            pulseira_info: tipoPulseira ? {
              id: tipoPulseira.id,
              nome_tipo: tipoPulseira.nome_tipo,
              cor_hex: tipoPulseira.cor_hex,
              numero_inicial: tipoPulseira.numero_inicial,
              numero_final: tipoPulseira.numero_final,
              areas_permitidas: tipoPulseira.pulseira_areas_permitidas?.map(a => ({
                area_id: a.area_id,
                nome_area: a.evento_areas?.nome_area
              })) || []
            } : null
          };
      
          return ApiResponse.success(res, response);
        } catch (error) {
            logger.error(
                { err: error, event_id: req.event?.id },
                'Error querying bracelet'
            );
            return ApiResponse.error(res, 'Erro interno ao consultar pulseira.');
        }
    }

    async consultarAreasPulseira(req, res) {
        try {
            const { id: identifies } = req.params;
            const eventoId = req.event?.id || req.query.evento_id;
            const supabaseClient = req.supabase || supabase;
            
            const { data, error } = await supabaseClient
                .from('evento_areas') // FIX C-10: tabela correta (era 'areas' que não existe)
                .select('id, nome_area') // campo correto
                .eq('evento_id', eventoId);

            if (error) throw error;

            return ApiResponse.success(res, { areas: data || [] });
        } catch (error) {
            logger.error(
                { err: error, event_id: req.event?.id },
                'Error querying areas'
            );
            return ApiResponse.error(res, 'Erro ao consultar áreas.');
        }
    }

    async ultimoCheckin(req, res) {
        try {
          const { pessoa_id } = req.params;
          const evento_id = req.headers['x-evento-id'] || req.query.evento_id || req.event?.id;
          const supabaseClient = req.supabase || supabase;
      
          const { data, error } = await supabaseClient
            .from('logs_acesso')
            .select('created_at, tipo')
            .eq('pessoa_id', pessoa_id)
            .eq('evento_id', evento_id)
            .eq('tipo', 'checkin')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
      
          if (error || !data) {
            return ApiResponse.success(res, null);
          }
      
          return ApiResponse.success(res, data);
        } catch (error) {
            logger.error(
                { err: error, person_id: pessoa_id, event_id: req.event?.id },
                'Error fetching last checkin'
            );
            return ApiResponse.error(res, 'Erro interno ao buscar último check-in.');
        }
    }

    async acionarCatraca(req, res) {
        // Gerenciado pelo hardware externo via WebSocket
        // Ver: Monitor.jsx e websocketService.js
        // Não remover — pode ser necessário no futuro
        return ApiResponse.success(res, { message: 'Pulso enviado para ponte de hardware.' });
    }

    // ============================================
    // CHECK-IN MANUAL (por pessoa_id — painel web)
    // ============================================
    async checkinManual(req, res) {
        try {
            const { busca: pessoa_id, dispositivoId, tipo, sync_id, offline_timestamp } = req.body;
            const eventoId = req.event?.id;
            const supabaseClient = req.supabase || supabase;

            if (!pessoa_id) return ApiResponse.error(res, 'ID do participante é obrigatório', 400);

            const result = await checkinService.registrarAcesso(supabaseClient, {
                pessoa_id,
                evento_id: eventoId,
                tipo: tipo || null,
                metodo: 'manual',
                dispositivo_id: dispositivoId || 'web-dashboard',
                created_by: req.user?.id,
                sync_id,
                offline_timestamp
            });

            if (result.error) return ApiResponse.error(res, result.error, result.status || 400);
            return ApiResponse.success(res, result);
        } catch (error) {
            logger.error(
                { err: error, person_id: pessoa_id, event_id: eventoId },
                'Error in manual checkin'
            );
            return ApiResponse.error(res, 'Erro ao processar check-in manual');
        }
    }

    // ============================================
    // CHECK-IN VIA QR CODE (painel web / offline sync)
    // ============================================
    async checkinQrcode(req, res) {
        try {
            const { qrCode, dispositivoId, tipo, sync_id, offline_timestamp } = req.body;
            const eventoId = req.event?.id;
            const supabaseClient = req.supabase || supabase;

            if (!qrCode) return ApiResponse.error(res, 'QR Code é obrigatório', 400);

            const { data: pessoa, error: pessoaErr } = await supabaseClient
                .from('pessoas')
                .select('*, empresas(nome)')
                .eq('qr_code', qrCode)
                .eq('evento_id', eventoId)
                .single();

            if (pessoaErr || !pessoa) return ApiResponse.error(res, 'QR Code não encontrado', 404);

            const result = await checkinService.registrarAcesso(supabaseClient, {
                pessoa_id: pessoa.id,
                pessoa,
                evento_id: eventoId,
                tipo: tipo || null,
                metodo: 'qrcode',
                dispositivo_id: dispositivoId || 'web-dashboard',
                created_by: req.user?.id,
                sync_id,
                offline_timestamp
            });

            if (result.error) return ApiResponse.error(res, result.error, result.status || 400);
            return ApiResponse.success(res, result);
        } catch (error) {
            logger.error(
                { err: error, qr_code: req.body?.qr_code, event_id: eventoId },
                'Error in QR code checkin'
            );
            return ApiResponse.error(res, 'Erro ao processar check-in QR Code');
        }
    }

    // ============================================
    // NOVO: CHECK-IN VIA PULSEIRA
    // ============================================
    async checkinPulseira(req, res) {
        let numero_pulseira;
        let eventoId;
        try {
            const { pessoa_id } = req.body;
            numero_pulseira = req.body.numero_pulseira;
            eventoId = req.event?.id;
            const supabaseClient = req.supabase || supabase;

            if (!pessoa_id || !numero_pulseira) {
                return ApiResponse.error(res, 'pessoa_id e numero_pulseira são obrigatórios', 400);
            }

            // Buscar pessoa
            const { data: pessoa, error: pessoaErr } = await supabaseClient
                .from('pessoas')
                .select('*, empresas(nome)')
                .eq('id', pessoa_id)
                .eq('evento_id', eventoId)
                .single();

            if (pessoaErr || !pessoa) {
                return ApiResponse.error(res, 'Pessoa não encontrada', 404);
            }

            // Validar status (não pode já estar em check-in)
            if (pessoa.status_acesso === 'checkin_feito') {
                return ApiResponse.error(res, 'Pessoa já está em check-in', 400);
            }

            // ALTO #3: Validar fase do evento para Pulseira
            try {
                await validationService.validateAccessRules(eventoId, pessoa, 'checkin', 'pulseira', new Date(), null);
            } catch (validationError) {
                return ApiResponse.error(res, validationError.message, validationError.status || 403);
            }

            // Buscar informações da pulseira (tipo, cor, áreas)
            const numeroPulseiraInt = parseInt(numero_pulseira, 10);
            const { data: tipoPulseira } = await supabaseClient
                .from('evento_tipos_pulseira')
                .select(`
                    id,
                    nome_tipo,
                    cor_hex,
                    alerta_duplicidade,
                    pulseira_areas_permitidas (
                        area_id,
                        evento_areas (id, nome_area)
                    )
                `)
                .eq('evento_id', eventoId)
                .lte('numero_inicial', numeroPulseiraInt)
                .gte('numero_final', numeroPulseiraInt)
                .single();

            // Verificar duplicidade de pulseira (se alerta_duplicidade estiver ativo)
            if (tipoPulseira?.alerta_duplicidade) {
                const { data: pulseiraExistente } = await supabaseClient
                    .from('pessoas')
                    .select('id, nome_completo')
                    .eq('numero_pulseira', numero_pulseira)
                    .eq('evento_id', eventoId)
                    .neq('id', pessoa_id)
                    .single();

                if (pulseiraExistente) {
                    logger.warn('Bracelet already in use', {
                    bracelet_number: numero_pulseira,
                    current_user: pulseiraExistente.nome_completo,
                    event_id: eventoId
                });
                    // Nãobloqueia, mas registra no log como alerta
                }
            }

            // Salvar numero_pulseira na pessoa
            await supabaseClient
                .from('pessoas')
                .update({ numero_pulseira, updated_at: new Date() })
                .eq('id', pessoa_id);

            // Montar info da pulseira para o log e resposta
            const pulseiraInfo = tipoPulseira ? {
                id: tipoPulseira.id,
                nome_tipo: tipoPulseira.nome_tipo,
                cor_hex: tipoPulseira.cor_hex,
                areas_permitidas: tipoPulseira.pulseira_areas_permitidas?.map(a => ({
                    area_id: a.area_id,
                    nome_area: a.evento_areas?.nome_area
                })) || []
            } : null;

            // Registrar log
            const logData = {
                evento_id: eventoId,
                pessoa_id,
                tipo: 'checkin',
                metodo: 'pulseira',
                numero_pulseira,
                status_log: 'autorizado',
                dispositivo_id: req.user?.id,
                created_by: req.user.id,
                localizacao: 'Check-in Pulseira'
            };

            await supabaseClient.from('logs_acesso').insert(logData);

            // Atualizar status
            await supabaseClient
                .from('pessoas')
                .update({ status_acesso: 'checkin_feito', updated_at: new Date() })
                .eq('id', pessoa_id);

            // WebSocket
            websocketService.emit('new_access', {
                ...logData,
                pessoa_nome: pessoa.nome_completo,
                metodo: 'pulseira',
                status_log: 'autorizado',
                pulseira_info: pulseiraInfo
            }, eventoId);

            // Dispatch webhook
            webhookDispatcher.dispatchCheckin(eventoId, pessoa);

            return ApiResponse.success(res, { success: true, pessoa, pulseira_info: pulseiraInfo });
        } catch (error) {
            logger.error(
                { err: error, bracelet_number: numero_pulseira, event_id: eventoId },
                'Error in bracelet checkin'
            );
            return ApiResponse.error(res, 'Erro ao processar check-in');
        }
    }

    async checkoutPulseira(req, res) {
        let numero_pulseira;
        let eventoId;
        try {
            numero_pulseira = req.body.numero_pulseira;
            eventoId = req.event?.id;
            const supabaseClient = req.supabase || supabase;

            if (!numero_pulseira) {
                return ApiResponse.error(res, 'numero_pulseira é obrigatório', 400);
            }

            // Buscar pessoa pela pulseira
            const { data: pessoa, error: pessoaErr } = await supabaseClient
                .from('pessoas')
                .select('*, empresas(nome)')
                .eq('numero_pulseira', numero_pulseira)
                .eq('evento_id', eventoId)
                .single();

            if (pessoaErr || !pessoa) {
                return ApiResponse.error(res, 'Pulseira não encontrada', 404);
            }

            if (pessoa.status_acesso !== 'checkin_feito') {
                return ApiResponse.error(res, 'Pessoa não está em check-in', 400);
            }

            // Registrar log
            const logData = {
                evento_id: eventoId,
                pessoa_id: pessoa.id,
                tipo: 'checkout',
                metodo: 'pulseira',
                numero_pulseira,
                status_log: 'autorizado',
                dispositivo_id: req.user?.id,
                created_by: req.user.id,
                localizacao: 'Check-out Pulseira'
            };

            await supabaseClient.from('logs_acesso').insert(logData);

            // Atualizar status
            await supabaseClient
                .from('pessoas')
                .update({ status_acesso: 'checkout_feito', updated_at: new Date() })
                .eq('id', pessoa.id);

            // WebSocket
            websocketService.emit('new_access', {
                ...logData,
                pessoa_nome: pessoa.nome_completo,
                metodo: 'pulseira',
                status_log: 'autorizado'
            }, eventoId);

            // Dispatch webhook
            webhookDispatcher.dispatchCheckout(eventoId, pessoa);

            return ApiResponse.success(res, { success: true, pessoa });
        } catch (error) {
            logger.error(
                { err: error, bracelet_number: numero_pulseira, event_id: eventoId },
                'Error in bracelet checkout'
            );
            return ApiResponse.error(res, 'Erro ao processar check-out');
        }
    }

    async buscarPessoaPulseira(req, res) {
        try {
            const { codigo } = req.query;
            const eventoId = req.event?.id;
            const supabaseClient = req.supabase || supabase;

            // Buscar por numero_pulseira ou CPF ou nome
            let query = supabaseClient
                .from('pessoas')
                .select('id, nome_completo, cpf, funcao, status_acesso, numero_pulseira, foto_url, empresas(nome)')
                .eq('evento_id', eventoId);

            if (codigo) {
                query = query.or(`numero_pulseira.eq.${codigo},cpf.eq.${codigo},nome_completo.ilike.%${codigo}%`);
            }

            const { data, error } = await query.limit(10);

            if (error) throw error;

            return ApiResponse.success(res, { pessoas: data || [] });
        } catch (error) {
            logger.error(
                { err: error, bracelet_id: id, event_id: req.event?.id },
                'Error fetching bracelet'
            );
            return ApiResponse.error(res, 'Erro ao buscar');
        }
    }

    // ============================================
    // NOVO: CHECK-IN VIA FACIAL (para terminais)
    // ============================================
    async checkinFacial(req, res) {
        try {
            const { terminal_id, face_encoding, foto_capturada, confianca } = req.body;
            const supabaseClient = req.supabase || supabase;

            // Validar terminal
            let { data: terminal, error: termErr } = await supabaseClient
                .from('terminais_faciais')
                .select('*, eventos(id, nome)')
                .eq('id', terminal_id)
                .single();

            // Compatibilidade: fallback para dispositivos_acesso (modelo consolidado)
            if (termErr || !terminal) {
                const { data: dispositivo, error: dispErr } = await supabaseClient
                    .from('dispositivos_acesso')
                    .select('id, evento_id, nome, area_nome, modo, config')
                    .eq('id', terminal_id)
                    .eq('tipo', 'terminal_facial')
                    .single();

                if (!dispErr && dispositivo) {
                    terminal = {
                        id: dispositivo.id,
                        evento_id: dispositivo.evento_id,
                        nome: dispositivo.nome,
                        area_nome: dispositivo.area_nome,
                        modo: dispositivo.modo || 'ambos',
                        ativo: true,
                        biometric_confidence_min: dispositivo.config?.biometric_confidence_min
                    };
                    termErr = null;
                }
            }

            if (termErr || !terminal) {
                return res.status(404).json({ error: 'Terminal não encontrado' });
            }

            if (!terminal.ativo) {
                return res.status(403).json({ error: 'Terminal inativo' });
            }

            const eventoId = terminal.evento_id;
            const modo = terminal.modo;

            // Buscar pessoa por face_encoding
            const { data: pessoa, error: pessoaErr } = await supabaseClient
                .from('pessoas')
                .select('*, empresas(nome)')
                .eq('face_encoding', face_encoding)
                .eq('evento_id', eventoId)
                .single();

            if (pessoaErr || !pessoa) {
                return res.status(404).json({ error: 'Pessoa não identificada' });
            }

            // Validar confiança
            const minConfianca = terminal.biometric_confidence_min || 75;
            let statusLog = 'autorizado';

            if (confianca < 60) {
                return res.status(403).json({ error: 'Acesso rejeitado - confiança insuficiente', confianca });
            } else if (confianca < minConfianca) {
                statusLog = 'confianca_baixa';
            }

            // Determinar tipo (checkin/checkout conforme modo)
            let tipoAcesso = 'checkin';
            const { data: ultimoLog } = await supabaseClient
                .from('logs_acesso')
                .select('tipo')
                .eq('pessoa_id', pessoa.id)
                .eq('evento_id', eventoId)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            const ultimoTipo = ultimoLog?.tipo;

            if (modo === 'checkin') {
                tipoAcesso = 'checkin';
            } else if (modo === 'checkout') {
                tipoAcesso = 'checkout';
            } else {
                // modo 'ambos' - Smart Access
                tipoAcesso = (ultimoTipo === 'checkin') ? 'checkout' : 'checkin';
            }

            // Se modo não permite o tipo, rejeitar
            if (modo === 'checkin' && tipoAcesso === 'checkout') {
                return res.status(403).json({ error: 'Terminal configurado apenas para entrada' });
            }
            if (modo === 'checkout' && tipoAcesso === 'checkin') {
                return res.status(403).json({ error: 'Terminal configurado apenas para saída' });
            }

            // Registrar log
            const logData = {
                evento_id: eventoId,
                pessoa_id: pessoa.id,
                tipo: tipoAcesso,
                metodo: 'facial',
                terminal_id,
                status_log: statusLog,
                confianca,
                foto_capturada,
                localizacao: terminal.area_nome || terminal.nome
            };

            await supabaseClient.from('logs_acesso').insert(logData);

            // Atualizar status da pessoa
            const novoStatus = tipoAcesso === 'checkin' ? 'checkin_feito' : 'checkout_feito';
            await supabaseClient
                .from('pessoas')
                .update({ status_acesso: novoStatus, updated_at: new Date() })
                .eq('id', pessoa.id);

            // WebSocket
            websocketService.emit('new_access', {
                ...logData,
                pessoa_nome: pessoa.nome_completo,
                terminal_nome: terminal.nome,
                area_nome: terminal.area_nome,
                metodo: 'facial',
                status_log: statusLog
            }, eventoId);

            return res.json({
                success: true,
                pessoa: {
                    id: pessoa.id,
                    nome: pessoa.nome_completo,
                    foto_url: pessoa.foto_url
                },
                tipo: tipoAcesso,
                status: statusLog,
                confianca
            });
        } catch (error) {
            logger.error(
                { err: error, event_id: req.event?.id, method: 'facial' },
                'Error in facial checkin'
            );
            return res.status(500).json({ error: 'Erro interno' });
        }
    }
}

module.exports = new AccessController();
