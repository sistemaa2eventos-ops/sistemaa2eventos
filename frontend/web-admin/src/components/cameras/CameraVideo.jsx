import React, { useEffect, useRef, useState } from 'react';
import { Box, Typography, CircularProgress } from '@mui/material';
import { VideocamOff as SemVideoIcon, PauseCircleOutline as PausadoIcon } from '@mui/icons-material';
import { urlMidiaCamera } from '../../utils/cameraMedia';

const IMAGEM_VAZIA = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
const ESPERAS_MS = [2000, 5000, 10000, 30000];

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

/**
 * Vídeo de uma câmera (MJPEG em <img>) que não pesa à toa:
 *  - fora da tela, com a aba escondida ou `pausado`: a conexão é fechada (nada trafega);
 *  - qualidade 'mini' (miniatura, sub-stream) ou 'foco' (tela grande, stream principal);
 *  - caiu: tenta de novo sozinho em 2, 5, 10 e 30 s (antes ficava na imagem "offline" até recarregar);
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
    const imgRef = useRef(null);
    const visivel = useVisivel(caixaRef);
    const ativo = visivel && !pausado;
    const [falhas, setFalhas] = useState(0);
    const [erro, setErro] = useState(false);
    const [carregou, setCarregou] = useState(false);
    const [reconexao, setReconexao] = useState(0);
    const [quadro, setQuadro] = useState(() => Date.now());

    // Snapshot: atualiza só enquanto aparece na tela
    useEffect(() => {
        if (!ativo || modo !== 'snapshot') return undefined;
        setQuadro(Date.now());
        const timer = setInterval(() => setQuadro(Date.now()), intervaloSnapshotMs);
        return () => clearInterval(timer);
    }, [ativo, modo, intervaloSnapshotMs]);

    // Caiu: nova tentativa com espera crescente
    useEffect(() => {
        if (!erro || !ativo) return undefined;
        const timer = setTimeout(() => {
            setErro(false);
            setReconexao(n => n + 1);
        }, ESPERAS_MS[Math.min(falhas, ESPERAS_MS.length - 1)]);
        return () => clearTimeout(timer);
    }, [erro, ativo, falhas]);

    // Sair da tela/pausar/trocar de câmera: fecha a conexão MJPEG na hora. Cada conexão é um <img> próprio
    // (key abaixo), então esta limpeza só atinge o elemento que está saindo, nunca o novo.
    const chaveImg = modo === 'stream' ? `${camId}:${qualidade}:${reconexao}` : `${camId}:${qualidade}:snapshot`;
    useEffect(() => {
        const img = imgRef.current;
        return () => { if (img) img.src = IMAGEM_VAZIA; };
    }, [ativo, chaveImg]);

    useEffect(() => { setCarregou(false); }, [chaveImg]);

    const src = !ativo || erro ? null
        : modo === 'stream'
            ? urlMidiaCamera(camId, 'stream', { annotate: true, qualidade, r: reconexao })
            : urlMidiaCamera(camId, 'snapshot', { annotate: true, qualidade, t: quadro });

    return (
        <Box
            ref={caixaRef}
            onClick={onClick}
            sx={{ position: 'relative', width: '100%', height: '100%', bgcolor: '#000000', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
        >
            {src && (
                <img
                    key={chaveImg}
                    ref={imgRef}
                    src={src}
                    alt={alt}
                    style={{ width: '100%', height: '100%', objectFit: fit, display: 'block', ...imgStyle }}
                    onLoad={() => { setCarregou(true); setFalhas(0); }}
                    onError={() => { setFalhas(n => n + 1); setErro(true); }}
                />
            )}
            {ativo && src && !carregou && (
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
