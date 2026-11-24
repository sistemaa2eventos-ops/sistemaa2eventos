import React from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { WarningAmberRounded as AlertaIcon, HelpOutlineRounded as PerguntaIcon } from '@mui/icons-material';
import { cores, tom } from '../../styles/tokens';

/**
 * Confirmação padrão do painel (substitui o window.confirm do navegador).
 * `perigo` (padrão: true) pinta a ação de vermelho — use false para confirmações neutras.
 */
const ConfirmDialog = ({
    open, title, message, description, onConfirm, onCancel, onClose, loading,
    confirmText = 'Confirmar', cancelText = 'Cancelar', perigo = true
}) => {
    const cor = perigo ? cores.erro : cores.primaria;
    // Aceita também description/onClose (nomes usados em telas antigas — antes eram ignorados
    // e o botão Cancelar não fazia nada)
    const cancelar = onCancel || onClose;
    const mensagem = message || description;
    return (
        <Dialog open={open} onClose={loading ? undefined : cancelar} maxWidth="xs" fullWidth>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box sx={{ width: 36, height: 36, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: tom(cor, 0.14), color: cor, flexShrink: 0 }}>
                    {perigo ? <AlertaIcon fontSize="small" /> : <PerguntaIcon fontSize="small" />}
                </Box>
                {title || (perigo ? 'Confirmar exclusão' : 'Confirmar')}
            </DialogTitle>
            <DialogContent>
                <Typography variant="body2" sx={{ color: cores.textoSuave, whiteSpace: 'pre-line' }}>
                    {mensagem || 'Esta ação não pode ser desfeita. Deseja continuar?'}
                </Typography>
            </DialogContent>
            <DialogActions>
                <Button onClick={cancelar} disabled={loading} sx={{ color: cores.textoSecundario }}>
                    {cancelText}
                </Button>
                <Button
                    variant="contained"
                    onClick={onConfirm}
                    disabled={loading}
                    color={perigo ? 'error' : 'primary'}
                    autoFocus
                >
                    {loading ? 'Aguarde...' : confirmText}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default ConfirmDialog;
