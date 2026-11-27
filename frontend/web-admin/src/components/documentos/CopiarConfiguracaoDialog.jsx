import React, { useEffect, useState } from 'react';
import { Alert, CircularProgress, Dialog, DialogActions, DialogContent, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useSnackbar } from 'notistack';
import api from '../../services/api';
import TituloModal from '../common/TituloModal';
import NeonButton from '../common/NeonButton';
import { botaoSecundario, cores, tom } from '../../styles/tokens';

/**
 * Copia a configuração de documentos (tipos, obrigatórios por função e para empresas, funções e aviso)
 * de outro evento para o evento em foco.
 */
const CopiarConfiguracaoDialog = ({ open, onClose, eventoAtualId, onCopiado }) => {
    const { enqueueSnackbar } = useSnackbar();
    const [eventos, setEventos] = useState([]);
    const [carregando, setCarregando] = useState(false);
    const [origem, setOrigem] = useState('');
    const [copiando, setCopiando] = useState(false);

    useEffect(() => {
        if (!open) return;
        setOrigem('');
        setCarregando(true);
        api.get('/eventos')
            .then(resp => setEventos((resp.data?.data || resp.data || []).filter(e => e.id !== eventoAtualId)))
            .catch(() => enqueueSnackbar('Não foi possível listar os eventos.', { variant: 'error' }))
            .finally(() => setCarregando(false));
    }, [open, eventoAtualId, enqueueSnackbar]);

    const copiar = async () => {
        setCopiando(true);
        try {
            const resp = await api.post('/documentos/config/copiar', { origem_evento_id: origem });
            onCopiado(resp.data?.data || {});
            enqueueSnackbar('Configuração copiada. Confira e clique em Salvar para manter.', { variant: 'success' });
            onClose();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Erro ao copiar a configuração.', { variant: 'error' });
        } finally {
            setCopiando(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth disableRestoreFocus
            PaperProps={{ sx: { bgcolor: cores.superficie, border: `1px solid ${cores.borda}`, backgroundImage: 'none' } }}>
            <TituloModal titulo="Copiar de outro evento" subtitulo="Traz os tipos, os obrigatórios e as funções do evento escolhido." onFechar={onClose} desabilitarFechar={copiando} />
            <DialogContent sx={{ p: 3 }}>
                <Stack spacing={2}>
                    <Alert severity="info" sx={{ bgcolor: tom(cores.primaria, 0.05), color: cores.texto, border: '1px solid rgba(0,212,255,0.2)' }}>
                        Tipos com o mesmo nome são reaproveitados. Os obrigatórios deste evento são substituídos pelos do evento escolhido;
                        tipos que só existem aqui continuam. Nada é gravado até clicar em Salvar.
                    </Alert>
                    {carregando ? <CircularProgress size={24} /> : (
                        <TextField select label="Evento de origem" value={origem} onChange={(e) => setOrigem(e.target.value)} fullWidth>
                            {eventos.length === 0 && <MenuItem disabled value="">Nenhum outro evento disponível</MenuItem>}
                            {eventos.map(e => (
                                <MenuItem key={e.id} value={e.id}>{e.nome}{e.status ? ` (${e.status})` : ''}</MenuItem>
                            ))}
                        </TextField>
                    )}
                    <Typography variant="caption" sx={{ color: cores.textoSecundario }}>
                        Os participantes e os documentos enviados não são copiados: só a configuração.
                    </Typography>
                </Stack>
            </DialogContent>
            <DialogActions sx={{ p: 2.5, borderTop: `1px solid ${cores.borda}` }}>
                <NeonButton variant="outlined" onClick={onClose} sx={botaoSecundario}>Cancelar</NeonButton>
                <NeonButton loading={copiando} disabled={!origem} onClick={copiar}>Copiar configuração</NeonButton>
            </DialogActions>
        </Dialog>
    );
};

export default CopiarConfiguracaoDialog;
