import React, { useEffect, useState } from 'react';
import { Dialog, DialogActions, DialogContent, Stack, TextField, Typography } from '@mui/material';
import { useSnackbar } from 'notistack';
import api, { erroDe } from '../services/api';
import TituloModal from './common/TituloModal';
import NeonButton from './common/NeonButton';
import { botaoSecundario, cores } from '../styles/tokens';

/**
 * Pedido à organização (excluir, alterar dados, outro). Nada muda até um operador aprovar.
 * @param {{ pedido: { tipo, alvo_id?, alvo_tipo?, dados?, titulo, descricao, exigeMotivo? } | null }} props
 */
const PedidoDialog = ({ pedido, onClose, onEnviado }) => {
    const { enqueueSnackbar } = useSnackbar();
    const [motivo, setMotivo] = useState('');
    const [enviando, setEnviando] = useState(false);

    useEffect(() => { if (pedido) setMotivo(''); }, [pedido]);

    const exigeMotivo = pedido?.exigeMotivo !== false;
    const enviar = async () => {
        setEnviando(true);
        try {
            const { titulo: _t, descricao: _d, exigeMotivo: _e, ...corpo } = pedido;
            await api.post('/solicitacoes', { ...corpo, motivo });
            enqueueSnackbar('Pedido enviado. Você acompanha a resposta em Solicitações.', { variant: 'success' });
            onEnviado?.();
            onClose();
        } catch (err) {
            enqueueSnackbar(erroDe(err, 'Erro ao enviar o pedido.'), { variant: 'error' });
        } finally {
            setEnviando(false);
        }
    };

    return (
        <Dialog open={!!pedido} onClose={() => !enviando && onClose()} maxWidth="sm" fullWidth disableRestoreFocus
            PaperProps={{ sx: { bgcolor: cores.superficie, border: `1px solid ${cores.borda}`, backgroundImage: 'none' } }}>
            <TituloModal titulo={pedido?.titulo || 'Pedido à organização'} onFechar={onClose} desabilitarFechar={enviando} />
            <DialogContent sx={{ p: 3 }}>
                <Stack spacing={2}>
                    {pedido?.descricao && <Typography variant="body2" sx={{ color: cores.texto }}>{pedido.descricao}</Typography>}
                    <TextField label={exigeMotivo ? 'Motivo (obrigatório)' : 'Observação (opcional)'} value={motivo} onChange={(e) => setMotivo(e.target.value)}
                        multiline minRows={3} inputProps={{ maxLength: 1000 }} fullWidth />
                    <Typography variant="caption" sx={{ color: cores.textoSecundario }}>
                        A organização do evento analisa e aprova ou recusa. Nada é alterado antes disso.
                    </Typography>
                </Stack>
            </DialogContent>
            <DialogActions sx={{ p: 2.5, borderTop: `1px solid ${cores.borda}` }}>
                <NeonButton variant="outlined" onClick={onClose} disabled={enviando} sx={botaoSecundario}>Cancelar</NeonButton>
                <NeonButton loading={enviando} disabled={exigeMotivo && motivo.trim().length < 5} onClick={enviar}>Enviar pedido</NeonButton>
            </DialogActions>
        </Dialog>
    );
};

export default PedidoDialog;
