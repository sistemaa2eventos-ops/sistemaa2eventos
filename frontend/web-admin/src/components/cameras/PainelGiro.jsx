import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Button, Chip, Slider, Stack, TextField, Tooltip, Typography, IconButton } from '@mui/material';
import {
    KeyboardArrowUp as UpIcon, KeyboardArrowDown as DownIcon, KeyboardArrowLeft as LeftIcon,
    KeyboardArrowRight as RightIcon, Add as ZoomInIcon, Remove as ZoomOutIcon, StopCircle as StopIcon,
    Bookmark as PosicaoIcon, BookmarkAdd as GravarIcon
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import api from '../../services/api';

// Enquanto o botão está apertado, a câmera recebe um comando a cada 700 ms. Cada comando dura 1 s na
// câmera: se o navegador travar ou a conexão cair, ela para sozinha.
const INTERVALO_MOVIMENTO_MS = 700;

const BOTAO = { color: '#FFFFFF', bgcolor: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.2)', '&:hover': { bgcolor: 'rgba(0,212,255,0.35)' }, width: 40, height: 40 };

/**
 * Controle de giro da câmera (ONVIF): setas que seguem enquanto o botão está apertado, velocidade,
 * zoom, posições salvas na câmera e gravação da posição atual. Só aparece em câmeras com giro ligado.
 */
const PainelGiro = ({ cameraId, onAcao }) => {
    const { enqueueSnackbar } = useSnackbar();
    const [velocidade, setVelocidade] = useState(0.5);
    const [presets, setPresets] = useState([]);
    const [nomePosicao, setNomePosicao] = useState('');
    const [gravando, setGravando] = useState(false);
    const [carregandoPresets, setCarregandoPresets] = useState(true);
    const timer = useRef(null);
    const ocupado = useRef(false);   // um comando por vez: sem fila de comandos atrasados
    const direcao = useRef(null);
    const velRef = useRef(velocidade);
    velRef.current = velocidade;

    const enviar = useCallback(async (corpo) => {
        const { data } = await api.post(`/cameras/${cameraId}/ptz`, corpo, { hideDefaultError: true });
        return data?.data;
    }, [cameraId]);

    const falhou = useCallback((err) => {
        const msg = err.response?.data?.error || 'Não deu para mexer na câmera.';
        enqueueSnackbar(msg, { variant: 'error' });
    }, [enqueueSnackbar]);

    const carregarPresets = useCallback(async () => {
        setCarregandoPresets(true);
        try {
            const { data } = await api.get(`/cameras/${cameraId}/ptz/presets`, { hideDefaultError: true });
            setPresets(data?.data?.presets || []);
        } catch {
            setPresets([]); // sem posições (câmera sem ONVIF ou sem acesso): o giro continua funcionando
        } finally {
            setCarregandoPresets(false);
        }
    }, [cameraId]);

    useEffect(() => { carregarPresets(); }, [carregarPresets]);

    const pararTudo = useCallback(() => {
        clearInterval(timer.current);
        timer.current = null;
        if (direcao.current) {
            direcao.current = null;
            enviar({ acao: 'parar' }).catch(() => {});
        }
    }, [enviar]);

    // Ao sair da tela ou trocar de câmera, para o motor
    useEffect(() => () => { clearInterval(timer.current); if (direcao.current) enviar({ acao: 'parar' }).catch(() => {}); }, [enviar]);

    const mover = useCallback((pan, tilt, zoom = 0) => {
        if (ocupado.current) return;
        ocupado.current = true;
        const v = velRef.current;
        enviar({ acao: 'mover', pan: pan * v, tilt: tilt * v, zoom: zoom * v })
            .then(() => onAcao?.('mover'))
            .catch(falhou)
            .finally(() => { ocupado.current = false; });
    }, [enviar, falhou, onAcao]);

    const apertar = (pan, tilt, zoom = 0) => (e) => {
        e.preventDefault();
        if (direcao.current) return;
        direcao.current = { pan, tilt, zoom };
        mover(pan, tilt, zoom);
        timer.current = setInterval(() => mover(pan, tilt, zoom), INTERVALO_MOVIMENTO_MS);
    };
    const soltar = () => { if (direcao.current) pararTudo(); };

    const irPara = async (p) => {
        try {
            await enviar({ acao: 'ir', token: p.token });
            enqueueSnackbar(`Indo para "${p.nome}"`, { variant: 'info', autoHideDuration: 1500 });
            onAcao?.('ir');
        } catch (err) { falhou(err); }
    };

    const gravarPosicao = async () => {
        const nome = nomePosicao.trim() || `Posição ${presets.length + 1}`;
        setGravando(true);
        try {
            await enviar({ acao: 'gravar', nome });
            setNomePosicao('');
            enqueueSnackbar(`Posição "${nome}" gravada na câmera`, { variant: 'success' });
            await carregarPresets();
            onAcao?.('gravar');
        } catch (err) { falhou(err); } finally { setGravando(false); }
    };

    const seta = (rotulo, Icone, pan, tilt) => (
        <Tooltip title={rotulo}>
            <IconButton aria-label={rotulo} sx={BOTAO}
                onPointerDown={apertar(pan, tilt)} onPointerUp={soltar} onPointerLeave={soltar} onPointerCancel={soltar}
                onContextMenu={(e) => e.preventDefault()}>
                <Icone />
            </IconButton>
        </Tooltip>
    );

    return (
        <Box onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}
            sx={{ bgcolor: 'rgba(0,0,0,0.55)', borderRadius: 2, p: 1.25, border: '1px solid rgba(255,255,255,0.12)', width: 'fit-content', maxWidth: '100%' }}>
            <Stack direction="row" spacing={2} alignItems="flex-start" flexWrap="wrap" useFlexGap>
                {/* Setas: mantenha apertado para girar; solte para parar */}
                <Box sx={{ display: 'grid', gridTemplateColumns: '40px 40px 40px', gridTemplateRows: '40px 40px 40px', gap: 0.5, userSelect: 'none', touchAction: 'none' }}>
                    <Box />
                    {seta('Girar para cima', UpIcon, 0, 1)}
                    <Tooltip title="Zoom +">
                        <IconButton aria-label="Zoom mais" sx={BOTAO} onPointerDown={apertar(0, 0, 1)} onPointerUp={soltar} onPointerLeave={soltar} onPointerCancel={soltar}>
                            <ZoomInIcon />
                        </IconButton>
                    </Tooltip>
                    {seta('Girar para a esquerda', LeftIcon, -1, 0)}
                    <Tooltip title="Parar">
                        <IconButton aria-label="Parar a câmera" sx={{ ...BOTAO, color: '#FFB800' }} onClick={() => { pararTudo(); enviar({ acao: 'parar' }).catch(falhou); }}>
                            <StopIcon />
                        </IconButton>
                    </Tooltip>
                    {seta('Girar para a direita', RightIcon, 1, 0)}
                    <Box />
                    {seta('Girar para baixo', DownIcon, 0, -1)}
                    <Tooltip title="Zoom -">
                        <IconButton aria-label="Zoom menos" sx={BOTAO} onPointerDown={apertar(0, 0, -1)} onPointerUp={soltar} onPointerLeave={soltar} onPointerCancel={soltar}>
                            <ZoomOutIcon />
                        </IconButton>
                    </Tooltip>
                </Box>

                <Box sx={{ minWidth: 200, flex: 1 }}>
                    <Typography variant="caption" sx={{ color: '#CBD5E1' }}>Velocidade</Typography>
                    <Slider size="small" min={0.2} max={1} step={0.1} value={velocidade} onChange={(_, v) => setVelocidade(v)}
                        aria-label="Velocidade do giro" sx={{ color: '#00D4FF' }} />

                    <Typography variant="caption" sx={{ color: '#CBD5E1', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <PosicaoIcon sx={{ fontSize: 14 }} /> Posições salvas na câmera
                    </Typography>
                    <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ mt: 0.5, mb: 1 }}>
                        {carregandoPresets && <Typography variant="caption" sx={{ color: '#94A3B8' }}>carregando...</Typography>}
                        {!carregandoPresets && presets.length === 0 && (
                            <Typography variant="caption" sx={{ color: '#94A3B8' }}>Nenhuma ainda. Gire até o ponto e grave abaixo.</Typography>
                        )}
                        {presets.map(p => (
                            <Chip key={p.token} size="small" label={p.nome} onClick={() => irPara(p)} sx={{ fontWeight: 600 }} />
                        ))}
                    </Stack>
                    <Stack direction="row" spacing={1} alignItems="center">
                        <TextField size="small" placeholder="Nome da posição" value={nomePosicao} onChange={e => setNomePosicao(e.target.value)}
                            inputProps={{ maxLength: 40, 'aria-label': 'Nome da posição' }} sx={{ flex: 1, minWidth: 120 }} />
                        <Button size="small" variant="outlined" startIcon={<GravarIcon />} onClick={gravarPosicao} disabled={gravando}
                            sx={{ color: '#FFFFFF', borderColor: 'rgba(255,255,255,0.3)', whiteSpace: 'nowrap' }}>
                            Gravar aqui
                        </Button>
                    </Stack>
                </Box>
            </Stack>
        </Box>
    );
};

export default PainelGiro;
