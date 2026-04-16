import React, { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, Box, Typography, CircularProgress, Divider, Stack
} from '@mui/material';
import {
    VerifiedUser as ApproveIcon,
    InfoOutlined as InfoIcon,
    Close as CloseIcon,
} from '@mui/icons-material';
import api from '../services/api';
import { useSnackbar } from 'notistack';
import PessoasAreaSelect from './PessoasAreaSelect';

export default function AprovacaoPessoaDialog({
    open,
    pessoa,
    eventoId,
    onClose,
    onApprove,
    loading = false,
}) {
    const { enqueueSnackbar } = useSnackbar();
    const [selectedAreas, setSelectedAreas] = useState([]);
    const [approving, setApproving]         = useState(false);

    useEffect(() => {
        if (open && pessoa) setSelectedAreas([]);
    }, [open, pessoa]);

    const handleApprove = async () => {
        if (selectedAreas.length === 0) {
            enqueueSnackbar('Selecione pelo menos uma área de acesso.', { variant: 'warning' });
            return;
        }
        try {
            setApproving(true);
            if (onApprove) {
                await onApprove(pessoa.id, selectedAreas);
                enqueueSnackbar(
                    `${pessoa.nome_completo} aprovado. Sincronizando com os leitores...`,
                    { variant: 'success' }
                );
            }
            onClose();
        } catch (error) {
            enqueueSnackbar('Erro ao aprovar: ' + error.message, { variant: 'error' });
        } finally {
            setApproving(false);
        }
    };

    if (!pessoa) return null;

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="sm"
            fullWidth
            PaperProps={{
                sx: {
                    bgcolor: 'background.paper',
                    border: '1px solid rgba(0,212,255,0.15)',
                    borderRadius: 3,
                }
            }}
        >
            {/* Header */}
            <DialogTitle sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                pb: 1.5,
                borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}>
                <ApproveIcon sx={{ color: 'primary.main', fontSize: 22 }} />
                <Box sx={{ flex: 1 }}>
                    <Typography variant="subtitle1" fontWeight={700} lineHeight={1.2}>
                        Aprovar Participante
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        Selecione as áreas de acesso antes de confirmar
                    </Typography>
                </Box>
                <Button
                    onClick={onClose}
                    disabled={approving}
                    size="small"
                    sx={{ minWidth: 0, p: 0.5, color: 'text.disabled' }}
                >
                    <CloseIcon fontSize="small" />
                </Button>
            </DialogTitle>

            <DialogContent sx={{ pt: 2.5, pb: 1 }}>
                {/* Dados do participante */}
                <Box sx={{
                    p: 2, mb: 2.5,
                    borderRadius: 2,
                    bgcolor: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.07)',
                }}>
                    <Typography variant="body1" fontWeight={600} color="text.primary">
                        {pessoa.nome_completo}
                    </Typography>
                    <Stack direction="row" spacing={2} sx={{ mt: 0.5 }}>
                        {pessoa.cpf && (
                            <Typography variant="caption" color="text.secondary">
                                CPF: {pessoa.cpf}
                            </Typography>
                        )}
                        {pessoa.email && (
                            <Typography variant="caption" color="text.secondary">
                                {pessoa.email}
                            </Typography>
                        )}
                    </Stack>
                </Box>

                {/* Aviso */}
                <Box sx={{
                    display: 'flex', gap: 1, alignItems: 'flex-start',
                    p: 1.5, mb: 2.5,
                    borderRadius: 2,
                    bgcolor: 'rgba(0,212,255,0.05)',
                    border: '1px solid rgba(0,212,255,0.15)',
                }}>
                    <InfoIcon sx={{ fontSize: 16, color: 'primary.main', flexShrink: 0, mt: 0.1 }} />
                    <Typography variant="caption" color="text.secondary" lineHeight={1.5}>
                        Ao aprovar, a face do participante será sincronizada automaticamente com
                        os leitores biométricos de cada área selecionada.
                    </Typography>
                </Box>

                {/* Seletor de áreas */}
                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                        <CircularProgress size={28} />
                    </Box>
                ) : (
                    <PessoasAreaSelect
                        eventoId={eventoId}
                        selectedAreas={selectedAreas}
                        onAreasChange={setSelectedAreas}
                    />
                )}
            </DialogContent>

            <DialogActions sx={{ px: 3, pb: 2.5, pt: 2, gap: 1, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <Button
                    onClick={onClose}
                    disabled={approving}
                    variant="text"
                    sx={{ color: 'text.secondary' }}
                >
                    Cancelar
                </Button>
                <Button
                    onClick={handleApprove}
                    variant="contained"
                    color="primary"
                    disabled={approving || selectedAreas.length === 0}
                    startIcon={approving
                        ? <CircularProgress size={16} color="inherit" />
                        : <ApproveIcon />
                    }
                    sx={{ minWidth: 160 }}
                >
                    {approving
                        ? 'Aprovando...'
                        : `Aprovar (${selectedAreas.length} área${selectedAreas.length !== 1 ? 's' : ''})`
                    }
                </Button>
            </DialogActions>
        </Dialog>
    );
}
