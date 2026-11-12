'use strict';

const logger = require('./logger');
const { supabase } = require('../config/supabase');
const crypto = require('crypto');

/**
 * Gerencia a comunicação com agentes locais via WebSocket.
 * Os agentes são instâncias do agent-local rodando em redes privadas.
 */
class AgentService {
    constructor() {
        this.agents = new Map();    // agentToken → socket
        this.pending = new Map();   // requestId → { resolve, reject, timer }
        this.videoSockets = new Map(); // agentId → socket do namespace /agent-video
        this.REQUEST_TIMEOUT = 30000;
    }

    /**
     * Inicializa o namespace /agent no Socket.IO
     */
    init(io) {
        const ns = io.of('/agent');

        const autenticar = async (socket, next) => {
            const token = socket.handshake.auth?.token;
            if (!token) return next(new Error('Token de agente ausente'));

            // Verificar token no banco
            const { data, error } = await supabase
                .from('agent_tokens')
                .select('id, nome, evento_id, ativo')
                .eq('token', token)
                .eq('ativo', true)
                .single();

            if (error || !data) {
                logger.warn(`[Agent] Token inválido: ${token?.substring(0, 8)}...`);
                return next(new Error('Token de agente inválido'));
            }

            socket.agentInfo = data;
            socket.agentToken = token;
            next();
        };
        ns.use(autenticar);

        // Vídeo ao vivo numa conexão separada do agente (2.4+): quadros grandes não atrasam os comandos
        // dos leitores faciais nem o batimento da conexão principal
        const nsVideo = io.of('/agent-video');
        nsVideo.use(autenticar);
        nsVideo.on('connection', (socket) => {
            const agentId = socket.agentInfo.id;
            // Comandos pesados (pedaços de gravação) vão por aqui, não pelo canal dos leitores
            this.videoSockets.set(agentId, socket);
            socket.on('disconnect', () => { if (this.videoSockets.get(agentId) === socket) this.videoSockets.delete(agentId); });
            socket.on('agent:response', (msg) => this._resposta(msg));
            socket.on('agent:video_quadro', (msg, ack) => {
                if (typeof ack === 'function') ack();
                require('./videoRelay').receber(agentId, msg);
            });
            // Rostos alinhados para o servidor de IA central (modo "auto" do evento) — ver services/iaCentral.js
            // Um PC de evento não ocupa o servidor central de todos: no máximo 3 levas ao mesmo tempo, e
            // só se o evento dele está em "servidor central"
            let iaEmVoo = 0;
            socket.on('agent:ia_reconhecer', async (msg, ack) => {
                if (typeof ack !== 'function') return;
                const eventoId = socket.agentInfo.evento_id; // sempre o evento do token do agente
                if (!eventoId || iaEmVoo >= 3) return ack({ indisponivel: true });
                iaEmVoo++;
                try {
                    const cfg = await require('../modules/system/gravacao.service').configEvento(eventoId).catch(() => null);
                    if (cfg?.ia_onde !== 'auto' && cfg?.ia_onde !== 'direto_servidor') return ack({ indisponivel: true, local: true });
                    ack(await require('./iaCentral').reconhecer(eventoId, msg?.itens));
                } catch {
                    ack({ indisponivel: true });
                } finally {
                    iaEmVoo--;
                }
            });
            // Há servidor de IA central ligado? (o agente avisa o motor, que só manda rostos se houver)
            socket.on('agent:ia_servidor_status', (_msg, ack) => {
                if (typeof ack === 'function') ack({ disponivel: require('./iaCentral').temServidor() });
            });
            // Vídeo MP4 (retransmissor local, sem IA) — ver services/mp4Relay.js
            socket.on('agent:video_mp4', (msg, ack) => {
                const r = require('./mp4Relay').receber(agentId, msg);
                if (typeof ack === 'function') ack(r || {});
            });
        });

        ns.on('connection', (socket) => {
            const { id: agentId, nome } = socket.agentInfo;
            logger.info(`🤖 Agente conectado: ${nome} (socket: ${socket.id})`);

            this.agents.set(agentId, socket);
            require('./alertaAgente').agenteConectou(socket.agentInfo);
            supabase.from('agent_tokens').update({ last_connected_at: new Date().toISOString() }).eq('id', agentId)
                .then(({ error }) => error && logger.debug(`[Agent] last_connected_at: ${error.message}`));

            socket.on('agent:ready', (info = {}) => {
                socket.recursos = info.recursos || {};
                socket.versaoAgente = info.version || null;
                const r = socket.recursos;
                logger.info(`🤖 Agente ${nome} pronto (${info.name || nome}, v${info.version || '?'}${r.video_local ? ', vídeo local' : ''}${r.gravacao ? ', gravação' : ''})`);
                // Perfil da IA e câmeras do evento que o motor local deve vigiar com o painel fechado
                require('../modules/system/iaConfig.service').aplicarNoAgente(agentId).catch(() => {});
                require('../modules/system/vigilancia.service').configurarAgente(agentId, socket.agentInfo.evento_id);
            });

            // Pessoa reconhecida pela vigilância (motor local, sem ninguém assistindo)
            socket.on('agent:deteccao', (deteccao, ack) => {
                if (typeof ack === 'function') ack();
                require('../modules/system/vigilancia.service').receberDeteccao(socket.agentInfo.evento_id, deteccao)
                    .catch(err => logger.error(`[Vigilância] detecção do agente ${nome}: ${err.message}`));
            });

            // Biometrias das pessoas do evento para o motor de IA (sem chave do banco no PC)
            socket.on('agent:rostos', (pedido, ack) => {
                if (typeof ack !== 'function') return;
                require('../modules/system/biometriaAgente.service').atender(socket.agentInfo, pedido)
                    .then(ack)
                    .catch(err => { logger.warn(`[Biometria] pedido do agente ${nome}: ${err.message}`); ack({ ok: false, erro: err.message }); });
            });

            // Gravação concluída no PC do evento / gravações apagadas pelo prazo ou limite de espaço
            socket.on('agent:gravacao', (dados, ack) => {
                require('../modules/system/gravacao.service').registrar(socket.agentInfo, dados)
                    .then(() => typeof ack === 'function' && ack({ ok: true }))
                    .catch(err => {
                        logger.warn(`[Gravação] registro do agente ${nome}: ${err.message}`);
                        if (typeof ack === 'function') ack({ ok: false, erro: err.message });
                    });
            });
            socket.on('agent:gravacao_apagadas', (dados, ack) => {
                require('../modules/system/gravacao.service').apagadas(socket.agentInfo, dados?.arquivos)
                    .then(() => typeof ack === 'function' && ack({ ok: true }))
                    .catch(err => typeof ack === 'function' && ack({ ok: false, erro: err.message }));
            });

            socket.on('agent:response', (msg) => this._resposta(msg));

            // Quadros de vídeo ao vivo enviados pelo agente (ver services/videoRelay.js)
            socket.on('agent:video_quadro', (msg, ack) => {
                if (typeof ack === 'function') ack();
                require('./videoRelay').receber(agentId, msg);
            });

            socket.on('disconnect', () => {
                logger.warn(`⚠️ Agente desconectado: ${nome}`);
                // Só remove se ainda for a conexão vigente (o agente pode ter reconectado)
                if (this.agents.get(agentId) === socket) {
                    this.agents.delete(agentId);
                    require('./videoRelay').agenteDesconectou(agentId);
                    require('./mp4Relay').agenteDesconectou(agentId);
                    // Fora por mais de 2 min → avisa os admins (painel + e-mail)
                    require('./alertaAgente').agenteDesconectou(socket.agentInfo, () => this.agents.has(agentId));
                }
                // Chamadas feitas por esta conexão não terão resposta: falham já, sem esperar o timeout
                for (const [requestId, pending] of this.pending) {
                    if (pending.socket !== socket) continue;
                    clearTimeout(pending.timer);
                    this.pending.delete(requestId);
                    pending.reject(new Error(`Agente ${nome} desconectou`));
                }
            });
        });

        logger.info('🤖 AgentService inicializado no namespace /agent');
    }

    /**
     * Envia um comando para o agente responsável pelo dispositivo
     * e aguarda a resposta com timeout.
     */
    _resposta({ requestId, success, data, error } = {}) {
        const pending = this.pending.get(requestId);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(requestId);
        if (success) pending.resolve(data);
        else pending.reject(new Error(error || 'Erro desconhecido no agente'));
    }

    /**
     * @param {{ canal?: 'video' }} [opcoes] canal 'video': usa a conexão de vídeo do agente (3.0+),
     *   para comandos pesados não atrasarem os leitores; sem ela, a conexão principal
     */
    async sendCommand(agentId, command, payload, timeoutMs = this.REQUEST_TIMEOUT, opcoes = {}) {
        const principal = this.agents.get(agentId);
        if (!principal) throw new Error(`Agente ${agentId} não está conectado`);
        const socket = (opcoes.canal === 'video' && this.videoSockets.get(agentId)?.connected && principal.versaoAgente >= '3.0.0')
            ? this.videoSockets.get(agentId)
            : principal;

        const requestId = crypto.randomUUID();

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(requestId);
                reject(new Error(`Timeout aguardando resposta do agente para ${command}`));
            }, timeoutMs);

            this.pending.set(requestId, { resolve, reject, timer, socket });
            socket.emit('agent:command', { requestId, command, payload });
        });
    }

    /**
     * Verifica se há agente conectado para um evento/dispositivo
     */
    async findAgentForDevice(deviceId) {
        const { data } = await supabase
            .from('dispositivos_acesso')
            .select('agent_id')
            .eq('id', deviceId)
            .single();

        if (!data?.agent_id) return null;

        const socket = this.agents.get(data.agent_id);
        return socket ? data.agent_id : null;
    }

    /** Agente conectado do evento (câmeras e IA facial ficam na rede do evento), ou null */
    findAgentForEvent(eventoId) {
        if (!eventoId) return null;
        for (const [agentId, socket] of this.agents) {
            if (socket.agentInfo?.evento_id === eventoId) return agentId;
        }
        return null;
    }

    /** O que o PC do agente sabe fazer (enviado no agent:ready): { video_local, ffmpeg, gravacao, rostos_pelo_agente } */
    recursos(agentId) {
        return this.agents.get(agentId)?.recursos || {};
    }

    /** Encerra a conexão de um agente (ex.: token desativado) */
    desconectar(agentId) {
        const socket = this.agents.get(agentId);
        if (socket) socket.disconnect(true);
        this.agents.delete(agentId);
    }

    /**
     * Lista agentes atualmente conectados
     */
    getConnectedAgents() {
        return [...this.agents.entries()].map(([id, socket]) => ({
            id,
            nome: socket.agentInfo?.nome,
            connectedAt: socket.handshake.time
        }));
    }

    /**
     * Gera e salva um novo token para um agente
     */
    static async generateToken(nome, eventoId, createdBy) {
        const token = crypto.randomBytes(32).toString('hex');

        const { data, error } = await supabase
            .from('agent_tokens')
            .insert([{ nome, evento_id: eventoId, token, ativo: true, created_by: createdBy }])
            .select('id, nome, token')
            .single();

        if (error) throw error;
        return data;
    }
}

module.exports = new AgentService();
