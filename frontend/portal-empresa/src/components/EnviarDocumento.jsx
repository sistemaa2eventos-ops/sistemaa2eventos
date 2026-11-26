import React, { useState } from 'react';
import { Box, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { UploadFile as UploadIcon } from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import api, { erroDe } from '../services/api';
import NeonButton from './common/NeonButton';
import { botaoSecundario, cores } from '../styles/tokens';

/**
 * Envio de documento (arquivo ou foto do celular). O documento entra na análise da organização.
 * @param {{ url: string, tipos: Array<{ id, nome, exige_validade }>, onEnviado: () => void }} props
 */
const EnviarDocumento = ({ url, tipos = [], onEnviado }) => {
    const { enqueueSnackbar } = useSnackbar();
    const [tipoId, setTipoId] = useState('');
    const [arquivo, setArquivo] = useState(null);
    const [validade, setValidade] = useState('');
    const [enviando, setEnviando] = useState(false);
    const tipo = tipos.find(t => t.id === tipoId);

    const enviar = async () => {
        if (!tipo || !arquivo) return;
        if (tipo.exige_validade && !validade) {
            enqueueSnackbar(`Informe a data de validade (obrigatória para ${tipo.nome}).`, { variant: 'warning' });
            return;
        }
        setEnviando(true);
        try {
            const form = new FormData();
            form.append('arquivo', arquivo);
            form.append('tipo_documento_id', tipo.id);
            if (validade) form.append('data_validade', validade);
            await api.post(url, form, { headers: { 'Content-Type': 'multipart/form-data' } });
            enqueueSnackbar('Documento enviado. A organização vai analisar.', { variant: 'success' });
            setTipoId('');
            setArquivo(null);
            setValidade('');
            onEnviado?.();
        } catch (err) {
            enqueueSnackbar(erroDe(err, 'Erro ao enviar o documento.'), { variant: 'error' });
        } finally {
            setEnviando(false);
        }
    };

    return (
        <Box sx={{ p: 2, borderRadius: 1.5, border: `1px dashed ${cores.bordaDestaque}` }}>
            <Typography variant="subtitle2" sx={{ color: cores.textoForte, fontWeight: 700, mb: 1.5 }}>Enviar documento</Typography>
            <Stack spacing={1.5}>
                <TextField select size="small" label="Tipo de documento" value={tipoId} onChange={(e) => setTipoId(e.target.value)} fullWidth>
                    {tipos.length === 0 && <MenuItem disabled value="">Nenhum tipo cadastrado pela organização</MenuItem>}
                    {tipos.map(t => <MenuItem key={t.id} value={t.id}>{t.nome}{t.exige_validade ? ' (com validade)' : ''}</MenuItem>)}
                </TextField>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                    <Button component="label" variant="outlined" startIcon={<UploadIcon />} sx={{ ...botaoSecundario, justifyContent: 'flex-start' }}>
                        {arquivo ? arquivo.name : 'Escolher arquivo ou tirar foto'}
                        <input hidden type="file" accept="application/pdf,image/jpeg,image/png" onChange={(e) => setArquivo(e.target.files?.[0] || null)} />
                    </Button>
                    {tipo && (
                        <TextField size="small" type="date" label={tipo.exige_validade ? 'Válido até (obrigatório)' : 'Válido até (se houver)'}
                            value={validade} onChange={(e) => setValidade(e.target.value)} InputLabelProps={{ shrink: true }} />
                    )}
                </Stack>
                <Typography variant="caption" sx={{ color: cores.textoSecundario }}>PDF, JPG ou PNG, até 10 MB.</Typography>
                <Box>
                    <NeonButton loading={enviando} disabled={!tipo || !arquivo} onClick={enviar}>Enviar documento</NeonButton>
                </Box>
            </Stack>
        </Box>
    );
};

export default EnviarDocumento;
