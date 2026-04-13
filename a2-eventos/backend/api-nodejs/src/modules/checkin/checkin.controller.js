const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');
const qrGenerator = require('../../utils/qrGenerator');
const checkinService = require('./checkin.service');
const ApiResponse = require('../../utils/apiResponse');

class AccessController {
    constructor() {
        this.validateQRCode = this.validateQRCode.bind(this);
        this.checkinQRCode = this.checkinQRCode.bind(this);
        this.checkinBarcode = this.checkinBarcode.bind(this);
        this.checkinRFID = this.checkinRFID.bind(this);
        this.checkinManual = this.checkinManual.bind(this);
        this.checkout = this.checkout.bind(this);
        this.checkoutQRCode = this.checkoutQRCode.bind(this);
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
    }

    async validateQRCode(req, res) {
        try {
            const { qrCode } = req.body;
            const eventoId = req.event?.id;
            if (!eventoId) return ApiResponse.error(res, 'Evento não identificado.', 400);
            if (!qrCode) return ApiResponse.error(res, 'QR Code é obrigatório.', 400);

            const supabaseClient = req.supabase || supabase;
            const { data: pessoa, error } = await supabaseClient
                .from('pessoas')
                .select('*, empresas(nome)')
                .eq('qr_code', qrCode)
                .eq('evento_id', eventoId)
                .single();

            if (error || !pessoa) return ApiResponse.error(res, 'Credencial não encontrada ou evento inválido', 404);
            
            return ApiResponse.success(res, pessoa);
        } catch (error) {
            logger.error('Erro ao validar QR Code:', error.message);
            return ApiResponse.error(res, 'Erro interno no servidor');
        }
    }

    async checkinQRCode(req, res) {
        try {
            const { qrCode, dispositivoId, sync_id, offline_timestamp } = req.body;
            const eventoId = req.event?.id;
            const supabaseClient = req.supabase || supabase;

            const moduleEnabled = await checkinService.isModuleEnabled(supabaseClient, eventoId, 'checkin_qrcode');
            if (!moduleEnabled) return ApiResponse.error(res, 'Módulo de QR Code desativado para este evento.', 403);

            if (!qrCode) return ApiResponse.error(res, 'QR Code é obrigatório.', 400);

            let qrData;
            try { 
                qrData = qrGenerator.parseCode(qrCode); 
            } catch (qrErr) { 
                // Fallback para Sync Offline: se vier do mobile app (offline_sync), o qrCode é o ID direto
                if (req.body.offline_sync) {
                    qrData = { identifier: qrCode };
                } else {
                    return ApiResponse.error(res, 'Credencial inválida ou assinatura corrompida', 401); 
                }
            }

            const { data: pessoa, error } = await supabaseClient
                .from('pessoas')
                .select('*')
                .eq('id', qrData.identifier)
                .eq('evento_id', eventoId)
                .single();

            if (error || !pessoa) return ApiResponse.error(res, 'Participante não localizado.', 404);

            if (pessoa.status_acesso === 'checkin') {
                return ApiResponse.error(res, 'Pessoa já realizou check-in.', 400, { pessoa_id: pessoa.id, nome: pessoa.nome });
            }

            const result = await checkinService.registrarAcesso(supabaseClient, {
                pessoa_id: pessoa.id, 
                evento_id: eventoId, 
                tipo: 'checkin', 
                metodo: 'qrcode',
                dispositivo_id: dispositivoId, 
                created_by: req.user?.id, 
                sync_id, 
                offline_timestamp
            });

            if (result.error) return ApiResponse.error(res, result.error, 400);
            
            return ApiResponse.success(res, result, 201);
        } catch (error) {
            logger.error('Erro no check-in QR Code:', error.message);
            return ApiResponse.error(res, 'Erro interno no servidor');
        }
    }

    async checkinBarcode(req, res) {
        try {
            const { busca, dispositivoId } = req.body;
            const eventoId = req.event?.id;
            const supabaseClient = req.supabase || supabase;

            const moduleEnabled = await checkinService.isModuleEnabled(supabaseClient, eventoId, 'checkin_barcode');
            if (!moduleEnabled) return ApiResponse.error(res, 'Módulo de Código de Barras desativado.', 403);
            if (!busca) return ApiResponse.error(res, 'Código de barras é obrigatório', 400);

            const { data: pessoa, error } = await supabaseClient
                .from('pessoas')
                .select('*')
                .eq('barcode', busca)
                .eq('evento_id', eventoId)
                .single();

            if (error || !pessoa) return ApiResponse.error(res, 'Credencial não localizada.', 404);

            const result = await checkinService.registrarAcesso(supabaseClient, { 
                pessoa_id: pessoa.id, 
                evento_id: eventoId, 
                tipo: 'checkin', 
                metodo: 'barcode', 
                dispositivo_id: dispositivoId, 
                created_by: req.user?.id 
            });

            if (result.error) return ApiResponse.error(res, result.error, 400);

            return ApiResponse.success(res, result);
        } catch (error) {
            logger.error('Erro no check-in Código de Barras:', error.message);
            return ApiResponse.error(res, 'Erro interno no servidor');
        }
    }

    async checkinRFID(req, res) {
        try {
            const { rfid_tag, dispositivoId } = req.body;
            const eventoId = req.event?.id;
            const supabaseClient = req.supabase || supabase;

            const moduleEnabled = await checkinService.isModuleEnabled(supabaseClient, eventoId, 'checkin_rfid');
            if (!moduleEnabled) return ApiResponse.error(res, 'Módulo RFID desativado.', 403);
            if (!rfid_tag) return ApiResponse.error(res, 'Tag RFID é obrigatória.', 400);

            const { data: pessoa, error } = await supabaseClient
                .from('pessoas')
                .select('*')
                .eq('rfid_tag', rfid_tag)
                .eq('evento_id', eventoId)
                .single();

            if (error || !pessoa) return ApiResponse.error(res, 'Tag não reconhecida para este evento.', 404);

            const result = await checkinService.registrarAcesso(supabaseClient, { 
                pessoa_id: pessoa.id, 
                evento_id: eventoId, 
                tipo: 'checkin', 
                metodo: 'rfid', 
                dispositivo_id: dispositivoId, 
                created_by: req.user?.id 
            });

            if (result.error) return ApiResponse.error(res, result.error, 400);

            return ApiResponse.success(res, result);
        } catch (error) {
            logger.error('Erro no check-in RFID:', error.message);
            return ApiResponse.error(res, 'Erro interno no servidor');
        }
    }

    async checkinManual(req, res) {
        try {
            const { busca, dispositivoId, sync_id, offline_timestamp } = req.body;
            const eventoId = req.event?.id;
            const supabaseClient = req.supabase || supabase;

            const moduleEnabled = await checkinService.isModuleEnabled(supabaseClient, eventoId, 'checkin_manual');
            if (!moduleEnabled) return ApiResponse.error(res, 'Módulo de Check-in Manual desativado.', 403);
            if (!busca) return ApiResponse.error(res, 'Identificador (CPF/Nome) é obrigatório.', 400);

            let query = supabaseClient.from('pessoas').select('*').eq('evento_id', eventoId);
            const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(busca);

            if (isUUID) {
                query = query.eq('id', busca);
            } else {
                const buscaLimpa = busca.replace(/[^\d\w\s]/g, '');
                if (/^\d+$/.test(buscaLimpa) && buscaLimpa.length === 11) query = query.eq('cpf', buscaLimpa);
                else query = query.ilike('nome', `%${buscaLimpa}%`);
            }

            const { data: pessoas, error } = await query.limit(10);
            if (error) throw error;
            if (!pessoas || pessoas.length === 0) return ApiResponse.error(res, 'Nenhum registro encontrado.', 404);

            if (pessoas.length > 1) {
                return ApiResponse.success(res, { multiple: true, pessoas: pessoas.map(f => ({ id: f.id, nome: f.nome, cpf: f.cpf, status: f.status_acesso })) });
            }

            const pessoa = pessoas[0];
            if (pessoa.status_acesso === 'checkin') return ApiResponse.error(res, 'Registro já em estado de Check-in.', 400);

            const result = await checkinService.registrarAcesso(supabaseClient, {
                pessoa_id: pessoa.id,
                evento_id: eventoId,
                tipo: 'checkin',
                metodo: 'manual',
                dispositivo_id: dispositivoId,
                created_by: req.user?.id,
                sync_id,
                offline_timestamp
            });

            if (result.error) return ApiResponse.error(res, result.error, 400);

            return ApiResponse.success(res, result);
        } catch (error) {
            logger.error('Erro no check-in Manual:', error.message);
            return ApiResponse.error(res, 'Erro interno no servidor');
        }
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
            logger.error('Erro no checkout:', error.message);
            return ApiResponse.error(res, 'Erro interno no servidor');
        }
    }

    async checkoutQRCode(req, res) {
        try {
            const { qrCode, dispositivoId } = req.body;
            const eventoId = req.event?.id;
            const supabaseClient = req.supabase || supabase;

            const moduleEnabled = await checkinService.isModuleEnabled(supabaseClient, eventoId, 'checkout_qrcode');
            if (!moduleEnabled) return ApiResponse.error(res, 'Módulo de Checkout QR Code desativado.', 403);

            if (!qrCode) return ApiResponse.error(res, 'QR Code é obrigatório.', 400);

            let qrData;
            try { qrData = qrGenerator.parseCode(qrCode); } 
            catch (qrErr) { return ApiResponse.error(res, 'Credencial inválida', 401); }

            const { data: pessoa, error } = await supabaseClient
                .from('pessoas')
                .select('id')
                .eq('id', qrData.identifier)
                .eq('evento_id', eventoId)
                .single();

            if (error || !pessoa) return ApiResponse.error(res, 'Credencial não localizada.', 404);

            const result = await checkinService.registrarAcesso(supabaseClient, {
                pessoa_id: pessoa.id, 
                evento_id: eventoId, 
                tipo: 'checkout', 
                metodo: 'qrcode',
                dispositivo_id: dispositivoId, 
                created_by: req.user?.id
            });

            if (result.error) return ApiResponse.error(res, result.error, 400);

            return ApiResponse.success(res, result);
        } catch (error) {
            logger.error('Erro no checkout QR Code:', error.message);
            return ApiResponse.error(res, 'Erro interno no servidor');
        }
    }

    async processFaceRecognition(req, res) {
        // Gerenciado pelo hardware externo via WebSocket
        // Ver: Monitor.jsx e websocketService.js
        // Não remover — pode ser necessário no futuro
        try {
            const { face_token, dispositivo_id } = req.body;
            const eventoId = req.event?.id;
            const supabaseClient = req.supabase || supabase;

            return ApiResponse.error(res, 'Ponto de Reconhecimento Facial em migração de Vector Store.', 501);
        } catch (error) {
            logger.error('Erro no processamento facial:', error.message);
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
                    .select('id, nome, cpf, foto_url, empresa_id, empresas(nome)')
                    .in('id', pessoaIds);

                // Passo 3: Mapear os dados para enriquecer os logs
                const pessoasMap = (pessoasData || []).reduce((acc, p) => {
                    acc[p.id] = p;
                    return acc;
                }, {});

                logs.forEach(log => {
                    if (log.pessoa_id && pessoasMap[log.pessoa_id]) {
                        log.pessoas = pessoasMap[log.pessoa_id];
                    }
                });
            }

            return ApiResponse.success(res, logs);
        } catch (error) {
            logger.error('Erro ao listar logs (Busca Resiliente):', error.message);
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
            logger.error('Erro ao buscar stats realtime:', error.message);
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

            return ApiResponse.success(res, { message: 'Participante expulso com sucesso.', data: pessoa });
        } catch (error) {
            logger.error('Erro ao expulsar participante:', error.message);
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
      
          const { data, error } = await supabaseClient
            .from('pessoas')
            .select('*, empresas(nome)')
            .eq('evento_id', evento_id)
            .or(`numero_pulseira.eq.${codigo},qr_code.eq.${codigo}`)
            .single();
      
          if (error || !data) {
            return ApiResponse.error(res, 'Pulseira ou QR Code não encontrado.', 404);
          }
      
          return ApiResponse.success(res, data);
        } catch (error) {
            logger.error('Erro ao consultar pulseira:', error.message);
            return ApiResponse.error(res, 'Erro interno ao consultar pulseira.');
        }
    }

    async consultarAreasPulseira(req, res) {
        try {
            const { id: identifies } = req.params;
            const eventoId = req.event?.id || req.query.evento_id;
            const supabaseClient = req.supabase || supabase;
            
            const { data, error } = await supabaseClient
                .from('areas')
                .select('id, nome')
                .eq('evento_id', eventoId);

            if (error) throw error;

            return ApiResponse.success(res, { areas: data || [] });
        } catch (error) {
            logger.error('Erro ao consultar áreas:', error.message);
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
            logger.error('Erro ao buscar último check-in:', error.message);
            return ApiResponse.error(res, 'Erro interno ao buscar último check-in.');
        }
    }

    async acionarCatraca(req, res) {
        // Gerenciado pelo hardware externo via WebSocket
        // Ver: Monitor.jsx e websocketService.js
        // Não remover — pode ser necessário no futuro
        return ApiResponse.success(res, { message: 'Pulso enviado para ponte de hardware.' });
    }
}

module.exports = new AccessController();