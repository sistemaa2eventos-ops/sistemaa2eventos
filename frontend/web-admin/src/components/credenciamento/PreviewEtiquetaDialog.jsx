import React, { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Box,
    Typography, Button, CircularProgress, IconButton, Paper, Stack
} from '@mui/material';
import {
    Print as PrintIcon,
    Close as CloseIcon,
    Style as StyleIcon
} from '@mui/icons-material';
import NeonButton from '../common/NeonButton';
import { carregarConfigEtiqueta, montarHtmlEtiqueta, imprimirHtml, preencher } from '../../services/etiquetaService';
import api from '../../services/api';

const ESCALA_PREVIEW = 2.8; // Fator de escala para preview na tela (mm -> px)

export const PreviewEtiquetaDialog = ({
    open,
    onClose,
    pessoaId,
    eventoId,
    dadosIniciais = null,
    onImprimiu = null,
    autoPrint = false
}) => {
    const [loading, setLoading] = useState(true);
    const [printing, setPrinting] = useState(false);
    const [config, setConfig] = useState(null);
    const [dadosPessoa, setDadosPessoa] = useState(dadosIniciais);
    const [erro, setErro] = useState(null);

    useEffect(() => {
        if (!open || (!pessoaId && !dadosIniciais) || !eventoId) return;

        let ativo = true;
        const carregar = async () => {
            try {
                setLoading(true);
                setErro(null);

                // 1. Carregar layout do evento
                const cfg = await carregarConfigEtiqueta(eventoId);
                if (!ativo) return;
                setConfig(cfg);

                // 2. Se não recebemos os dados prontos, buscar pela API
                let dados = dadosIniciais;
                if (!dados && pessoaId) {
                    const res = await api.get(`/config/etiquetas/pessoa/${pessoaId}`, {
                        params: { evento_id: eventoId }
                    });
                    dados = res.data?.data;
                }

                if (!ativo) return;
                setDadosPessoa(dados);

                // Se autoPrint for true, já dispara logo após carregar
                if (autoPrint && dados && cfg?.layout) {
                    setTimeout(() => {
                        handleImprimir(cfg.layout, dados);
                    }, 500);
                }
            } catch (err) {
                if (ativo) setErro(err.response?.data?.error || err.message || 'Falha ao carregar dados da etiqueta.');
            } finally {
                if (ativo) setLoading(false);
            }
        };

        carregar();
        return () => { ativo = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, pessoaId, eventoId, dadosIniciais]);

    const handleImprimir = async (layoutParam = null, dadosParam = null) => {
        const layoutFinal = layoutParam || config?.layout;
        const dadosFinal = dadosParam || dadosPessoa;
        if (!layoutFinal || !dadosFinal) return;

        try {
            setPrinting(true);
            const html = montarHtmlEtiqueta(layoutFinal, dadosFinal);
            await imprimirHtml(html);
            if (onImprimiu) onImprimiu();
            onClose();
        } catch (err) {
            console.error('Erro na impressão:', err);
        } finally {
            setPrinting(false);
        }
    };

    if (!open) return null;

    const layout = config?.layout;
    const papel = layout?.papel_config || { width: 100, height: 150 };
    const larguraPx = (Number(papel.width) || 100) * ESCALA_PREVIEW;
    const alturaPx = (Number(papel.height) || 150) * ESCALA_PREVIEW;
    const elementos = layout?.elementos || [];

    return (
        <Dialog
            open={open}
            onClose={printing ? undefined : onClose}
            maxWidth="sm"
            fullWidth
            PaperProps={{
                sx: {
                    bgcolor: '#0A1628',
                    border: '1px solid rgba(0, 212, 255, 0.25)',
                    borderRadius: 2,
                    boxShadow: '0 12px 40px rgba(0,0,0,0.8)'
                }
            }}
        >
            <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <Stack direction="row" spacing={1.5} alignItems="center">
                    <StyleIcon sx={{ color: '#00D4FF' }} />
                    <Box>
                        <Typography variant="h6" fontWeight={700} color="#FFFFFF" lineHeight={1.2}>
                            Pré-visualização da impressão
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)' }}>
                            Dimensão: {papel.width}mm × {papel.height}mm {papel.width <= 60 && papel.height <= 90 ? '(Cartão PVC / Crachá)' : '(Etiqueta / Bobina)'}
                        </Typography>
                    </Box>
                </Stack>
                <IconButton size="small" onClick={onClose} disabled={printing} sx={{ color: 'rgba(255,255,255,0.6)' }}>
                    <CloseIcon />
                </IconButton>
            </DialogTitle>

            <DialogContent sx={{ py: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: 320 }}>
                {loading ? (
                    <Box sx={{ my: 'auto', textAlign: 'center' }}>
                        <CircularProgress size={36} sx={{ color: '#00D4FF', mb: 2 }} />
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)' }}>
                            Gerando pré-visualização da credencial...
                        </Typography>
                    </Box>
                ) : erro ? (
                    <Box sx={{ my: 'auto', textAlign: 'center', p: 2 }}>
                        <Typography variant="body1" color="error" fontWeight={600} gutterBottom>
                            {erro}
                        </Typography>
                        <Button variant="outlined" size="small" onClick={onClose} sx={{ mt: 1, color: '#FFFFFF', borderColor: 'rgba(255,255,255,0.3)' }}>
                            Fechar
                        </Button>
                    </Box>
                ) : (
                    <Box sx={{ width: '100%', overflowX: 'auto', display: 'flex', justifyContent: 'center', py: 1 }}>
                        <Paper
                            elevation={8}
                            sx={{
                                width: larguraPx,
                                height: alturaPx,
                                minWidth: larguraPx,
                                minHeight: alturaPx,
                                bgcolor: '#FFFFFF',
                                position: 'relative',
                                overflow: 'hidden',
                                borderRadius: '4px',
                                border: '1px solid #D1D5DB'
                            }}
                        >
                            {elementos.map(el => {
                                const left = (Number(el.x) / 3) * ESCALA_PREVIEW;
                                const top = (Number(el.y) / 3) * ESCALA_PREVIEW;
                                const width = (Number(el.width) / 3) * ESCALA_PREVIEW;
                                const height = (Number(el.height) / 3) * ESCALA_PREVIEW;
                                const fontSize = ((Number(el.fontSize) || 14) / 3) * ESCALA_PREVIEW;

                                if (el.type === 'qrcode') {
                                    return (
                                        <Box
                                            key={el.id}
                                            sx={{
                                                position: 'absolute',
                                                left, top, width, height,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                                            }}
                                        >
                                            {dadosPessoa?.qr_imagem ? (
                                                <Box
                                                    component="img"
                                                    src={dadosPessoa.qr_imagem}
                                                    alt="QR Code"
                                                    sx={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                                />
                                            ) : (
                                                <Box sx={{ width: '100%', height: '100%', border: '1px dashed #000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#000' }}>
                                                    QR CODE
                                                </Box>
                                            )}
                                        </Box>
                                    );
                                }

                                const textoFormatado = preencher(el.content, dadosPessoa);
                                return (
                                    <Box
                                        key={el.id}
                                        sx={{
                                            position: 'absolute',
                                            left, top, width, height,
                                            overflow: 'hidden',
                                            color: '#000000',
                                            fontWeight: el.fontWeight === 'bold' ? 700 : 400,
                                            fontSize: `${fontSize}px`,
                                            lineHeight: 1.15,
                                            whiteSpace: 'nowrap',
                                            textOverflow: 'ellipsis'
                                        }}
                                    >
                                        {textoFormatado}
                                    </Box>
                                );
                            })}
                        </Paper>
                    </Box>
                )}
            </DialogContent>

            <DialogActions sx={{ p: 2.5, borderTop: '1px solid rgba(255,255,255,0.08)', gap: 1.5 }}>
                <Button
                    variant="outlined"
                    onClick={onClose}
                    disabled={printing}
                    sx={{ color: 'rgba(255,255,255,0.7)', borderColor: 'rgba(255,255,255,0.2)', textTransform: 'none' }}
                >
                    Fechar sem imprimir
                </Button>
                <NeonButton
                    neonColor="#00FF88"
                    startIcon={printing ? <CircularProgress size={18} color="inherit" /> : <PrintIcon />}
                    onClick={() => handleImprimir()}
                    disabled={loading || !!erro || printing}
                    sx={{ fontWeight: 700, px: 3 }}
                >
                    {printing ? 'Imprimindo...' : 'Confirmar e Imprimir'}
                </NeonButton>
            </DialogActions>
        </Dialog>
    );
};

export default PreviewEtiquetaDialog;
