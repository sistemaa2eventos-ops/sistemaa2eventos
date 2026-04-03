import React, { useState, useEffect } from 'react';
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
    FormControl
} from '@mui/material';
import {
    Add as AddIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    Search as SearchIcon,
    DirectionsCar as CarIcon
} from '@mui/icons-material';
import api from '../services/api';
import GlassCard from '../components/common/GlassCard';
import PageHeader from '../components/common/PageHeader';
import NeonButton from '../components/common/NeonButton';
import DataTable from '../components/common/DataTable';
import { styled } from '@mui/material/styles';
import { useSearchParams } from 'react-router-dom';

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

const Veiculos = () => {
    const [searchParams] = useSearchParams();
    const eventoIdParam = searchParams.get('evento_id') || localStorage.getItem('active_evento_id');
    const [veiculos, setVeiculos] = useState([]);
    const [empresas, setEmpresas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [search, setSearch] = useState('');
    const [openDialog, setOpenDialog] = useState(false);
    const [openDeleteConfirm, setOpenDeleteConfirm] = useState(false);
    const [veiculoToDelete, setVeiculoToDelete] = useState(null);
    const [selectedVeiculo, setSelectedVeiculo] = useState(null);
    const [formData, setFormData] = useState({
        placa: '',
        modelo: '',
        empresa_id: '',
        motorista_id: ''
    });

    const columns = [
        {
            id: 'placa',
            label: 'PLACA / TAG',
            minWidth: 150,
            format: (val) => (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <CarIcon sx={{ color: '#00D4FF', fontSize: 20 }} />
                    <Typography variant="body2" sx={{ fontWeight: 700, letterSpacing: '2px' }}>{val}</Typography>
                </Box>
            )
        },
        { id: 'modelo', label: 'MODELO', minWidth: 200 },
        {
            id: 'empresas',
            label: 'EMPRESA / DELEGAÇÃO',
            minWidth: 200,
            format: (val) => val?.nome || 'N/A'
        },
        {
            id: 'acoes',
            label: 'AÇÕES',
            minWidth: 120,
            align: 'center',
            format: (value, row) => (
                <Stack direction="row" spacing={1} justifyContent="center">
                    <IconButton
                        size="small"
                        onClick={() => handleOpenDialog(row)}
                        sx={{ color: '#00D4FF', background: 'rgba(0,212,255,0.05)' }}
                        title="Editar"
                    >
                        <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                        size="small"
                        onClick={() => handleDelete(row.id)}
                        sx={{ color: '#FF3366', background: 'rgba(255,51,102,0.05)' }}
                        title="Excluir"
                    >
                        <DeleteIcon fontSize="small" />
                    </IconButton>
                </Stack>
            ),
        },
    ];

    useEffect(() => {
        loadVeiculos();
    }, [search]);

    useEffect(() => {
        loadEmpresas();
    }, []);

    const loadVeiculos = async () => {
        try {
            setLoading(true);
            const response = await api.get('/veiculos', {
                params: {
                    busca: search || undefined
                },
            });
            setVeiculos(response.data.data || []);
        } catch (error) {
            console.error('Erro ao carregar veiculos:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadEmpresas = async () => {
        try {
            const response = await api.get('/empresas', {
                params: {
                    evento_id: eventoIdParam || undefined
                },
            });
            setEmpresas(response.data.data || []);
        } catch (error) {
            console.error('Erro ao carregar empresas para o select:', error);
        }
    };

    const handleOpenDialog = (veiculo = null) => {
        if (veiculo) {
            setSelectedVeiculo(veiculo);
            setFormData({
                placa: veiculo.placa || '',
                modelo: veiculo.modelo || '',
                empresa_id: veiculo.empresa_id || '',
                motorista_id: veiculo.motorista_id || ''
            });
        } else {
            setSelectedVeiculo(null);
            setFormData({
                placa: '',
                modelo: '',
                empresa_id: '',
                motorista_id: ''
            });
        }
        setOpenDialog(true);
    };

    const handleCloseDialog = () => {
        setOpenDialog(false);
        setSelectedVeiculo(null);
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            const payload = { ...formData };
            if (!payload.motorista_id) delete payload.motorista_id;

            if (selectedVeiculo) {
                await api.put(`/veiculos/${selectedVeiculo.id}`, payload);
            } else {
                await api.post('/veiculos', payload);
            }
            handleCloseDialog();
            loadVeiculos();
        } catch (error) {
            console.error('Erro ao salvar veículo:', error);
            alert(error.response?.data?.error || 'Erro ao registrar veículo');
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
        } catch (error) {
            console.error('Erro ao excluir veiculo:', error);
            alert('Falha ao desativar veículo.');
        }
    };

    return (
        <Box sx={{ p: 4 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 4 }}>
                <PageHeader
                    title="Controle de Frota ANPR"
                    subtitle="Gerencie placas de veículos autorizados para o reconhecimento automatizado."
                    breadcrumbs={[{ text: 'Dashboard' }, { text: 'Veículos LPR' }]}
                />
                <NeonButton
                    startIcon={<AddIcon />}
                    onClick={() => handleOpenDialog()}
                    sx={{ mt: 2 }}
                >
                    Anexar Placa
                </NeonButton>
            </Box>

            <GlassCard glowColor="#00D4FF" sx={{ p: 3, mb: 3 }}>
                <SearchWrapper>
                    <SearchIcon sx={{ color: 'text.secondary' }} />
                    <input
                        type="text"
                        placeholder="Rastrear por placa ou modelo..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
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

                <DataTable
                    columns={columns}
                    data={veiculos}
                    loading={loading}
                    sx={{
                        '& .MuiTableHead-root': { background: 'rgba(0,212,255,0.05)' },
                        border: '1px solid rgba(0,212,255,0.05)'
                    }}
                />
            </GlassCard>

            <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth disableRestoreFocus>
                <DialogTitle sx={{ fontFamily: '"Orbitron", sans-serif', fontWeight: 700, letterSpacing: '2px' }}>
                    {selectedVeiculo ? 'MODIFICAR VEÍCULO' : 'AUTORIZAR NOVA PLACA'}
                </DialogTitle>
                <DialogContent>
                    <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <TextField
                            label="Placa de Trânsito"
                            fullWidth
                            value={formData.placa}
                            onChange={(e) => setFormData({ ...formData, placa: e.target.value.toUpperCase() })}
                            placeholder="ABC-1234 ou ABC1D23"
                        />
                        <TextField
                            label="Modelo / Cor / Observação"
                            fullWidth
                            value={formData.modelo}
                            onChange={(e) => setFormData({ ...formData, modelo: e.target.value })}
                            placeholder="Ex: Honda Civic Preto"
                        />

                        <FormControl fullWidth>
                            <InputLabel id="empresa-select-label">Empresa / Delegação</InputLabel>
                            <Select
                                labelId="empresa-select-label"
                                value={formData.empresa_id}
                                label="Empresa / Delegação"
                                onChange={(e) => setFormData({ ...formData, empresa_id: e.target.value })}
                            >
                                {empresas.map((emp) => (
                                    <MenuItem key={emp.id} value={emp.id}>{emp.nome}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                    </Box>
                </DialogContent>
                <DialogActions sx={{ p: 3 }}>
                    <Button onClick={handleCloseDialog} disabled={saving} sx={{ color: 'text.secondary' }}>ABORTAR</Button>
                    <NeonButton onClick={handleSave} loading={saving} autoFocus>SALVAR DECRETO</NeonButton>
                </DialogActions>
            </Dialog>

            <Dialog open={openDeleteConfirm} onClose={() => setOpenDeleteConfirm(false)} maxWidth="xs" fullWidth>
                <DialogTitle sx={{ color: '#FF3366' }}>EXCLUIR DADOS</DialogTitle>
                <DialogContent>
                    Deseja realmente remover esta placa da lista de veículos autorizados? Ela será ignorada pelo motor ANPR.
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenDeleteConfirm(false)} sx={{ color: 'text.secondary' }}>Cancelar</Button>
                    <Button onClick={confirmDelete} sx={{ color: '#FF3366', fontWeight: 'bold' }}>Excluir</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default Veiculos;
