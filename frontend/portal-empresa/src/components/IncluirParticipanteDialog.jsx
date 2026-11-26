import React, { useEffect, useState } from 'react';
import { Dialog, DialogActions, DialogContent, Grid, TextField, Typography } from '@mui/material';
import { useSnackbar } from 'notistack';
import api, { erroDe } from '../services/api';
import TituloModal from './common/TituloModal';
import NeonButton from './common/NeonButton';
import { ROTULO_CAMPO } from '../util';
import { botaoSecundario, cores } from '../styles/tokens';

const CAMPOS = ['cpf', 'nome_completo', 'funcao', 'email', 'telefone', 'data_nascimento', 'nome_mae', 'nome_credencial', 'passaporte'];
const vazio = () => Object.fromEntries(CAMPOS.map(c => [c, '']));

const mascaraCpf = (v) => {
    const d = v.replace(/\D/g, '').slice(0, 11);
    return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
};

/**
 * Inclusão de participante: entra como pré-cadastro da empresa. O participante conclui pelo
 * link de cadastro (CPF, foto e aceite LGPD) e a organização analisa os documentos.
 */
const IncluirParticipanteDialog = ({ open, onClose, onIncluido }) => {
    const { enqueueSnackbar } = useSnackbar();
    const [dados, setDados] = useState(vazio);
    const [salvando, setSalvando] = useState(false);

    useEffect(() => { if (open) setDados(vazio()); }, [open]);

    const salvar = async () => {
        setSalvando(true);
        try {
            const corpo = Object.fromEntries(Object.entries(dados).filter(([, v]) => String(v).trim()));
            const { data } = await api.post('/participantes', corpo);
            enqueueSnackbar(data?.data?.atualizado ? 'Pré-cadastro atualizado.' : 'Participante incluído. Envie o link de cadastro para ele concluir.', { variant: 'success' });
            onIncluido?.();
            onClose();
        } catch (err) {
            enqueueSnackbar(erroDe(err, 'Erro ao incluir o participante.'), { variant: 'error' });
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Dialog open={open} onClose={() => !salvando && onClose()} maxWidth="sm" fullWidth disableRestoreFocus
            PaperProps={{ sx: { bgcolor: cores.superficie, border: `1px solid ${cores.borda}`, backgroundImage: 'none' } }}>
            <TituloModal titulo="Incluir participante" subtitulo="Entra como pré-cadastro: a pessoa conclui pelo link de cadastro da equipe." onFechar={onClose} desabilitarFechar={salvando} />
            <DialogContent sx={{ p: 3 }}>
                <Grid container spacing={2}>
                    {CAMPOS.map(c => (
                        <Grid item xs={12} sm={c === 'cpf' || c === 'nome_completo' ? 12 : 6} key={c}>
                            <TextField
                                size="small" fullWidth
                                label={`${ROTULO_CAMPO[c]}${c === 'cpf' || c === 'nome_completo' ? ' *' : ''}`}
                                type={c === 'data_nascimento' ? 'date' : c === 'email' ? 'email' : 'text'}
                                InputLabelProps={c === 'data_nascimento' ? { shrink: true } : undefined}
                                inputProps={c === 'cpf' ? { inputMode: 'numeric' } : { maxLength: 200 }}
                                value={dados[c]}
                                onChange={(e) => setDados(d => ({ ...d, [c]: c === 'cpf' ? mascaraCpf(e.target.value) : e.target.value }))}
                            />
                        </Grid>
                    ))}
                </Grid>
                <Typography variant="caption" component="p" sx={{ color: cores.textoSecundario, mt: 2 }}>
                    O participante fica pendente até concluir o cadastro e a organização aprovar os documentos.
                </Typography>
            </DialogContent>
            <DialogActions sx={{ p: 2.5, borderTop: `1px solid ${cores.borda}` }}>
                <NeonButton variant="outlined" onClick={onClose} disabled={salvando} sx={botaoSecundario}>Cancelar</NeonButton>
                <NeonButton loading={salvando} disabled={dados.cpf.replace(/\D/g, '').length !== 11 || !dados.nome_completo.trim()} onClick={salvar}>
                    Incluir
                </NeonButton>
            </DialogActions>
        </Dialog>
    );
};

export default IncluirParticipanteDialog;
