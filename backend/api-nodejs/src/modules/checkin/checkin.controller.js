const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');
const cacheService = require('../../services/cacheService');
const websocketService = require('../../services/websocketService');
const qrGenerator = require('../../utils/qrGenerator');
const { v4: uuidv4 } = require('uuid');

// ----- NEW SERVICES IMPORT -----
const WatchlistService = require('./services/watchlist.service');
const ValidationService = require('./services/validation.service');
const DatabaseService = require('./services/database.service');

class AccessController {
    constructor() {
        this.validateQRCode = this.validateQRCode.bind(this);
        this.checkinQRCode = this.checkinQRCode.bind(this);
        this.checkinBarcode = this.checkinBarcode.bind(this);
        this.checkinRFID = this.checkinRFID.bind(this);
        this.checkinManual = this.checkinManual.bind(this);
        this.checkout = this.checkout.bind(this);
        this.checkoutQRCode = this.checkoutQRCode.bind(this);
        this.registrarAcesso = this.registrarAcesso.bind(this);
        this.processFaceRecognition = this.processFaceRecognition.bind(this);
        this.getLogs = this.getLogs.bind(this);
        this.getRealtimeStats = this.getRealtimeStats.bind(this);
        this.expulsar = this.expulsar.bind(this);
        this.isModuleEnabled = this.isModuleEnabled.bind(this);
        this.vincularPulseiraFacial = this.vincularPulseiraFacial.bind(this);
        this.bloquearPessoa = this.bloquearPessoa.bind(this);
        this.consultarAreasPulseira = this.consultarAreasPulseira.bind(this);
        this.acionarCatraca = this.acionarCatraca.bind(this);
    }

    async isModuleEnabled(evento_id, module_key) {
        try {
            const { data, error } = await supabase.from('event_modules').select('is_enabled').eq('evento_id', evento_id).eq('module_key', module_key).single();
            if (error || !data) return true;
            return data.is_enabled;
        } catch (error) {
            logger.error(`Erro ao verificar módulo ${module_key}:`, error);
            return true;
        }
    }

    async consultarAreasPulseira(evento_id, identificador) {
        if (!identificador) return null;
        const num = parseInt(identificador, 10);
        if (isNaN(num)) return null;
        try {
            const { data: tipos, error } = await supabase.from('evento_tipos_pulseira')
                .select(`id, nome_tipo, cor_hex, pulseira_areas_permitidas ( evento_areas (nome_area) )`)
                .eq('evento_id', evento_id).lte('numero_inicial', num).gte('numero_final', num);

            if (error || !tipos || tipos.length === 0) return null;
            const tipo = tipos[0];
            const areas = tipo.pulseira_areas_permitidas.map(p => p.evento_areas?.nome_area).filter(Boolean);
            return { tipo: tipo.nome_tipo, cor: tipo.cor_hex, areas: areas };
        } catch (error) {
            logger.error('Erro ao consultar áreas da pulseira:', error);
            return null;
        }
    }

    async validateQRCode(req, res) {
        try {
            const { qrCode } = req.body;
            const evento_id = req.event.id;
            if (!qrCode) return res.status(400).json({ error: 'QR Code é obrigatório' });

            const { data: pessoa, error } = await supabase.from('pessoas').select('*, empresas(nome)').eq('qr_code', qrCode).eq('evento_id', evento_id).single();
            if (error || !pessoa) return res.status(404).json({ error: 'Credencial não encontrada ou evento inválido' });
            res.json({ success: true, data: pessoa });
        } catch (error) {
            res.status(500).json({ error: 'Erro interno no servidor' });
        }
    }

    async checkinQRCode(req, res) {
        try {
            const { qrCode, dispositivoId, sync_id, offline_timestamp } = req.body;
            const evento_id = req.event.id;

            const moduleEnabled = await this.isModuleEnabled(evento_id, 'checkin_qrcode');
            if (!moduleEnabled) return res.status(403).json({ error: req.t('error.module_disabled_qrcode', { defaultValue: 'Módulo desativado' }) });

            if (!qrCode) return res.status(400).json({ error: req.t('error.qr_required') });

            let qrData;
            try { qrData = qrGenerator.parseCode(qrCode); } 
            catch (qrErr) { return res.status(401).json({ error: 'Credencial inválida ou assinatura corrompida' }); }

            const { data: pessoa, error } = await supabase.from('pessoas').select('*').eq('id', qrData.identifier).eq('evento_id', evento_id).single();
            if (error || !pessoa) return res.status(404).json({ error: req.t('error.credential_not_found') });

            if (pessoa.status_acesso === 'checkin') return res.status(400).json({ error: req.t('error.already_checked_in'), pessoa: { id: pessoa.id, nome: pessoa.nome } });

            const result = await this.registrarAcesso({
                pessoa_id: pessoa.id, evento_id, tipo: 'checkin', metodo: 'qrcode',
                dispositivo_id: dispositivoId, created_by: req.user.id, sync_id, offline_timestamp
            });

            if (result.error) return res.status(400).json({ error: result.error, is_race_condition: result.error.includes('Double Entry') });
            res.json({ success: true, message: req.t('success.checkin'), data: result });
        } catch (error) {
            if (error.status === 403) return res.status(403).json({ error: error.message });
            res.status(500).json({ error: req.t('error.internal_server') });
        }
    }

    async checkinBarcode(req, res) {
        try {
            const { busca, dispositivoId } = req.body;
            const evento_id = req.event.id;

            const moduleEnabled = await this.isModuleEnabled(evento_id, 'checkin_barcode');
            if (!moduleEnabled) return res.status(403).json({ error: 'Módulo de Check-in Código de Barras desativado para este evento' });
            if (!busca) return res.status(400).json({ error: 'Código de barras é obrigatório' });

            const { data: pessoa, error } = await supabase.from('pessoas').select('*').eq('barcode', busca).eq('evento_id', evento_id).single();
            if (error || !pessoa) return res.status(404).json({ error: req.t('error.credential_not_found') });

            const result = await this.registrarAcesso({ pessoa_id: pessoa.id, evento_id, tipo: 'checkin', metodo: 'barcode', dispositivo_id: dispositivoId, created_by: req.user.id });
            res.json({ success: true, message: req.t('success.checkin'), data: result });
        } catch (error) {
            if (error.status === 403) return res.status(403).json({ error: error.message });
            res.status(500).json({ error: req.t('error.internal_server') });
        }
    }

    async checkinRFID(req, res) {
        try {
            const { rfid_tag, dispositivoId } = req.body;
            const evento_id = req.event.id;

            const moduleEnabled = await this.isModuleEnabled(evento_id, 'checkin_rfid');
            if (!moduleEnabled) return res.status(403).json({ error: req.t('error.module_disabled_rfid', { defaultValue: 'Módulo de Check-in RFID desativado para este evento' }) });
            if (!rfid_tag) return res.status(400).json({ error: req.t('error.rfid_required') });

            const { data: pessoa, error } = await supabase.from('pessoas').select('*').eq('rfid_tag', rfid_tag).eq('evento_id', evento_id).single();
            if (error || !pessoa) return res.status(404).json({ error: req.t('error.credential_not_found') });

            const result = await this.registrarAcesso({ pessoa_id: pessoa.id, evento_id, tipo: 'checkin', metodo: 'rfid', dispositivo_id: dispositivoId, created_by: req.user.id });
            res.json({ success: true, message: req.t('success.checkin'), data: result });
        } catch (error) {
            if (error.status === 403) return res.status(403).json({ error: error.message });
            res.status(500).json({ error: req.t('error.internal_server') });
        }
    }

    async checkinManual(req, res) {
        try {
            const { busca, dispositivoId } = req.body;
            const evento_id = req.event.id;

            const moduleEnabled = await this.isModuleEnabled(evento_id, 'checkin_manual');
            if (!moduleEnabled) return res.status(403).json({ error: 'Módulo desativado' });
            if (!busca) return res.status(400).json({ error: 'CPF ou nome é obrigatório' });

            let query = supabase.from('pessoas').select('*').eq('evento_id', evento_id);
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
            if (!pessoas || pessoas.length === 0) return res.status(404).json({ error: 'Pessoa não encontrada' });

            if (pessoas.length > 1) {
                return res.json({ success: true, multiple: true, pessoas: pessoas.map(f => ({ id: f.id, nome: f.nome, cpf: f.cpf, status: f.status_acesso })) });
            }

            const pessoa = pessoas[0];
            if (pessoa.status_acesso === 'checkin_feito') return res.status(400).json({ error: 'Pessoa já realizou check-in' });

            const result = await this.registrarAcesso({ pessoa_id: pessoa.id, evento_id, tipo: 'checkin', metodo: 'manual', dispositivo_id: dispositivoId, created_by: req.user.id });
            res.json({ success: true, message: 'Check-in manual realizado com sucesso', data: result });
        } catch (error) {
            if (error.status === 403) return res.status(403).json({ error: error.message });
            res.status(500).json({ error: 'Erro interno no servidor' });
        }
    }

    async checkout(req, res) {
        try {
            const { pessoa_id, dispositivoId } = req.body;
            const evento_id = req.event.id;

            const moduleEnabled = await this.isModuleEnabled(evento_id, 'checkout_manual');
            if (!moduleEnabled) return res.status(403).json({ error: 'Módulo desativado' });

            const { data: pessoa, error } = await supabase.from('pessoas').select('*').eq('id', pessoa_id).eq('evento_id', evento_id).single();
            if (error || !pessoa) return res.status(404).json({ error: 'Pessoa não encontrada' });
            if (pessoa.status_acesso !== 'checkin_feito') return res.status(400).json({ error: 'Não possui check-in ativo' });

            const result = await this.registrarAcesso({ pessoa_id, evento_id, tipo: 'checkout', metodo: 'manual', dispositivo_id: dispositivoId, created_by: req.user.id });
            res.json({ success: true, message: 'Checkout realizado com sucesso', data: result });
        } catch (error) { res.status(500).json({ error: 'Erro interno no servidor' }); }
    }

    async checkoutQRCode(req, res) {
        try {
            const { qrCode, dispositivoId } = req.body;
            const evento_id = req.event.id;

            const moduleEnabled = await this.isModuleEnabled(evento_id, 'checkout_qrcode');
            if (!moduleEnabled) return res.status(403).json({ error: 'Módulo desativado' });
            if (!qrCode) return res.status(400).json({ error: 'QR Code é obrigatório' });

            let qrData;
            try { qrData = qrGenerator.parseCode(qrCode); } 
            catch (qrErr) { return res.status(401).json({ error: 'Credencial inválida ou assinatura corrompida' }); }

            const { data: pessoa, error } = await supabase.from('pessoas').select('*').eq('id', qrData.identifier).eq('evento_id', evento_id).single();
            if (error || !pessoa) return res.status(404).json({ error: 'Credencial não encontrada' });
            if (pessoa.status_acesso !== 'checkin_feito') return res.status(400).json({ error: 'Pessoa não está com entrada ativa', pessoa: { id: pessoa.id, nome: pessoa.nome } });

            const result = await this.registrarAcesso({ pessoa_id: pessoa.id, evento_id, tipo: 'checkout', metodo: 'qrcode', dispositivo_id: dispositivoId, created_by: req.user.id });
            res.json({ success: true, message: 'Checkout realizado com sucesso', data: result });
        } catch (error) { res.status(500).json({ error: 'Erro interno no servidor' }); }
    }

    /**
     * ✅ REFACTORED: Orquestrador Limpo do Acesso (Clean Architecture Facade)
     */
    async registrarAcesso(payload) {
        const { pessoa_id, evento_id, tipo, metodo, dispositivo_id, confianca = null, foto_capturada = null, data_hora = null, created_by, sync_id = null, offline_timestamp = null } = payload;

        // Idempotência inicial veloz
        if (sync_id) {
            const { data: existing } = await supabase.from('logs_acesso').select('id').eq('sync_id', sync_id).single();
            if (existing) { logger.info(`🔄 Sinc_id ${sync_id} já proc.`); return existing; }
        }

        const logId = uuidv4();
        const tsToUse = offline_timestamp || data_hora;
        const timestamp = tsToUse ? new Date(tsToUse) : new Date();

        // 1. Contexto Base
        const { data: pessoa } = await supabase.from('pessoas').select('*, empresas(nome, ativo)').eq('id', pessoa_id).single();
        if (!pessoa) throw new Error('Pessoa não encontrada');

        // 2. Microservice: Watchlist & Alerts
        const isWatchlisted = await WatchlistService.checkWatchlist(evento_id, pessoa_id, pessoa, tipo, metodo, dispositivo_id);

        // 3. Microservice: Validação Regras Negócio / Fases / Cotas / Anti-Passback
        try {
            await ValidationService.validateAccessRules(evento_id, pessoa, tipo, metodo, timestamp, confianca);
        } catch (error) {
            // Regra falhou: Registrar log tipo 'negado' via DatabaseService
            await DatabaseService.logDeniedAccess(evento_id, pessoa_id, metodo, dispositivo_id, created_by, error.message);
            throw error;
        }

        // Consultas de Contexto Adicionais (Pulseiras)
        const isAlert = isWatchlisted || pessoa.alerta_ativo;
        const dadosPulseira = await this.consultarAreasPulseira(evento_id, pessoa.rfid_tag || pessoa.barcode);
        if (dadosPulseira) logger.info(`Acesso de pulseira liberado pelas áreas: ${dadosPulseira.areas.join(', ')}`);

        // Calcular novo status
        let new_status = pessoa.status_acesso;
        if (tipo === 'checkin') new_status = 'checkin_feito';
        else if (tipo === 'checkout') new_status = 'checkout_feito';

        // 4. Microservice: Transação Distribuída (Supabase + MSSQL)
        const rpcResult = await DatabaseService.registerAccessTransaction(logId, timestamp, payload, pessoa, new_status);
        if (rpcResult.already_done) return { success: true, already_done: true };

        cacheService.invalidatePessoa(pessoa_id);

        const logFinal = {
            id: logId, evento_id, pessoa_id, tipo, metodo, dispositivo_id, confianca,
            created_at: timestamp, observacao: null,
            pessoas: { id: pessoa.id, nome: pessoa.nome, foto_url: pessoa.foto_url || null, empreasa_id: pessoa.empresa_id, empresas: pessoa.empresas },
            ...rpcResult
        };

        websocketService.emit('new_access', logFinal, evento_id);

        if (isAlert) {
            logger.warn(`🚨 ALERTA: ${pessoa.nome} detectado em ${dispositivo_id}`);
        }

        return { success: true, log: logFinal, new_status: rpcResult.new_status };
    }

    async processFaceRecognition(req, res) {
        try {
            // Nova Arquitetura On-Demand Webhook (A catraca manda a foto, o Node descobre quem é)
            const { dispositivo_id, foto_capturada, evento_id } = req.body;
            if (!foto_capturada || !evento_id) return res.status(400).json({ error: 'Foto ou Evento não fornecidos' });

            const moduleEnabled = await this.isModuleEnabled(evento_id, 'checkin_face');
            if (!moduleEnabled) return res.status(403).json({ error: 'Módulo desativado' });

            // 1. Fast Vector Search (InsightFace ONNX -> pgvector)
            const VectorService = require('./services/vector.service');
            const match = await VectorService.identifyPersonByImage(foto_capturada);

            if (!match) {
                logger.warn(`📸 [Webhook] Rosto desconhecido tentou acesso no dispositivo ${dispositivo_id || 'N/A'}`);
                await DatabaseService.logDeniedAccess(evento_id, require('uuid').v4(), 'face', dispositivo_id, 'Sistema', 'Rosto Desconhecido (Sem Match Vetorial)');
                return res.status(404).json({ success: false, error: 'Acesso Negado: Rosto Desconhecido' });
            }

            const { pessoa_id, confianca } = match;
            const { data: pessoa } = await supabase.from('pessoas').select('*, empresas(nome)').eq('id', pessoa_id).single();
            if (!pessoa) return res.status(404).json({ error: 'Match vetorial encontrou ID inexistente ou deletado' });

            if (dispositivo_id) {
                const { data: dispositivo } = await supabase.from('dispositivos_acesso').select('id, nome, config').eq('id', dispositivo_id).single();
                if (dispositivo?.config?.modo_identificacao) {
                    websocketService.emit('face_identified', { pessoa_id: pessoa.id, evento_id, metodo: 'face', dispositivo_id, dispositivo_nome: dispositivo.nome, confianca, pessoas: pessoa, timestamp: new Date() }, evento_id);
                    return res.json({ success: true, message: 'Modo Identidade: Aguardando operador.', data: { nome: pessoa.nome } });
                }
            }

            if (pessoa.status_acesso === 'checkin_feito') return res.json({ success: true, message: 'Acesso já concedido', data: { nome: pessoa.nome } });

            const result = await this.registrarAcesso({ pessoa_id, evento_id, tipo: 'checkin', metodo: 'face', dispositivo_id, confianca, foto_capturada, created_by: req.user?.id || dispositivo_id });
            if (!result) return res.status(500).json({ success: false, error: 'Falha.' });

            try { await this.acionarCatraca(dispositivo_id, 'liberar'); } 
            catch (hwError) {
                logger.error('❌ Falha Hardware:', hwError.message);
                await supabase.from('pessoas').update({ status_acesso: 'pendente' }).eq('id', pessoa_id);
                await supabase.from('logs_acesso').update({ tipo: 'negado', observacao: 'Falha hw: ' + hwError.message }).eq('id', result.log.id);
                return res.status(503).json({ success: false, error: 'Dispositivo físico indisponível.' });
            }

            res.json({ success: true, data: result });
        } catch (error) {
            if (error.status === 403) return res.status(403).json({ error: error.message });
            res.status(500).json({ error: 'Erro interno ao processar face' });
        }
    }

    async acionarCatraca(dispositivo_id, comando) {
        const { data: disp } = await supabase.from('dispositivos_acesso').select('*').eq('id', dispositivo_id).single();
        if (!disp || !disp.ip_address) return;

        try {
            const DeviceFactory = require('../devices/adapters/DeviceFactory');
            const service = DeviceFactory.getDevice(disp);
            const result = await service.openDoor();
            if (!result) throw new Error(`openDoor falhou`);
        } catch (error) { throw error; }
    }

    async getLogs(req, res) {
        const { pessoa_id, page = 1, limit = 20 } = req.query;
        let query = supabase.from('logs_acesso').select('*, pessoas(nome), dispositivos_acesso(nome)', { count: 'exact' }).eq('evento_id', req.event.id);
        if (pessoa_id && pessoa_id !== 'null') query = query.eq('pessoa_id', pessoa_id);
        const { data, count } = await query.order('created_at', { ascending: false }).range((page - 1) * limit, page * limit - 1);
        res.json({ success: true, data, total: count });
    }

    async getRealtimeStats(req, res) {
        try {
            const stats = await ValidationService.getRealtimeStatsInternal(req.event.id);
            res.json({ success: true, data: { ...stats, timestamp: new Date() } });
        } catch (error) { res.status(500).json({ error: error.message }); }
    }

    async vincularPulseiraFacial(req, res) {
        try {
            const { pessoa_id, numero_pulseira, dispositivo_id } = req.body;
            const evento_id = req.event.id;

            if (!pessoa_id || !numero_pulseira || !dispositivo_id) return res.status(400).json({ error: 'Dados incompletos' });

            const { data: pessoa, error: pessoaError } = await supabase.from('pessoas').select('*').eq('id', pessoa_id).eq('evento_id', evento_id).single();
            if (pessoaError || !pessoa) return res.status(404).json({ error: 'Pessoa não encontrada neste evento' });

            if (pessoa.status_acesso === 'checkin_feito') return res.status(400).json({ error: 'Check-in já ativo' });

            const fasePermitida = await ValidationService.verificarFaseEvento(evento_id, pessoa);
            if (!fasePermitida) {
                await DatabaseService.logDeniedAccess(evento_id, pessoa_id, 'face-rfid', dispositivo_id, req.user.id, 'Fase não permitida');
                return res.status(403).json({ success: false, error: 'Acesso negado fase n/ autorizada' });
            }

            const { error: updateError } = await supabase.from('pessoas').update({ rfid_tag: numero_pulseira }).eq('id', pessoa_id);
            if (updateError) throw updateError;
            cacheService.invalidatePessoa(pessoa_id);

            const result = await this.registrarAcesso({ pessoa_id, evento_id, tipo: 'checkin', metodo: 'face-rfid', dispositivo_id, created_by: req.user.id });
            res.json({ success: true, message: 'Pulseira vinculada e check-in efetuado com sucesso', data: result });
        } catch (error) {
            if (error.status === 403) return res.status(403).json({ error: error.message });
            res.status(500).json({ error: 'Erro interno no servidor' });
        }
    }

    async bloquearPessoa(req, res) {
        try {
            const { id } = req.params;
            const { acao, justificativa } = req.body;
            const admin_id = req.user.id;
            const user_role = req.user.role || req.user.currentRole || 'operador';

            if (user_role !== 'admin' && user_role !== 'supervisor') return res.status(403).json({ error: 'Permissão negada.' });
            if (!['bloquear', 'desbloquear'].includes(acao) || !justificativa) return res.status(400).json({ error: 'Parâmetros inválidos.' });

            const bloqueado_flag = acao === 'bloquear';
            const { error: updateError } = await supabase.from('pessoas')
                .update({ bloqueado: bloqueado_flag, motivo_bloqueio: bloqueado_flag ? justificativa : null, status_acesso: bloqueado_flag ? 'bloqueado' : 'verificacao' }).eq('id', id);

            if (updateError) throw updateError;
            cacheService.invalidatePessoa(id);

            await supabase.from('historico_bloqueios').insert({ pessoa_id: id, acao_tipo: acao === 'bloquear' ? 'bloqueio' : 'desbloqueio', justificativa: justificativa, executado_por_admin_id: admin_id });
            res.json({ success: true, message: `Ocorrência salva.` });
        } catch (error) { res.status(500).json({ error: 'Erro interno.' }); }
    }

    async expulsar(req, res) {
        const { pessoa_id } = req.params;
        const { motivo, dispositivoId } = req.body;
        await this.registrarAcesso({ pessoa_id: pessoa_id, evento_id: req.event.id, tipo: 'expulsao', metodo: 'manual', dispositivo_id: dispositivoId, created_by: req.user.id });
        await supabase.from('pessoas').update({ status_acesso: 'expulso' }).eq('id', pessoa_id);
        res.json({ success: true, message: 'Expulso: ' + motivo });
    }
}

module.exports = new AccessController();