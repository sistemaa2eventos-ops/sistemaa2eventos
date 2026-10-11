import React, { useState } from 'react';
import {
    Box, Chip, Dialog, DialogContent, DialogTitle, IconButton, Stack, Tooltip, Typography
} from '@mui/material';
import {
    Visibility as ViewIcon, CheckCircle as CheckIcon, Replay as ResubmitIcon,
    Cancel as RejectIcon, Close as CloseIcon, OpenInNew as OpenInNewIcon
} from '@mui/icons-material';
import VisualizadorDocumento from './VisualizadorDocumento';
import { STATUS_DOCUMENTO, chipSx, formatarData, diasAte } from './documentosUtils';

/**
 * Lista de documentos de uma pessoa/empresa com status, tipo, validade e visualização.
 * @param {{ documentos: Array, onAuditar?: (doc, acao) => void, compacto?: boolean }} props
 */
const ListaDocumentos = ({ documentos = [], onAuditar, compacto = false }) => {
    const [aberto, setAberto] = useState(null);
    const [urlAberta, setUrlAberta] = useState(null);

    if (!documentos.length) {
        return (
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', py: 1 }}>
                Nenhum documento enviado.
            </Typography>
        );
    }

    return (
        <>
            <Stack spacing={1}>
                {documentos.map((doc) => {
                    const st = STATUS_DOCUMENTO[doc.status] || STATUS_DOCUMENTO.pendente;
                    const dias = diasAte(doc.data_validade);
                    const corValidade = dias === null ? 'rgba(255,255,255,0.5)' : dias < 0 ? '#FF3366' : dias <= 15 ? '#FFB800' : 'rgba(255,255,255,0.7)';
                    return (
                        <Box key={doc.id} sx={{
                            display: 'flex', alignItems: 'center', gap: 1.5, p: compacto ? 1 : 1.5, borderRadius: 1.5,
                            bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)'
                        }}>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography variant="body2" sx={{ color: '#FFFFFF', fontWeight: 700 }} noWrap>
                                    {doc.tipo_nome || doc.titulo || 'Documento'}
                                </Typography>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.55)' }}>
                                    {doc.tipo_nome && doc.titulo ? `${doc.titulo} · ` : ''}enviado em {formatarData(doc.data_inclusao)}
                                    {doc.data_validade && (
                                        <span style={{ color: corValidade, fontWeight: 700 }}>
                                            {' · '}validade {formatarData(doc.data_validade)}
                                            {dias !== null && (dias < 0 ? ' (vencido)' : dias <= 15 ? ` (${dias}d)` : '')}
                                        </span>
                                    )}
                                </Typography>
                                {doc.notas_auditoria && !compacto && (
                                    <Typography variant="caption" sx={{ display: 'block', color: 'rgba(255,255,255,0.45)', fontStyle: 'italic' }}>
                                        {doc.notas_auditoria}
                                    </Typography>
                                )}
                            </Box>
                            <Chip label={st.label} size="small" sx={chipSx(st.color)} />
                            <Tooltip title="Visualizar">
                                <IconButton size="small" onClick={() => setAberto(doc)} sx={{ color: '#00D4FF' }}>
                                    <ViewIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                            {onAuditar && (
                                <>
                                    <Tooltip title="Aprovar">
                                        <IconButton size="small" onClick={() => onAuditar(doc, 'aprovado')} sx={{ color: '#00FF88' }}>
                                            <CheckIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                    <Tooltip title="Solicitar reenvio">
                                        <IconButton size="small" onClick={() => onAuditar(doc, 'reenvio_solicitado')} sx={{ color: '#FFB800' }}>
                                            <ResubmitIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                    <Tooltip title="Reprovar">
                                        <IconButton size="small" onClick={() => onAuditar(doc, 'reprovado')} sx={{ color: '#FF3366' }}>
                                            <RejectIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                </>
                            )}
                        </Box>
                    );
                })}
            </Stack>

            <Dialog open={!!aberto} onClose={() => setAberto(null)} maxWidth="lg" fullWidth
                PaperProps={{ sx: { background: 'rgba(12,16,28,0.97)', border: '1px solid rgba(0,212,255,0.3)', borderRadius: 1.5 } }}>
                {aberto && (
                    <>
                        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#FFFFFF' }}>
                            <Typography variant="h6" sx={{ fontWeight: 700 }}>{aberto.tipo_nome || aberto.titulo}</Typography>
                            <Box>
                                <IconButton onClick={() => urlAberta && window.open(urlAberta, '_blank')} sx={{ color: '#00D4FF' }} title="Abrir em nova aba">
                                    <OpenInNewIcon />
                                </IconButton>
                                <IconButton onClick={() => setAberto(null)} sx={{ color: 'rgba(255,255,255,0.6)' }}>
                                    <CloseIcon />
                                </IconButton>
                            </Box>
                        </DialogTitle>
                        <DialogContent>
                            <VisualizadorDocumento doc={aberto} onUrl={setUrlAberta} />
                        </DialogContent>
                    </>
                )}
            </Dialog>
        </>
    );
};

export default ListaDocumentos;
