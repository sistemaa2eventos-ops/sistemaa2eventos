const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');
const checkinService = require('./checkin.service');
const validationService = require('./services/validation.service');
const ApiResponse = require('../../utils/apiResponse');
const webhookDispatcher = require('../../services/webhookDispatcher');
const websocketService = require('../../services/websocketService'); // FIX C-02: import ausente causava ReferenceError em runtime
const databaseService = require('./services/database.service');
const watchlistService = require('../system/watchlist.service');
const { COLUNAS_PESSOA_ACESSO } = require('./services/colunasPessoa');
const pulseiraService = require('../pulseiras/pulseira.service');

class AccessController {
    constructor() {
        this.checkout = this.checkout.bind(this);
        this.getLogs = this.getLogs.bind(this);
        this.getRealtimeStats = this.getRealtimeStats.bind(this);
        this.expulsar = this.expulsar.bind(this);
        this.vincularPulseiraFacial = this.vincularPulseiraFacial.bind(this);
        this.bloquearPessoa = this.bloquearPessoa.bind(this);
        this.consultarAreasPulseira = this.consultarAreasPulseira.bind(this);
        this.consultarPulseira = this.consultarPulseira.bind(this);
        this.fiscalizarAcesso = this.fiscalizarAcesso.bind(this);
        this.getFiscalizacoesRecentes = this.getFiscalizacoesRecentes.bind(this);
        this.ultimoCheckin = this.ultimoCheckin.bind(this);
        this.acionarCatraca = this.acionarCatraca.bind(this);
        this.checkinManual = this.checkinManual.bind(this);
        this.checkinQrcode = this.checkinQrcode.bind(this);
        this.credenciarPulseira = this.credenciarPulseira.bind(this);
        this.leitorRapido = this.leitorRapido.bind(this);
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
                { err: error, person_id: req.params?.id || req.body?.pessoa_id, event_id: req.event?.id, method: req.body?.metodo },
                'Error registering checkout'
            );
            return ApiResponse.error(res, 'Erro interno no servidor');
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
            if (tipo) query = query.eq('tipo', tipo);

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

            // Passo 4: Nome do terminal. dispositivo_id pode ser UUID (leitores), o nome do
            // leitor (registros antigos) ou 'web-dashboard'/'fiscalizacao' (operador no painel).
            // Só UUIDs vão para a consulta — um valor não-UUID derrubava a busca inteira.
            const ehUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v || '');
            const NOMES_FIXOS = { 'web-dashboard': 'Painel (operador)', fiscalizacao: 'Fiscalização' };
            const dispositivoIds = [...new Set(logs.map(l => l.dispositivo_id).filter(ehUuid))];
            const dispMap = {};
            if (dispositivoIds.length > 0) {
                const { data: dispData } = await supabaseClient
                    .from('dispositivos_acesso')
                    .select('id, nome')
                    .in('id', dispositivoIds);
                (dispData || []).forEach(d => { dispMap[d.id] = d.nome; });
            }
            logs.forEach(log => {
                if (!log.dispositivo_id) return;
                log.dispositivo_nome = dispMap[log.dispositivo_id]
                    || NOMES_FIXOS[log.dispositivo_id]
                    || (ehUuid(log.dispositivo_id) ? 'Leitor removido' : log.dispositivo_id);
            });

            // Passo 5: Coletar e mapear Áreas para obter o NOME DA ÁREA
            const areaIds = [...new Set(logs.map(l => l.area_id).filter(id => id))];
            if (areaIds.length > 0) {
                const { data: areasData } = await supabaseClient
                    .from('evento_areas')
                    .select('id, nome_area')
                    .in('id', areaIds);
                const areaMap = (areasData || []).reduce((acc, a) => { acc[a.id] = a.nome_area; return acc; }, {});
                logs.forEach(log => {
                    if (log.area_id && areaMap[log.area_id]) {
                        log.area_nome = areaMap[log.area_id];
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
                { err: error, person_id: req.params?.id, event_id: req.event?.id },
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
                { err: error, person_id: req.params?.pessoa_id, event_id: req.event?.id },
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
            const { busca: pessoa_id, dispositivoId, tipo, sync_id, offline_timestamp, area_id } = req.body;
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
                offline_timestamp,
                area_id: area_id || null
            });

            if (result.error) return ApiResponse.error(res, result.error, result.status || 400);
            return ApiResponse.success(res, result);
        } catch (error) {
            logger.error(
                { err: error, person_id: req.body?.busca, event_id: req.event?.id },
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
            const { qrCode, dispositivoId, tipo, sync_id, offline_timestamp, area_id } = req.body;
            const eventoId = req.event?.id;
            const supabaseClient = req.supabase || supabase;

            if (!qrCode) return ApiResponse.error(res, 'QR Code é obrigatório', 400);

            const { data: pessoa, error: pessoaErr } = await supabaseClient
                .from('pessoas')
                .select(`${COLUNAS_PESSOA_ACESSO}, empresas(nome)`)
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
                offline_timestamp,
                area_id: area_id || null
            });

            if (result.error) return ApiResponse.error(res, result.error, result.status || 400);
            return ApiResponse.success(res, result);
        } catch (error) {
            logger.error(
                { err: error, qr_code: req.body?.qrCode, event_id: req.event?.id },
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
            const area_id = req.body.area_id || null;
            const supabaseClient = req.supabase || supabase;

            if (!pessoa_id || !numero_pulseira) {
                return ApiResponse.error(res, 'pessoa_id e numero_pulseira são obrigatórios', 400);
            }

            // Buscar pessoa
            const { data: pessoa, error: pessoaErr } = await supabaseClient
                .from('pessoas')
                .select(`${COLUNAS_PESSOA_ACESSO}, empresas(nome)`)
                .eq('id', pessoa_id)
                .eq('evento_id', eventoId)
                .single();

            if (pessoaErr || !pessoa) {
                return ApiResponse.error(res, 'Pessoa não encontrada', 404);
            }

            // Buscar tipo de pulseira pela faixa numérica
            const numeroPulseiraInt = parseInt(numero_pulseira, 10);
            const { data: tipoPulseira } = await supabaseClient
                .from('evento_tipos_pulseira')
                .select(`
                    id, nome_tipo, cor_hex, alerta_duplicidade,
                    pulseira_areas_permitidas (
                        area_id,
                        evento_areas (id, nome_area)
                    )
                `)
                .eq('evento_id', eventoId)
                .lte('numero_inicial', numeroPulseiraInt)
                .gte('numero_final', numeroPulseiraInt)
                .single();

            // Verificar duplicidade de pulseira
            if (tipoPulseira?.alerta_duplicidade) {
                const { data: pulseiraExistente } = await supabaseClient
                    .from('pessoas')
                    .select('id, nome_completo')
                    .eq('numero_pulseira', numero_pulseira)
                    .eq('evento_id', eventoId)
                    .neq('id', pessoa_id)
                    .single();

                if (pulseiraExistente) {
                    logger.warn(`⚠️ Pulseira ${numero_pulseira} já vinculada a ${pulseiraExistente.nome_completo}`);
                }
            }

            // Salvar numero_pulseira e tipo_pulseira_id na pessoa
            const updateData = { numero_pulseira, updated_at: new Date() };
            if (tipoPulseira?.id) updateData.tipo_pulseira_id = tipoPulseira.id;
            await supabaseClient.from('pessoas').update(updateData).eq('id', pessoa_id);
            pulseiraService.registrarEntrega(pessoa_id, req.user?.id);

            // Delegar ao fluxo centralizado (inclui validações, watchlist, anti-passback, websocket)
            // A pessoa lida antes do update ainda tinha a pulseira antiga: o log gravava o número errado
            const result = await checkinService.registrarAcesso(supabaseClient, {
                pessoa_id,
                pessoa: { ...pessoa, numero_pulseira },
                evento_id: eventoId,
                tipo: req.body.tipo || null, // null = Smart Access decide
                metodo: 'pulseira',
                dispositivo_id: 'web-dashboard',
                created_by: req.user?.id,
                area_id
            });

            if (result.error) return ApiResponse.error(res, result.error, result.status || 400);

            // Montar info da pulseira para resposta
            const pulseiraInfo = tipoPulseira ? {
                id: tipoPulseira.id,
                nome_tipo: tipoPulseira.nome_tipo,
                cor_hex: tipoPulseira.cor_hex,
                areas_permitidas: tipoPulseira.pulseira_areas_permitidas?.map(a => ({
                    area_id: a.area_id,
                    nome_area: a.evento_areas?.nome_area
                })) || []
            } : null;

            // Dispatch webhook
            webhookDispatcher.dispatchCheckin(eventoId, pessoa);

            return ApiResponse.success(res, { ...result, pulseira_info: pulseiraInfo });
        } catch (error) {
            logger.error(
                { err: error, bracelet_number: numero_pulseira, event_id: eventoId },
                'Error in bracelet checkin'
            );
            return ApiResponse.error(res, error.message || 'Erro ao processar check-in');
        }
    }

    async checkoutPulseira(req, res) {
        let numero_pulseira;
        let eventoId;
        try {
            numero_pulseira = req.body.numero_pulseira;
            eventoId = req.event?.id || req.headers['x-evento-id'] || req.query.evento_id;
            const area_id = req.body.area_id || null;
            const supabaseClient = req.supabase || supabase;

            if (!numero_pulseira) {
                return ApiResponse.error(res, 'Identificador (pulseira, CPF ou código) é obrigatório', 400);
            }

            const safeCode = String(numero_pulseira).trim();
            const digits = safeCode.replace(/\D/g, '');

            // 1. Tentar buscar pessoa pela pulseira
            let { data: pessoa, error: pessoaErr } = await supabaseClient
                .from('pessoas')
                .select(`${COLUNAS_PESSOA_ACESSO}, empresas(nome)`)
                .eq('numero_pulseira', safeCode)
                .eq('evento_id', eventoId)
                .maybeSingle();

            // 2. Se não encontrar por pulseira, buscar por CPF, QR Code ou ID
            if (!pessoa) {
                const orConds = [`qr_code.eq.${safeCode}`, `numero_pulseira.eq.${safeCode}`];
                if (digits.length === 11) {
                    const cpfFmt = digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
                    orConds.push(`cpf.eq.${digits}`, `cpf.eq.${cpfFmt}`);
                } else if (digits.length > 0) {
                    orConds.push(`cpf.eq.${digits}`, `cpf.eq.${safeCode}`);
                }
                if (/^[0-9a-fA-F-]{36}$/.test(safeCode)) {
                    orConds.push(`id.eq.${safeCode}`);
                }

                const { data: pAlt } = await supabaseClient
                    .from('pessoas')
                    .select(`${COLUNAS_PESSOA_ACESSO}, empresas(nome)`)
                    .eq('evento_id', eventoId)
                    .or(orConds.join(','))
                    .limit(1);

                if (pAlt && pAlt.length > 0) {
                    pessoa = pAlt[0];
                }
            }

            if (!pessoa) {
                return ApiResponse.error(res, 'Participante / Pulseira não encontrada para baixa', 404);
            }

            // Delegar ao fluxo centralizado com tipo forçado 'checkout'
            const result = await checkinService.registrarAcesso(supabaseClient, {
                pessoa_id: pessoa.id,
                pessoa,
                evento_id: eventoId,
                tipo: 'checkout',
                metodo: pessoa.numero_pulseira === safeCode ? 'pulseira' : 'barcode',
                dispositivo_id: 'web-dashboard',
                created_by: req.user?.id,
                area_id,
                sync_id: req.body.sync_id,
                offline_timestamp: req.body.offline_timestamp
            });

            if (result.error) return ApiResponse.error(res, result.error, result.status || 400);

            // Dispatch webhook
            webhookDispatcher.dispatchCheckout(eventoId, pessoa);

            return ApiResponse.success(res, { ...result, pessoa });
        } catch (error) {
            logger.error(
                { err: error, bracelet_number: numero_pulseira, event_id: eventoId },
                'Error in bracelet checkout'
            );
            return ApiResponse.error(res, error.message || 'Erro ao processar check-out');
        }
    }

    /**
     * LEITOR RÁPIDO (CÓDIGO DE BARRAS / CPF / ENTRADA / SAÍDA DIRETA SEM PULSEIRA)
     */
    async leitorRapido(req, res) {
        try {
            const { codigo, tipo = 'checkin', area_id, metodo = 'barcode', sync_id, offline_timestamp } = req.body;
            const eventoId = req.event?.id || req.headers['x-evento-id'] || req.query.evento_id;
            const supabaseClient = req.supabase || supabase;

            if (!codigo) {
                return ApiResponse.error(res, 'Código ou identificador não informado', 400);
            }

            const cleanCode = String(codigo).trim();
            const cleanDigits = cleanCode.replace(/\D/g, '');

            // 1. Tentar buscar a pessoa por: numero_pulseira, cpf, qr_code ou id
            let query = supabaseClient
                .from('pessoas')
                .select(`${COLUNAS_PESSOA_ACESSO}, empresas(nome)`)
                .eq('evento_id', eventoId);

            let orConds = [`numero_pulseira.eq.${cleanCode}`, `qr_code.eq.${cleanCode}`];
            if (cleanDigits.length === 11) {
                const cpfFormatted = cleanDigits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
                orConds.push(`cpf.eq.${cleanDigits}`, `cpf.eq.${cpfFormatted}`);
            } else if (cleanDigits.length > 0) {
                orConds.push(`cpf.eq.${cleanDigits}`, `cpf.eq.${cleanCode}`);
            }
            if (/^[0-9a-fA-F-]{36}$/.test(cleanCode)) {
                orConds.push(`id.eq.${cleanCode}`);
            }

            let { data: pessoas, error } = await query.or(orConds.join(',')).limit(1);

            if (!pessoas || pessoas.length === 0) {
                const { data: fallbackPessoas } = await supabaseClient
                    .from('pessoas')
                    .select(`${COLUNAS_PESSOA_ACESSO}, empresas(nome)`)
                    .eq('evento_id', eventoId)
                    .ilike('nome_completo', `%${cleanCode}%`)
                    .limit(1);
                pessoas = fallbackPessoas;
            }

            if (!pessoas || pessoas.length === 0) {
                return ApiResponse.error(res, `Participante não encontrado para o código "${cleanCode}"`, 404);
            }

            const pessoa = pessoas[0];

            // 2. Verificar Watchlist e Bloqueio Geral
            if (pessoa.cpf) {
                const monitorado = await watchlistService.verificarCPF(pessoa.cpf, eventoId);
                if (monitorado && (monitorado.tipo === 'bloqueado' || monitorado.bloqueado_geral)) {
                    return ApiResponse.error(res, `ACESSO BLOQUEADO: ${monitorado.motivo || 'Participante na lista de bloqueio geral'}`, 403);
                }
            }

            // 3. Registrar o acesso (checkin ou checkout) SEM exigir pulseira!
            const tipoAcesso = tipo === 'checkout' ? 'checkout' : 'checkin';
            const result = await checkinService.registrarAcesso(supabaseClient, {
                pessoa_id: pessoa.id,
                pessoa,
                evento_id: eventoId,
                tipo: tipoAcesso,
                metodo: metodo || 'barcode',
                dispositivo_id: 'web-dashboard',
                created_by: req.user?.id,
                area_id: area_id || null,
                sync_id, offline_timestamp
            });

            if (result.error) return ApiResponse.error(res, result.error, result.status || 400);

            // Disparar Webhook
            if (tipoAcesso === 'checkout') {
                webhookDispatcher.dispatchCheckout(eventoId, pessoa);
            } else {
                webhookDispatcher.dispatchCheckin(eventoId, pessoa);
            }

            return ApiResponse.success(res, {
                ...result,
                pessoa: {
                    id: pessoa.id,
                    nome: pessoa.nome_completo || pessoa.nome,
                    cpf: pessoa.cpf,
                    foto_url: pessoa.foto_url,
                    empresa: pessoa.empresas?.nome,
                    numero_pulseira: pessoa.numero_pulseira,
                    funcao: pessoa.funcao
                }
            });
        } catch (error) {
            logger.error({ err: error, body: req.body }, 'Erro no leitorRapido');
            return ApiResponse.error(res, error.message || 'Erro ao processar leitura rápida');
        }
    }

    // ============================================
    // CREDENCIAR PULSEIRA (Fase 3 — Fluxo principal do evento)
    // Escaneia barcode → busca tipo_pulseira → vincula áreas → auto check-in
    // Suporta também credenciamento direto SEM pulseira se numero_pulseira for nulo/vazio
    // ============================================
    async credenciarPulseira(req, res) {
        try {
            const { pessoa_id, numero_pulseira, area_id, sync_id, offline_timestamp } = req.body;
            const eventoId = req.event?.id;
            const supabaseClient = req.supabase || supabase;

            if (!pessoa_id) {
                return ApiResponse.error(res, 'pessoa_id é obrigatório', 400);
            }

            // 1. Buscar pessoa
            const { data: pessoa, error: pessoaErr } = await supabaseClient
                .from('pessoas')
                .select(`${COLUNAS_PESSOA_ACESSO}, empresas(nome)`)
                .eq('id', pessoa_id)
                .eq('evento_id', eventoId)
                .single();

            if (pessoaErr || !pessoa) {
                return ApiResponse.error(res, 'Pessoa não encontrada', 404);
            }

            // Documentação pendente: credenciar pelo operador vale como liberação do turno
            // (registra quem liberou; expira no checkout ou no horário de reset do evento)
            if (['pendente', 'recusado'].includes(pessoa.status_acesso)) {
                try {
                    const liberacao = await require('../entities/liberacaoManual.service').liberar({
                        pessoaId: pessoa_id,
                        eventoId,
                        operadorId: req.user?.id,
                        motivo: numero_pulseira ? `Liberado no credenciamento (pulseira ${numero_pulseira})` : 'Liberado no credenciamento'
                    });
                    pessoa.liberacao_manual_ate = liberacao.liberacao_manual_ate;
                } catch (libErr) {
                    logger.warn(`[Credenciar] Liberação manual não registrada para ${pessoa.nome_completo}: ${libErr.message}`);
                }
            }

            // Fluxo DIRETO SEM PULSEIRA: se número não for informado, registra entrada direta
            if (!numero_pulseira || !String(numero_pulseira).trim()) {
                const result = await checkinService.registrarAcesso(supabaseClient, {
                    pessoa_id,
                    pessoa,
                    evento_id: eventoId,
                    tipo: 'checkin',
                    metodo: 'manual',
                    dispositivo_id: 'web-dashboard',
                    created_by: req.user?.id,
                    area_id: area_id || null,
                    sync_id, offline_timestamp
                });

                if (result.error) return ApiResponse.error(res, result.error, result.status || 400);
                webhookDispatcher.dispatchCheckin(eventoId, pessoa);

                return ApiResponse.success(res, {
                    ...result,
                    pulseira_info: null,
                    areas_vinculadas: [],
                    pessoa: {
                        id: pessoa.id,
                        nome: pessoa.nome_completo,
                        foto_url: pessoa.foto_url,
                        empresa: pessoa.empresas?.nome
                    }
                });
            }

            // 2. Buscar tipo de pulseira (por ID explícito ou por faixa numérica)
            let tipoPulseira = null;
            if (req.body.tipo_pulseira_id) {
                const { data: tp } = await supabaseClient
                    .from('evento_tipos_pulseira')
                    .select(`
                        id, nome_tipo, cor_hex, alerta_duplicidade,
                        pulseira_areas_permitidas (
                            area_id,
                            evento_areas (id, nome_area)
                        )
                    `)
                    .eq('id', req.body.tipo_pulseira_id)
                    .single();
                if (tp) tipoPulseira = tp;
            }

            if (!tipoPulseira && numero_pulseira) {
                const numeroPulseiraInt = parseInt(numero_pulseira, 10);
                if (!isNaN(numeroPulseiraInt)) {
                    const { data: tp } = await supabaseClient
                        .from('evento_tipos_pulseira')
                        .select(`
                            id, nome_tipo, cor_hex, alerta_duplicidade,
                            pulseira_areas_permitidas (
                                area_id,
                                evento_areas (id, nome_area)
                            )
                        `)
                        .eq('evento_id', eventoId)
                        .lte('numero_inicial', numeroPulseiraInt)
                        .gte('numero_final', numeroPulseiraInt)
                        .single();
                    if (tp) tipoPulseira = tp;
                }
            }

            // 3. Verificar duplicidade
            if (tipoPulseira?.alerta_duplicidade) {
                const { data: existente } = await supabaseClient
                    .from('pessoas')
                    .select('id, nome_completo')
                    .eq('numero_pulseira', numero_pulseira)
                    .eq('evento_id', eventoId)
                    .neq('id', pessoa_id)
                    .single();

                if (existente) {
                    return ApiResponse.error(res,
                        `Pulseira ${numero_pulseira} já vinculada a ${existente.nome_completo}`, 409);
                }
            }

            // 4. Vincular áreas de acesso (pessoa_areas_acesso) — uma única gravação para todas as áreas
            const areasVinculadas = [];
            const permissoes = tipoPulseira?.pulseira_areas_permitidas || [];
            if (permissoes.length > 0) {
                const { error: areaErr } = await supabaseClient
                    .from('pessoa_areas_acesso')
                    .upsert(permissoes.map(perm => ({
                        pessoa_id,
                        area_id: perm.area_id,
                        evento_id: eventoId,
                        criado_por: req.user?.id
                    })), { onConflict: 'pessoa_id,area_id' });

                if (areaErr) {
                    logger.warn(`[Credenciar] Falha ao vincular áreas de ${pessoa.nome_completo}: ${areaErr.message}`);
                } else {
                    permissoes.forEach(perm => areasVinculadas.push({
                        area_id: perm.area_id,
                        nome_area: perm.evento_areas?.nome_area
                    }));
                }
            }

            // 5. Salvar pulseira (e o cache areas_autorizadas) na pessoa — uma gravação
            const updateData = { numero_pulseira, updated_at: new Date() };
            if (areasVinculadas.length > 0) updateData.areas_autorizadas = areasVinculadas.map(a => a.area_id);
            if (tipoPulseira?.id) updateData.tipo_pulseira_id = tipoPulseira.id;
            await supabaseClient.from('pessoas').update(updateData).eq('id', pessoa_id);
            pulseiraService.registrarEntrega(pessoa_id, req.user?.id);

            // 6. Auto CHECK-IN via fluxo centralizado
            const result = await checkinService.registrarAcesso(supabaseClient, {
                pessoa_id,
                pessoa: { ...pessoa, numero_pulseira },
                evento_id: eventoId,
                tipo: 'checkin',
                metodo: 'pulseira',
                dispositivo_id: 'web-dashboard',
                created_by: req.user?.id,
                area_id: area_id || null,
                sync_id, offline_timestamp,
                // Marca o log para não contar no anti-passback dos leitores faciais
                observacao: require('./services/validation.service').MARCADOR_CREDENCIAMENTO
            });

            if (result.error) return ApiResponse.error(res, result.error, result.status || 400);

            // 7. Montar resposta enriquecida
            const pulseiraInfo = tipoPulseira ? {
                id: tipoPulseira.id,
                nome_tipo: tipoPulseira.nome_tipo,
                cor_hex: tipoPulseira.cor_hex,
                areas_permitidas: areasVinculadas
            } : null;

            logger.info(`🏷️ [Credenciar] Pulseira ${numero_pulseira} → ${pessoa.nome_completo} | ${areasVinculadas.length} áreas`);

            return ApiResponse.success(res, {
                ...result,
                pulseira_info: pulseiraInfo,
                areas_vinculadas: areasVinculadas,
                pessoa: {
                    id: pessoa.id,
                    nome: pessoa.nome_completo,
                    foto_url: pessoa.foto_url,
                    empresa: pessoa.empresas?.nome
                }
            });
        } catch (error) {
            logger.error({ err: error, event_id: req.event?.id }, 'Error in credenciarPulseira');
            return ApiResponse.error(res, error.message || 'Erro ao credenciar pulseira');
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
                { err: error, bracelet_code: req.query?.codigo, event_id: req.event?.id },
                'Error fetching bracelet'
            );
            return ApiResponse.error(res, 'Erro ao buscar');
        }
    }

    /**
     * Consultar informações completas da pulseira / colaborador
     */
    async consultarPulseira(req, res) {
        try {
            const { codigo } = req.params;
            const eventoId = req.event?.id;
            const supabaseClient = req.supabase || supabase;

            // Só letras, números e hífen: o código entra num filtro do PostgREST
            const safeCodigo = String(codigo || '').trim();
            if (!/^[A-Za-z0-9-]{1,64}$/.test(safeCodigo)) {
                return ApiResponse.error(res, 'Código inválido.', 400);
            }
            // Comparar com id (UUID) só quando o código for um UUID — senão o banco rejeita a consulta inteira
            const filtros = [`numero_pulseira.eq.${safeCodigo}`];
            const cpfDigitos = safeCodigo.replace(/\D/g, '');
            if (cpfDigitos.length === 11) filtros.push(`cpf.eq.${cpfDigitos}`);
            if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(safeCodigo)) filtros.push(`id.eq.${safeCodigo}`);

            const { data: pessoas, error } = await supabaseClient
                .from('pessoas')
                .select('id, nome_completo, cpf, funcao, status_acesso, status_documentos, numero_pulseira, foto_url, tipo_pulseira_id, empresas(id, nome)')
                .eq('evento_id', eventoId)
                .or(filtros.join(','))
                .limit(1);

            if (error) throw error;
            if (!pessoas || pessoas.length === 0) {
                return ApiResponse.error(res, 'Pulseira / Colaborador não encontrado', 404);
            }

            return ApiResponse.success(res, pessoas[0]);
        } catch (error) {
            logger.error({ err: error, codigo: req.params?.codigo }, 'Erro ao consultar pulseira');
            return ApiResponse.error(res, 'Erro ao consultar pulseira');
        }
    }

    /**
     * Fiscalização Rápida de Áreas (App/Tablet do Fiscal)
     * Valida permissão do colaborador para a área física específica
     * Dispara alerta multicanal imediato se o colaborador estiver na lista de procurados/watchlist
     */
    async fiscalizarAcesso(req, res) {
        try {
            const { codigo, area_id, metodo = 'scanner' } = req.body;
            const eventoId = req.event?.id || req.headers['x-evento-id'] || req.query.evento_id;
            const supabaseClient = req.supabase || supabase;

            const safeCodigo = (codigo || '').trim();
            if (!safeCodigo) {
                return ApiResponse.error(res, 'Informe o código da pulseira, CPF ou nome do colaborador.', 400);
            }

            // 1. Buscar a pessoa no evento atual:
            // Suporta: número da pulseira, CPF (formatado ou limpo), ID direto (UUID), ou Nome (ilike)
            const digitsOnly = safeCodigo.replace(/\D/g, '');
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(safeCodigo);

            let conditions = [`numero_pulseira.eq.${safeCodigo}`];
            if (digitsOnly.length === 11) {
                conditions.push(`cpf.eq.${digitsOnly}`);
            }
            conditions.push(`cpf.eq.${safeCodigo}`);
            if (isUuid) {
                conditions.push(`id.eq.${safeCodigo}`);
            }

            let { data: pessoas, error: findErr } = await supabaseClient
                .from('pessoas')
                .select('id, nome_completo, cpf, funcao, status_acesso, status_documentos, numero_pulseira, foto_url, tipo_pulseira_id, bloqueado, motivo_bloqueio, empresas(id, nome, ativo)')
                .eq('evento_id', eventoId)
                .or(conditions.join(','))
                .limit(1);

            if (findErr) {
                logger.warn({ findErr, safeCodigo }, 'Falha na busca primária de pessoa por código/CPF');
            }

            // Se não encontrou por pulseira/CPF, tenta busca parcial por nome
            if (!pessoas || pessoas.length === 0) {
                const { data: porNome } = await supabaseClient
                    .from('pessoas')
                    .select('id, nome_completo, cpf, funcao, status_acesso, status_documentos, numero_pulseira, foto_url, tipo_pulseira_id, bloqueado, motivo_bloqueio, empresas(id, nome, ativo)')
                    .eq('evento_id', eventoId)
                    .ilike('nome_completo', `%${safeCodigo}%`)
                    .limit(1);

                if (porNome && porNome.length > 0) {
                    pessoas = porNome;
                }
            }

            const pessoa = pessoas?.[0];
            if (!pessoa) {
                return ApiResponse.success(res, {
                    autorizado: false,
                    status: 'nao_encontrado',
                    mensagem: `Código/Colaborador '${safeCodigo}' não encontrado no evento.`,
                    codigo_lido: safeCodigo
                });
            }

            // 2. Buscar informações da área fiscalizada se informada
            let areaFiscalizada = null;
            if (area_id) {
                const { data: areaData } = await supabaseClient
                    .from('evento_areas')
                    .select('id, nome_area')
                    .eq('id', area_id)
                    .single();
                areaFiscalizada = areaData;
            }

            // 3. Buscar todas as áreas autorizadas da pessoa (diretas + por tipo de pulseira) e histórico do último check-in
            const [paaRes, papRes, checkinLogRes] = await Promise.all([
                supabaseClient
                    .from('pessoa_areas_acesso')
                    .select('area_id, evento_areas(id, nome_area)')
                    .eq('pessoa_id', pessoa.id),
                pessoa.tipo_pulseira_id
                    ? supabaseClient
                        .from('pulseira_areas_permitidas')
                        .select('area_id, evento_areas(id, nome_area)')
                        .eq('tipo_pulseira_id', pessoa.tipo_pulseira_id)
                    : Promise.resolve({ data: [] }),
                supabaseClient
                    .from('logs_acesso')
                    .select('created_at, area_id, metodo, evento_areas(nome_area)')
                    .eq('evento_id', eventoId)
                    .eq('pessoa_id', pessoa.id)
                    .in('tipo', ['checkin', 'entrada'])
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle()
            ]);

            const areasMap = new Map();
            (paaRes.data || []).forEach(item => {
                if (item.area_id) {
                    areasMap.set(item.area_id, item.evento_areas?.nome_area || 'Área');
                }
            });
            (papRes.data || []).forEach(item => {
                if (item.area_id) {
                    areasMap.set(item.area_id, item.evento_areas?.nome_area || 'Área');
                }
            });

            let ultimoCheckin = checkinLogRes?.data;
            if (!ultimoCheckin) {
                const { data: anyLog } = await supabaseClient
                    .from('logs_acesso')
                    .select('created_at, area_id, metodo, evento_areas(nome_area)')
                    .eq('evento_id', eventoId)
                    .eq('pessoa_id', pessoa.id)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();
                ultimoCheckin = anyLog;
            }

            const areasAutorizadas = Array.from(areasMap.entries()).map(([id, nome]) => ({ id, nome_area: nome }));
            const pessoaPayload = {
                id: pessoa.id,
                nome_completo: pessoa.nome_completo,
                cpf: pessoa.cpf,
                funcao: pessoa.funcao,
                empresa_nome: pessoa.empresas?.nome || 'Pessoa Física',
                foto_url: pessoa.foto_url,
                numero_pulseira: pessoa.numero_pulseira,
                status_acesso: pessoa.status_acesso,
                status_documentos: pessoa.status_documentos,
                bloqueado: pessoa.bloqueado,
                motivo_bloqueio: pessoa.motivo_bloqueio,
                horario_checkin: ultimoCheckin?.created_at || null,
                area_checkin: ultimoCheckin?.evento_areas?.nome_area || null,
                metodo_checkin: ultimoCheckin?.metodo || null,
                areas_autorizadas: areasAutorizadas
            };

            // 4. VERIFICAÇÃO DE ALERTA DE SEGURANÇA / WATCHLIST GLOBAL (MULTI-EVENTO)
            const cpfLimpo = pessoa.cpf ? pessoa.cpf.replace(/\D/g, '') : null;
            let watchMatch = null;
            if (cpfLimpo) {
                const { data: wList } = await supabaseClient
                    .from('watchlist')
                    .select('*')
                    .eq('cpf', cpfLimpo)
                    .eq('ativo', true)
                    .order('created_at', { ascending: false })
                    .limit(1);
                if (wList && wList.length > 0) watchMatch = wList[0];
            }
            if (!watchMatch && pessoa.nome_completo) {
                const { data: wByName } = await supabaseClient
                    .from('watchlist')
                    .select('*')
                    .ilike('nome', pessoa.nome_completo)
                    .eq('ativo', true)
                    .order('created_at', { ascending: false })
                    .limit(1);
                if (wByName && wByName.length > 0) watchMatch = wByName[0];
            }

            if (watchMatch) {
                // Alvo procurado identificado no evento durante abordagem!
                const contextoAlerta = {
                    pessoa_id: pessoa.id,
                    evento_id: eventoId,
                    tipo: 'fiscalizacao',
                    nome: pessoa.nome_completo,
                    cpf: pessoa.cpf,
                    numero_pulseira: pessoa.numero_pulseira || safeCodigo,
                    funcao: pessoa.funcao,
                    empresa_nome: pessoa.empresas?.nome,
                    area_id: area_id || null,
                    area: areaFiscalizada?.nome_area || 'Fiscalização Geral',
                    dispositivo_id: req.body.dispositivoId || null,
                    operador_nome: req.user?.nome_completo || req.user?.email || 'Fiscal de Campo',
                    foto_url: pessoa.foto_url
                };

                // Disparo de alerta multicanal assíncrono (Email Master, Telegram, WhatsApp, BD)
                watchlistService.registrarAlerta(watchMatch, contextoAlerta).catch(err => {
                    logger.error({ err }, 'Erro ao disparar alertas multicanal da watchlist');
                });

                // Registrar log de acesso como alerta crítico
                const logId = require('uuid').v4();
                await supabaseClient.from('logs_acesso').insert({
                    id: logId,
                    evento_id: eventoId,
                    pessoa_id: pessoa.id,
                    tipo: 'fiscalizacao',
                    metodo,
                    area_id: area_id || null,
                    observacao: `🚨 ALVO DE SEGURANÇA INTERCEPTADO: ${watchMatch.motivo || 'Alvo Monitorado'}`,
                    created_at: new Date().toISOString()
                });

                // DISPARO SIGILOSO: Emite alerta exclusivamente para os Administradores Master (sala system_admin)
                websocketService.emit('watchlist_alert', {
                    ...contextoAlerta,
                    motivo: watchMatch.motivo,
                    nivel_alerta: watchMatch.nivel_alerta || 'critico',
                    timestamp: new Date().toISOString()
                }, 'system_watchlist');

                // Para a sala do evento, registra passagem negada padrão para não expor a operação
                websocketService.emit('new_access', {
                    id: logId,
                    tipo: 'fiscalizacao',
                    resultado: 'negado',
                    pessoa_id: pessoa.id,
                    pessoa_nome: pessoa.nome_completo,
                    pessoas: {
                        id: pessoa.id,
                        nome_completo: pessoa.nome_completo,
                        cpf: pessoa.cpf,
                        foto_url: pessoa.foto_url,
                        numero_pulseira: pessoa.numero_pulseira
                    },
                    area_id: area_id || null,
                    area_nome: areaFiscalizada?.nome_area || 'Geral',
                    observacao: 'Acesso bloqueado',
                    created_at: new Date().toISOString()
                }, eventoId);

                // Retorno à tela de fiscalização de área: Apenas informa que a credencial está bloqueada
                return ApiResponse.success(res, {
                    autorizado: false,
                    status: 'bloqueado',
                    mensagem: 'ACESSO NEGADO: Credencial bloqueada para este evento.',
                    pessoa: pessoaPayload,
                    area: areaFiscalizada
                });
            }

            // 5. Checar bloqueio
            if (pessoa.bloqueado || pessoa.empresas?.ativo === false) {
                const motivo = pessoa.bloqueado ? (pessoa.motivo_bloqueio || 'Bloqueio de segurança') : 'Empresa Inativa';
                
                await databaseService.logDeniedAccess(eventoId, pessoa.id, metodo, 'fiscalizacao', req.user?.id, `BLOQUEADO: ${motivo}`, { pessoa, dispositivo_nome: 'Fiscalização' });
                
                return ApiResponse.success(res, {
                    autorizado: false,
                    status: 'bloqueado',
                    mensagem: `BLOQUEADO: ${motivo}`,
                    pessoa: pessoaPayload,
                    area: areaFiscalizada
                });
            }

            // 6. Checar status de credenciamento prévio
            if (pessoa.status_acesso === 'pendente') {
                return ApiResponse.success(res, {
                    autorizado: false,
                    status: 'pendente',
                    mensagem: 'CREDENCIAMENTO PENDENTE (Dirija-se à Portaria)',
                    pessoa: pessoaPayload,
                    area: areaFiscalizada
                });
            }

            // 7. Checar autorização da área específica se informada
            if (area_id) {
                const temPermissao = areasMap.has(area_id);
                if (!temPermissao) {
                    await databaseService.logDeniedAccess(eventoId, pessoa.id, metodo, 'fiscalizacao', req.user?.id, `Área Não Autorizada: ${areaFiscalizada?.nome_area || area_id}`, { pessoa, area_id, area_nome: areaFiscalizada?.nome_area, dispositivo_nome: 'Fiscalização' });

                    websocketService.emit('area_alert', {
                        tipo: 'tentativa_area_restrita',
                        pessoa_id: pessoa.id,
                        pessoa_nome: pessoa.nome_completo,
                        pessoa_foto: pessoa.foto_url,
                        area_id,
                        area_nome: areaFiscalizada?.nome_area,
                        hora: new Date().toISOString()
                    }, eventoId);

                    websocketService.emit('new_access', {
                        id: require('uuid').v4(),
                        tipo: 'negado',
                        resultado: 'negado',
                        pessoa_id: pessoa.id,
                        pessoa_nome: pessoa.nome_completo,
                        pessoas: {
                            id: pessoa.id,
                            nome_completo: pessoa.nome_completo,
                            cpf: pessoa.cpf,
                            foto_url: pessoa.foto_url,
                            numero_pulseira: pessoa.numero_pulseira
                        },
                        area_id,
                        area_nome: areaFiscalizada?.nome_area,
                        observacao: `Tentativa em Área Restrita: ${areaFiscalizada?.nome_area || area_id}`,
                        created_at: new Date().toISOString()
                    }, eventoId);

                    return ApiResponse.success(res, {
                        autorizado: false,
                        status: 'area_negada',
                        mensagem: `ACESSO NEGADO: Não autorizado para ${areaFiscalizada?.nome_area || 'esta área'}`,
                        pessoa: pessoaPayload,
                        area: areaFiscalizada
                    });
                }
            }

            // 8. SUCESSO: Autorizado!
            const logId = require('uuid').v4();
            await supabaseClient.from('logs_acesso').insert({
                id: logId,
                evento_id: eventoId,
                pessoa_id: pessoa.id,
                tipo: 'fiscalizacao',
                metodo,
                area_id: area_id || null,
                observacao: `Fiscalizado na área: ${areaFiscalizada?.nome_area || 'Geral'}`,
                created_at: new Date().toISOString()
            });

            websocketService.emit('fiscalizacao_passagem', {
                pessoa_id: pessoa.id,
                pessoa_nome: pessoa.nome_completo,
                pessoa_foto: pessoa.foto_url,
                numero_pulseira: pessoa.numero_pulseira,
                area_id: area_id || null,
                area_nome: areaFiscalizada?.nome_area || 'Geral',
                autorizado: true,
                hora: new Date().toISOString()
            }, eventoId);

            websocketService.emit('new_access', {
                id: logId,
                tipo: 'fiscalizacao',
                resultado: 'sucesso',
                pessoa_id: pessoa.id,
                pessoa_nome: pessoa.nome_completo,
                pessoas: {
                    id: pessoa.id,
                    nome_completo: pessoa.nome_completo,
                    cpf: pessoa.cpf,
                    foto_url: pessoa.foto_url,
                    numero_pulseira: pessoa.numero_pulseira
                },
                area_id: area_id || null,
                area_nome: areaFiscalizada?.nome_area || 'Geral',
                observacao: `Fiscalizado na área: ${areaFiscalizada?.nome_area || 'Geral'}`,
                created_at: new Date().toISOString()
            }, eventoId);

            return ApiResponse.success(res, {
                autorizado: true,
                status: 'liberado',
                mensagem: `ACESSO LIBERADO${areaFiscalizada ? ` — ${areaFiscalizada.nome_area.toUpperCase()}` : ''}`,
                pessoa: pessoaPayload,
                area: areaFiscalizada
            });

        } catch (error) {
            logger.error({ err: error, event_id: req.event?.id }, 'Erro ao fiscalizar acesso');
            return ApiResponse.error(res, error.message || 'Erro ao processar fiscalização');
        }
    }

    /**
     * Obter histórico recente de fiscalizações e passagens do evento
     */
    async getFiscalizacoesRecentes(req, res) {
        try {
            const eventoId = req.event?.id || req.headers['x-evento-id'] || req.query.evento_id;
            const supabaseClient = req.supabase || supabase;

            const { data, error } = await supabaseClient
                .from('logs_acesso')
                .select(`
                    id,
                    created_at,
                    tipo,
                    metodo,
                    observacao,
                    area_id,
                    evento_areas (id, nome_area),
                    pessoas (
                        id,
                        nome_completo,
                        cpf,
                        funcao,
                        numero_pulseira,
                        foto_url,
                        status_acesso,
                        empresas (id, nome)
                    )
                `)
                .eq('evento_id', eventoId)
                .order('created_at', { ascending: false })
                .limit(20);

            if (error) throw error;

            const formatados = (data || []).map(item => {
                const isAlerta = item.observacao?.includes('🚨');
                const isNegado = item.tipo === 'negado' || item.tipo === 'bloqueado' || item.observacao?.includes('NEGADO');
                const status = isAlerta ? 'alerta_seguranca' : (isNegado ? 'negado' : 'liberado');

                return {
                    id: item.id,
                    created_at: item.created_at,
                    tipo: item.tipo,
                    metodo: item.metodo,
                    status,
                    observacao: item.observacao,
                    area_nome: item.evento_areas?.nome_area || 'Geral',
                    numero_pulseira: item.pessoas?.numero_pulseira || '—',
                    pessoa: item.pessoas ? {
                        id: item.pessoas.id,
                        nome_completo: item.pessoas.nome_completo,
                        cpf: item.pessoas.cpf,
                        funcao: item.pessoas.funcao,
                        empresa_nome: item.pessoas.empresas?.nome || '—',
                        numero_pulseira: item.pessoas.numero_pulseira,
                        foto_url: item.pessoas.foto_url,
                        status_acesso: item.pessoas.status_acesso
                    } : null
                };
            });

            return ApiResponse.success(res, formatados);
        } catch (error) {
            logger.error({ err: error, event_id: req.event?.id }, 'Erro ao buscar fiscalizações recentes');
            return ApiResponse.error(res, 'Erro ao carregar histórico de fiscalizações');
        }
    }
}

module.exports = new AccessController();
