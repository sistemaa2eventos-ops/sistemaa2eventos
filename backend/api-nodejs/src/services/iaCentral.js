'use strict';

const crypto = require('crypto');
const logger = require('./logger');
const { supabase } = require('../config/supabase');

/**
 * Servidores de IA centrais (fora da rede do evento).
 *
 * O servidor (PC com placa de vídeo) conecta AQUI, saindo da rede dele — nenhuma porta aberta na
 * casa/escritório. Os PCs dos eventos mandam só rostos já recortados e alinhados (~4 KB); esta API
 * escolhe um servidor (o que já tem o evento carregado e está menos ocupado), repassa e devolve a
 * resposta (id da pessoa + semelhança). Nada é gravado aqui.
 *
 * Segurança:
 *  - token por servidor, guardado só como SHA-256 (servidores_ia.token_hash), revogável;
 *  - o servidor só recebe a biometria dos eventos que esta API atribuiu a ele, e a guarda na memória;
 *  - tamanho dos pedidos limitado; resultados são só ids e números.
 */
const PRAZO_TOTAL_MS = 1800; // o PC do evento desiste em 2,5 s: tentativas cabem neste total
const MIN_RETENTATIVA_MS = 600;
const MAX_ITENS = 50;
const MAX_IMG = 60000;     // caracteres base64 por rosto (112x112 JPEG fica em ~5 mil)
const MAX_EM_VOO = 24;     // pedidos simultâneos por servidor
// Permissão de um servidor para baixar a biometria de um evento: vence sem reconhecimento por este tempo
const ATRIBUICAO_MS = 3 * 3600000;
const LISTA_COMPLETA_MIN_MS = 60000; // modo 'ids' (lê a tabela inteira): no máximo 1x/min por evento

const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

class IaCentral {
    constructor() {
        this.servidores = new Map(); // id → { socket, nome, info, emVoo, eventos:Set, atendidos }
    }

    init(io) {
        const ns = io.of('/ia-servidor');
        ns.use(async (socket, next) => {
            const token = socket.handshake.auth?.token;
            if (!token || String(token).length < 32) return next(new Error('Token do servidor de IA ausente'));
            const { data, error } = await supabase.from('servidores_ia')
                .select('id, nome, ativo').eq('token_hash', hashToken(token)).maybeSingle();
            if (error || !data || !data.ativo) {
                logger.warn('[IA central] conexão recusada: token inválido ou revogado');
                return next(new Error('Token do servidor de IA inválido'));
            }
            socket.servidor = data;
            next();
        });

        ns.on('connection', (socket) => {
            const { id, nome } = socket.servidor;
            const anterior = this.servidores.get(id);
            if (anterior) anterior.socket.disconnect(true); // reconectou: fica a conexão nova
            // eventos: evento_id → último reconhecimento pedido (ms). Só esses podem baixar biometria.
            const reg = { socket, nome, info: {}, emVoo: 0, eventos: new Map(), listas: new Map(), atendidos: 0, desde: new Date().toISOString() };
            this.servidores.set(id, reg);
            logger.info(`🧠 [IA central] servidor conectado: ${nome}`);
            const ip = String(socket.handshake.headers['x-forwarded-for'] || socket.handshake.address || '').split(',')[0].trim();
            supabase.from('servidores_ia').update({ ultimo_contato: new Date().toISOString(), ultimo_ip: ip || null }).eq('id', id).then(() => {});

            socket.on('servidor:pronto', (info = {}) => {
                reg.info = { versao: String(info.versao || '').slice(0, 40), hardware: String(info.hardware || '').slice(0, 120) };
                supabase.from('servidores_ia').update({ info: reg.info }).eq('id', id).then(() => {});
                logger.info(`🧠 [IA central] ${nome} pronto (${info.hardware || '?'}, v${info.versao || '?'})`);
            });

            // Biometria de um evento: só dos eventos que esta API mandou este servidor atender, enquanto
            // a atribuição valer. Vai SÓ o id + vetor do rosto (nome, CPF e foto ficam no PC do evento).
            socket.on('servidor:rostos', async (pedido = {}, ack) => {
                if (typeof ack !== 'function') return;
                const eventoId = pedido.evento_id;
                const uso = eventoId ? reg.eventos.get(eventoId) : null;
                if (!uso || Date.now() - uso > ATRIBUICAO_MS) {
                    if (eventoId) reg.eventos.delete(eventoId);
                    return ack({ ok: false, erro: 'evento não atribuído a este servidor' });
                }
                if (pedido.modo === 'ids') {
                    const ultima = reg.listas.get(eventoId) || 0;
                    if (Date.now() - ultima < LISTA_COMPLETA_MIN_MS) return ack({ ok: false, erro: 'lista completa pedida há menos de 1 min' });
                    reg.listas.set(eventoId, Date.now());
                }
                try {
                    const r = await require('../modules/system/biometriaAgente.service').atender({ evento_id: eventoId }, pedido);
                    if (Array.isArray(r?.pessoas)) {
                        r.pessoas = r.pessoas.map(p => ({ id: p.id, face_encoding: p.face_encoding ?? null }));
                    }
                    ack(r);
                } catch (err) {
                    ack({ ok: false, erro: err.message });
                }
            });

            socket.on('servidor:descarregou', ({ evento_id } = {}) => { if (evento_id) reg.eventos.delete(evento_id); });

            socket.on('disconnect', () => {
                if (this.servidores.get(id) === reg) {
                    this.servidores.delete(id);
                    logger.warn(`🧠 [IA central] servidor desconectado: ${nome}`);
                }
            });
        });
        logger.info('🧠 IA central pronta no namespace /ia-servidor');
    }

    /** Servidor para o evento: quem já tem o evento na memória e está menos ocupado; senão, o mais livre */
    _escolher(eventoId, excluir) {
        let melhor = null;
        for (const [id, s] of this.servidores) {
            if (id === excluir || !s.socket.connected || s.emVoo >= MAX_EM_VOO) continue;
            const nota = (s.eventos.has(eventoId) ? 0 : 1000) + s.emVoo;
            if (!melhor || nota < melhor.nota) melhor = { id, s, nota };
        }
        return melhor;
    }

    /**
     * Rostos alinhados de um evento → [{id, pessoa_id, s1, s2}].
     * { indisponivel: true } quando nenhum servidor pode responder agora (o PC do evento usa a reserva).
     */
    async reconhecer(eventoId, itens) {
        if (!eventoId || !Array.isArray(itens) || !itens.length) return { resultados: [] };
        const limpos = itens.slice(0, MAX_ITENS)
            .filter(it => it && typeof it.id === 'string' && typeof it.img === 'string' && it.img.length <= MAX_IMG)
            .map(it => ({ id: it.id.slice(0, 64), img: it.img }));
        if (!limpos.length) return { resultados: [] };

        const inicio = Date.now();
        let excluir = null;
        for (let tentativa = 0; tentativa < 2; tentativa++) {
            const resta = PRAZO_TOTAL_MS - (Date.now() - inicio);
            if (tentativa > 0 && resta < MIN_RETENTATIVA_MS) break; // não chegaria a tempo ao PC do evento
            const escolhido = this._escolher(eventoId, excluir);
            if (!escolhido) break;
            const { id, s } = escolhido;
            const jaTinha = s.eventos.has(eventoId);
            s.eventos.set(eventoId, Date.now());
            s.emVoo++;
            try {
                const r = await s.socket.timeout(resta).emitWithAck('ia_reconhecer', { evento_id: eventoId, itens: limpos });
                if (r?.carregando) return { indisponivel: true, carregando: true }; // primeiro uso: carregando os rostos
                if (Array.isArray(r?.resultados)) {
                    s.atendidos += r.resultados.length;
                    return {
                        resultados: r.resultados.map(x => ({
                            id: String(x.id), pessoa_id: x.pessoa_id || null,
                            s1: Number(x.s1) || 0, s2: Number(x.s2) || 0
                        }))
                    };
                }
            } catch (err) {
                logger.debug(`[IA central] ${s.nome} não respondeu: ${err.message}`);
                // Servidor que nem respondeu não fica com permissão para baixar a biometria deste evento
                if (!jaTinha) s.eventos.delete(eventoId);
            } finally {
                s.emVoo--;
            }
            excluir = id; // tenta outro servidor uma vez, se ainda houver tempo
        }
        return { indisponivel: true };
    }

    /** Evento voltou a reconhecer no próprio PC: tira a permissão e a memória dele de todos os servidores */
    liberarEvento(eventoId) {
        for (const s of this.servidores.values()) {
            if (s.eventos.delete(eventoId)) s.socket.emit('ia_descarregar', { evento_id: eventoId });
            s.listas.delete(eventoId);
        }
    }

    status() {
        return [...this.servidores.entries()].map(([id, s]) => ({
            id, nome: s.nome, conectado: s.socket.connected, desde: s.desde, info: s.info,
            em_voo: s.emVoo, eventos: s.eventos.size, rostos_atendidos: s.atendidos
        }));
    }

    temServidor() {
        for (const s of this.servidores.values()) if (s.socket.connected) return true;
        return false;
    }

    // ---------------------------------------------------------------- cadastro dos servidores
    async listar() {
        const { data, error } = await supabase.from('servidores_ia')
            .select('id, nome, ativo, criado_em, ultimo_contato, ultimo_ip, info').order('criado_em', { ascending: true });
        if (error) throw error;
        const online = new Map(this.status().map(s => [s.id, s]));
        return (data || []).map(s => ({ ...s, online: online.get(s.id) || null }));
    }

    /** Cria um servidor e devolve o token UMA vez (no banco fica só o hash) */
    async criar(nome, usuarioId) {
        const token = crypto.randomBytes(32).toString('hex');
        const { data, error } = await supabase.from('servidores_ia')
            .insert({ nome: String(nome || 'Servidor de IA').trim().slice(0, 80), token_hash: hashToken(token), criado_por: usuarioId || null })
            .select('id, nome').single();
        if (error) throw error;
        return { ...data, token };
    }

    async revogar(id) {
        const { error } = await supabase.from('servidores_ia').update({ ativo: false }).eq('id', id);
        if (error) throw error;
        const s = this.servidores.get(id);
        if (s) s.socket.disconnect(true);
        this.servidores.delete(id);
    }
}

module.exports = new IaCentral();
module.exports.hashToken = hashToken;
