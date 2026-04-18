import React, { useState, useEffect, useCallback } from 'react';
import { useSnackbar } from 'notistack';
import {
    Box,
    Typography,
    Stack,
    IconButton,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    Button,
    Select,
    MenuItem,
    InputLabel,
    FormControl,
    Autocomplete,
    Tooltip,
    Divider,
    Paper,
    CircularProgress
} from '@mui/material';
import {
    Add as AddIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    Search as SearchIcon,
    DirectionsCar as CarIcon,
    History as HistoryIcon,
    Block as BlockIcon,
    CheckCircle as CheckCircleIcon,
    MeetingRoom as PassagemIcon,
    Cancel as CancelIcon,
    Info as InfoIcon
} from '@mui/icons-material';
import api from '../services/api';
import GlassCard from '../components/common/GlassCard';
import PageHeader from '../components/common/PageHeader';
import NeonButton from '../components/common/NeonButton';
import DataTable from '../components/common/DataTable';
import StatusBadge from '../components/common/StatusBadge';
import { styled } from '@mui/material/styles';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const SearchWrapper = styled(Box)(({ theme }) => ({
    background: 'rgba(10, 22, 40, 0.6)',
    border: '1px solid rgba(0, 212, 255, 0.1)',
    borderRadius: 12,
    padding: theme.spacing(1, 2),
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    marginBottom: theme.spacing(3),
    '&:focus-within': {
        border: '1px solid rgba(0, 212, 255, 0.4)',
        boxShadow: '0 0 10px rgba(0, 212, 255, 0.1)',
    }
}));

const ConsultaCard = styled(Paper)(({ color }) => ({
    padding: '16px',
    marginBottom: '24px',
    background: 'rgba(10, 22, 40, 0.8)',
    backdropFilter: 'blur(10px)',
    borderLeft: `5px solid ${color}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between'
}));

const Veiculos = () => {
    const { enqueueSnackbar } = useSnackbar();
    const [searchParams] = useSearchParams();
    const eventoId = searchParams.get('evento_id') || localStorage.getItem('active_evento_id');
    
    // Estados principais
    const [veiculos, setVeiculos] = useState([]);
    const [empresas, setEmpresas] = useState([]);
    const [pessoas, setPessoas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    
    // Paginação e Busca
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(25);
    const [totalCount, setTotalCount] = useState(0);

    // Dialogs e Modais
    const [openDialog, setOpenDialog] = useState(false);
    const [openDeleteConfirm, setOpenDeleteConfirm] = useState(false);
    const [openPassagemDialog, setOpenPassagemDialog] = useState(false);
    const [openHistoricoDialog, setOpenHistoricoDialog] = useState(false);
    
    const [selectedVeiculo, setSelectedVeiculo] = useState(null);
    const [veiculoToDelete, setVeiculoToDelete] = useState(null);
    
    // Estados de Consulta Rápida
    const [consultaPlaca, setConsultaPlaca] = useState('');
    const [resultadoConsulta, setResultadoConsulta] = useState(null);
    const [consultando, setConsultando] = useState(false);

    // Estados de Passagem e Histórico
    const [passagemData, setPassagemData] = useState({ tipo: 'entrada', observacao: '' });
    const [historicoLogs, setHistoricoLogs] = useState([]);
    const [loadingHistorico, setLoadingHistorico] = useState(false);
    const [histPage, setHistPage] = useState(0);

    const [formData, setFormData] = useState({
        placa: '',
        marca: '',
        modelo: '',
        empresa_id: '',
        motorista_id: '',
        evento_id: eventoId
    });

    const columns = [
        {
            id: 'placa',
            label: 'PLACA / TAG',
            minWidth: 120,
            format: (val) => (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <CarIcon sx={{ color: '#00D4FF', fontSize: 18 }} />
                    <Typography variant="body2" sx={{ fontWeight: 700, letterSpacing: '1px' }}>{val}</Typography>
                </Box>
            )
        },
        { 
            id: 'info', 
            label: 'VEÍCULO', 
            minWidth: 180,
            format: (_, row) => (
                <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{row.marca || 'N/A'}</Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>{row.modelo}</Typography>
                </Box>
            )
        },
        {
            id: 'status',
            label: 'STATUS',
            minWidth: 120,
            format: (val) => (
                <StatusBadge 
                    status={val === 'liberado' ? 'autorizado' : 'bloqueado'} 
                    label={val === 'liberado' ? 'LIBERADO' : 'BLOQUEADO'} 
                />
            )
        },
        {
            id: 'empresas',
            label: 'EMPRESA',
            minWidth: 150,
            format: (val) => val?.nome || '—'
        },
        {
            id: 'pessoas',
            label: 'MOTORISTA',
            minWidth: 180,
            format: (val) => val?.nome_completo ? (
                <Box title={val.cpf}>
                    <Typography variant="body2">{val.nome_completo}</Typography>
                    <Typography variant="caption" sx={{ opacity: 0.6 }}>{val.cpf}</Typography>
                </Box>
            ) : '—'
        },
        {
            id: 'acoes',
            label: 'OPERAÇÕES',
            minWidth: 200,
            align: 'center',
            format: (value, row) => (
                <Stack direction="row" spacing={1} justifyContent="center">
                    <Tooltip title="Registrar Passagem">
                        <IconButton
                            size="small"
                            onClick={() => handleOpenPassagem(row)}
                            sx={{ color: '#00E676', background: 'rgba(0,230,118,0.05)' }}
                        >
                            <PassagemIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>

                    <Tooltip title={row.status === 'liberado' ? "Bloquear Veículo" : "Liberar Veículo"}>
                        <IconButton
                            size="small"
                            onClick={() => handleToggleStatus(row)}
                            sx={{ 
                                color: row.status === 'liberado' ? '#FFAB40' : '#00E676', 
                                background: row.status === 'liberado' ? 'rgba(255,171,64,0.05)' : 'rgba(0,230,118,0.05)' 
                            }}
                        >
                            {row.status === 'liberado' ? <BlockIcon fontSize="small" /> : <CheckCircleIcon fontSize="small" />}
                        </IconButton>
                    </Tooltip>

                    <Tooltip title="Histórico">
                        <IconButton
                            size="small"
                            onClick={() => handleOpenHistorico(row)}
                            sx={{ color: '#00D4FF', background: 'rgba(0,212,255,0.05)' }}
                        >
                            <HistoryIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>

                    <Divider orientation="vertical" flexItem sx={{ mx: 0.5, borderColor: 'rgba(255,255,255,0.05)' }} />

                    <IconButton
                        size="small"
                        onClick={() => handleOpenDialog(row)}
                        sx={{ color: 'text.secondary' }}
                    >
                        <EditIcon fontSize="small" />
                    </IconButton>
                    
                    <IconButton
                        size="small"
                        onClick={() => handleDelete(row.id)}
                        sx={{ color: '#FF3366', background: 'rgba(255,51,102,0.05)' }}
                    >
                        <DeleteIcon fontSize="small" />
                    </IconButton>
                </Stack>
            ),
        },
    ];

    const loadVeiculos = useCallback(async () => {
        if (!eventoId) return;
        try {
            setLoading(true);
            const response = await api.get('/veiculos', {
                params: {
                    busca: search || undefined,
                    page: page + 1,
                    limit: rowsPerPage,
                    evento_id: eventoId
                },
            });
            setVeiculos(response.data.data || []);
            setTotalCount(response.data.total || 0);
        } catch (error) {
            enqueueSnackbar('Falha ao sincronizar frota.', { variant: 'error' });
        } finally {
            setLoading(false);
        }
    }, [search, page, rowsPerPage, eventoId, enqueueSnackbar]);

    const loadPessoas = useCallback(async () => {
        if (!eventoId) return;
        try {
            const response = await api.get('/pessoas', {
                params: { evento_id: eventoId, limit: 1000 }
            });
            // Extração segura do array de dados (PessoaController retorna { success: true, data: { data: [] } })
            const rawData = response.data.data;
            const arrayPessoas = Array.isArray(rawData?.data) ? rawData.data : (Array.isArray(rawData) ? rawData : []);
            setPessoas(arrayPessoas);
        } catch (err) {
            console.error('Erro ao carregar pessoas:', err);
            setPessoas([]);
        }
    }, [eventoId]);

    const loadEmpresas = useCallback(async () => {
        if (!eventoId) return;
        try {
            const response = await api.get('/empresas', {
                params: { evento_id: eventoId }
            });
            setEmpresas(response.data.data || []);
        } catch (err) {
            console.error('Erro ao carregar empresas:', err);
        }
    }, [eventoId]);

    useEffect(() => {
        loadVeiculos();
    }, [loadVeiculos]);

    useEffect(() => {
        loadEmpresas();
        loadPessoas();
    }, [loadEmpresas, loadPessoas]);

    const handleConsultarPlaca = async () => {
        if (!consultaPlaca) return;
        try {
            setConsultando(true);
            const res = await api.get(`/veiculos/consulta/${consultaPlaca.toUpperCase().replace(/\s/g, '')}`, {
                params: { evento_id: eventoId }
            });
            setResultadoConsulta(res.data);
        } catch (error) {
            if (error.response?.status === 404) {
                setResultadoConsulta({ success: false, motivo: 'NAO_CADASTRADO' });
            } else {
                enqueueSnackbar('Erro ao consultar placa.', { variant: 'error' });
            }
        } finally {
            setConsultando(false);
        }
    };

    const handleToggleStatus = async (veiculo) => {
        try {
            const newStatus = veiculo.status === 'liberado' ? 'bloqueado' : 'liberado';
            await api.patch(`/veiculos/${veiculo.id}/status`, { status: newStatus });
            enqueueSnackbar(`Veículo ${newStatus === 'liberado' ? 'liberado' : 'bloqueado'} com sucesso.`, { variant: 'success' });
            loadVeiculos();
        } catch (error) {
            enqueueSnackbar('Erro ao alterar status.', { variant: 'error' });
        }
    };

    const handleOpenPassagem = (veiculo) => {
        setSelectedVeiculo(veiculo);
        setPassagemData({ tipo: 'entrada', observacao: '' });
        setOpenPassagemDialog(true);
    };

    const handleRegistrarPassagem = async () => {
        try {
            setSaving(true);
            await api.post('/veiculos/passagem', {
                placa: selectedVeiculo.placa,
                tipo: passagemData.tipo,
                observacao: passagemData.observacao,
                evento_id: eventoId
            });
            enqueueSnackbar('Passagem registrada com sucesso.', { variant: 'success' });
            setOpenPassagemDialog(false);
        } catch (error) {
            enqueueSnackbar(error.response?.data?.error || 'Erro ao registrar passagem.', { variant: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const handleOpenHistorico = async (veiculo) => {
        setSelectedVeiculo(veiculo);
        setOpenHistoricoDialog(true);
        setHistPage(0);
        loadHistorico(veiculo.id, 0);
    };

    const loadHistorico = async (id, p = 0) => {
        try {
            setLoadingHistorico(true);
            const res = await api.get(`/veiculos/${id}/historico`, {
                params: { page: p + 1, limit: 10 }
            });
            setHistoricoLogs(res.data.data || []);
        } catch (err) {
            enqueueSnackbar('Erro ao carregar histórico.', { variant: 'error' });
        } finally {
            setLoadingHistorico(false);
        }
    };

    const handleOpenDialog = (veiculo = null) => {
        if (veiculo) {
            setSelectedVeiculo(veiculo);
            setFormData({
                placa: veiculo.placa || '',
                marca: veiculo.marca || '',
                modelo: veiculo.modelo || '',
                empresa_id: veiculo.empresa_id || '',
                motorista_id: veiculo.motorista_id || '',
                evento_id: eventoId
            });
        } else {
            setSelectedVeiculo(null);
            setFormData({
                placa: '',
                marca: '',
                modelo: '',
                empresa_id: '',
                motorista_id: '',
                evento_id: eventoId
            });
        }
        setOpenDialog(true);
    };

    const handleCloseDialog = () => {
        setOpenDialog(false);
        setSelectedVeiculo(null);
    };

    const handleSave = async () => {
        if (!formData.placa || !formData.marca || !formData.modelo || !formData.empresa_id) {
            enqueueSnackbar('Preencha os campos obrigatórios (*)', { variant: 'warning' });
            return;
        }

        try {
            setSaving(true);
            if (selectedVeiculo) {
                await api.put(`/veiculos/${selectedVeiculo.id}`, formData);
            } else {
                await api.post('/veiculos', formData);
            }
            enqueueSnackbar('Registro salvo com sucesso.', { variant: 'success' });
            handleCloseDialog();
            loadVeiculos();
        } catch (error) {
            enqueueSnackbar(error.response?.data?.error || 'Erro ao salvar veículo', { variant: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = (id) => {
        setVeiculoToDelete(id);
        setOpenDeleteConfirm(true);
    };

    const confirmDelete = async () => {
        try {
            await api.delete(`/veiculos/${veiculoToDelete}`);
            setOpenDeleteConfirm(false);
            setVeiculoToDelete(null);
            loadVeiculos();
            enqueueSnackbar('Veículo removido.', { variant: 'success' });
        } catch (error) {
            enqueueSnackbar('Falha ao remover veículo.', { variant: 'error' });
        }
    };

    return (
        <Box sx={{ p: 4 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
                <PageHeader
                    title="Frota & Controle ANPR"
                    subtitle="Gestão de veículos autorizados e monitoramento de tráfego em tempo real."
                    breadcrumbs={[{ text: 'Dashboard' }, { text: 'Gestão de Frotas' }]}
                />
                <NeonButton
                    startIcon={<AddIcon />}
                    onClick={() => handleOpenDialog()}
                    sx={{ mt: 2 }}
                >
                    Cadastrar Veículo
                </NeonButton>
            </Box>

            {/* Painel de Consulta Rápida */}
            <GlassCard sx={{ p: 2, mb: 3 }}>
                <Stack direction="row" spacing={2} alignItems="center">
                    <TextField 
                        size="small"
                        placeholder="Consultar Placa (EX: ABC1D23)"
                        value={consultaPlaca}
                        onChange={(e) => setConsultaPlaca(e.target.value.toUpperCase())}
                        onKeyPress={(e) => e.key === 'Enter' && handleConsultarPlaca()}
                        sx={{ width: 300 }}
                    />
                    <Button 
                        variant="contained" 
                        onClick={handleConsultarPlaca} 
                        disabled={consultando}
                        startIcon={consultando ? <CircularProgress size={16} /> : <SearchIcon />}
                    >
                        CONSULTAR
                    </Button>
                    {resultadoConsulta && (
                        <IconButton onClick={() => setResultadoConsulta(null)} size="small">
                            <CancelIcon fontSize="small" />
                        </IconButton>
                    )}
                </Stack>

                {resultadoConsulta && (
                    <Box sx={{ mt: 2 }}>
                        {resultadoConsulta.autorizado ? (
                            <ConsultaCard color="#00E676">
                                <Stack direction="row" spacing={2} alignItems="center">
                                    <CheckCircleIcon sx={{ color: '#00E676' }} />
                                    <Box>
                                        <Typography variant="subtitle2" sx={{ color: '#00E676', fontWeight: 700 }}>AUTORIZADO</Typography>
                                        <Typography variant="body2">{resultadoConsulta.veiculo.placa} — {resultadoConsulta.veiculo.marca} {resultadoConsulta.veiculo.modelo}</Typography>
                                    </Box>
                                </Stack>
                                <Typography variant="caption">{resultadoConsulta.veiculo.empresas?.nome}</Typography>
                            </ConsultaCard>
                        ) : resultadoConsulta.motivo === 'BLOQUEADO' || resultadoConsulta.motivo === 'Veículo bloqueado.' ? (
                            <ConsultaCard color="#FF3366">
                                <Stack direction="row" spacing={2} alignItems="center">
                                    <BlockIcon sx={{ color: '#FF3366' }} />
                                    <Box>
                                        <Typography variant="subtitle2" sx={{ color: '#FF3366', fontWeight: 700 }}>BLOQUEADO</Typography>
                                        <Typography variant="body2">O veículo possui restrições de acesso.</Typography>
                                    </Box>
                                </Stack>
                            </ConsultaCard>
                        ) : (
                            <ConsultaCard color="#FFAB40">
                                <Stack direction="row" spacing={2} alignItems="center">
                                    <InfoIcon sx={{ color: '#FFAB40' }} />
                                    <Box>
                                        <Typography variant="subtitle2" sx={{ color: '#FFAB40', fontWeight: 700 }}>SEM REGISTRO</Typography>
                                        <Typography variant="body2">Placa não encontrada na base de dados do evento.</Typography>
                                    </Box>
                                </Stack>
                            </ConsultaCard>
                        )}
                    </Box>
                )}
            </GlassCard>

            <GlassCard glowColor="#00D4FF" sx={{ p: 0 }}>
                <Box sx={{ p: 3, pb: 0 }}>
                    <SearchWrapper>
                        <SearchIcon sx={{ color: 'text.secondary' }} />
                        <input
                            type="text"
                            placeholder="Buscar por placa, modelo ou marca..."
                            value={search}
                            onChange={(e) => {
                                setSearch(e.target.value);
                                setPage(0);
                            }}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#fff',
                                width: '100%',
                                outline: 'none',
                                fontFamily: 'inherit',
                                fontSize: '0.9rem'
                            }}
                        />
                    </SearchWrapper>
                </Box>

                <DataTable
                    columns={columns}
                    data={veiculos}
                    loading={loading}
                    pagination
                    page={page}
                    rowsPerPage={rowsPerPage}
                    totalCount={totalCount}
                    onPageChange={(p) => setPage(p)}
                    onRowsPerPageChange={(r) => {
                        setRowsPerPage(r);
                        setPage(0);
                    }}
                    sx={{
                        '& .MuiTableHead-root': { background: 'rgba(0,212,255,0.05)' },
                        borderTop: '1px solid rgba(255,255,255,0.05)'
                    }}
                />
            </GlassCard>

            {/* Modal Cadastro/Edição */}
            <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth disableRestoreFocus>
                <DialogTitle sx={{ fontFamily: '"Orbitron", sans-serif', fontWeight: 700, letterSpacing: '1px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    {selectedVeiculo ? 'MODIFICAR VEÍCULO' : 'CADASTRAR VEÍCULO'}
                </DialogTitle>
                <DialogContent>
                    <Box sx={{ pt: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <TextField
                            label="Placa de Trânsito *"
                            fullWidth
                            value={formData.placa}
                            onChange={(e) => setFormData({ ...formData, placa: e.target.value.toUpperCase() })}
                            placeholder="ABC1D23"
                        />
                        
                        <Stack direction="row" spacing={2}>
                            <TextField
                                label="Marca *"
                                fullWidth
                                value={formData.marca}
                                onChange={(e) => setFormData({ ...formData, marca: e.target.value })}
                                placeholder="Ex: Toyota"
                            />
                            <TextField
                                label="Modelo *"
                                fullWidth
                                value={formData.modelo}
                                onChange={(e) => setFormData({ ...formData, modelo: e.target.value })}
                                placeholder="Ex: Corolla"
                            />
                        </Stack>

                        <FormControl fullWidth>
                            <InputLabel id="empresa-select-label">Empresa / Delegação *</InputLabel>
                            <Select
                                labelId="empresa-select-label"
                                value={formData.empresa_id}
                                label="Empresa / Delegação *"
                                onChange={(e) => setFormData({ ...formData, empresa_id: e.target.value })}
                            >
                                {empresas.map((emp) => (
                                    <MenuItem key={emp.id} value={emp.id}>{emp.nome}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        <Autocomplete
                            options={pessoas}
                            getOptionLabel={(option) => `${option.nome_completo} (${option.cpf})`}
                            value={Array.isArray(pessoas) ? (pessoas.find(p => p.id === formData.motorista_id) || null) : null}
                            onChange={(_, newValue) => setFormData({ ...formData, motorista_id: newValue?.id || '' })}
                            renderInput={(params) => <TextField {...params} label="Motorista Vinculado" placeholder="Busque por nome ou CPF" />}
                        />

                    </Box>
                </DialogContent>
                <DialogActions sx={{ p: 3, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                    <Button onClick={handleCloseDialog} disabled={saving}>CANCELAR</Button>
                    <NeonButton onClick={handleSave} loading={saving}>SALVAR REGISTRO</NeonButton>
                </DialogActions>
            </Dialog>

            {/* Modal Registrar Passagem */}
            <Dialog open={openPassagemDialog} onClose={() => setOpenPassagemDialog(false)} maxWidth="xs" fullWidth>
                <DialogTitle>REGISTRAR PASSAGEM</DialogTitle>
                <DialogContent>
                    <Stack spacing={3} sx={{ pt: 2 }}>
                        <Typography variant="body2">Registrando movimento para: <b>{selectedVeiculo?.placa}</b></Typography>
                        <FormControl fullWidth>
                            <InputLabel>Tipo de Movimento</InputLabel>
                            <Select
                                value={passagemData.tipo}
                                label="Tipo de Movimento"
                                onChange={(e) => setPassagemData({ ...passagemData, tipo: e.target.value })}
                            >
                                <MenuItem value="entrada">ENTRADA</MenuItem>
                                <MenuItem value="saida">SAÍDA</MenuItem>
                            </Select>
                        </FormControl>
                        <TextField 
                            label="Observação"
                            multiline
                            rows={3}
                            value={passagemData.observacao}
                            onChange={(e) => setPassagemData({ ...passagemData, observacao: e.target.value })}
                        />
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ p: 3 }}>
                    <Button onClick={() => setOpenPassagemDialog(false)}>CANCELAR</Button>
                    <Button variant="contained" color="success" onClick={handleRegistrarPassagem} disabled={saving}>REGISTRAR</Button>
                </DialogActions>
            </Dialog>

            {/* Modal Histórico */}
            <Dialog open={openHistoricoDialog} onClose={() => setOpenHistoricoDialog(false)} maxWidth="md" fullWidth>
                <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    HISTÓRICO DE TRÂNSITO — {selectedVeiculo?.placa}
                    <IconButton size="small" onClick={() => setOpenHistoricoDialog(false)}><CancelIcon /></IconButton>
                </DialogTitle>
                <DialogContent dividers>
                    {loadingHistorico ? (
                        <Box sx={{ p: 5, textAlign: 'center' }}><CircularProgress /></Box>
                    ) : (
                        <DataTable 
                            data={historicoLogs}
                            columns={[
                                { 
                                    id: 'created_at', 
                                    label: 'DATA/HORA', 
                                    format: (v) => format(new Date(v), 'dd/MM/yyyy HH:mm', { locale: ptBR })
                                },
                                { 
                                    id: 'tipo', 
                                    label: 'TIPO',
                                    format: (v) => <StatusBadge status={v === 'entrada' ? 'autorizado' : 'pendente'} label={v.toUpperCase()} />
                                },
                                { id: 'metodo', label: 'MÉTODO', format: (v) => v.toUpperCase() },
                                { id: 'usuarios', label: 'OPERADOR', format: (v) => v?.nome_completo || 'AUTO (LPR)' },
                                { id: 'observacao', label: 'OBSERVAÇÃO' }
                            ]}
                        />
                    )}
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={() => setOpenHistoricoDialog(false)} color="inherit">FECHAR</Button>
                </DialogActions>
            </Dialog>

            {/* Confirmar Exclusão */}
            <Dialog open={openDeleteConfirm} onClose={() => setOpenDeleteConfirm(false)} maxWidth="xs" fullWidth>
                <DialogTitle sx={{ color: '#FF3366' }}>CONFIRMAR EXCLUSÃO</DialogTitle>
                <DialogContent>
                    A remoção desta placa impedirá o reconhecimento automático e invalidará o cadastro de trânsito vinculado.
                </DialogContent>
                <DialogActions sx={{ p: 3 }}>
                    <Button onClick={() => setOpenDeleteConfirm(false)}>CANCELAR</Button>
                    <Button onClick={confirmDelete} sx={{ color: '#FF3366', fontWeight: 'bold' }} variant="outlined">EXCLUIR DEFINITIVAMENTE</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default Veiculos;
