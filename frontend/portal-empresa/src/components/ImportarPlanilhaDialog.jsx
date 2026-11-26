import React, { useEffect, useState } from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, Grid, Stack, Typography } from '@mui/material';
import { FileDownload as DownloadIcon, UploadFile as UploadIcon } from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import api, { baixarArquivo, dadosDe, erroDe } from '../services/api';
import TituloModal from './common/TituloModal';
import NeonButton from './common/NeonButton';
import { botaoSecundario, cores } from '../styles/tokens';

const Numero = ({ valor, rotulo, cor }) => (
    <Box sx={{ p: 1.5, borderRadius: 1.5, border: `1px solid ${cores.borda}`, bgcolor: cores.superficieElevada }}>
        <Typography sx={{ color: cor, fontWeight: 700, fontSize: '1.25rem' }}>{valor}</Typography>
        <Typography variant="caption" sx={{ color: cores.textoSecundario }}>{rotulo}</Typography>
    </Box>
);

/** Importa a planilha da equipe (modelo do evento): cada linha vira pré-cadastro da empresa. */
const ImportarPlanilhaDialog = ({ open, onClose, onImportado }) => {
    const { enqueueSnackbar } = useSnackbar();
    const [arquivo, setArquivo] = useState(null);
    const [enviando, setEnviando] = useState(false);
    const [resultado, setResultado] = useState(null);

    useEffect(() => { if (open) { setArquivo(null); setResultado(null); } }, [open]);

    const importar = async () => {
        setEnviando(true);
        try {
            const form = new FormData();
            form.append('arquivo', arquivo);
            const r = dadosDe(await api.post('/planilha/importar', form, { headers: { 'Content-Type': 'multipart/form-data' } }));
            setResultado(r);
            onImportado?.();
        } catch (err) {
            enqueueSnackbar(erroDe(err, 'Erro ao importar a planilha.'), { variant: 'error' });
        } finally {
            setEnviando(false);
        }
    };

    return (
        <Dialog open={open} onClose={() => !enviando && onClose()} maxWidth="sm" fullWidth disableRestoreFocus
            PaperProps={{ sx: { bgcolor: cores.superficie, border: `1px solid ${cores.borda}`, backgroundImage: 'none' } }}>
            <TituloModal titulo="Importar planilha da equipe" onFechar={onClose} desabilitarFechar={enviando} />
            <DialogContent sx={{ p: 3 }}>
                <Stack spacing={2.5}>
                    <Typography variant="body2" sx={{ color: cores.texto }}>
                        Use o modelo do evento. Cada linha vira um pré-cadastro: a pessoa abre o link de cadastro, digita o CPF,
                        confere os dados e conclui. CPF já cadastrado na empresa é atualizado; quem já concluiu só tem o vazio preenchido.
                    </Typography>
                    <Box>
                        <Button variant="outlined" startIcon={<DownloadIcon />} sx={botaoSecundario}
                            onClick={() => baixarArquivo('/planilha/modelo', 'Modelo_participantes.xlsx').catch(e => enqueueSnackbar(e.message, { variant: 'error' }))}>
                            Baixar modelo
                        </Button>
                    </Box>
                    <Box>
                        <Button component="label" variant="outlined" startIcon={<UploadIcon />} sx={botaoSecundario} disabled={enviando}>
                            {arquivo ? arquivo.name : 'Escolher planilha (.xlsx)'}
                            <input hidden type="file" accept=".xlsx" onChange={(e) => { setArquivo(e.target.files?.[0] || null); setResultado(null); e.target.value = ''; }} />
                        </Button>
                    </Box>
                    {resultado && (
                        <Stack spacing={1.5}>
                            <Grid container spacing={1.5}>
                                <Grid item xs={6} sm={3}><Numero valor={resultado.criados} rotulo="Novos" cor={cores.sucesso} /></Grid>
                                <Grid item xs={6} sm={3}><Numero valor={resultado.atualizados} rotulo="Atualizados" cor={cores.primaria} /></Grid>
                                <Grid item xs={6} sm={3}><Numero valor={resultado.ignorados} rotulo="Sem mudança" cor={cores.textoSecundario} /></Grid>
                                <Grid item xs={6} sm={3}><Numero valor={resultado.erros.length} rotulo="Com erro" cor={resultado.erros.length ? cores.erro : cores.textoSecundario} /></Grid>
                            </Grid>
                            {resultado.erros.length > 0 && (
                                <Box sx={{ maxHeight: 220, overflowY: 'auto', p: 1.5, borderRadius: 1.5, border: `1px solid ${cores.borda}` }}>
                                    {resultado.erros.map(e => (
                                        <Typography key={`${e.linha}-${e.motivo}`} variant="body2" sx={{ color: cores.texto }}>
                                            <b style={{ color: cores.erro }}>Linha {e.linha}:</b> {e.motivo}
                                        </Typography>
                                    ))}
                                </Box>
                            )}
                        </Stack>
                    )}
                </Stack>
            </DialogContent>
            <DialogActions sx={{ p: 2.5, borderTop: `1px solid ${cores.borda}` }}>
                <NeonButton variant="outlined" onClick={onClose} disabled={enviando} sx={botaoSecundario}>Fechar</NeonButton>
                <NeonButton loading={enviando} disabled={!arquivo} onClick={importar}>Importar</NeonButton>
            </DialogActions>
        </Dialog>
    );
};

export default ImportarPlanilhaDialog;
