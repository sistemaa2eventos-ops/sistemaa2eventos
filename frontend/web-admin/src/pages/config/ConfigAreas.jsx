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
    Button
} from '@mui/material';
import { useSnackbar } from 'notistack';
import {
    Add as AddIcon,
    Delete as DeleteIcon,
    Map as MapIcon
} from '@mui/icons-material';
import api from '../../services/api';
import GlassCard from '../../components/common/GlassCard';
import PageHeader from '../../components/common/PageHeader';
import NeonButton from '../../components/common/NeonButton';
import DataTable from '../../components/common/DataTable';
import { styled } from '@mui/material/styles';

const ConfigAreas = () => {
    const [areas, setAreas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [openDialog, setOpenDialog] = useState(false);
    const [openDeleteConfirm, setOpenDeleteConfirm] = useState(false);
    const [areaToDelete, setAreaToDelete] = useState(null);
    const [formData, setFormData] = useState({ nome_area: '' });
    const { enqueueSnackbar } = useSnackbar();

    const columns = [
        {
            id: 'nome_area',
            label: 'NOME DA ÁREA',
            minWidth: 200,
            format: (val) => (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <MapIcon sx={{ color: '#00D4FF', fontSize: 20 }} />
                    <Typography variant="body2" sx={{ fontWeight: 700, letterSpacing: '1px' }}>{val?.toUpperCase()}</Typography>
                </Box>
            )
        },
        {
            id: 'acoes',
            label: 'AÇÕES',
            minWidth: 100,
            align: 'center',
            format: (value, row) => (
                <Stack direction="row" spacing={1} justifyContent="center">
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
        loadAreas();
    }, []);

    const loadAreas = async () => {
        try {
            setLoading(true);
            const response = await api.get('/config/areas');
            setAreas(response.data.data || []);
        } catch (error) {
            console.error('Erro ao carregar áreas:', error);
            enqueueSnackbar('Falha ao carregar zonas de acesso.', { variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleOpenDialog = () => {
        setFormData({ nome_area: '' });
        setOpenDialog(true);
    };

    const handleCloseDialog = () => {
        setOpenDialog(false);
    };

    const handleSave = async () => {
        if (!formData.nome_area) {
            enqueueSnackbar('O nome da área é obrigatório.', { variant: 'warning' });
            return;
        }
        try {
            setSaving(true);
            await api.post('/config/areas', formData);
            enqueueSnackbar('Zona de acesso registrada com sucesso!', { variant: 'success' });
            handleCloseDialog();
            loadAreas();
        } catch (error) {
            console.error('Erro ao salvar área:', error);
            const detail = error.response?.data?.details ? `Detalhes: ${error.response.data.details}` : '';
            enqueueSnackbar(`${error.response?.data?.error || 'Erro ao criar área'}. ${detail}`, { variant: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = (id) => {
        setAreaToDelete(id);
        setOpenDeleteConfirm(true);
    };

    const confirmDelete = async () => {
        try {
            await api.delete(`/config/areas/${areaToDelete}`);
            enqueueSnackbar('Zona de acesso pulverizada com sucesso.', { variant: 'success' });
            setOpenDeleteConfirm(false);
            setAreaToDelete(null);
            loadAreas();
        } catch (error) {
            console.error('Erro ao excluir área:', error);
            enqueueSnackbar('Falha ao remover área. Ela pode estar em uso por uma pulseira ou regra de acesso.', { variant: 'error' });
        }
    };

    return (
        <Box sx={{ p: 4, maxWidth: 900, margin: '0 auto' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 4 }}>
                <PageHeader
                    title="Zonas de Acesso (Áreas)"
                    subtitle="Gere mapeamentos macro para controle do perímetro de acessos independentes."
                    breadcrumbs={[{ text: 'Configurações' }, { text: 'Credenciamento' }, { text: 'Zonas e Áreas' }]}
                />
                <NeonButton
                    startIcon={<AddIcon />}
                    onClick={handleOpenDialog}
                    sx={{ mt: 2 }}
                >
                    Nova Zona de Acesso
                </NeonButton>
            </Box>

            <GlassCard glowColor="#00D4FF" sx={{ p: 3, mb: 3 }}>
                <DataTable
                    columns={columns}
                    data={areas}
                    loading={loading}
                    sx={{
                        '& .MuiTableHead-root': { background: 'rgba(0,212,255,0.05)' },
                        border: '1px solid rgba(0,212,255,0.05)'
                    }}
                />
            </GlassCard>

            <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth disableRestoreFocus>
                <DialogTitle sx={{ fontFamily: '"Orbitron", sans-serif', fontWeight: 700, letterSpacing: '2px' }}>
                    REGISTRAR NOVA ZONA
                </DialogTitle>
                <DialogContent>
                    <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <TextField
                            label="Nome ou Identificação da Área"
                            fullWidth
                            value={formData.nome_area}
                            onChange={(e) => setFormData({ ...formData, nome_area: e.target.value })}
                            placeholder="Ex: BACKSTAGE, PISTA PREMIUM, CAMAROTE 1..."
                        />
                    </Box>
                </DialogContent>
                <DialogActions sx={{ p: 3 }}>
                    <Button onClick={handleCloseDialog} disabled={saving} sx={{ color: 'text.secondary' }}>ABORTAR</Button>
                    <NeonButton onClick={handleSave} loading={saving} autoFocus>CONCLUIR CADASTRO</NeonButton>
                </DialogActions>
            </Dialog>

            <Dialog open={openDeleteConfirm} onClose={() => setOpenDeleteConfirm(false)} maxWidth="xs" fullWidth>
                <DialogTitle sx={{ color: '#FF3366' }}>EXCLUIR ZONA DE ACESSO</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
                        Atenção: A remoção de uma zona quebrará regras de acesso se existirem pulseiras atreladas a ela.
                    </Typography>
                    Deseja realmente pulverizar o registro desta área?
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenDeleteConfirm(false)} sx={{ color: 'text.secondary' }}>Cancelar</Button>
                    <Button onClick={confirmDelete} sx={{ color: '#FF3366', fontWeight: 'bold' }}>Excluir Definitivamente</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default ConfigAreas;
