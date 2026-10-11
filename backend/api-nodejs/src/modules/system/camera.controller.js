const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');
const axios = require('axios');
const agentService = require('../../services/agentService');

// A IA facial (microservice-face-python) e as câmeras ficam na rede local do evento. A API chega até elas:
//  1. direto, se PYTHON_MICROSERVICE_URL estiver definida (API rodando no próprio servidor do evento);
//  2. pelo agente local conectado do evento (API na nuvem: o agente repassa ao motor em localhost:8000);
//  3. fora de produção, direto em http://localhost:8000.
const IA_URL_DIRETA = process.env.PYTHON_MICROSERVICE_URL
    || (process.env.NODE_ENV === 'production' ? null : 'http://localhost:8000');
const MSG_IA_OFFLINE = 'Serviço de câmeras/IA do evento não está conectado';
const PAUSA_IA_OFFLINE_MS = 20000;
const QUADROS_POR_SEGUNDO_AGENTE = 4; // vídeo ao vivo repassado pelo agente (sai pela internet do evento)

const rotaDaCamera = (cam) => {
    if (IA_URL_DIRETA) return { tipo: 'direto', url: IA_URL_DIRETA, chave: 'direto' };
    const agentId = agentService.findAgentForEvent(cam.evento_id);
    return agentId ? { tipo: 'agente', agentId, chave: agentId } : null;
};

// IA fora do ar: imagem/vídeo/rastreamento respondem na hora por 20 s e o aviso vai ao log uma vez
// (antes: um erro por imagem pedida). Separado por rota, para um evento não travar o outro.
const iaIndisponivelAte = new Map(); // rota.chave → ms
const iaDisponivel = (rota) => !!rota && Date.now() >= (iaIndisponivelAte.get(rota.chave) || 0);
const marcarIaIndisponivel = (rota, origem, err) => {
    if (!rota) return;
    if (iaDisponivel(rota)) logger.warn(`[${origem}] ${MSG_IA_OFFLINE} (${err.message}); nova tentativa em 20 s`);
    iaIndisponivelAte.set(rota.chave, Date.now() + PAUSA_IA_OFFLINE_MS);
};
const erroDeConexao = (err) => ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNABORTED', 'EHOSTUNREACH'].includes(err?.code);
const iaOffline = (motivo) => Object.assign(new Error(motivo), { iaOffline: true });

/** GET no motor de IA. Devolve { data, contentType }; data é Buffer quando binary. */
async function chamarIa(rota, path, params, { binary = false, timeout = 8000 } = {}) {
    if (rota.tipo === 'direto') {
        try {
            const r = await axios.get(`${rota.url}${path}`, { params, timeout, responseType: binary ? 'arraybuffer' : 'json' });
            return { data: r.data, contentType: r.headers['content-type'] };
        } catch (err) {
            throw erroDeConexao(err) ? iaOffline(err.code) : err;
        }
    }
    let r;
    try {
        r = await agentService.sendCommand(rota.agentId, 'ia', { path, params, binary, timeoutMs: timeout }, timeout + 2000);
    } catch (err) {
        throw iaOffline(err.message); // agente caiu, motor desligado ou agente antigo sem o comando 'ia'
    }
    if (!r.ok) throw new Error(`IA respondeu HTTP ${r.status}`);
    return binary
        ? { data: Buffer.from(r.base64, 'base64'), contentType: r.contentType }
        : { data: r.json };
}

/** Imagem de câmera HTTP (snapshot CGI): pelo agente quando a API está na nuvem */
async function buscarImagemHttp(cam, rota, timeout) {
    if (rota?.tipo === 'agente') {
        const r = await agentService.sendCommand(rota.agentId, 'http',
            { url: cam.snapshot_url, user: cam.usuario, password: cam.senha, timeoutMs: timeout }, timeout + 2000);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return { data: Buffer.from(r.base64, 'base64'), contentType: r.contentType };
    }
    const r = await axios.get(cam.snapshot_url, {
        responseType: 'arraybuffer',
        timeout,
        auth: cam.usuario ? { username: cam.usuario, password: cam.senha } : null
    });
    return { data: r.data, contentType: r.headers['content-type'] };
}

const esperar = (ms) => new Promise(r => setTimeout(r, ms));
const watchlistService = require('./watchlist.service');

// Credenciais nunca vão para o navegador: rtsp://user:senha@host → rtsp://user:***@host
const mascararUrl = (url) => (typeof url === 'string' ? url.replace(/(\/\/[^:/@]+:)[^@/]*@/, '$1***@') : url);
const ALERTAS_CAMERA = new Map(); // `${camId}:${cpf}` → último alerta de pessoa bloqueada (ms)
const CAMPOS_EDITAVEIS = ['nome', 'area_id', 'fabricante', 'stream_url', 'snapshot_url', 'protocolo', 'ip_address', 'porta', 'usuario', 'senha', 'status'];

class CameraController {
    /**
     * Listar Câmeras do Evento
     */
    async list(req, res) {
        try {
            const evento_id = req.query.evento_id || req.headers['x-evento-id'];
            if (!evento_id) return res.status(400).json({ error: 'evento_id obrigatório' });

            const { data, error } = await supabase
                .from('cameras_ip')
                .select('*, area:evento_areas(nome_area)')
                .eq('evento_id', evento_id)
                .order('created_at', { ascending: true });

            if (error) throw error;
            const seguras = (data || []).map(({ senha, ...cam }) => ({
                ...cam,
                stream_url: mascararUrl(cam.stream_url),
                snapshot_url: mascararUrl(cam.snapshot_url),
                tem_senha: !!senha
            }));
            res.json({ success: true, data: seguras });
        } catch (error) {
            logger.error('Erro ao listar câmeras:', error);
            res.status(500).json({ error: 'Erro ao listar câmeras' });
        }
    }

    /**
     * Criar Câmera
     */
    async create(req, res) {
        try {
            const evento_id = req.body.evento_id || req.headers['x-evento-id'];
            const cameraData = { ...req.body };

            // Se for RTSP ou snapshot_url contiver rtsp://
            if (cameraData.snapshot_url && cameraData.snapshot_url.startsWith('rtsp://')) {
                cameraData.stream_url = cameraData.snapshot_url;
                cameraData.protocolo = 'rtsp';
            } else if (cameraData.fabricante === 'RTSP / OBS' || cameraData.porta === 8554 || cameraData.protocolo === 'rtsp') {
                cameraData.protocolo = 'rtsp';
                if (!cameraData.stream_url) {
                    const authPart = cameraData.usuario && cameraData.senha ? `${cameraData.usuario}:${cameraData.senha}@` : '';
                    cameraData.stream_url = `rtsp://${authPart}${cameraData.ip_address}:${cameraData.porta || 8554}/live`;
                }
            } else if (cameraData.fabricante && !cameraData.snapshot_url) {
                // Auto-preencher snapshot_url se fabricante for selecionado e URL estiver vazia
                const ip = cameraData.ip_address;
                const porta = cameraData.porta || 80;
                if (cameraData.fabricante === 'Intelbras') {
                    cameraData.snapshot_url = `http://${ip}:${porta}/cgi-bin/snapshot.cgi`;
                } else if (cameraData.fabricante === 'Hikvision') {
                    cameraData.snapshot_url = `http://${ip}:${porta}/ISAPI/Streaming/channels/101/picture`;
                }
            }

            const { data, error } = await supabase
                .from('cameras_ip')
                .insert([{ ...cameraData, evento_id }])
                .select()
                .single();

            if (error) throw error;
            res.json({ success: true, data });
        } catch (error) {
            logger.error('Erro ao criar câmera:', error);
            res.status(500).json({ error: 'Erro ao salvar câmera' });
        }
    }

    /**
     * Atualizar Câmera
     */
    async update(req, res) {
        try {
            const { id } = req.params;
            const evento_id = req.event?.id || req.headers['x-evento-id'];

            // Só campos conhecidos; senha vazia e URLs mascaradas mantêm o valor atual
            const updateData = {};
            for (const campo of CAMPOS_EDITAVEIS) {
                if (req.body[campo] !== undefined) updateData[campo] = req.body[campo];
            }
            if (!updateData.senha) delete updateData.senha;
            for (const campo of ['stream_url', 'snapshot_url']) {
                if (typeof updateData[campo] === 'string' && updateData[campo].includes(':***@')) delete updateData[campo];
            }

            const { data, error } = await supabase
                .from('cameras_ip')
                .update(updateData)
                .eq('id', id)
                .eq('evento_id', evento_id)
                .select()
                .single();

            if (error) throw error;
            const { senha: _omit, ...segura } = data;
            res.json({ success: true, data: { ...segura, stream_url: mascararUrl(segura.stream_url), snapshot_url: mascararUrl(segura.snapshot_url) } });
        } catch (error) {
            logger.error('Erro ao atualizar câmera:', error);
            res.status(500).json({ error: 'Erro ao atualizar' });
        }
    }

    /**
     * Deletar Câmera
     */
    async delete(req, res) {
        try {
            const { id } = req.params;
            const { error } = await supabase
                .from('cameras_ip')
                .delete()
                .eq('id', id);

            if (error) throw error;
            res.json({ success: true });
        } catch (error) {
            logger.error('Erro ao excluir câmera:', error);
            res.status(500).json({ error: 'Erro ao excluir' });
        }
    }

    /**
     * Testar Conexão (Medir Latência e Status)
     */
    async testarConexao(req, res) {
        try {
            const { id } = req.params;
            const { data: cam } = await supabase.from('cameras_ip').select('*').eq('id', id).single();
            if (!cam) return res.status(404).json({ error: 'Câmera não encontrada' });

            const start = Date.now();
            let status = 'offline';
            let latencia = 0;
            let motivo = null;

            const isRtsp = cam.protocolo === 'rtsp' || (cam.stream_url && cam.stream_url.startsWith('rtsp://'));
            const rota = rotaDaCamera(cam);

            if (isRtsp) {
                if (!rota) {
                    motivo = MSG_IA_OFFLINE;
                } else {
                    try {
                        const { data } = await chamarIa(rota, '/api/camera/test',
                            { stream_url: cam.stream_url || cam.snapshot_url }, { timeout: 5000 });
                        if (data?.online) {
                            status = 'online';
                            latencia = Date.now() - start;
                        } else {
                            motivo = 'A IA do evento não recebe imagem desta câmera';
                        }
                    } catch (err) {
                        if (err.iaOffline) marcarIaIndisponivel(rota, 'testarConexao', err);
                        motivo = err.iaOffline ? MSG_IA_OFFLINE : err.message;
                        logger.warn(`[testarConexao] Erro testando stream RTSP: ${err.message}`);
                    }
                }
            } else if (cam.snapshot_url) {
                try {
                    await buscarImagemHttp(cam, rota, 3000);
                    status = 'online';
                    latencia = Date.now() - start;
                } catch (err) {
                    motivo = err.message;
                }
            }

            await supabase
                .from('cameras_ip')
                .update({ status, last_seen: new Date() })
                .eq('id', id);

            res.json({ success: true, online: status === 'online', latencia_ms: latencia, ...(motivo ? { motivo } : {}) });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * Proxy Snapshot (Evitar CORS e suportar streams RTSP)
     */
    async getSnapshot(req, res) {
        let rota = null;
        try {
            const { id } = req.params;
            const { data: cam } = await supabase.from('cameras_ip').select('*').eq('id', id).single();
            if (!cam) return res.status(404).send('Camera Not Found');

            const isRtsp = cam.protocolo === 'rtsp' || (cam.stream_url && cam.stream_url.startsWith('rtsp://'));
            rota = rotaDaCamera(cam);

            if (isRtsp) {
                if (!iaDisponivel(rota)) return res.status(503).send(MSG_IA_OFFLINE);
                const { data } = await chamarIa(rota, '/api/camera/snapshot', {
                    stream_url: cam.stream_url || cam.snapshot_url,
                    annotate: req.query.annotate !== 'false'
                }, { binary: true, timeout: 6000 });

                res.set('Content-Type', 'image/jpeg');
                res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
                return res.send(data);
            }

            if (!cam.snapshot_url) return res.status(404).send('Snapshot URL Not Configured');

            const { data, contentType } = await buscarImagemHttp(cam, rota, 5000);
            res.set('Content-Type', contentType || 'image/jpeg');
            res.send(data);
        } catch (error) {
            if (error.iaOffline) {
                marcarIaIndisponivel(rota, 'getSnapshot', error);
                return res.status(503).send(MSG_IA_OFFLINE);
            }
            logger.error(`[getSnapshot] Erro ao obter snapshot: ${error.message}`);
            res.status(502).send('Gateway Error: ' + error.message);
        }
    }

    /**
     * Proxy de Stream MJPEG contínuo em tempo real
     */
    async getStream(req, res) {
        let rota = null;
        try {
            const { id } = req.params;
            const { data: cam } = await supabase.from('cameras_ip').select('*').eq('id', id).single();
            if (!cam) return res.status(404).send('Camera Not Found');

            rota = rotaDaCamera(cam);
            if (!iaDisponivel(rota)) return res.status(503).send(MSG_IA_OFFLINE);
            const streamUrl = cam.stream_url || cam.snapshot_url;
            const annotate = req.query.annotate !== 'false';

            if (rota.tipo === 'agente') {
                // O agente responde comando a comando: o MJPEG é montado aqui com quadros reduzidos
                let ativo = true;
                req.on('close', () => { ativo = false; });
                const intervalo = 1000 / QUADROS_POR_SEGUNDO_AGENTE;
                let primeiro = true;
                while (ativo) {
                    const inicio = Date.now();
                    try {
                        const { data } = await chamarIa(rota, '/api/camera/snapshot',
                            { stream_url: streamUrl, annotate, max_width: 960, quality: 70 },
                            { binary: true, timeout: 5000 });
                        if (!ativo) break;
                        if (primeiro) {
                            res.writeHead(200, {
                                'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
                                'Cache-Control': 'no-cache, no-store, must-revalidate',
                                'Connection': 'close',
                                'Pragma': 'no-cache'
                            });
                            primeiro = false;
                        }
                        res.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${data.length}\r\n\r\n`);
                        res.write(data);
                        res.write('\r\n');
                    } catch (err) {
                        if (err.iaOffline) {
                            marcarIaIndisponivel(rota, 'getStream', err);
                            if (primeiro) return res.status(503).send(MSG_IA_OFFLINE);
                            break;
                        }
                    }
                    await esperar(Math.max(0, intervalo - (Date.now() - inicio)));
                }
                return res.end();
            }

            const response = await axios({
                method: 'get',
                url: `${rota.url}/api/camera/stream`,
                params: { stream_url: streamUrl, annotate },
                responseType: 'stream',
                timeout: 0
            });

            res.set('Content-Type', response.headers['content-type'] || 'multipart/x-mixed-replace; boundary=frame');
            res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.set('Connection', 'close');
            res.set('Pragma', 'no-cache');

            response.data.pipe(res);

            req.on('close', () => {
                if (response.data && typeof response.data.destroy === 'function') {
                    response.data.destroy();
                }
            });
        } catch (error) {
            if (erroDeConexao(error)) {
                marcarIaIndisponivel(rota, 'getStream', error);
                if (!res.headersSent) res.status(503).send(MSG_IA_OFFLINE);
                return;
            }
            logger.error(`[getStream] Erro no streaming da câmera: ${error.message}`);
            if (!res.headersSent) {
                res.status(502).send('Gateway Stream Error: ' + error.message);
            }
        }
    }

    /**
     * Rastreamento e Identificação Facial em Tempo Real
     */
    async trackFace(req, res) {
        try {
            const { id } = req.params;
            const { data: cam, error: camErr } = await supabase
                .from('cameras_ip')
                .select('*, area:evento_areas(id, nome_area)')
                .eq('id', id)
                .maybeSingle();

            if (camErr) {
                logger.error(`[trackFace] Erro ao buscar câmera no banco: ${camErr.message}`);
            }
            if (!cam) return res.status(404).json({ error: 'Câmera não encontrada' });

            // Serviço de IA fora do ar: responde na hora em vez de tentar (e logar) a cada varredura
            const rota = rotaDaCamera(cam);
            const semIa = (error) => res.json({ success: false, error, results: [], camera: { id: cam.id, nome: cam.nome } });
            if (!iaDisponivel(rota)) return semIa(MSG_IA_OFFLINE);
            let trackResp;
            try {
                trackResp = await chamarIa(rota, '/api/track/live', {
                    stream_url: cam.stream_url,
                    threshold: req.query.threshold || 0.50
                }, { timeout: 8000 });
            } catch (pyErr) {
                if (pyErr.iaOffline) {
                    marcarIaIndisponivel(rota, 'trackFace', pyErr);
                    return semIa(MSG_IA_OFFLINE);
                }
                logger.warn(`[trackFace] Falha no rastreamento da câmera ${cam.nome}: ${pyErr.message}`);
                return semIa('Falha no rastreamento facial desta câmera');
            }
            if (!trackResp.data) return semIa('Resposta inválida da IA');

            // Se reconheceu alguém, emitir via WebSocket para o Monitor em tempo real
            if (trackResp.data.success && trackResp.data.results && trackResp.data.results.length > 0) {
                const io = (req.app && typeof req.app.get === 'function') ? req.app.get('io') : global.io;
                const eventoId = cam.evento_id;

                const snapshotFrame = trackResp.data.annotated_frame_base64 
                    ? `data:image/jpeg;base64,${trackResp.data.annotated_frame_base64}` 
                    : null;

                const localizacaoEvento = cam.area?.nome_area
                    ? `${cam.area.nome_area} (Câmera: ${cam.nome})`
                    : (cam.nome || 'Ponto de Monitoramento');

                const dispositivoInfo = {
                    id: cam.id,
                    nome: cam.nome,
                    tipo: 'camera_ip',
                    ip: cam.ip_address,
                    porta: cam.porta,
                    fabricante: cam.fabricante || 'RTSP'
                };

                for (const face of trackResp.data.results) {
                    if (face.matched_person) {
                        const mp = face.matched_person;
                        if (!mp.foto_url && mp.cpf) {
                            try {
                                const { data: pData } = await supabase.from('pessoas').select('foto_url').eq('cpf', mp.cpf).maybeSingle();
                                if (pData?.foto_url) mp.foto_url = pData.foto_url;
                            } catch (fErr) {
                                logger.warn(`[trackFace] Falha ao recuperar foto de perfil: ${fErr.message}`);
                            }
                        }
                        const faceCropImg = face.face_crop_base64
                            ? `data:image/jpeg;base64,${face.face_crop_base64}`
                            : null;

                        // Detecção de câmera NÃO é passagem de acesso: não entra no feed nem nos contadores
                        // (antes cada varredura de 4,5 s gerava um "check-in" falso no Monitor).
                        // Pessoa bloqueada vista pela câmera: alerta no máximo 1x por minuto por câmera.
                        const chaveAlerta = `${cam.id}:${mp.cpf || mp.id}`;
                        const ultimoAlerta = ALERTAS_CAMERA.get(chaveAlerta) || 0;
                        if (io && eventoId && mp.bloqueado && Date.now() - ultimoAlerta > 60000) {
                            ALERTAS_CAMERA.set(chaveAlerta, Date.now());
                            {
                                io.to(`evento_${eventoId}`).emit('area_alert', {
                                    pessoa_nome: mp.nome,
                                    area_nome: cam.area?.nome_area || cam.nome,
                                    dispositivo_nome: cam.nome,
                                    localizacao: localizacaoEvento,
                                    tipo: 'pessoa_bloqueada',
                                    hora: new Date().toISOString()
                                });
                            }
                        }

                        // Checagem e disparo de alerta na Watchlist (Alvos Procurados / Monitorados)
                        if (mp.cpf && eventoId) {
                            try {
                                const monitorado = await watchlistService.verificarCPF(mp.cpf, eventoId);
                                if (monitorado) {
                                    mp.is_watchlist = true;
                                    mp.watchlist = monitorado;
                                    mp.foto_capturada = snapshotFrame;
                                    mp.face_crop = faceCropImg;
                                    mp.dispositivo = dispositivoInfo;
                                    mp.localizacao = localizacaoEvento;

                                    // TRAVA ANTI-LOOPING: Se o alerta já foi emitido e está em rastreamento ativo, NÃO reemitir!
                                    if (watchlistService.isAlertaAtivo(eventoId, mp.cpf)) {
                                        mp.em_rastreamento = true;
                                    } else {
                                        logger.warn(`🚨 [NOVO ALERTA] WATCHLIST DETECTADO PELA CÂMERA: ${mp.nome} (CPF: ${mp.cpf}) na câmera '${cam.nome}' em '${localizacaoEvento}'`);

                                        // Disparo único multicanal com foto capturada, dispositivo e localização física
                                        watchlistService.registrarAlerta(monitorado, {
                                            pessoa_id: mp.id,
                                            nome: mp.nome,
                                            cpf: mp.cpf,
                                            foto_url: mp.foto_url,
                                            foto_capturada: snapshotFrame,
                                            face_crop: faceCropImg,
                                            evento_id: eventoId,
                                            tipo: 'camera_vigilancia',
                                            area_id: cam.area_id,
                                            area: cam.area?.nome_area || cam.nome,
                                            localizacao: localizacaoEvento,
                                            dispositivo_id: cam.id,
                                            dispositivo: dispositivoInfo,
                                            operador_nome: 'Sistema de Visão Computacional (IA InsightFace)'
                                        }).catch(err => logger.error(`Falha ao registrar alerta da watchlist: ${err.message}`));
                                    }
                                }
                            } catch (wErr) {
                                logger.error(`Erro ao verificar watchlist na câmera: ${wErr.message}`);
                            }
                        }
                    }
                }
            }

            const localizacaoEvento = cam.area?.nome_area
                ? `${cam.area.nome_area} (Câmera: ${cam.nome})`
                : (cam.nome || 'Ponto de Monitoramento');

            // SIGILO ABSOLUTO: Se o operador logado não for admin_master, higienizar qualquer informação de watchlist da resposta
            const isAdminMaster = req.user && req.user.nivel_acesso === 'admin_master';
            if (!isAdminMaster && trackResp.data && Array.isArray(trackResp.data.results)) {
                trackResp.data.results.forEach(item => {
                    if (item.matched_person) {
                        delete item.matched_person.is_watchlist;
                        delete item.matched_person.watchlist;
                        delete item.matched_person.em_rastreamento;
                    }
                });
            }

            res.json({
                ...trackResp.data,
                camera: {
                    id: cam.id,
                    nome: cam.nome,
                    ip: cam.ip_address,
                    porta: cam.porta,
                    fabricante: cam.fabricante,
                    area: cam.area?.nome_area,
                    localizacao: localizacaoEvento
                }
            });
        } catch (error) {
            logger.error(`[trackFace] Erro no rastreamento facial: ${error.message}`);
            res.status(500).json({ error: 'Erro no rastreamento facial', detail: error.message });
        }
    }
}

module.exports = new CameraController();
