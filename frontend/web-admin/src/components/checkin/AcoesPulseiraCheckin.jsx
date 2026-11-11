import React, { useState } from 'react';
import {
    Box, IconButton, Menu, MenuItem, ListItemIcon, ListItemText, Typography,
    Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button, Tooltip
} from '@mui/material';
import { MoreVert as MoreIcon, EditOutlined as EditIcon, Undo as UndoIcon, AssignmentReturn as DevolverIcon, ReportProblemOutlined as PerdidaIcon } from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import api from '../../services/api';

/**
 * Ações de correção da pulseira direto na tela de check-in (o operador corrige ali; o relatório só comprova).
 * Só aparece para quem já tem pulseira em uso.
 */
const AcoesPulseiraCheckin = ({ pessoa, onAtualizado }) => {
    const { enqueueSnackbar } = useSnackbar();
    const [menuEl, setMenuEl] = useState(null);
    const [corrigindo, setCorrigindo] = useState(false);
    const [novoNumero, setNovoNumero] = useState('');
    const [ocupado, setOcupado] = useState(false);

    const params = { params: { evento_id: localStorage.getItem('active_evento_id') } };

    const executar = async (chamada, mensagemOk) => {
        setOcupado(true);
        try {
            await chamada();
            enqueueSnackbar(mensagemOk, { variant: 'success' });
            onAtualizado?.();
            return true;
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Não foi possível concluir a ação.', { variant: 'error' });
            return false;
        } finally {
            setOcupado(false);
        }
    };

    const lancamentoErrado = () => {
        setMenuEl(null);
        executar(
            () => api.post('/pulseiras/anular', { pessoa_id: pessoa.id, observacao: 'Lançamento errado (tela de check-in)' }, params),
            'Lançamento desfeito. A pulseira anterior, se houver, voltou para a pessoa.'
        );
    };

    const encerrar = (motivo) => {
        setMenuEl(null);
        executar(
            () => api.post('/pulseiras/encerrar', { pessoa_id: pessoa.id, motivo, observacao: 'Registrado na tela de check-in' }, params),
            motivo === 'perdida' ? 'Pulseira marcada como perdida.' : 'Pulseira marcada como devolvida.'
        );
    };

    const abrirCorrecao = () => {
        setMenuEl(null);
        setNovoNumero('');
        setCorrigindo(true);
    };

    const confirmarCorrecao = async () => {
        const numero = novoNumero.trim();
        if (!numero) return;
        const ok = await executar(
            () => api.post('/pulseiras/corrigir', { pessoa_id: pessoa.id, numero_pulseira: numero, observacao: 'Correção de número (tela de check-in)' }, params),
            `Pulseira corrigida para ${numero}.`
        );
        if (ok) setCorrigindo(false);
    };

    return (
        <>
            <Tooltip title="Corrigir ou anular a pulseira">
                <IconButton
                    size="small"
                    aria-label={`Ações da pulseira de ${pessoa.nome}`}
                    onClick={(e) => { e.stopPropagation(); setMenuEl(e.currentTarget); }}
                    disabled={ocupado}
                    sx={{ color: 'rgba(255,255,255,0.7)' }}
                >
                    <MoreIcon fontSize="small" />
                </IconButton>
            </Tooltip>

            <Menu anchorEl={menuEl} open={!!menuEl} onClose={() => setMenuEl(null)} onClick={(e) => e.stopPropagation()}>
                <MenuItem onClick={abrirCorrecao}>
                    <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
                    <ListItemText primary="Corrigir número" secondary="Trocar pelo número certo" />
                </MenuItem>
                <MenuItem onClick={lancamentoErrado}>
                    <ListItemIcon><UndoIcon fontSize="small" /></ListItemIcon>
                    <ListItemText primary="Lançamento errado" secondary="Desfaz a última entrega" />
                </MenuItem>
                <MenuItem onClick={() => encerrar('devolvida')}>
                    <ListItemIcon><DevolverIcon fontSize="small" /></ListItemIcon>
                    <ListItemText primary="Marcar como devolvida" />
                </MenuItem>
                <MenuItem onClick={() => encerrar('perdida')}>
                    <ListItemIcon><PerdidaIcon fontSize="small" /></ListItemIcon>
                    <ListItemText primary="Marcar como perdida" />
                </MenuItem>
            </Menu>

            <Dialog open={corrigindo} onClose={() => !ocupado && setCorrigindo(false)} maxWidth="xs" fullWidth>
                <DialogTitle>Corrigir pulseira</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
                        {pessoa.nome} está com a pulseira <strong>{pessoa.numero_pulseira}</strong>. Digite o número certo: o número errado fica registrado como anulado e não conta como entrega.
                    </Typography>
                    <Box>
                        <TextField
                            autoFocus
                            fullWidth
                            label="Número correto"
                            type="number"
                            value={novoNumero}
                            onChange={(e) => setNovoNumero(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') confirmarCorrecao(); }}
                            inputProps={{ min: 1 }}
                        />
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setCorrigindo(false)} disabled={ocupado}>Cancelar</Button>
                    <Button variant="contained" onClick={confirmarCorrecao} disabled={ocupado || !novoNumero.trim()}>
                        {ocupado ? 'Salvando...' : 'Confirmar correção'}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
};

export default AcoesPulseiraCheckin;
