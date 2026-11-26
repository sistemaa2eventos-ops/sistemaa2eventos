import React from 'react';
import { Box, Button, Chip, Stack, Typography } from '@mui/material';
import { OpenInNew as AbrirIcon } from '@mui/icons-material';
import { STATUS_DOCUMENTO, chipSx, dataBr, dataHora } from '../util';
import { cores } from '../styles/tokens';

/**
 * Documentos enviados, com a situação de cada um e o motivo quando a auditoria recusou.
 * onPedirExclusao(doc): pede à organização para excluir (o responsável não exclui sozinho).
 */
const ListaDocumentos = ({ documentos = [], onPedirExclusao }) => {
    if (!documentos.length) {
        return <Typography variant="body2" sx={{ color: cores.textoSecundario }}>Nenhum documento enviado ainda.</Typography>;
    }
    return (
        <Stack spacing={1}>
            {documentos.map(d => {
                const st = STATUS_DOCUMENTO[d.status] || STATUS_DOCUMENTO.pendente;
                return (
                    <Box key={d.id} sx={{ p: 1.5, borderRadius: 1.5, border: `1px solid ${cores.borda}`, bgcolor: cores.superficieElevada }}>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ sm: 'center' }}>
                            <Box sx={{ minWidth: 0 }}>
                                <Typography variant="body2" sx={{ fontWeight: 700, color: cores.textoForte }}>{d.tipo_nome || d.titulo}</Typography>
                                <Typography variant="caption" sx={{ color: cores.textoSecundario }}>
                                    Enviado em {dataHora(d.data_inclusao)}{d.data_validade ? ` · válido até ${dataBr(d.data_validade)}` : ''}
                                </Typography>
                            </Box>
                            <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0 }}>
                                <Chip size="small" label={st.rotulo} sx={chipSx(st.cor)} />
                                {d.url && (
                                    <Button size="small" startIcon={<AbrirIcon fontSize="small" />} href={d.url} target="_blank" rel="noopener noreferrer" sx={{ textTransform: 'none' }}>
                                        Abrir
                                    </Button>
                                )}
                                {onPedirExclusao && (
                                    <Button size="small" onClick={() => onPedirExclusao(d)} sx={{ textTransform: 'none', color: cores.erro }}>
                                        Pedir exclusão
                                    </Button>
                                )}
                            </Stack>
                        </Stack>
                        {d.motivo_recusa && (
                            <Typography variant="body2" sx={{ color: cores.erro, mt: 1 }}>Motivo da auditoria: {d.motivo_recusa}</Typography>
                        )}
                    </Box>
                );
            })}
        </Stack>
    );
};

export default ListaDocumentos;
