import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
    Alert,
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    Stack,
    Typography
} from '@mui/material';
import {
    Cameraswitch as TrocarCameraIcon,
    PhotoCamera as CapturarIcon
} from '@mui/icons-material';
import NeonButton from '../common/NeonButton';
import TituloModal from '../common/TituloModal';
import { botaoSecundario, cores, tamanhos } from '../../styles/tokens';

/**
 * Modal de captura por câmera / webcam ao vivo (funciona em PC, tablet e celular).
 * Retorna um arquivo JPEG (File) e seu Data URL no callback aoCapturar({ file, dataUrl }).
 */
const ModalCameraCaptura = ({
    aberto,
    titulo = 'Capturar foto com a câmera',
    subtitulo = 'Enquadre o material ou a pilha com boa iluminação e clique em Capturar.',
    maxLargura = 1280,
    qualidade = 0.86,
    aoFechar,
    aoCapturar
}) => {
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const [facingMode, setFacingMode] = useState('environment');
    const [erro, setErro] = useState('');
    const [pronta, setPronta] = useState(false);

    const pararStream = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
        setPronta(false);
    }, []);

    useEffect(() => {
        if (!aberto) {
            pararStream();
            setErro('');
            return undefined;
        }

        let cancelado = false;
        const iniciar = async () => {
            setErro('');
            setPronta(false);
            if (!navigator.mediaDevices?.getUserMedia) {
                setErro('Câmera indisponível neste navegador (verifique se está em HTTPS e com permissão).');
                return;
            }
            try {
                pararStream();
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: { ideal: facingMode },
                        width: { ideal: 1280 },
                        height: { ideal: 720 }
                    },
                    audio: false
                });
                if (cancelado) {
                    stream.getTracks().forEach((t) => t.stop());
                    return;
                }
                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    await videoRef.current.play().catch(() => {});
                    setPronta(true);
                }
            } catch (err) {
                if (!cancelado) {
                    setErro(err?.message || 'Não foi possível acessar a câmera. Verifique as permissões do navegador.');
                }
            }
        };

        iniciar();
        return () => {
            cancelado = true;
            pararStream();
        };
    }, [aberto, facingMode, pararStream]);

    const handleCapturar = () => {
        const video = videoRef.current;
        if (!video || video.readyState < 2) return;

        const vw = video.videoWidth || 1280;
        const vh = video.videoHeight || 720;
        const escala = Math.min(1, maxLargura / Math.max(1, vw, vh));
        const w = Math.max(320, Math.round(vw * escala));
        const h = Math.max(240, Math.round(vh * escala));

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, w, h);

        const dataUrl = canvas.toDataURL('image/jpeg', qualidade);
        canvas.toBlob((blob) => {
            const file = blob
                ? new File([blob], `captura-${Date.now()}.jpg`, { type: 'image/jpeg' })
                : null;
            pararStream();
            if (aoCapturar) aoCapturar({ file, dataUrl, largura: w, altura: h });
            if (aoFechar) aoFechar();
        }, 'image/jpeg', qualidade);
    };

    return (
        <Dialog open={aberto} onClose={aoFechar} maxWidth="sm" fullWidth>
            <TituloModal titulo={titulo} subtitulo={subtitulo} onFechar={aoFechar} />
            <DialogContent dividers>
                <Stack spacing={1.5}>
                    {erro && <Alert severity="error">{erro}</Alert>}
                    <Box
                        sx={{
                            position: 'relative',
                            borderRadius: 2,
                            overflow: 'hidden',
                            bgcolor: cores.fundo,
                            border: `1px solid ${cores.borda}`,
                            aspectRatio: '16 / 9',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: pronta ? 'block' : 'none' }}
                        />
                        {!pronta && !erro && (
                            <Typography sx={{ fontSize: tamanhos.sm, color: cores.textoSecundario }}>
                                Inicializando câmera...
                            </Typography>
                        )}
                    </Box>
                </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, py: 2, justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                <Button
                    variant="outlined"
                    size="small"
                    startIcon={<TrocarCameraIcon />}
                    onClick={() => setFacingMode((m) => (m === 'environment' ? 'user' : 'environment'))}
                    sx={botaoSecundario}
                >
                    Alternar câmera
                </Button>
                <Stack direction="row" spacing={1}>
                    <Button variant="outlined" onClick={aoFechar} sx={botaoSecundario}>
                        Cancelar
                    </Button>
                    <NeonButton disabled={!pronta} startIcon={<CapturarIcon />} onClick={handleCapturar}>
                        Capturar foto
                    </NeonButton>
                </Stack>
            </DialogActions>
        </Dialog>
    );
};

export default ModalCameraCaptura;
