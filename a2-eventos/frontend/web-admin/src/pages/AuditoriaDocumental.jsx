import React, { useState, useEffect, useCallback } from 'react';
import { useSnackbar } from 'notistack';
import {
    Box, Typography, Button, IconButton, Stack, Card, CardContent,
    Grid, Chip, Dialog, DialogTitle, DialogContent, DialogActions,
    TextField, Divider, Tooltip, MenuItem, Select, FormControl,
    InputLabel, CircularProgress, Alert
} from '@mui/material';
import {
    CheckCircle as CheckIcon,
    Cancel as RejectIcon,
    Visibility as ViewIcon,
    AssignmentTurnedIn as AssigIcon,
    HourglassEmpty as PendingIcon,
    Replay as ResubmitIcon,
    VerifiedUser as ApprovedIcon,
    Block as BlockIcon,
    Search as SearchIcon,
    OpenInNew as OpenInNewIcon,
    ZoomIn as ZoomInIcon,
    Close as CloseIcon
} from '@mui/icons-material';
import PageHeader from '../components/common/PageHeader';
import GlassCard from '../components/common/GlassCard';
import NeonButton from '../components/common/NeonButton';
import DataTable from '../components/common/DataTable';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const MOTIVOS_REENVIO = [
    'Foto cortada ou ilegível (não é possível ler os dados)',
    'Falta o verso do documento (RG / CNH)',
    'Documento não corresponde ao tipo solicitado',
    'Certidão / ASO com assinatura ou CRM ausente',
    'Outro (especificado nas notas)'
];

const MOTIVOS_REPROVACAO = [
    'Documento com validade expirada / vencido',
    'Nome ou CPF divergente do cadastro do colaborador',
    'Documento rasurado ou indício de adulteração',
    'Pessoa não possui os pré-requisitos para a função',
    'Outro (especificado nas notas)'
];

const AuditoriaDocumental = () => {
    const { enqueueSnackbar } = useSnackbar();
    const { user } = useAuth();

    // Dados e Listagem
    const [documentos, setDocumentos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({ total: 0, pendentes: 0, aprovados: 0, reprovados: 0, reenvio_solicitado: 0 });
    const [loadingStats, setLoadingStats] = useState(false);

    // Modal de Análise / Visualização
    const [previewDoc, setPreviewDoc] = useState(null);
    const [openPreview, setOpenPreview] = useState(false);

    // Modal de Ação / Confirmação
    const [actionDoc, setActionDoc] = useState(null);
    const [openActionDialog, setOpenActionDialog] = useState(false);
    const [acao, setAcao] = useState('aprovado'); // 'aprovado', 'reprovado', 'reenvio_solicitado'
    const [notasAuditoria, setNotasAuditoria] = useState('');
    const [motivoPredefinido, setMotivoPredefinido] = useState('');
    const [dataEmissao, setDataEmissao] = useState('');
    const [submitting, setSubmitting] = useState(false);

    // Seleção em Lote
    const [selectedDocs, setSelectedDocs] = useState([]);
    const [isBatch, setIsBatch] = useState(false);

    // Paginação e Busca
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [totalCount, setTotalCount] = useState(0);
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(search);
            setPage(0);
        }, 350);
        return () => clearTimeout(timer);
    }, [search]);

    const loadStats = useCallback(async () => {
        try {
            setLoadingStats(true);
            const resp = await api.get('/documentos/estatisticas');
            if (resp.data?.data) {
                setStats(resp.data.data);
            }
        } catch (err) {
            console.warn('Erro ao carregar estatísticas:', err.message);
        } finally {
            setLoadingStats(false);
        }
    }, []);

    const loadDocumentos = useCallback(async () => {
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
    }, [page, rowsPerPage, debouncedSearch, enqueueSnackbar]);

    useEffect(() => {
        loadDocumentos();
        loadStats();
    }, [loadDocumentos, loadStats]);

    // Abrir Modal de Decisão (Individual ou Lote)
    const handleOpenAction = (docOrList, actionType, batchMode = false) => {
        setAcao(actionType);
        setIsBatch(batchMode);
        setNotasAuditoria('');
        setMotivoPredefinido('');
        setDataEmissao('');

        if (batchMode) {
            setActionDoc(null);
        } else {
            setActionDoc(docOrList);
        }
        setOpenActionDialog(true);
    };

    // Abrir Modal de Visualização & Análise Rápida
    const handleQuickPreview = (doc) => {
        setPreviewDoc(doc);
        setOpenPreview(true);
    };

    // Confirmar Ação (Aprovar, Reprovar, Reenvio)
    const confirmAction = async () => {
        try {
            setSubmitting(true);

            // Montar motivo/notas
            const notaFinal = motivoPredefinido
                ? `[${motivoPredefinido}] ${notasAuditoria}`.trim()
                : notasAuditoria.trim();

            if ((acao === 'reprovado' || acao === 'reenvio_solicitado') && !notaFinal) {
                enqueueSnackbar('Por favor, informe ou selecione o motivo da reprovação/solicitação de reenvio.', { variant: 'warning' });
                setSubmitting(false);
                return;
            }

            if (isBatch) {
                const payloadDocs = selectedDocs.map(id => {
                    const d = Array.isArray(documentos) ? documentos.find(doc => doc.id === id) : null;
                    return d ? { id: d.id, tipo_entidade: d.tipo_entidade } : null;
                }).filter(Boolean);

                await api.patch('/documentos/batch/auditar', {
                    documentos: payloadDocs,
                    status: acao,
                    notas_auditoria: notaFinal,
                    data_emissao: dataEmissao || null
                });
                setSelectedDocs([]);
            } else {
                await api.patch(`/documentos/${actionDoc.tipo_entidade}/${actionDoc.id}/auditar`, {
                    status: acao,
                    notas_auditoria: notaFinal,
                    data_emissao: dataEmissao || null
                });
            }

            setOpenActionDialog(false);
            if (openPreview) setOpenPreview(false);

            const labelAcao = acao === 'aprovado' ? 'aprovado(s)' : acao === 'reenvio_solicitado' ? 'marcado(s) para reenvio' : 'reprovado(s)';
            enqueueSnackbar(`Documento(s) ${labelAcao} com sucesso!`, { variant: 'success' });

            loadDocumentos();
            loadStats();
        } catch (error) {
            enqueueSnackbar(error.response?.data?.error || 'Falha ao processar auditoria.', { variant: 'error' });
        } finally {
            setSubmitting(false);
        }
    };

    const isPdf = (url) => {
        if (!url) return false;
        return url.toLowerCase().includes('.pdf') || url.toLowerCase().includes('application/pdf');
    };

    const columns = [
        {
            id: 'entidade_nome',
            label: 'NOME (COLABORADOR / EMPRESA)',
            minWidth: 220,
            format: (val, row) => (
                <Box sx={{ cursor: 'pointer' }} onClick={() => handleQuickPreview(row)}>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: '#fff', '&:hover': { color: '#00D4FF' } }}>
                        {String(val || 'Nome Indisponível')}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)' }}>
                        Doc: {String(row.entidade_doc || '—')}
                    </Typography>
                </Box>
            )
        },
        {
            id: 'tipo_entidade',
            label: 'TIPO',
            minWidth: 100,
            format: (val) => (
                <Chip
                    label={(val || 'PESSOA').toUpperCase()}
                    size="small"
                    sx={{
                        bgcolor: val === 'empresa' ? 'rgba(0,212,255,0.15)' : 'rgba(123,47,190,0.15)',
                        color: val === 'empresa' ? '#00D4FF' : '#B266FF',
                        fontWeight: 700,
                        border: '1px solid',
                        borderColor: val === 'empresa' ? 'rgba(0,212,255,0.3)' : 'rgba(123,47,190,0.3)'
                    }}
                />
            )
        },
        {
            id: 'titulo',
            label: 'DOCUMENTO',
            minWidth: 180,
            format: (val, row) => (
                <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#fff' }}>{val || 'Sem Título'}</Typography>
                    <Typography variant="caption" sx={{ color: '#00D4FF', fontWeight: 600 }}>{row.tipo_doc}</Typography>
                </Box>
            )
        },
        {
            id: 'data_inclusao',
            label: 'SUBMISSÃO',
            minWidth: 120,
            format: (val) => (
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)' }}>
                    {val ? new Date(val).toLocaleDateString('pt-BR') : '—'}
                </Typography>
            )
        },
        {
            id: 'acoes',
            label: 'AÇÕES RÁPIDAS',
            minWidth: 200,
            align: 'right',
            format: (val, row) => (
                <Stack direction="row" spacing={1} justifyContent="flex-end">
                    <Tooltip title="Visualizar & Auditar">
                        <IconButton
                            size="small"
                            onClick={() => handleQuickPreview(row)}
                            sx={{ color: '#00D4FF', bgcolor: 'rgba(0,212,255,0.1)', '&:hover': { bgcolor: 'rgba(0,212,255,0.25)' } }}
                        >
                            <ViewIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>

                    <Tooltip title="Aprovar Documento">
                        <IconButton
                            size="small"
                            onClick={() => handleOpenAction(row, 'aprovado')}
                            sx={{ color: '#00FF88', bgcolor: 'rgba(0,255,136,0.1)', '&:hover': { bgcolor: 'rgba(0,255,136,0.25)' } }}
                        >
                            <CheckIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>

                    <Tooltip title="Solicitar Reenvio (Ilegível / Incorreto)">
                        <IconButton
                            size="small"
                            onClick={() => handleOpenAction(row, 'reenvio_solicitado')}
                            sx={{ color: '#FFAA00', bgcolor: 'rgba(255,170,0,0.1)', '&:hover': { bgcolor: 'rgba(255,170,0,0.25)' } }}
                        >
                            <ResubmitIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>

                    <Tooltip title="Reprovar Documento">
                        <IconButton
                            size="small"
                            onClick={() => handleOpenAction(row, 'reprovado')}
                            sx={{ color: '#FF3366', bgcolor: 'rgba(255,51,102,0.1)', '&:hover': { bgcolor: 'rgba(255,51,102,0.25)' } }}
                        >
                            <RejectIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </Stack>
            )
        }
    ];

    return (
        <Box sx={{ p: { xs: 2, md: 4 } }}>
            <PageHeader
                title="Auditoria Digital de Documentos"
                subtitle="Fila de conferência de documentos operacionais (ASO, NR-10/35, RG, Contratos). Aprove ou solicite reenvio em tempo real."
                breadcrumbs={[{ text: 'Dashboard' }, { text: 'Auditoria' }]}
            />

            {/* 4 Cards de Métricas no Topo */}
            <Grid container spacing={2.5} sx={{ mt: 1, mb: 3 }}>
                <Grid item xs={12} sm={6} md={3}>
                    <GlassCard sx={{ p: 2.5, borderLeft: '4px solid #FFAA00' }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Box>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 700, letterSpacing: '1px' }}>
                                    FILA PENDENTE
                                </Typography>
                                <Typography variant="h4" sx={{ color: '#FFAA00', fontWeight: 900, mt: 0.5 }}>
                                    {stats.pendentes}
                                </Typography>
                            </Box>
                            <PendingIcon sx={{ fontSize: 38, color: '#FFAA00', opacity: 0.8 }} />
                        </Stack>
                    </GlassCard>
                </Grid>

                <Grid item xs={12} sm={6} md={3}>
                    <GlassCard sx={{ p: 2.5, borderLeft: '4px solid #00FF88' }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Box>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 700, letterSpacing: '1px' }}>
                                    APROVADOS
                                </Typography>
                                <Typography variant="h4" sx={{ color: '#00FF88', fontWeight: 900, mt: 0.5 }}>
                                    {stats.aprovados}
                                </Typography>
                            </Box>
                            <ApprovedIcon sx={{ fontSize: 38, color: '#00FF88', opacity: 0.8 }} />
                        </Stack>
                    </GlassCard>
                </Grid>

                <Grid item xs={12} sm={6} md={3}>
                    <GlassCard sx={{ p: 2.5, borderLeft: '4px solid #00D4FF' }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Box>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 700, letterSpacing: '1px' }}>
                                    REENVIO SOLICITADO
                                </Typography>
                                <Typography variant="h4" sx={{ color: '#00D4FF', fontWeight: 900, mt: 0.5 }}>
                                    {stats.reenvio_solicitado}
                                </Typography>
                            </Box>
                            <ResubmitIcon sx={{ fontSize: 38, color: '#00D4FF', opacity: 0.8 }} />
                        </Stack>
                    </GlassCard>
                </Grid>

                <Grid item xs={12} sm={6} md={3}>
                    <GlassCard sx={{ p: 2.5, borderLeft: '4px solid #FF3366' }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Box>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 700, letterSpacing: '1px' }}>
                                    REPROVADOS
                                </Typography>
                                <Typography variant="h4" sx={{ color: '#FF3366', fontWeight: 900, mt: 0.5 }}>
                                    {stats.reprovados}
                                </Typography>
                            </Box>
                            <BlockIcon sx={{ fontSize: 38, color: '#FF3366', opacity: 0.8 }} />
                        </Stack>
                    </GlassCard>
                </Grid>
            </Grid>

            {/* Barra de Busca */}
            <Box sx={{ mb: 2 }}>
                <TextField
                    fullWidth
                    variant="outlined"
                    placeholder="Buscar por colaborador, CPF, empresa ou tipo de documento (Ex: NR-35, ASO, RG)..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    InputProps={{
                        startAdornment: <SearchIcon sx={{ color: 'rgba(255,255,255,0.4)', mr: 1.5 }} />
                    }}
                    sx={{
                        bgcolor: 'rgba(255,255,255,0.03)',
                        borderRadius: 2,
                        '& .MuiOutlinedInput-root': {
                            color: '#fff',
                            '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
                            '&:hover fieldset': { borderColor: '#00D4FF' },
                            '&.Mui-focused fieldset': { borderColor: '#00D4FF' }
                        }
                    }}
                />
            </Box>

            {/* Tabela Principal */}
            <GlassCard sx={{ p: 3, position: 'relative' }}>
                {/* Batch Action Toolbar */}
                {selectedDocs.length > 0 && (
                    <Box sx={{
                        position: 'absolute',
                        top: -24,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        zIndex: 10,
                        backgroundColor: 'rgba(15, 20, 32, 0.98)',
                        border: '1px solid rgba(0, 212, 255, 0.4)',
                        borderRadius: 8,
                        boxShadow: '0 8px 30px rgba(0,0,0,0.7)',
                        px: 3, py: 1.2,
                        display: 'flex', alignItems: 'center', gap: 2,
                        backdropFilter: 'blur(16px)'
                    }}>
                        <Typography variant="body2" sx={{ fontWeight: 800, color: '#00D4FF' }}>
                            {selectedDocs.length} selecionado(s)
                        </Typography>
                        <Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(255,255,255,0.2)' }} />
                        
                        <Button
                            size="small"
                            variant="contained"
                            color="success"
                            startIcon={<CheckIcon />}
                            onClick={() => handleOpenAction(selectedDocs, 'aprovado', true)}
                            sx={{ borderRadius: 4, textTransform: 'none', fontWeight: 700 }}
                        >
                            Aprovar
                        </Button>
                        <Button
                            size="small"
                            variant="contained"
                            color="warning"
                            startIcon={<ResubmitIcon />}
                            onClick={() => handleOpenAction(selectedDocs, 'reenvio_solicitado', true)}
                            sx={{ borderRadius: 4, textTransform: 'none', fontWeight: 700 }}
                        >
                            Reenvio
                        </Button>
                        <Button
                            size="small"
                            variant="contained"
                            color="error"
                            startIcon={<RejectIcon />}
                            onClick={() => handleOpenAction(selectedDocs, 'reprovado', true)}
                            sx={{ borderRadius: 4, textTransform: 'none', fontWeight: 700 }}
                        >
                            Reprovar
                        </Button>
                    </Box>
                )}

                {documentos.length === 0 && !loading ? (
                    <Box sx={{ textAlign: 'center', py: 8 }}>
                        <AssigIcon sx={{ fontSize: 64, color: '#00FF88', mb: 2, opacity: 0.6 }} />
                        <Typography variant="h5" sx={{ color: '#00FF88', fontWeight: 800 }}>FILA ZERO</Typography>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', mt: 1 }}>
                            Parabéns! Todos os documentos enviados foram analisados.
                        </Typography>
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
                    />
                )}
            </GlassCard>

            {/* MODAL 1: PREVIEW RÁPIDO COM VISUALIZADOR EMBUTIDO */}
            <Dialog
                open={openPreview}
                onClose={() => setOpenPreview(false)}
                maxWidth="lg"
                fullWidth
                PaperProps={{
                    sx: {
                        background: 'rgba(12, 16, 28, 0.97)',
                        backdropFilter: 'blur(20px)',
                        border: '1px solid rgba(0, 212, 255, 0.3)',
                        borderRadius: 3,
                        minHeight: '80vh'
                    }
                }}
            >
                {previewDoc && (
                    <>
                        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                            <Box>
                                <Typography variant="h6" sx={{ color: '#fff', fontWeight: 800 }}>
                                    {previewDoc.titulo || 'Visualização do Documento'}
                                </Typography>
                                <Typography variant="caption" sx={{ color: '#00D4FF', fontWeight: 700 }}>
                                    {previewDoc.tipo_doc} • {previewDoc.entidade_nome} ({previewDoc.tipo_entidade?.toUpperCase()})
                                </Typography>
                            </Box>
                            <Stack direction="row" spacing={1} alignItems="center">
                                <IconButton
                                    onClick={() => window.open(previewDoc.url_arquivo, '_blank')}
                                    sx={{ color: '#00D4FF' }}
                                    title="Abrir em Nova Aba"
                                >
                                    <OpenInNewIcon />
                                </IconButton>
                                <IconButton onClick={() => setOpenPreview(false)} sx={{ color: 'rgba(255,255,255,0.6)' }}>
                                    <CloseIcon />
                                </IconButton>
                            </Stack>
                        </DialogTitle>

                        <DialogContent sx={{ p: 3 }}>
                            <Grid container spacing={3} sx={{ height: '100%' }}>
                                {/* Painel Esquerdo: Visualizador */}
                                <Grid item xs={12} md={8}>
                                    <Box sx={{
                                        width: '100%',
                                        height: '65vh',
                                        backgroundColor: 'rgba(0,0,0,0.6)',
                                        borderRadius: 2,
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        overflow: 'hidden',
                                        position: 'relative'
                                    }}>
                                        {isPdf(previewDoc.url_arquivo) ? (
                                            <iframe
                                                src={`${previewDoc.url_arquivo}#toolbar=0`}
                                                title="Visualizador PDF"
                                                style={{ width: '100%', height: '100%', border: 'none' }}
                                            />
                                        ) : (
                                            <img
                                                src={previewDoc.url_arquivo}
                                                alt="Documento do Colaborador"
                                                style={{
                                                    maxWidth: '100%',
                                                    maxHeight: '100%',
                                                    objectFit: 'contain'
                                                }}
                                            />
                                        )}
                                    </Box>
                                </Grid>

                                {/* Painel Direito: Dados e Ações Imediatas */}
                                <Grid item xs={12} md={4}>
                                    <GlassCard sx={{ p: 2.5, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                                        <Box>
                                            <Typography variant="overline" sx={{ color: '#00D4FF', fontWeight: 800, letterSpacing: '1.5px' }}>
                                                DADOS DO TITULAR
                                            </Typography>
                                            <Typography variant="h6" sx={{ color: '#fff', fontWeight: 800, mt: 1 }}>
                                                {previewDoc.entidade_nome}
                                            </Typography>
                                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', mt: 0.5 }}>
                                                Documento / CPF: <b>{previewDoc.entidade_doc || '—'}</b>
                                            </Typography>
                                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)' }}>
                                                Tipo Entidade: <b>{previewDoc.tipo_entidade?.toUpperCase()}</b>
                                            </Typography>
                                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)' }}>
                                                Data de Envio: <b>{new Date(previewDoc.data_inclusao || previewDoc.created_at).toLocaleDateString('pt-BR')}</b>
                                            </Typography>

                                            <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)', my: 2 }} />

                                            <Typography variant="caption" sx={{ color: '#FFAA00', display: 'block', mb: 1, fontWeight: 700 }}>
                                                CRITÉRIOS DE CONFERÊNCIA:
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', display: 'block' }}>
                                                • Nitidez da foto e legibilidade dos dados<br />
                                                • Presença de assinatura/CRM (ASO)<br />
                                                • Validade dentro do período do evento
                                            </Typography>
                                        </Box>

                                        {/* 3 Botões Imediatos no Preview */}
                                        <Stack spacing={1.5} sx={{ mt: 3 }}>
                                            <Button
                                                variant="contained"
                                                color="success"
                                                size="large"
                                                startIcon={<CheckIcon />}
                                                onClick={() => handleOpenAction(previewDoc, 'aprovado')}
                                                sx={{ fontWeight: 800, py: 1.2, textTransform: 'none' }}
                                            >
                                                Aprovar Documento
                                            </Button>

                                            <Button
                                                variant="contained"
                                                color="warning"
                                                size="large"
                                                startIcon={<ResubmitIcon />}
                                                onClick={() => handleOpenAction(previewDoc, 'reenvio_solicitado')}
                                                sx={{ fontWeight: 800, py: 1.2, textTransform: 'none' }}
                                            >
                                                Solicitar Reenvio
                                            </Button>

                                            <Button
                                                variant="contained"
                                                color="error"
                                                size="large"
                                                startIcon={<RejectIcon />}
                                                onClick={() => handleOpenAction(previewDoc, 'reprovado')}
                                                sx={{ fontWeight: 800, py: 1.2, textTransform: 'none' }}
                                            >
                                                Reprovar
                                            </Button>
                                        </Stack>
                                    </GlassCard>
                                </Grid>
                            </Grid>
                        </DialogContent>
                    </>
                )}
            </Dialog>

            {/* MODAL 2: CONFIRMAÇÃO DE AÇÃO / MOTIVO (APROVAR, REENVIAR, REPROVAR) */}
            <Dialog
                open={openActionDialog}
                onClose={() => !submitting && setOpenActionDialog(false)}
                maxWidth="sm"
                fullWidth
                PaperProps={{
                    sx: {
                        background: 'rgba(15, 20, 32, 0.98)',
                        backdropFilter: 'blur(20px)',
                        border: '1px solid',
                        borderColor: acao === 'aprovado' ? '#00FF88' : acao === 'reenvio_solicitado' ? '#FFAA00' : '#FF3366',
                        borderRadius: 3
                    }
                }}
            >
                <DialogTitle sx={{
                    color: acao === 'aprovado' ? '#00FF88' : acao === 'reenvio_solicitado' ? '#FFAA00' : '#FF3366',
                    fontWeight: 800
                }}>
                    {acao === 'aprovado' && 'APROVAR DOCUMENTO'}
                    {acao === 'reenvio_solicitado' && 'SOLICITAR REENVIO DE DOCUMENTO'}
                    {acao === 'reprovado' && 'REPROVAR DOCUMENTO'}
                </DialogTitle>

                <DialogContent>
                    <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <Typography variant="body2" sx={{ color: '#fff' }}>
                            {isBatch ? (
                                <>Aplicando ação para <b>{selectedDocs.length}</b> documento(s) selecionado(s).</>
                            ) : (
                                <>Colaborador/Empresa: <b>{actionDoc?.entidade_nome}</b><br />
                                Documento: <span style={{ color: '#00D4FF' }}>{actionDoc?.titulo} ({actionDoc?.tipo_doc})</span></>
                            )}
                        </Typography>

                        {/* Mensagem Explicativa */}
                        {acao === 'reenvio_solicitado' && (
                            <Alert severity="warning" sx={{ bgcolor: 'rgba(255,170,0,0.1)', color: '#FFAA00' }}>
                                O colaborador receberá notificação no portal de auto-cadastro com o motivo apontado abaixo para reenviar o arquivo correto.
                            </Alert>
                        )}

                        {acao === 'reprovado' && (
                            <Alert severity="error" sx={{ bgcolor: 'rgba(255,51,102,0.1)', color: '#FF3366' }}>
                                O status do colaborador será marcado como irregular, bloqueando seu credenciamento e emissão de pulseira no evento.
                            </Alert>
                        )}

                        {/* Dropdown de Motivos Pré-definidos */}
                        {(acao === 'reenvio_solicitado' || acao === 'reprovado') && (
                            <FormControl fullWidth sx={{ mt: 1 }}>
                                <InputLabel sx={{ color: 'rgba(255,255,255,0.7)' }}>Motivo Pré-definido</InputLabel>
                                <Select
                                    value={motivoPredefinido}
                                    label="Motivo Pré-definido"
                                    onChange={(e) => setMotivoPredefinido(e.target.value)}
                                    sx={{
                                        color: '#fff',
                                        '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' }
                                    }}
                                >
                                    {(acao === 'reenvio_solicitado' ? MOTIVOS_REENVIO : MOTIVOS_REPROVACAO).map((m, idx) => (
                                        <MenuItem key={idx} value={m}>{m}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        )}

                        {/* Data de Emissão (Opcional ao aprovar) */}
                        {acao === 'aprovado' && (
                            <TextField
                                label="Data de Emissão do Documento (Opcional)"
                                type="date"
                                InputLabelProps={{ shrink: true }}
                                fullWidth
                                value={dataEmissao}
                                onChange={(e) => setDataEmissao(e.target.value)}
                                sx={{
                                    mt: 1,
                                    '& .MuiOutlinedInput-root': {
                                        color: '#fff',
                                        '& fieldset': { borderColor: 'rgba(255,255,255,0.2)' }
                                    }
                                }}
                            />
                        )}

                        {/* Campo Livre de Observações/Notas */}
                        <TextField
                            label={acao === 'aprovado' ? 'Observações Internas (Opcional)' : 'Detalhes adicionais do motivo'}
                            fullWidth
                            multiline
                            rows={3}
                            value={notasAuditoria}
                            onChange={(e) => setNotasAuditoria(e.target.value)}
                            placeholder={acao === 'reenvio_solicitado' ? 'Ex: Por favor envie uma foto nítida da frente e do verso.' : 'Observações...'}
                            sx={{
                                '& .MuiOutlinedInput-root': {
                                    color: '#fff',
                                    '& fieldset': { borderColor: 'rgba(255,255,255,0.2)' }
                                }
                            }}
                        />
                    </Box>
                </DialogContent>

                <DialogActions sx={{ p: 3 }}>
                    <Button onClick={() => setOpenActionDialog(false)} sx={{ color: 'rgba(255,255,255,0.6)' }} disabled={submitting}>
                        Cancelar
                    </Button>
                    <NeonButton
                        onClick={confirmAction}
                        loading={submitting}
                    >
                        CONFIRMAR {acao === 'aprovado' ? 'APROVAÇÃO' : acao === 'reenvio_solicitado' ? 'SOLICITAÇÃO' : 'REPROVAÇÃO'}
                    </NeonButton>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default AuditoriaDocumental;
