'use strict';

const logger = require('./logger');

/**
 * Vídeo ao vivo das câmeras do evento no painel da nuvem.
 *
 * O agente local envia os quadros por conta própria ('agent:video_quadro'), na taxa pedida, e cada
 * quadro é repassado como MJPEG a todos que estão assistindo aquela câmera — um único envio do
 * evento serve qualquer número de espectadores. Antes era um pedido por quadro (~4 fps).
 */
const RENOVAR_MS = 10000;  // o agente para sozinho se não houver renovação em 30 s
const LIMITE_BUFFER = 2e6; // espectador lento: pula quadros em vez de acumular memória

class VideoRelay {
    constructor() {
        this.streams = new Map(); // streamId → { agentId, espectadores: Set<res>, ultimo, pronto, renovar }
    }

    _escrever(res, jpeg) {
        res.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${jpeg.length}\r\n\r\n`);
        res.write(jpeg);
        res.write('\r\n');
    }

    /**
     * Assiste ao vídeo de uma câmera pelo agente. Rejeita se o agente não aceitar o comando
     * (ex.: agente antigo sem 'video_iniciar'), para o chamador cair no modo antigo.
     */
    async assistir({ agentId, streamId, params, req, res }) {
        const agentService = require('./agentService');
        let st;
        // Repete se o vídeo foi encerrado enquanto este espectador esperava a confirmação do agente
        // (outro espectador fechou): antes ficava preso a um vídeo que já não existia, com a tela preta
        for (let tentativa = 0; tentativa < 3; tentativa++) {
            st = this.streams.get(streamId);
            if (!st) {
                st = { agentId, espectadores: new Set(), ultimo: null, renovar: null, params };
                // A renovação leva os parâmetros atuais: mudar fps/qualidade no painel vale na hora
                const comando = () => agentService.sendCommand(agentId, 'video_iniciar', { streamId, ...st.params, ttlMs: RENOVAR_MS * 3 }, 5000);
                st.pronto = comando();
                this.streams.set(streamId, st);
                try {
                    await st.pronto;
                } catch (err) {
                    if (this.streams.get(streamId) === st) this.streams.delete(streamId);
                    throw err;
                }
                st.renovar = setInterval(() => comando().catch(err => logger.debug(`[Vídeo] renovação ${streamId}: ${err.message}`)), RENOVAR_MS);
                logger.info(`🎥 [Vídeo] ${streamId} ao vivo pelo agente (${params.fps} fps, ${params.max_width}px)`);
            } else {
                await st.pronto;
            }
            if (this.streams.get(streamId) === st) break;
        }
        if (this.streams.get(streamId) !== st) throw new Error('Vídeo encerrado durante a abertura');
        st.params = params;

        // Fechou a tela enquanto o agente confirmava: não fica vídeo ligado sem ninguém
        if (req.destroyed || res.writableEnded) {
            if (st.espectadores.size === 0 && this.streams.get(streamId) === st) this._encerrar(streamId);
            return;
        }

        res.writeHead(200, {
            'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Connection': 'close',
            'Pragma': 'no-cache',
            // Sem buffer no nginx: espectador lento perde quadros em vez de acumular atraso
            'X-Accel-Buffering': 'no'
        });
        st.espectadores.add(res);
        if (st.ultimo) this._escrever(res, st.ultimo); // imagem na hora para quem chega depois

        req.on('close', () => {
            st.espectadores.delete(res);
            if (st.espectadores.size === 0 && this.streams.get(streamId) === st) this._encerrar(streamId);
        });
    }

    /** Quadro enviado pelo agente */
    receber(agentId, { streamId, jpeg } = {}) {
        const st = this.streams.get(streamId);
        if (!st || st.agentId !== agentId || !jpeg) return;
        const buf = Buffer.isBuffer(jpeg) ? jpeg : Buffer.from(jpeg);
        st.ultimo = buf;
        for (const res of st.espectadores) {
            if (res.writableLength > LIMITE_BUFFER) continue;
            this._escrever(res, buf);
        }
    }

    _encerrar(streamId) {
        const st = this.streams.get(streamId);
        if (!st) return;
        clearInterval(st.renovar);
        this.streams.delete(streamId);
        require('./agentService').sendCommand(st.agentId, 'video_parar', { streamId }, 5000).catch(() => {});
        logger.info(`🎥 [Vídeo] ${streamId} encerrado (ninguém assistindo)`);
    }

    /**
     * Agente caiu: derruba os vídeos dele. destroy (e não end): o <img> recebe erro e o painel reconecta
     * sozinho quando o agente voltar; com end o navegador ficava parado no último quadro.
     */
    agenteDesconectou(agentId) {
        for (const [streamId, st] of this.streams) {
            if (st.agentId !== agentId) continue;
            clearInterval(st.renovar);
            this.streams.delete(streamId);
            for (const res of st.espectadores) res.destroy();
        }
    }
}

module.exports = new VideoRelay();
