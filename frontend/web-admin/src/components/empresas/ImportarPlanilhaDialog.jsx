import React, { useEffect, useState } from 'react';
import {
    Alert, Box, Button, Dialog, DialogActions, DialogContent, Grid, Stack, Typography
} from '@mui/material';
import { FileDownload as DownloadIcon, UploadFile as UploadIcon } from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import api from '../../services/api';
import TituloModal from '../common/TituloModal';
import NeonButton from '../common/NeonButton';
import { baixarModeloPlanilha } from './planilhaEmpresa';
import { botaoSecundario, cores, tom } from '../../styles/tokens';

const Numero = ({ valor, rotulo, cor }) => (
    <Box sx={{ p: 1.5, borderRadius: 1.5, border: `1px solid ${cores.borda}`, bgcolor: cores.superficieElevada }}>
        <Typography variant="h6" sx={{ color: cor, fontWeight: 700, lineHeight: 1.2 }}>{valor}</Typography>
        <Typography variant="caption" sx={{ color: cores.textoSecundario }}>{rotulo}</Typography>
    </Box>
);

/**
 * Importa a planilha de participantes de uma empresa (modelo do evento). Cada linha vira um
 * pré-cadastro da empresa, que o participante confere e completa pelo link de cadastro.
 */
const ImportarPlanilhaDialog = ({ open, onClose, empresa, onImportado }) => {
    const { enqueueSnackbar } = useSnackbar();
    const [arquivo, setArquivo] = useState(null);
    const [enviando, setEnviando] = useState(false);
    const [resultado, setResultado] = useState(null);

    useEffect(() => {
        if (!open) return;
        setArquivo(null);
        setResultado(null);
    }, [open]);

    const baixarModelo = async () => {
        try {
            await baixarModeloPlanilha(empresa?.id);
        } catch (err) {
            enqueueSnackbar(err.message, { variant: 'error' });
        }
    };

    const importar = async () => {
        if (!arquivo || !empresa?.id) return;
        setEnviando(true);
        try {
            const form = new FormData();
            form.append('arquivo', arquivo);
            const resp = await api.post(`/planilha/empresas/${empresa.id}/importar`, form, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            const r = resp.data?.data;
            setResultado(r);
            enqueueSnackbar(
                `Importação concluída: ${r.criados} novo(s), ${r.atualizados} atualizado(s)${r.erros.length ? `, ${r.erros.length} com erro` : ''}.`,
                { variant: r.erros.length ? 'warning' : 'success' }
            );
            onImportado?.(r);
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Erro ao importar a planilha.', { variant: 'error' });
        } finally {
            setEnviando(false);
        }
    };

    return (
        <Dialog open={open} onClose={() => !enviando && onClose()} maxWidth="sm" fullWidth disableRestoreFocus
            PaperProps={{ sx: { bgcolor: cores.superficie, border: `1px solid ${cores.borda}`, backgroundImage: 'none' } }}>
            <TituloModal
                titulo="Importar planilha"
                subtitulo={empresa?.nome ? `Participantes de ${empresa.nome}` : undefined}
                onFechar={onClose}
                desabilitarFechar={enviando}
            />
            <DialogContent sx={{ p: 3 }}>
                <Stack spacing={2.5}>
                    <Typography variant="body2" sx={{ color: cores.texto }}>
                        Use o modelo do evento. Cada linha vira um pré-cadastro desta empresa: o participante abre o link de cadastro,
                        digita o CPF e os dados aparecem preenchidos para ele conferir, corrigir e completar (foto e documentos).
                    </Typography>
                    <Alert severity="info" sx={{ bgcolor: tom(cores.primaria, 0.05), color: cores.texto, border: '1px solid rgba(0,212,255,0.2)' }}>
                        CPF que já está nesta empresa é atualizado. Se o participante já concluiu o cadastro, a planilha só preenche o que
                        estiver vazio. CPF de outra empresa do evento não é importado.
                    </Alert>

                    <Box>
                        <Button variant="outlined" startIcon={<DownloadIcon />} onClick={baixarModelo} sx={botaoSecundario}>
                            Baixar modelo desta empresa
                        </Button>
                    </Box>

                    <Box>
                        <Button component="label" variant="outlined" startIcon={<UploadIcon />} sx={botaoSecundario} disabled={enviando}>
                            {arquivo ? arquivo.name : 'Escolher planilha (.xlsx)'}
                            <input hidden type="file" accept=".xlsx"
                                onChange={(e) => { setArquivo(e.target.files?.[0] || null); setResultado(null); e.target.value = ''; }} />
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
                                    <Typography variant="subtitle2" sx={{ color: cores.textoForte, fontWeight: 700, mb: 1 }}>
                                        Linhas não importadas
                                    </Typography>
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
