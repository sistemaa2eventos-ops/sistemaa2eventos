import React from 'react';
import { Alert, Box, Button, CircularProgress, Typography } from '@mui/material';
import { LockOpen as LiberarIcon } from '@mui/icons-material';

/**
 * Aviso de entrada bloqueada pelo rosto (sem ficha aberta). Mesma mensagem e mesmo botão
 * "Liberar reentrada" da ficha do ModalCredenciamento: o hook useCheckin guarda o estado.
 */
const AvisoEntradaBloqueada = ({ bloqueio, podeLiberar = false, liberando = false, onLiberar, onFechar }) => {
    if (!bloqueio) return null;
    const { liberavel, mensagem, nome, erroLiberacao } = bloqueio;

    return (
        <Alert
            severity="warning"
            variant="outlined"
            onClose={onFechar}
            sx={{ mb: { xs: 1.5, sm: 2 }, color: '#FFB800', borderColor: 'rgba(255, 184, 0, 0.5)', bgcolor: 'rgba(255, 184, 0, 0.06)', '& .MuiAlert-icon': { color: '#FFB800' }, '& .MuiAlert-action .MuiIconButton-root': { color: '#FFB800' } }}
        >
            {nome && (
                <Typography variant="caption" sx={{ display: 'block', color: 'rgba(255,255,255,0.75)', fontWeight: 700 }}>
                    {nome}
                </Typography>
            )}
            <Typography variant="body2" sx={{ fontWeight: 700, color: '#FFFFFF' }}>
                {liberavel
                    ? (mensagem || 'Entrada bloqueada nesta área: a reentrada precisa de liberação do controlador.')
                    : 'Pessoa já está dentro'}
            </Typography>

            {liberavel && podeLiberar && (
                <Button
                    size="small"
                    variant="outlined"
                    onClick={onLiberar}
                    disabled={liberando}
                    startIcon={liberando ? <CircularProgress size={14} /> : <LiberarIcon sx={{ fontSize: 16 }} />}
                    sx={{ mt: 1, minHeight: 36, fontSize: '0.8rem', color: '#FFB800', borderColor: 'rgba(255, 184, 0, 0.6)', textTransform: 'none', borderRadius: 1.5 }}
                >
                    {liberando ? 'Liberando...' : 'Liberar reentrada'}
                </Button>
            )}
            {liberavel && !podeLiberar && (
                <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'rgba(255,255,255,0.75)' }}>
                    Peça ao controlador da área para liberar a reentrada.
                </Typography>
            )}
            {!liberavel && (
                <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'rgba(255,255,255,0.75)' }}>
                    Para registrar a saída, use o Check-out.
                </Typography>
            )}
            {erroLiberacao && (
                <Box sx={{ mt: 1 }}>
                    <Typography variant="caption" sx={{ display: 'block', color: '#FF3366', fontWeight: 700 }}>
                        {erroLiberacao}
                    </Typography>
                </Box>
            )}
        </Alert>
    );
};

export default AvisoEntradaBloqueada;
