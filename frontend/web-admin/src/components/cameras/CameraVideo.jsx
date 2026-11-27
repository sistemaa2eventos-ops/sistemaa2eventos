import React, { useEffect, useRef, useState } from 'react';
import { Box, Typography, CircularProgress } from '@mui/material';
import { VideocamOff as SemVideoIcon, PauseCircleOutline as PausadoIcon } from '@mui/icons-material';
import api from '../../services/api';
import { pedirIngressoCamera, urlComIngresso } from '../../utils/cameraMedia';
import { visorDisponivel, tokenVisor, urlVisorMp4, urlVisorDeteccoes, esquecerToken, abrirWebrtcVisor } from '../../utils/visorLocal';
import { cores, tom } from '../../styles/tokens';

const IMAGEM_VAZIA = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
const ESPERAS_MS = [2000, 5000, 10000, 30000];
const INGRESSO_VALE_MS = 90000; // o servidor dá 2 min; renova antes

/** Visível na tela e com a aba do navegador aberta */
function useVisivel(ref) {
    const [naTela, setNaTela] = useState(true);
    const [abaVisivel, setAbaVisivel] = useState(() => !document.hidden);
    useEffect(() => {
        const el = ref.current;
        if (!el || typeof IntersectionObserver === 'undefined') return undefined;
        const obs = new IntersectionObserver(([e]) => setNaTela(e.isIntersecting), { rootMargin: '100px' });
        obs.observe(el);
        return () => obs.disconnect();
    }, [ref]);
    useEffect(() => {
        const aoMudar = () => setAbaVisivel(!document.hidden);
        document.addEventListener('visibilitychange', aoMudar);
        return () => document.removeEventListener('visibilitychange', aoMudar);
    }, []);
    return naTela && abaVisivel;
}

/** Retângulo onde a imagem aparece dentro da caixa (object-fit contain/cover) */
function areaDaImagem(caixa, largura, altura, fit) {
    if (!caixa || !largura || !altura) return null;
    const cw = caixa.clientWidth;
    const ch = caixa.clientHeight;
    const escala = fit === 'cover' ? Math.max(cw / largura, ch / altura) : Math.min(cw / largura, ch / altura);
    const w = largura * escala;
    const h = altura * escala;
    return { x: (cw - w) / 2, y: (ch - h) / 2, w, h };
}

const corDaCaixa = (r) => (r.pessoa?.bloqueado ? cores.erro : r.pessoa ? cores.sucesso : r.qualidade === 'optimal' ? '#FFD400' : cores.textoSecundario);
const textoDaCaixa = (r) => {
    if (r.pessoa) return r.pessoa.bloqueado ? `ALERTA: ${r.pessoa.nome}` : `${r.pessoa.nome} ${Math.round((r.pessoa.semelhanca || 0) * 100)}%`;
    return ({ profile_view: 'De lado', low_resolution: 'Distante', blurry: 'Em movimento' })[r.qualidade] || 'Desconhecido';
};

/**
 * Vídeo de uma câmera que não pesa à toa:
 *  - MP4 direto do PC do evento (H.264 copiado da câmera), funcionando com o motor de IA desligado;
 *    navegador que não toca (ex.: câmera em H.265) cai sozinho para MJPEG;
 *  - câmera com IA: as caixas dos rostos são desenhadas por cima do vídeo (consulta leve à IA);
 *  - fora da tela, com a aba escondida ou `pausado`: a conexão é fechada (nada trafega);
 *  - caiu: tenta de novo sozinho em 2, 5, 10 e 30 s;
 *  - modo 'snapshot': uma imagem a cada `intervaloSnapshotMs`, só enquanto visível.
 */
const CameraVideo = ({
    camId,
    alt,
    modo = 'stream',
    qualidade = 'mini',
    pausado = false,
    intervaloSnapshotMs = 5000,
    fit = 'cover',
    imgStyle,
    textoPausado = 'Pausado',
    onClick
}) => {
    const caixaRef = useRef(null);
    const midiaRef = useRef(null);
    const visivel = useVisivel(caixaRef);
    const ativo = visivel && !pausado;
    const [falhas, setFalhas] = useState(0);
    const [erro, setErro] = useState(false);
    const [carregou, setCarregou] = useState(false);
    const [reconexao, setReconexao] = useState(0);
    const [quadro, setQuadro] = useState(() => Date.now());
    const [acesso, setAcesso] = useState(null);      // { ingresso, mp4, ia, em }
    const [caixas, setCaixas] = useState([]);
    const [dimensoes, setDimensoes] = useState(null); // { w, h } da imagem/vídeo
    const [, forcarDesenho] = useState(0);
    const acessoEmRef = useRef(0);
    useEffect(() => { acessoEmRef.current = acesso?.em || 0; }, [acesso]);

    // Ingresso de vídeo: a cada ativação/reconexão e antes de vencer (snapshot)
    useEffect(() => {
        if (!ativo) return undefined;
        let cancelado = false;
        pedirIngressoCamera(camId)
            .then((r) => { if (!cancelado) setAcesso({ ...r, em: Date.now() }); })
            .catch(() => { if (!cancelado) { setFalhas(n => n + 1); setErro(true); } });
        return () => { cancelado = true; };
    }, [ativo, camId, reconexao]);

    // Visor local (central na mesma rede): vídeo direto do PC do evento, sem ida e volta pela VPS.
    const [visorToken, setVisorToken] = useState(null);
    // Só escolhe o caminho depois de saber se o visor responde: antes abria pela VPS e trocava em seguida
    const [visorDecidido, setVisorDecidido] = useState(false);
    useEffect(() => {
        if (!ativo || modo !== 'stream') { setVisorToken(null); setVisorDecidido(true); return undefined; }
        let cancelado = false;
        setVisorDecidido(false);
        (async () => {
            let token = null;
            if (await visorDisponivel()) {
                try { token = await tokenVisor(); } catch { token = null; }
            }
            if (!cancelado) { setVisorToken(token); setVisorDecidido(true); }
        })();
        return () => { cancelado = true; };
    }, [ativo, modo, camId, reconexao]);

    // Fora do PC do evento (sem visor): nada de vídeo pela internet. O vídeo pelo Socket.IO da VPS dividia
    // um canal TCP com detecções e comandos, parava e pulava ("foto parada"). Agora: imagem a 1 quadro/s na
    // tela grande e 1 a cada 2 s nas miniaturas, avisado na tela. Tempo real é na Central do PC do evento.
    const remoto = modo === 'stream' && visorDecidido && !visorToken;
    const modoImagem = modo === 'snapshot' || remoto;
    const intervaloImagem = remoto ? (qualidade === 'foco' ? 1000 : 2000) : intervaloSnapshotMs;

    // Imagem: atualiza só enquanto aparece na tela (renovando o ingresso antes de vencer)
    useEffect(() => {
        if (!ativo || !modoImagem) return undefined;
        setQuadro(Date.now());
        const timer = setInterval(() => {
            if (acessoEmRef.current && Date.now() - acessoEmRef.current > INGRESSO_VALE_MS) setReconexao(n => n + 1);
            else setQuadro(Date.now());
        }, intervaloImagem);
        return () => clearInterval(timer);
    }, [ativo, modoImagem, intervaloImagem]);

    // Caiu: nova tentativa com espera crescente
    useEffect(() => {
        if (!erro || !ativo) return undefined;
        const timer = setTimeout(() => {
            setErro(false);
            setAcesso(null);
            setReconexao(n => n + 1);
        }, ESPERAS_MS[Math.min(falhas, ESPERAS_MS.length - 1)]);
        return () => clearTimeout(timer);
    }, [erro, ativo, falhas]);

    // Vídeo ao vivo só pelo visor local: WebRTC e, se ele não abrir, o MP4 do próprio PC do evento
    const usarMp4 = modo === 'stream' && !!acesso?.mp4 && !!visorToken;

    // Com vídeo do PC do evento, a IA é desenhada aqui; pela internet (imagem), vem desenhada pelo servidor
    const caixasNoNavegador = !!acesso?.ia && !!acesso?.mp4 && !remoto;
    const anotarNoServidor = !!acesso?.ia && (!acesso?.mp4 || remoto);

    // WebRTC pelo visor local (sem atraso). Se não abrir (agente antigo, navegador sem WebRTC), cai para o MP4
    // local e fica nele até trocar de câmera.
    const [rtcFalhou, setRtcFalhou] = useState(false);
    useEffect(() => { setRtcFalhou(false); }, [camId]);
    const viaRtc = ativo && !erro && !!acesso?.ingresso && usarMp4 && visorDecidido && !!visorToken && !rtcFalhou;

    // Sair da tela/pausar/trocar de câmera: fecha a conexão na hora (cada conexão é um elemento próprio)
    const chave = `${camId}:${qualidade}:${modo}:${viaRtc ? 'rtc' : usarMp4 ? 'mp4' : 'img'}:${reconexao}`;

    useEffect(() => {
        if (!viaRtc) return undefined;
        let pc = null;
        let encerrado = false;
        let recebeu = false;
        const el = midiaRef.current;
        // Sem quadro em 8 s: desiste do WebRTC e usa o MP4 local
        const prazo = setTimeout(() => { if (!recebeu && !encerrado) setRtcFalhou(true); }, 8000);
        abrirWebrtcVisor(camId, visorToken, qualidade, (stream) => {
            if (encerrado || !el) return;
            recebeu = true;
            el.srcObject = stream;
            el.play?.().catch(() => { /* autoplay mudo: segue */ });
        }).then((conexao) => {
            if (encerrado) { conexao.close(); return; }
            pc = conexao;
            pc.addEventListener('connectionstatechange', () => {
                if (encerrado) return;
                const s = pc.connectionState;
                if (s === 'failed' || s === 'closed') {
                    if (recebeu) { setFalhas(n => n + 1); setErro(true); } else setRtcFalhou(true);
                } else if (s === 'disconnected') {
                    // Pode voltar sozinho; se não voltar em 3 s, reconecta
                    setTimeout(() => {
                        if (!encerrado && pc.connectionState === 'disconnected') { setFalhas(n => n + 1); setErro(true); }
                    }, 3000);
                }
            });
        }).catch(() => { if (!encerrado) setRtcFalhou(true); });
        return () => {
            encerrado = true;
            clearTimeout(prazo);
            if (pc) pc.close();
            if (el) el.srcObject = null;
        };
    }, [viaRtc, chave, camId, visorToken, qualidade]);
    useEffect(() => {
        const el = midiaRef.current;
        return () => {
            if (!el) return;
            if (el.tagName === 'VIDEO') { el.removeAttribute('src'); el.load(); } else el.src = IMAGEM_VAZIA;
        };
    }, [ativo, chave]);
    useEffect(() => { setCarregou(false); setCaixas([]); }, [chave]);

    // Caixas da IA (só câmeras com IA e na tela)
    useEffect(() => {
        if (!ativo || !caixasNoNavegador || modo !== 'stream') { setCaixas([]); return undefined; }
        let parado = false;
        let timer;
        // Com o visor local as caixas vêm do motor deste PC (sem internet no meio): dá para consultar bem mais rápido
        const local = !!visorToken;
        const intervalo = local ? (qualidade === 'foco' ? 120 : 400) : (qualidade === 'foco' ? 300 : 800);
        const consultar = async () => {
            try {
                let data;
                if (local) {
                    const r = await fetch(urlVisorDeteccoes(camId, visorToken, qualidade), { cache: 'no-store', signal: AbortSignal.timeout(3000) });
                    data = r.ok ? await r.json() : null;
                } else {
                    ({ data } = await api.get(`/cameras/${camId}/deteccoes`, { params: { qualidade }, hideDefaultError: true, timeout: 5000 }));
                }
                if (!parado) setCaixas(data?.results || []);
            } catch {
                if (!parado) setCaixas([]);
            }
            if (!parado) timer = setTimeout(consultar, intervalo);
        };
        consultar();
        return () => { parado = true; clearTimeout(timer); };
    }, [ativo, caixasNoNavegador, modo, camId, qualidade, visorToken]);

    // Recalcula a posição das caixas quando a caixa muda de tamanho
    useEffect(() => {
        const el = caixaRef.current;
        if (!el || typeof ResizeObserver === 'undefined') return undefined;
        const obs = new ResizeObserver(() => forcarDesenho(n => n + 1));
        obs.observe(el);
        return () => obs.disconnect();
    }, []);

    // Sem "perseguir" o fim do buffer: em MP4 progressivo o salto não reduz o atraso e, disparado a cada
    // evento, reiniciava o decodificador centenas de vezes por segundo (medido: 4.704 saltos em 20 s),
    // deixando a imagem praticamente parada. O navegador toca liso sozinho.

    const falhou = () => {
        // Sem recuo para MJPEG: tenta de novo com as esperas de ESPERAS_MS.
        // Se veio pelo visor local, o token pode ter expirado: a próxima tentativa pega uma sessão nova.
        if (visorToken) esquecerToken();
        setFalhas(n => n + 1);
        setErro(true);
    };
    const abriu = (w, h) => {
        setCarregou(true);
        setFalhas(0);
        if (w && h) setDimensoes({ w, h });
    };

    let src = null;
    if (ativo && !erro && acesso?.ingresso) {
        if (modo === 'stream' && !visorDecidido) src = null; // aguardando saber se o visor local responde (até 1,5 s)
        else if (viaRtc) src = null; // vídeo chega por srcObject (WebRTC)
        else if (usarMp4) src = urlVisorMp4(camId, visorToken, qualidade); // reserva local quando o WebRTC não abre
        // Pela internet (ou modo imagem): uma imagem por vez, com a IA desenhada no servidor
        else src = urlComIngresso(camId, 'snapshot', acesso.ingresso, { annotate: anotarNoServidor, qualidade, t: quadro });
    }

    const { transform, transformOrigin, ...estiloMidia } = imgStyle || {};
    const area = caixas.length ? areaDaImagem(caixaRef.current, dimensoes?.w, dimensoes?.h, estiloMidia.objectFit || fit) : null;

    return (
        <Box
            ref={caixaRef}
            onClick={onClick}
            sx={{ position: 'relative', width: '100%', height: '100%', bgcolor: '#000000', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
        >
            <Box sx={{ position: 'absolute', inset: 0, transform, transformOrigin }}>
                {(viaRtc || (src && usarMp4)) && (
                    <video
                        key={chave}
                        ref={midiaRef}
                        src={viaRtc ? undefined : src}
                        autoPlay
                        muted
                        playsInline
                        disablePictureInPicture
                        aria-label={alt}
                        style={{ width: '100%', height: '100%', objectFit: fit, display: 'block', ...estiloMidia }}
                        onLoadedData={(e) => abriu(e.currentTarget.videoWidth, e.currentTarget.videoHeight)}
                        onError={falhou}
                        onEnded={() => { setAcesso(null); setReconexao(n => n + 1); }}
                    />
                )}
                {src && !usarMp4 && (
                    <img
                        key={chave}
                        ref={midiaRef}
                        src={src}
                        alt={alt}
                        style={{ width: '100%', height: '100%', objectFit: fit, display: 'block', ...estiloMidia }}
                        onLoad={(e) => abriu(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
                        onError={falhou}
                    />
                )}
                {area && caixas.map((r) => {
                    const [x1, y1, x2, y2] = r.caixa || [];
                    if (x2 === undefined) return null;
                    const cor = corDaCaixa(r);
                    return (
                        <Box key={r.id} sx={{
                            position: 'absolute', pointerEvents: 'none',
                            left: area.x + x1 * area.w, top: area.y + y1 * area.h,
                            width: (x2 - x1) * area.w, height: (y2 - y1) * area.h,
                            border: `2px solid ${cor}`, borderRadius: '3px',
                            transition: 'left 0.25s linear, top 0.25s linear, width 0.25s linear, height 0.25s linear'
                        }}>
                            <Typography component="span" sx={{
                                position: 'absolute', bottom: '100%', left: -2, mb: '2px', px: 0.6, py: 0.1,
                                fontSize: qualidade === 'foco' ? '0.75rem' : '0.62rem', fontWeight: 700, lineHeight: 1.3,
                                whiteSpace: 'nowrap', bgcolor: cor, color: '#06121B', borderRadius: '3px'
                            }}>
                                {textoDaCaixa(r)}
                            </Typography>
                        </Box>
                    );
                })}
            </Box>
            {/* Pela internet não há vídeo ao vivo: avisa onde está o tempo real */}
            {carregou && remoto && qualidade === 'foco' && (
                <Typography variant="caption" sx={{
                    position: 'absolute', left: 8, bottom: 8, px: 1, py: 0.25, borderRadius: 1, pointerEvents: 'none',
                    bgcolor: 'rgba(0,0,0,0.65)', color: '#FFD400', fontWeight: 600, fontSize: '0.75rem'
                }}>
                    Pela internet: 1 imagem por segundo • tempo real na Central do PC do evento
                </Typography>
            )}
            {ativo && !erro && !carregou && (
                <CircularProgress size={22} sx={{ position: 'absolute', color: tom(cores.primaria, 0.7) }} />
            )}
            {(erro || pausado) && (
                <Box sx={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0.5, color: 'rgba(255,255,255,0.55)' }}>
                    {pausado ? <PausadoIcon /> : <SemVideoIcon />}
                    <Typography variant="caption" sx={{ fontSize: '0.75rem', fontWeight: 600 }}>
                        {pausado ? textoPausado : 'Sem vídeo, reconectando...'}
                    </Typography>
                </Box>
            )}
        </Box>
    );
};

export default CameraVideo;
