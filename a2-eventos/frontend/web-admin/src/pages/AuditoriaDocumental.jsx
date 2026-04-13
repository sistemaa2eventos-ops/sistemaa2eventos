import React, { useState, useEffect } from 'react';
import { useSnackbar } from 'notistack';
import { Box, Typography, Button, IconButton, Stack, Card, CardContent, Grid, Chip, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Divider } from '@mui/material';
import {
    CheckCircle as CheckIcon,
    Cancel as RejectIcon,
    Visibility as ViewIcon,
    AssignmentTurnedIn as AssigIcon
} from '@mui/icons-material';
import PageHeader from '../components/common/PageHeader';
import GlassCard from '../components/common/GlassCard';
import NeonButton from '../components/common/NeonButton';
import DataTable from '../components/common/DataTable';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const AuditoriaDocumental = () => {
    const { enqueueSnackbar } = useSnackbar();
    const { user } = useAuth();
    const [documentos, setDocumentos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedDoc, setSelectedDoc] = useState(null);
    const [openDialog, setOpenDialog] = useState(false);
    const [notasAuditoria, setNotasAuditoria] = useState('');
    const [acao, setAcao] = useState(''); // 'aprovado' ou 'rejeitado'
    const [submitting, setSubmitting] = useState(false);
    const [dataEmissao, setDataEmissao] = useState('');
    const [dataValidade, setDataValidade] = useState('');
    const [selectedDocs, setSelectedDocs] = useState([]);
    const [isBatch, setIsBatch] = useState(false);

    // Estados de Paginação e Busca
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [totalCount, setTotalCount] = useState(0);
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    // Efeito de Debounce para Busca
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(search);
            setPage(0); // Volta para primeira página ao buscar
        }, 400);
        return () => clearTimeout(timer);
    }, [search]);

    useEffect(() => {
        loadDocumentos();
    }, [page, rowsPerPage, debouncedSearch]);

    const loadDocumentos = async () => {
        try {
            setLoading(true);
            const resp = await api.get('/documentos/pendentes', {
                params: {
                    page: page + 1,
                    limit: rowsPerPage,
                    search: debouncedSearch
                }
            });
            setDocumentos(resp.data.data || []);
            setTotalCount(resp.data.metadata?.total || 0);
        } catch (error) {
            enqueueSnackbar('Erro ao buscar documentos pendentes.', { variant: 'error' });
        } finally {
            setLoading(false);
        }
    };


    const handleAction = (doc, actionType) => {
        setSelectedDoc(doc);
        setIsBatch(false);
        setAcao(actionType);
        setNotasAuditoria('');
        setDataEmissao('');
        setDataValidade('');
        setOpenDialog(true);
    };

    const handleBatchAction = (actionType) => {
        setIsBatch(true);
        setAcao(actionType);
        setNotasAuditoria('');
        setDataEmissao('');
        setDataValidade('');
        setOpenDialog(true);
    };

    const confirmAction = async () => {
        try {
            setSubmitting(true);

            if (isBatch) {
                const payloadDocs = selectedDocs.map(id => {
                    const d = documentos.find(doc => doc.id === id);
                    return { id: d.id, tipo_entidade: d.tipo_entidade };
                });

                await api.patch('/documentos/batch/auditar', {
                    documentos: payloadDocs,
                    status: acao,
                    notas_auditoria: notasAuditoria,
                    data_emissao: dataEmissao || null,
                    data_validade: dataValidade || null
                });
                setSelectedDocs([]);
            } else {
                await api.patch(`/documentos/${selectedDoc.tipo_entidade}/${selectedDoc.id}/auditar`, {
                    status: acao,
                    notas_auditoria: notasAuditoria,
                    data_emissao: dataEmissao || null,
                    data_validade: dataValidade || null
                });
            }

            setOpenDialog(false);
            enqueueSnackbar(`Documento(s) ${acao === 'aprovado' ? 'aprovado(s)' : 'rejeitado(s)'} com sucesso.`, { variant: 'success' });
            loadDocumentos();
        } catch (error) {
            enqueueSnackbar(error.response?.data?.error || 'Falha ao auditar documento.', { variant: 'error' });
        } finally {
            setSubmitting(false);
        }
    };

    const viewDocument = (url) => {
        window.open(url, '_blank');
    };

    const columns = [
        {
            id: 'entidade_nome',
            label: 'NOME (EMPRESA/PESSOA)',
            minWidth: 200,
            format: (val, row) => (
                <Box>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>{val}</Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>Doc: {row.entidade_doc}</Typography>
                </Box>
            )
        },
        {
            id: 'tipo_entidade',
            label: 'TIPO',
            minWidth: 100,
            format: (val) => (
                <Chip
                    label={val.toUpperCase()}
                    size="small"
                    sx={{
                        bgcolor: val === 'empresa' ? 'rgba(0,212,255,0.1)' : 'rgba(123,47,190,0.1)',
                        color: val === 'empresa' ? '#00D4FF' : '#7B2FBE',
                        fontWeight: 700,
                        border: 'none'
                    }}
                />
            )
        },
        {
            id: 'titulo',
            label: 'TÍTULO / TIPO DOC',
            minWidth: 200,
            format: (val, row) => (
                <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{val}</Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>{row.tipo_doc}</Typography>
                </Box>
            )
        },
        {
            id: 'data_inclusao',
            label: 'DATA UPLOAD',
            minWidth: 150,
            format: (val) => new Date(val).toLocaleDateString()
        },
        {
            id: 'acoes',
            label: 'AÇÕES DE AUDITORIA',
            minWidth: 180,
            align: 'right',
            format: (val, row) => (
                <Stack direction="row" spacing={1} justifyContent="flex-end">
                    <IconButton size="small" onClick={() => viewDocument(row.url_arquivo)} sx={{ color: '#00D4FF', bgcolor: 'rgba(0,212,255,0.1)' }} title="Visualizar Arquivo">
                        <ViewIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={() => handleAction(row, 'aprovado')} sx={{ color: '#00FF88', bgcolor: 'rgba(0,255,136,0.1)' }} title="Aprovar">
                        <CheckIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={() => handleAction(row, 'rejeitado')} sx={{ color: '#FF3366', bgcolor: 'rgba(255,51,102,0.1)' }} title="Rejeitar">
                        <RejectIcon fontSize="small" />
                    </IconButton>
                </Stack>
            )
        }
    ];

    return (
        <Box sx={{ p: 4 }}>
            <PageHeader
                title="Auditoria Documental (ECM)"
                subtitle="Fila de aprovação de documentos operacionais. Analise NRs, ASOs e contratos pendentes."
                breadcrumbs={[{ text: 'Dashboard' }, { text: 'Auditoria' }]}
            />

            <Box sx={{ mt: 3, mb: 2 }}>
                <TextField
                    fullWidth
                    variant="outlined"
                    placeholder="Buscar por título, nome da entidade ou tipo de documento..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    sx={{
                        bgcolor: 'rgba(255,255,255,0.02)',
                        borderRadius: 2,
                        '& .MuiOutlinedInput-root': {
                            color: '#fff',
                            '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
                            '&:hover fieldset': { borderColor: '#00D4FF' },
                        }
                    }}
                />
            </Box>

            <GlassCard sx={{ p: 3, mt: 3, position: 'relative' }}>
                {/* Batch Action Toolbar */}
                {selectedDocs.length > 0 && (
                    <Box sx={{
                        position: 'absolute',
                        top: -20,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        zIndex: 10,
                        backgroundColor: 'rgba(20, 20, 30, 0.95)',
                        border: '1px solid rgba(0, 212, 255, 0.3)',
                        borderRadius: 8,
                        boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                        px: 3, py: 1.5,
                        display: 'flex', alignItems: 'center', gap: 2,
                        backdropFilter: 'blur(10px)'
                    }}>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: '#fff' }}>
                            {selectedDocs.length} selecionado(s)
                        </Typography>
                        <Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(255,255,255,0.2)' }} />
                        <Button
                            size="small"
                            variant="contained"
                            color="success"
                            startIcon={<CheckIcon />}
                            onClick={() => handleBatchAction('aprovado')}
                            sx={{ borderRadius: 4, textTransform: 'none', fontWeight: 600 }}
                        >
                            Aprovar Lote
                        </Button>
                        <Button
                            size="small"
                            variant="contained"
                            color="error"
                            startIcon={<RejectIcon />}
                            onClick={() => handleBatchAction('rejeitado')}
                            sx={{ borderRadius: 4, textTransform: 'none', fontWeight: 600 }}
                        >
                            Rejeitar Lote
                        </Button>
                    </Box>
                )}

                {documentos.length === 0 && !loading ? (
                    <Box sx={{ textAlign: 'center', py: 8 }}>
                        <AssigIcon sx={{ fontSize: 60, color: '#00FF88', mb: 2, opacity: 0.5 }} />
                        <Typography variant="h6" sx={{ color: '#00FF88', fontWeight: 700 }}>FILA ZERO</Typography>
                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>Não há documentos pendentes de análise no momento.</Typography>
                    </Box>
                ) : (
                    <DataTable
                        columns={columns}
                        data={documentos}
                        loading={loading}
                        checkboxSelection={true}
                        selected={selectedDocs}
                        onSelectionChange={setSelectedDocs}
                        page={page}
                        rowsPerPage={rowsPerPage}
                        totalCount={totalCount}
                        onPageChange={(e, newPage) => setPage(newPage)}
                        onRowsPerPageChange={(e) => {
                            setRowsPerPage(parseInt(e.target.value, 10));
                            setPage(0);
                        }}
                        sx={{ '& .MuiTableHead-root': { background: 'rgba(255,184,0,0.05)' } }}
                    />
                )}
            </GlassCard>

            <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ color: acao === 'aprovado' ? '#00FF88' : '#FF3366', fontFamily: '"Orbitron", sans-serif', fontWeight: 700 }}>
                    {acao === 'aprovado' ? 'APROVAR DOCUMENTO(S)' : 'REJEITAR DOCUMENTO(S)'}
                </DialogTitle>
                <DialogContent>
                    <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <Typography variant="body2" sx={{ color: '#fff' }}>
                            {isBatch ? (
                                <>Você está prestes a <b>{acao.toUpperCase()}</b> um lote de <b>{selectedDocs.length}</b> documentos.</>
                            ) : (
                                <>Você está prestes a <b>{acao.toUpperCase()}</b> o documento <i style={{ color: '#00D4FF' }}>{selectedDoc?.titulo}</i> de <b>{selectedDoc?.entidade_nome}</b>.</>
                            )}
                        </Typography>
                        {acao === 'rejeitado' && (
                            <Typography variant="caption" sx={{ color: '#FFB800' }}>
                                A rejeição tornará o status do participante/empresa como irregular perante o Controle de Risco Operacional.
                            </Typography>
                        )}
                        {acao === 'aprovado' && (
                            <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <TextField
                                    label="Confirmar / Alterar Tipo de Documento"
                                    fullWidth
                                    value={dataValidade} // Usando o estado existente como solicitado para manter valor
                                    onChange={(e) => setDataValidade(e.target.value)}
                                    helperText="Caso precise corrigir o nome do documento (Ex: NR-35)"
                                />
                                <TextField
                                    label="Data de Emissão (Opcional)"
                                    type="date"
                                    InputLabelProps={{ shrink: true }}
                                    fullWidth
                                    value={dataEmissao}
                                    onChange={(e) => setDataEmissao(e.target.value)}
                                />
                                {/* O campo data_validade foi ocultado da UI conforme solicitação, mas o estado é mantido internamente se necessário em versões futuras */}
                            </Box>
                        )}
                        <TextField
                            label="Notas de Auditoria (Motivo / Observações)"
                            fullWidth
                            multiline
                            rows={3}
                            value={notasAuditoria}
                            onChange={(e) => setNotasAuditoria(e.target.value)}
                            required={acao === 'rejeitado'}
                            sx={{ mt: 2 }}
                        />
                    </Box>
                </DialogContent>
                <DialogActions sx={{ p: 3 }}>
                    <Button onClick={() => setOpenDialog(false)} sx={{ color: 'text.secondary' }}>CANCELAR</Button>
                    <NeonButton
                        onClick={confirmAction}
                        loading={submitting}
                    >
                        CONFIRMAR {acao.toUpperCase()}
                    </NeonButton>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default AuditoriaDocumental;
