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
        this.REQUEST_TIMEOUT = 30000;
    }

    /**
     * Inicializa o namespace /agent no Socket.IO
     */
    init(io) {
        const ns = io.of('/agent');

        ns.use(async (socket, next) => {
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
        });

        ns.on('connection', (socket) => {
            const { id: agentId, nome } = socket.agentInfo;
            logger.info(`🤖 Agente conectado: ${nome} (socket: ${socket.id})`);

            this.agents.set(agentId, socket);

            socket.on('agent:ready', (info) => {
                logger.info(`🤖 Agente ${nome} pronto. Dispositivos: ${info.devices?.join(', ') || 'nenhum'}`);
            });

            socket.on('agent:response', ({ requestId, success, data, error }) => {
                const pending = this.pending.get(requestId);
                if (!pending) return;

                clearTimeout(pending.timer);
                this.pending.delete(requestId);

                if (success) {
                    pending.resolve(data);
                } else {
                    pending.reject(new Error(error || 'Erro desconhecido no agente'));
                }
            });

            socket.on('disconnect', () => {
                logger.warn(`⚠️ Agente desconectado: ${nome}`);
                this.agents.delete(agentId);
            });
        });

        logger.info('🤖 AgentService inicializado no namespace /agent');
    }

    /**
     * Envia um comando para o agente responsável pelo dispositivo
     * e aguarda a resposta com timeout.
     */
    async sendCommand(agentId, command, payload) {
        const socket = this.agents.get(agentId);
        if (!socket) throw new Error(`Agente ${agentId} não está conectado`);

        const requestId = crypto.randomUUID();

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(requestId);
                reject(new Error(`Timeout aguardando resposta do agente para ${command}`));
            }, this.REQUEST_TIMEOUT);

            this.pending.set(requestId, { resolve, reject, timer });
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
