import React from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { DeleteForeverRounded as ExcluirIcon, DownloadRounded as BaixarIcon, CheckCircleRounded as OkIcon } from '@mui/icons-material';
import { cores, tom } from '../../styles/tokens';

/**
 * Exclusão de evento em duas etapas: 1) baixar o registro no PC do admin; 2) excluir.
 * O botão Excluir só fica habilitado com estado 'baixado' (o download foi disparado sem erro).
 */
const ExcluirEventoDialog = ({ open, nomeEvento, estado, erro, onBaixar, onExcluir, onCancel, loading }) => {
    const baixando = estado === 'gerando';
    const baixado = estado === 'baixado';
    const travado = loading || baixando;

    return (
        <Dialog open={open} onClose={travado ? undefined : onCancel} maxWidth="sm" fullWidth>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box sx={{ width: 36, height: 36, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: tom(cores.erro, 0.14), color: cores.erro, flexShrink: 0 }}>
                    <ExcluirIcon fontSize="small" />
                </Box>
                Excluir evento definitivamente
            </DialogTitle>
            <DialogContent>
                <Typography variant="body2" sx={{ color: cores.textoSuave, mb: 2 }}>
                    {nomeEvento ? <strong>{nomeEvento}</strong> : 'Este evento'} e os dados dele serão apagados do sistema, sem como desfazer.
                    Para só pausar o evento, use o botão Ativo/Inativo no card.
                </Typography>

                <Typography variant="body2" sx={{ color: cores.textoSuave, mb: 2 }}>
                    <strong>Passo 1.</strong> Baixe o registro do evento no seu computador: dados do evento, pessoas, empresas,
                    acessos (entradas e saídas), pulseiras e o registro de atividades da Central. A exclusão só é liberada depois do download.
                </Typography>

                {erro && (
                    <Alert severity="error" sx={{ mb: 2 }}>{erro}</Alert>
                )}

                {baixado && (
                    <Alert severity="success" icon={<OkIcon fontSize="inherit" />} sx={{ mb: 2 }}>
                        Registro baixado. Confira o arquivo JSON na pasta de downloads do navegador antes de continuar.
                    </Alert>
                )}

                <Button
                    variant={baixado ? 'outlined' : 'contained'}
                    startIcon={<BaixarIcon />}
                    onClick={onBaixar}
                    disabled={travado}
                    sx={{ mb: 2 }}
                >
                    {baixando ? 'Gerando registro...' : baixado ? 'Baixar de novo' : 'Baixar registro do evento (JSON)'}
                </Button>

                <Typography variant="body2" sx={{ color: cores.textoSuave }}>
                    <strong>Passo 2.</strong> {baixado
                        ? 'Agora você pode excluir.'
                        : 'O botão de excluir libera depois do registro baixado.'}
                </Typography>
            </DialogContent>
            <DialogActions>
                <Button onClick={onCancel} disabled={travado} sx={{ color: cores.textoSecundario }}>
                    Cancelar
                </Button>
                <Button
                    variant="contained"
                    color="error"
                    onClick={onExcluir}
                    disabled={!baixado || travado}
                >
                    {loading ? 'Excluindo...' : 'Excluir definitivamente'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default ExcluirEventoDialog;
