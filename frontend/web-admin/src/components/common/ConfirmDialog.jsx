import React from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Typography,
    Button,
    Box
} from '@mui/material';
import { Warning as WarningIcon } from '@mui/icons-material';
import NeonButton from './NeonButton';

const ConfirmDialog = ({ open, title, message, onConfirm, onCancel, loading }) => {
    return (
        <Dialog
            open={open}
            onClose={onCancel}
            PaperProps={{
                sx: {
                    background: '#0A1628',
                    border: '1px solid rgba(255, 51, 102, 0.2)',
                    boxShadow: '0 0 40px rgba(255, 51, 102, 0.1)',
                    borderRadius: 4
                }
            }}
        >
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 2, pb: 1 }}>
                <WarningIcon sx={{ color: '#FF3366' }} />
                <Typography variant="h6" component="span" sx={{ fontFamily: '"Orbitron", sans-serif', fontWeight: 900, fontSize: '1rem' }}>
                    {title || 'CONFIRMAR EXCLUSÃO'}
                </Typography>
            </DialogTitle>
            <DialogContent>
                <Typography sx={{ color: 'text.secondary' }}>
                    {message || 'Esta ação é irreversível e afetará os dados sincronizados. Deseja prosseguir?'}
                </Typography>
            </DialogContent>
            <DialogActions sx={{ p: 3, pt: 0 }}>
                <Button
                    onClick={onCancel}
                    sx={{ color: 'text.secondary', fontWeight: 700 }}
                    disabled={loading}
                >
                    ABORTAR
                </Button>
                <NeonButton
                    onClick={onConfirm}
                    color="error"
                    loading={loading}
                    sx={{
                        background: 'rgba(255, 51, 102, 0.1)',
                        border: '1px solid #FF3366',
                        color: '#FF3366',
                        '&:hover': {
                            background: '#FF3366',
                            color: '#fff'
                        }
                    }}
                >
                    CONFIRMAR
                </NeonButton>
            </DialogActions>
        </Dialog>
    );
};

export default ConfirmDialog;