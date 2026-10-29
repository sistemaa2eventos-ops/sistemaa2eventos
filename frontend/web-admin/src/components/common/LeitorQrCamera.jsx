import React, { useEffect, useId, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Box, Button, CircularProgress, Dialog, DialogContent, Typography, useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { Cameraswitch as TrocarIcon } from '@mui/icons-material';
import TituloModal from './TituloModal';
import useFecharComVoltar from '../../hooks/useFecharComVoltar';

// Mensagem que a pessoa entende para cada falha do getUserMedia
const mensagemErro = (err) => {
    const nome = err?.name || '';
    const texto = String(err?.message || err || '');
    if (nome === 'NotAllowedError' || /permission|denied/i.test(texto)) {
        return 'A câmera foi bloqueada. Libere o acesso à câmera para este site nas configurações do navegador e tente de novo.';
    }
    if (nome === 'NotFoundError' || /not found|no camera|requested device/i.test(texto)) {
        return 'Nenhuma câmera encontrada neste aparelho.';
    }
    if (nome === 'NotReadableError' || /in use|could not start/i.test(texto)) {
        return 'A câmera está em uso por outro app. Feche-o e tente de novo.';
    }
    if (typeof window !== 'undefined' && !window.isSecureContext) {
        return 'A câmera só funciona com o painel aberto em https.';
    }
    return `Não foi possível abrir a câmera (${texto || 'erro desconhecido'}).`;
};

/**
 * Quadro da câmera: só existe enquanto o modal está aberto, então o <div> já está na
 * página quando o leitor começa (o html5-qrcode procura o elemento pelo id).
 */
const AreaLeitura = ({ frontal, onLeitura, onErro }) => {
    const idBruto = useId();
    const id = `leitor-qr-${idBruto.replace(/[^a-zA-Z0-9]/g, '')}`;
    const [abrindo, setAbrindo] = useState(true);
    const leituraRef = useRef(onLeitura);
    const erroRef = useRef(onErro);
    leituraRef.current = onLeitura;
    erroRef.current = onErro;

    useEffect(() => {
        const leitor = new Html5Qrcode(id, { experimentalFeatures: { useBarCodeDetectorIfSupported: true }, verbose: false });
        let lido = false;
        let ativo = true;
        let falhou = false;

        const inicio = leitor.start(
            { facingMode: frontal ? 'user' : 'environment' },
            {
                fps: 10,
                // Quadro de mira proporcional à tela (70% do menor lado)
                qrbox: (largura, altura) => {
                    const lado = Math.max(150, Math.floor(Math.min(largura, altura) * 0.7));
                    return { width: lado, height: lado };
                }
            },
            (texto) => {
                if (lido) return;
                lido = true;
                leituraRef.current(String(texto).trim());
            },
            () => {}
        ).then(() => {
            if (ativo) setAbrindo(false);
        }).catch((err) => {
            falhou = true;
            if (ativo) erroRef.current(mensagemErro(err));
        });

        return () => {
            ativo = false;
            // Espera a câmera terminar de abrir antes de desligar, senão ela fica acesa
            inicio
                .then(() => (falhou ? null : leitor.stop()))
                .catch(() => {})
                .finally(() => { try { leitor.clear(); } catch { /* já limpo */ } });
        };
    }, [id, frontal]);

    return (
        <Box sx={{ position: 'relative', width: '100%', maxWidth: 480, mx: 'auto', borderRadius: 2, overflow: 'hidden', bgcolor: '#000', minHeight: 240 }}>
            <div id={id} style={{ width: '100%' }} />
            {abrindo && (
                <Box sx={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1.5, color: 'rgba(255,255,255,0.75)' }}>
                    <CircularProgress size={28} color="inherit" />
                    <Typography variant="body2">Abrindo a câmera…</Typography>
                </Box>
            )}
        </Box>
    );
};

/**
 * Leitura de QR code / código de barras pela câmera do aparelho.
 * No celular abre em tela cheia com a câmera traseira; lê um código, chama onLeitura e fecha.
 */
const LeitorQrCamera = ({
    open,
    onClose,
    onLeitura,
    titulo = 'Ler pela câmera',
    instrucao = 'Aponte a câmera para o QR code ou código de barras da pulseira ou do crachá.'
}) => {
    const theme = useTheme();
    const celular = useMediaQuery(theme.breakpoints.down('md'));
    const [frontal, setFrontal] = useState(false);
    const [erro, setErro] = useState('');
    useFecharComVoltar(open, onClose);

    useEffect(() => {
        if (open) setErro('');
    }, [open]);

    const aoLer = (texto) => {
        if (!texto) return;
        onClose();
        onLeitura(texto);
    };

    return (
        <Dialog open={open} onClose={onClose} fullScreen={celular} fullWidth maxWidth="sm">
            <TituloModal titulo={titulo} subtitulo={instrucao} onFechar={onClose} />
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
                {erro ? (
                    <Box sx={{ p: 2, borderRadius: 2, border: '1px solid rgba(255,51,102,0.4)', bgcolor: 'rgba(255,51,102,0.08)' }}>
                        <Typography variant="body2" sx={{ color: '#FF8FA8' }}>{erro}</Typography>
                    </Box>
                ) : (
                    open && <AreaLeitura key={frontal ? 'frontal' : 'traseira'} frontal={frontal} onLeitura={aoLer} onErro={setErro} />
                )}
                <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'center', flexWrap: 'wrap', mt: 'auto' }}>
                    {erro ? (
                        <Button variant="outlined" onClick={() => setErro('')} sx={{ minHeight: 44, textTransform: 'none' }}>
                            Tentar de novo
                        </Button>
                    ) : (
                        <Button variant="outlined" startIcon={<TrocarIcon />} onClick={() => setFrontal(f => !f)} sx={{ minHeight: 44, textTransform: 'none' }}>
                            {frontal ? 'Usar câmera traseira' : 'Usar câmera frontal'}
                        </Button>
                    )}
                    <Button onClick={onClose} sx={{ minHeight: 44, textTransform: 'none', color: 'text.secondary' }}>
                        Cancelar
                    </Button>
                </Box>
            </DialogContent>
        </Dialog>
    );
};

export default LeitorQrCamera;
