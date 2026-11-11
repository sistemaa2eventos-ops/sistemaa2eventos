'use strict';

const crypto = require('crypto');
const logger = require('./logger');

/**
 * Vídeo MP4 ao vivo das câmeras (sem motor de IA): o agente local lê o MP4 fragmentado do
 * retransmissor go2rtc (H.264 copiado da câmera, sem recodificar) e manda os pedaços por
 * 'agent:video_mp4'; aqui eles viram a resposta HTTP de um <video> no painel.
 *
 * Um envio por espectador (o MP4 precisa começar pelo cabeçalho de cada conexão); o sub-stream
 * da câmera custa ~0,3–0,6 Mbit/s, de 5 a 10 vezes menos que o MJPEG antigo.
 */
const LIMITE_BUFFER = 4e6;      // espectador lento: encerra (o painel reconecta no ponto ao vivo)
const ESPERA_INICIO_MS = 12000;

class Mp4Relay {
    constructor() {
        this.streams = new Map(); // streamId → { agentId, res, aberto, antes[], fechar }
    }

    async assistir({ agentId, cameraId, qualidade, ua, req, res }) {
        const agentService = require('./agentService');
        const streamId = crypto.randomUUID();
        const st = { agentId, res, aberto: false, antes: [], fechado: false };
        st.fechar = (avisarAgente = true) => {
            if (st.fechado) return;
            st.fechado = true;
            this.streams.delete(streamId);
            if (avisarAgente) agentService.sendCommand(agentId, 'video_mp4_parar', { streamId }, 5000).catch(() => {});
            if (!res.writableEnded) res.end();
        };
        this.streams.set(streamId, st);
        req.on('close', () => st.fechar(true));

        let resposta;
        try {
            resposta = await agentService.sendCommand(agentId, 'video_mp4_iniciar',
                { streamId, camera_id: cameraId, qualidade, ua }, ESPERA_INICIO_MS);
        } catch (err) {
            st.fechado = true;
            this.streams.delete(streamId);
            // Timeout: o agente pode ter aberto depois — manda parar para não ficar subindo vídeo à toa
            agentService.sendCommand(agentId, 'video_mp4_parar', { streamId }, 5000).catch(() => {});
            if (!res.headersSent) {
                // 409: o painel cai para o MJPEG (agente antigo, câmera fora do retransmissor)
                const semSuporte = /Comando desconhecido|não está no retransmissor|não instalado|Canal de vídeo/.test(err.message);
                res.status(semSuporte ? 409 : 503).send(err.message);
            }
            return;
        }
        if (st.fechado) return; // espectador saiu enquanto o agente abria

        res.writeHead(200, {
            'Content-Type': resposta?.tipo || 'video/mp4',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Connection': 'close',
            'X-Accel-Buffering': 'no'
        });
        st.aberto = true;
        for (const pedaco of st.antes) res.write(pedaco);
        st.antes = [];
        logger.debug(`🎥 [Vídeo MP4] ${cameraId} (${qualidade}) aberto pelo agente`);
    }

    /**
     * Pedaço enviado pelo agente. Devolve { parar: true } (vai no ack) quando ninguém mais assiste
     * esse vídeo: o agente para de enviar na hora.
     */
    receber(agentId, { streamId, dados, fim } = {}) {
        const st = this.streams.get(streamId);
        if (!st || st.agentId !== agentId) return fim ? undefined : { parar: true };
        if (fim) return st.fechar(false);
        if (!dados) return undefined;
        const buf = Buffer.isBuffer(dados) ? dados : Buffer.from(dados);
        if (!st.aberto) {
            st.antes.push(buf);
            return;
        }
        if (st.res.writableLength > LIMITE_BUFFER) {
            st.fechar(true);
            return { parar: true };
        }
        st.res.write(buf);
        return undefined;
    }

    /** Agente caiu: derruba os vídeos dele (o <video> recebe erro e o painel reconecta) */
    agenteDesconectou(agentId) {
        for (const [streamId, st] of this.streams) {
            if (st.agentId !== agentId) continue;
            st.fechado = true;
            this.streams.delete(streamId);
            st.res.destroy();
        }
    }
}

module.exports = new Mp4Relay();
