import React, { useState, useEffect, useCallback } from 'react';
import { useSnackbar } from 'notistack';
import { useSearchParams } from 'react-router-dom';
import {
    Box, Typography, Button, IconButton, Stack,
    Grid, Chip, Dialog, DialogTitle, DialogContent, DialogActions,
    TextField, Divider, Tooltip, MenuItem, Select, FormControl,
    InputLabel, Alert, Tabs, Tab
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
    Close as CloseIcon
} from '@mui/icons-material';
import PageHeader from '../components/common/PageHeader';
import GlassCard from '../components/common/GlassCard';
import KpiCard from '../components/common/KpiCard';
import { cores, botaoSecundario } from '../styles/tokens';
import NeonButton from '../components/common/NeonButton';
import DataTable from '../components/common/DataTable';
import api from '../services/api';
import VisualizadorDocumento from '../components/documentos/VisualizadorDocumento';
import AbaColaboradores from '../components/documentos/AbaColaboradores';
import AbaVencimentos from '../components/documentos/AbaVencimentos';

import { comoRotulo } from '../utils/formatadores';
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

    // Dados e Listagem
    const [documentos, setDocumentos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({ total: 0, pendentes: 0, aprovados: 0, reprovados: 0, reenvio_solicitado: 0 });
    const [_loadingStats, setLoadingStats] = useState(false);

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
    const [dataValidade, setDataValidade] = useState('');
    const [tipoDocumentoId, setTipoDocumentoId] = useState('');
    const [tiposDocumento, setTiposDocumento] = useState([]);
    const [submitting, setSubmitting] = useState(false);

    // Abas: 0 = fila, 1 = colaboradores, 2 = vencimentos
    const [searchParams] = useSearchParams();
    const [aba, setAba] = useState(() => ({ colaboradores: 1, vencimentos: 2 }[searchParams.get('aba')] || 0));
    const [recarregarToken, setRecarregarToken] = useState(0);
    const [previewUrl, setPreviewUrl] = useState(null);

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

    // Catálogo de tipos de documento do evento (classificação + validade obrigatória)
    useEffect(() => {
        api.get('/documentos/config')
            .then(resp => setTiposDocumento((resp.data?.data?.tipos || []).filter(t => t.ativo !== false)))
            .catch(() => setTiposDocumento([]));
    }, []);

    const tipoSelecionado = tiposDocumento.find(t => t.id === tipoDocumentoId);

    // Abrir Modal de Decisão (Individual ou Lote)
    const handleOpenAction = (docOrList, actionType, batchMode = false) => {
        setAcao(actionType);
        setIsBatch(batchMode);
        setNotasAuditoria('');
        setMotivoPredefinido('');
        setDataEmissao('');
        setDataValidade(!batchMode && docOrList?.data_validade ? String(docOrList.data_validade).slice(0, 10) : '');
        setTipoDocumentoId(!batchMode && docOrList?.tipo_documento_id ? docOrList.tipo_documento_id : '');

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

            if (acao === 'aprovado' && tipoSelecionado?.exige_validade && !dataValidade) {
                enqueueSnackbar(`Informe a data de validade (obrigatória para ${tipoSelecionado.nome}).`, { variant: 'warning' });
                setSubmitting(false);
                return;
            }

            const camposAuditoria = {
                status: acao,
                notas_auditoria: notaFinal,
                data_emissao: dataEmissao || null,
                data_validade: acao === 'aprovado' ? (dataValidade || null) : null,
                tipo_documento_id: tipoDocumentoId || null
            };

            if (isBatch) {
                const payloadDocs = selectedDocs.map(id => {
                    const d = Array.isArray(documentos) ? documentos.find(doc => doc.id === id) : null;
                    return d ? { id: d.id, tipo_entidade: d.tipo_entidade } : null;
                }).filter(Boolean);

                await api.patch('/documentos/batch/auditar', {
                    documentos: payloadDocs,
                    ...camposAuditoria
                });
                setSelectedDocs([]);
            } else {
                await api.patch(`/documentos/${actionDoc.tipo_entidade}/${actionDoc.id}/auditar`, camposAuditoria);
            }

            setOpenActionDialog(false);
            if (openPreview) setOpenPreview(false);

            const labelAcao = acao === 'aprovado' ? 'aprovado(s)' : acao === 'reenvio_solicitado' ? 'marcado(s) para reenvio' : 'reprovado(s)';
            enqueueSnackbar(`Documento(s) ${labelAcao} com sucesso!`, { variant: 'success' });

            loadDocumentos();
            loadStats();
            setRecarregarToken(t => t + 1);
        } catch (error) {
            enqueueSnackbar(error.response?.data?.error || 'Falha ao processar auditoria.', { variant: 'error' });
        } finally {
            setSubmitting(false);
        }
    };

    const columns = [
        {
            id: 'entidade_nome',
            label: 'Nome (colaborador / empresa)',
            minWidth: 220,
            format: (val, row) => (
                <Box sx={{ cursor: 'pointer' }} onClick={() => handleQuickPreview(row)}>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: '#FFFFFF', '&:hover': { color: '#00D4FF' } }}>
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
            label: 'Tipo',
            minWidth: 100,
            format: (val) => (
                <Chip
                    label={comoRotulo(val || 'pessoa')}
                    size="small"
                    sx={{
                        bgcolor: val === 'empresa' ? 'rgba(0,212,255,0.15)' : 'rgba(123,47,190,0.15)',
                        color: val === 'empresa' ? '#00D4FF' : '#A855F7',
                        fontWeight: 700,
                        border: '1px solid',
                        borderColor: val === 'empresa' ? 'rgba(0,212,255,0.3)' : 'rgba(123,47,190,0.3)'
                    }}
                />
            )
        },
        {
            id: 'titulo',
            label: 'Documento',
            minWidth: 180,
            format: (val, row) => (
                <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#FFFFFF' }}>{val || 'Sem Título'}</Typography>
                    <Typography variant="caption" sx={{ color: '#00D4FF', fontWeight: 600 }}>{row.tipo_doc}</Typography>
                </Box>
            )
        },
        {
            id: 'data_inclusao',
            label: 'Submissão',
            minWidth: 120,
            format: (val) => (
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)' }}>
                    {val ? new Date(val).toLocaleDateString('pt-BR') : '—'}
                </Typography>
            )
        },
        {
            id: 'acoes',
            label: 'Ações rápidas',
            minWidth: 200,
            align: 'right',
            format: (val, row) => (
                <Stack direction="row" spacing={1} justifyContent="flex-end">
                    <Tooltip title="Ver e analisar documento">
                        <IconButton
                            size="small"
                            onClick={() => handleQuickPreview(row)}
                            sx={{ color: '#00D4FF', bgcolor: 'rgba(0,212,255,0.1)', '&:hover': { bgcolor: 'rgba(0,212,255,0.25)' } }}
                        >
                            <ViewIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>

                    <Tooltip title="Aprovar documento">
                        <IconButton
                            size="small"
                            onClick={() => handleOpenAction(row, 'aprovado')}
                            sx={{ color: '#00FF88', bgcolor: 'rgba(0,255,136,0.1)', '&:hover': { bgcolor: 'rgba(0,255,136,0.25)' } }}
                        >
                            <CheckIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>

                    <Tooltip title="Solicitar reenvio (ilegível / incorreto)">
                        <IconButton
                            size="small"
                            onClick={() => handleOpenAction(row, 'reenvio_solicitado')}
                            sx={{ color: '#FFB800', bgcolor: 'rgba(255,170,0,0.1)', '&:hover': { bgcolor: 'rgba(255,170,0,0.25)' } }}
                        >
                            <ResubmitIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>

                    <Tooltip title="Reprovar documento">
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
        <Box sx={{ p: { xs: 2, md: 3 } }}>
            <PageHeader
                title="Auditoria de documentos"
                subtitle="Confira os documentos enviados (ASO, NRs, RG, contratos), aprove ou peça reenvio."
                breadcrumbs={[{ text: 'Dashboard' }, { text: 'Auditoria' }]}
            />

            {/* Indicadores da auditoria */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={6} md={3}>
                    <KpiCard titulo="Aguardando análise" valor={stats.pendentes} icone={<PendingIcon />} cor={cores.alerta} />
                </Grid>
                <Grid item xs={6} md={3}>
                    <KpiCard titulo="Aprovados" valor={stats.aprovados} icone={<ApprovedIcon />} cor={cores.sucesso} />
                </Grid>
                <Grid item xs={6} md={3}>
                    <KpiCard titulo="Reenvio solicitado" valor={stats.reenvio_solicitado} icone={<ResubmitIcon />} cor={cores.primaria} />
                </Grid>
                <Grid item xs={6} md={3}>
                    <KpiCard titulo="Reprovados" valor={stats.reprovados} icone={<BlockIcon />} cor={cores.erro} />
                </Grid>
            </Grid>

            <Tabs value={aba} onChange={(e, v) => setAba(v)} sx={{
                mb: 2, '& .MuiTab-root': { color: 'rgba(255,255,255,0.6)', fontWeight: 700 },
                '& .Mui-selected': { color: '#00D4FF !important' }, '& .MuiTabs-indicator': { bgcolor: '#00D4FF' }
            }}>
                <Tab label={`Fila de análise (${stats.pendentes})`} />
                <Tab label="Colaboradores" />
                <Tab label="Vencimentos" />
            </Tabs>

            {aba === 1 && (
                <GlassCard sx={{ p: 3 }}>
                    <AbaColaboradores onAuditar={(doc, a) => handleOpenAction(doc, a)} recarregarToken={recarregarToken} />
                </GlassCard>
            )}

            {aba === 2 && (
                <GlassCard sx={{ p: 3 }}>
                    <AbaVencimentos onAuditar={(doc, a) => handleOpenAction(doc, a)} recarregarToken={recarregarToken} />
                </GlassCard>
            )}

            {aba === 0 && (<>
            {/* Barra de Busca */}
            <Box sx={{ mb: 2 }}>
                <TextField
                    fullWidth
                    variant="outlined"
                    placeholder="Buscar por colaborador, CPF, e-mail, telefone, empresa, CNPJ ou documento (Ex: NR-35, ASO, RG)..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    InputProps={{
                        startAdornment: <SearchIcon sx={{ color: 'rgba(255,255,255,0.4)', mr: 1.5 }} />
                    }}
                    sx={{
                        bgcolor: 'rgba(255,255,255,0.03)',
                        borderRadius: 1.5,
                        '& .MuiOutlinedInput-root': {
                            color: '#FFFFFF',
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
                        <Typography variant="body2" sx={{ fontWeight: 700, color: '#00D4FF' }}>
                            {selectedDocs.length} selecionado(s)
                        </Typography>
                        <Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(255,255,255,0.2)' }} />
                        
                        <Button
                            size="small"
                            variant="contained"
                            color="success"
                            startIcon={<CheckIcon />}
                            onClick={() => handleOpenAction(selectedDocs, 'aprovado', true)}
                            sx={{ borderRadius: 1.5, textTransform: 'none', fontWeight: 700 }}
                        >
                            Aprovar
                        </Button>
                        <Button
                            size="small"
                            variant="contained"
                            color="warning"
                            startIcon={<ResubmitIcon />}
                            onClick={() => handleOpenAction(selectedDocs, 'reenvio_solicitado', true)}
                            sx={{ borderRadius: 1.5, textTransform: 'none', fontWeight: 700 }}
                        >
                            Reenvio
                        </Button>
                        <Button
                            size="small"
                            variant="contained"
                            color="error"
                            startIcon={<RejectIcon />}
                            onClick={() => handleOpenAction(selectedDocs, 'reprovado', true)}
                            sx={{ borderRadius: 1.5, textTransform: 'none', fontWeight: 700 }}
                        >
                            Reprovar
                        </Button>
                    </Box>
                )}

                {documentos.length === 0 && !loading ? (
                    <Box sx={{ textAlign: 'center', py: 8 }}>
                        <AssigIcon sx={{ fontSize: 64, color: '#00FF88', mb: 2, opacity: 0.6 }} />
                        <Typography variant="h5" sx={{ color: '#00FF88', fontWeight: 700 }}>Fila zero</Typography>
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
            </>)}

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
                        borderRadius: 1.5,
                        minHeight: '80vh'
                    }
                }}
            >
                {previewDoc && (
                    <>
                        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                            <Box>
                                <Typography variant="h6" sx={{ color: '#FFFFFF', fontWeight: 700 }}>
                                    {previewDoc.titulo || 'Visualização do Documento'}
                                </Typography>
                                <Typography variant="caption" sx={{ color: '#00D4FF', fontWeight: 700 }}>
                                    {previewDoc.tipo_doc} • {previewDoc.entidade_nome} ({previewDoc.tipo_entidade?.toUpperCase()})
                                </Typography>
                            </Box>
                            <Stack direction="row" spacing={1} alignItems="center">
                                <IconButton
                                    onClick={() => window.open(previewUrl || previewDoc.url_arquivo, '_blank')}
                                    sx={{ color: '#00D4FF' }}
                                    title="Abrir em nova aba"
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
                                    <VisualizadorDocumento doc={previewDoc} onUrl={setPreviewUrl} />
                                </Grid>

                                {/* Painel Direito: Dados e Ações Imediatas */}
                                <Grid item xs={12} md={4}>
                                    <GlassCard sx={{ p: 2.5, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                                        <Box>
                                            <Typography variant="overline" sx={{ color: '#00D4FF', fontWeight: 700, letterSpacing: '1.5px' }}>
                                                Dados do titular
                                            </Typography>
                                            <Typography variant="h6" sx={{ color: '#FFFFFF', fontWeight: 700, mt: 1 }}>
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

                                            <Typography variant="caption" sx={{ color: '#FFB800', display: 'block', mb: 1, fontWeight: 700 }}>
                                                Critérios de conferência:
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
                                                sx={{ fontWeight: 700, py: 1.2, textTransform: 'none' }}
                                            >
                                                Aprovar documento
                                            </Button>

                                            <Button
                                                variant="contained"
                                                color="warning"
                                                size="large"
                                                startIcon={<ResubmitIcon />}
                                                onClick={() => handleOpenAction(previewDoc, 'reenvio_solicitado')}
                                                sx={{ fontWeight: 700, py: 1.2, textTransform: 'none' }}
                                            >
                                                Solicitar reenvio
                                            </Button>

                                            <Button
                                                variant="contained"
                                                color="error"
                                                size="large"
                                                startIcon={<RejectIcon />}
                                                onClick={() => handleOpenAction(previewDoc, 'reprovado')}
                                                sx={{ fontWeight: 700, py: 1.2, textTransform: 'none' }}
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
                        borderColor: acao === 'aprovado' ? '#00FF88' : acao === 'reenvio_solicitado' ? '#FFB800' : '#FF3366',
                        borderRadius: 3
                    }
                }}
            >
                <DialogTitle sx={{
                    color: acao === 'aprovado' ? '#00FF88' : acao === 'reenvio_solicitado' ? '#FFB800' : '#FF3366',
                    fontWeight: 700
                }}>
                    {acao === 'aprovado' && 'APROVAR DOCUMENTO'}
                    {acao === 'reenvio_solicitado' && 'SOLICITAR REENVIO DE DOCUMENTO'}
                    {acao === 'reprovado' && 'REPROVAR DOCUMENTO'}
                </DialogTitle>

                <DialogContent>
                    <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <Typography variant="body2" sx={{ color: '#FFFFFF' }}>
                            {isBatch ? (
                                <>Aplicando ação para <b>{selectedDocs.length}</b> documento(s) selecionado(s).</>
                            ) : (
                                <>Colaborador/empresa: <b>{actionDoc?.entidade_nome}</b><br />
                                Documento: <span style={{ color: '#00D4FF' }}>{actionDoc?.tipo_nome || actionDoc?.titulo} ({actionDoc?.tipo_doc})</span></>
                            )}
                        </Typography>

                        {/* Mensagem Explicativa */}
                        {acao === 'reenvio_solicitado' && (
                            <Alert severity="warning" sx={{ bgcolor: 'rgba(255,170,0,0.1)', color: '#FFB800' }}>
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
                                <InputLabel sx={{ color: 'rgba(255,255,255,0.7)' }}>Motivo pré-definido</InputLabel>
                                <Select
                                    value={motivoPredefinido}
                                    label="Motivo pré-definido"
                                    onChange={(e) => setMotivoPredefinido(e.target.value)}
                                    sx={{
                                        color: '#FFFFFF',
                                        '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' }
                                    }}
                                >
                                    {(acao === 'reenvio_solicitado' ? MOTIVOS_REENVIO : MOTIVOS_REPROVACAO).map((m, idx) => (
                                        <MenuItem key={idx} value={m}>{m}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        )}

                        {/* Tipo do documento (classificação usada nas regras por função) */}
                        {tiposDocumento.length > 0 && (
                            <FormControl fullWidth sx={{ mt: 1 }}>
                                <InputLabel sx={{ color: 'rgba(255,255,255,0.7)' }}>Tipo do documento</InputLabel>
                                <Select
                                    value={tipoDocumentoId}
                                    label="Tipo do documento"
                                    onChange={(e) => setTipoDocumentoId(e.target.value)}
                                    sx={{ color: '#FFFFFF', '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' } }}
                                >
                                    <MenuItem value=""><em>Não classificado</em></MenuItem>
                                    {tiposDocumento.map(t => (
                                        <MenuItem key={t.id} value={t.id}>{t.nome}{t.exige_validade ? ' (com validade)' : ''}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        )}

                        {/* Validade (obrigatória quando o tipo exige) */}
                        {acao === 'aprovado' && (
                            <TextField
                                label={tipoSelecionado?.exige_validade ? 'Data de Validade (obrigatória)' : 'Data de Validade (se houver)'}
                                type="date"
                                InputLabelProps={{ shrink: true }}
                                fullWidth
                                required={!!tipoSelecionado?.exige_validade}
                                value={dataValidade}
                                onChange={(e) => setDataValidade(e.target.value)}
                                sx={{
                                    mt: 1,
                                    '& .MuiOutlinedInput-root': {
                                        color: '#FFFFFF',
                                        '& fieldset': { borderColor: tipoSelecionado?.exige_validade && !dataValidade ? '#FFB800' : 'rgba(255,255,255,0.2)' }
                                    }
                                }}
                            />
                        )}

                        {/* Data de Emissão (Opcional ao aprovar) */}
                        {acao === 'aprovado' && (
                            <TextField
                                label="Data de emissão do documento (opcional)"
                                type="date"
                                InputLabelProps={{ shrink: true }}
                                fullWidth
                                value={dataEmissao}
                                onChange={(e) => setDataEmissao(e.target.value)}
                                sx={{
                                    mt: 1,
                                    '& .MuiOutlinedInput-root': {
                                        color: '#FFFFFF',
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
                                    color: '#FFFFFF',
                                    '& fieldset': { borderColor: 'rgba(255,255,255,0.2)' }
                                }
                            }}
                        />
                    </Box>
                </DialogContent>

                <DialogActions sx={{ p: 3 }}>
                    <Button variant="outlined" onClick={() => setOpenActionDialog(false)} disabled={submitting} sx={botaoSecundario}>
                        Cancelar
                    </Button>
                    <NeonButton
                        onClick={confirmAction}
                        loading={submitting}
                    >
                        Confirmar {acao === 'aprovado' ? 'aprovação' : acao === 'reenvio_solicitado' ? 'solicitação' : 'reprovação'}
                    </NeonButton>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default AuditoriaDocumental;
