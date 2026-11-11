import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Typography, CircularProgress } from '@mui/material';
import { VideocamOff as SemVideoIcon, PauseCircleOutline as PausadoIcon } from '@mui/icons-material';
import api from '../../services/api';
import { pedirIngressoCamera, urlComIngresso } from '../../utils/cameraMedia';

const IMAGEM_VAZIA = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
const ESPERAS_MS = [2000, 5000, 10000, 30000];
const INGRESSO_VALE_MS = 90000; // o servidor dá 2 min; renova antes
const ATRASO_MAX_S = 2.5;       // vídeo ao vivo atrasou mais que isso: pula para o ponto ao vivo

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

const corDaCaixa = (r) => (r.pessoa?.bloqueado ? '#FF3366' : r.pessoa ? '#00FF88' : r.qualidade === 'optimal' ? '#FFD400' : '#94A3B8');
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
    const [mp4Falhou, setMp4Falhou] = useState(false);
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
    useEffect(() => { setMp4Falhou(false); }, [camId]);
    // Falha passageira (agente reconectou) não deixa a câmera presa no MJPEG, que gasta muito mais internet
    useEffect(() => {
        if (!mp4Falhou) return undefined;
        const t = setTimeout(() => setMp4Falhou(false), 60000);
        return () => clearTimeout(t);
    }, [mp4Falhou]);

    // Snapshot: atualiza só enquanto aparece na tela (renovando o ingresso antes de vencer)
    useEffect(() => {
        if (!ativo || modo !== 'snapshot') return undefined;
        setQuadro(Date.now());
        const timer = setInterval(() => {
            if (acessoEmRef.current && Date.now() - acessoEmRef.current > INGRESSO_VALE_MS) setReconexao(n => n + 1);
            else setQuadro(Date.now());
        }, intervaloSnapshotMs);
        return () => clearInterval(timer);
    }, [ativo, modo, intervaloSnapshotMs]);

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

    const usarMp4 = modo === 'stream' && !!acesso?.mp4 && !mp4Falhou;
    // Com vídeo do PC do evento, a IA é desenhada aqui; sem ele (agente antigo), vem queimada no MJPEG do motor
    const caixasNoNavegador = !!acesso?.ia && !!acesso?.mp4;
    const anotarNoServidor = !!acesso?.ia && !acesso?.mp4;

    // Sair da tela/pausar/trocar de câmera: fecha a conexão na hora (cada conexão é um elemento próprio)
    const chave = `${camId}:${qualidade}:${modo}:${usarMp4 ? 'mp4' : 'img'}:${reconexao}`;
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
        const intervalo = qualidade === 'foco' ? 700 : 1500;
        const consultar = async () => {
            try {
                const { data } = await api.get(`/cameras/${camId}/deteccoes`, { params: { qualidade }, hideDefaultError: true, timeout: 5000 });
                if (!parado) setCaixas(data?.results || []);
            } catch {
                if (!parado) setCaixas([]);
            }
            if (!parado) timer = setTimeout(consultar, intervalo);
        };
        consultar();
        return () => { parado = true; clearTimeout(timer); };
    }, [ativo, caixasNoNavegador, modo, camId, qualidade]);

    // Recalcula a posição das caixas quando a caixa muda de tamanho
    useEffect(() => {
        const el = caixaRef.current;
        if (!el || typeof ResizeObserver === 'undefined') return undefined;
        const obs = new ResizeObserver(() => forcarDesenho(n => n + 1));
        obs.observe(el);
        return () => obs.disconnect();
    }, []);

    // MP4 ao vivo: se atrasou (internet oscilou), pula para o ponto ao vivo
    const manterAoVivo = useCallback(() => {
        const v = midiaRef.current;
        if (!v || v.tagName !== 'VIDEO' || !v.buffered.length) return;
        const fim = v.buffered.end(v.buffered.length - 1);
        if (fim - v.currentTime > ATRASO_MAX_S) v.currentTime = Math.max(0, fim - 0.3);
    }, []);

    const falhou = () => {
        if (usarMp4) { setMp4Falhou(true); return; } // tenta MJPEG antes de dar como offline
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
        if (usarMp4) src = urlComIngresso(camId, 'video.mp4', acesso.ingresso, { qualidade });
        else if (modo === 'stream') src = urlComIngresso(camId, 'stream', acesso.ingresso, { annotate: anotarNoServidor, qualidade, r: reconexao });
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
                {src && usarMp4 && (
                    <video
                        key={chave}
                        ref={midiaRef}
                        src={src}
                        autoPlay
                        muted
                        playsInline
                        disablePictureInPicture
                        aria-label={alt}
                        style={{ width: '100%', height: '100%', objectFit: fit, display: 'block', ...estiloMidia }}
                        onLoadedData={(e) => abriu(e.currentTarget.videoWidth, e.currentTarget.videoHeight)}
                        onProgress={manterAoVivo}
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
            {ativo && !erro && !carregou && (
                <CircularProgress size={22} sx={{ position: 'absolute', color: 'rgba(0,212,255,0.7)' }} />
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
