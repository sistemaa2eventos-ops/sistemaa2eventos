import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Stack, IconButton, Dialog, 
    DialogTitle, DialogContent, DialogActions, 
    TextField, Button, CircularProgress, Grid
} from '@mui/material';
import { useSnackbar } from 'notistack';
import {
    Add as AddIcon,
    Delete as DeleteIcon,
    Place as PlaceIcon
} from '@mui/icons-material';
import api from '../../services/api';
import GlassCard from '../../components/common/GlassCard';
import DataTable from '../../components/common/DataTable';

const ConfigAreas = () => {
    const [areas, setAreas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [openDialog, setOpenDialog] = useState(false);
    const [areaToDelete, setAreaToDelete] = useState(null);
    const [formData, setFormData] = useState({ nome: '', capacidade_maxima: 0 });
    const { enqueueSnackbar } = useSnackbar();

    const columns = [
        {
            id: 'nome',
            label: 'NOME DA ÁREA',
            minWidth: 200,
            format: (val) => (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <PlaceIcon sx={{ color: 'primary.main', fontSize: 20 }} />
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>{val?.toUpperCase()}</Typography>
                </Box>
            )
        },
        {
            id: 'capacidade_maxima',
            label: 'CAPACIDADE',
            minWidth: 100,
            align: 'center',
            format: (val) => val || '-'
        },
        {
            id: 'acoes',
            label: 'AÇÕES',
            minWidth: 100,
            align: 'center',
            format: (value, row) => (
                <IconButton
                    size="small"
                    onClick={() => handleDelete(row.id)}
                    sx={{ color: 'error.main', bgcolor: 'rgba(255, 51, 102, 0.05)' }}
                >
                    <DeleteIcon fontSize="small" />
                </IconButton>
            ),
        },
    ];

    useEffect(() => {
        loadAreas();
    }, []);

    const loadAreas = async () => {
        try {
            setLoading(true);
            const response = await api.get('/eventos/areas');
            setAreas(response.data.data || []);
        } catch (error) {
            enqueueSnackbar('Falha ao carregar áreas.', { variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!formData.nome) return enqueueSnackbar('Nome é obrigatório.', { variant: 'warning' });
        try {
            setSaving(true);
            const eid = localStorage.getItem('active_evento_id');
            await api.post(`/eventos/${eid}/areas`, formData);
            enqueueSnackbar('Área criada com sucesso!', { variant: 'success' });
            setOpenDialog(false);
            loadAreas();
        } catch (error) {
            enqueueSnackbar('Erro ao criar área.', { variant: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Excluir esta área permanentemente?')) return;
        try {
            await api.delete(`/eventos/areas/${id}`);
            enqueueSnackbar('Área removida.', { variant: 'success' });
            loadAreas();
        } catch (error) {
            enqueueSnackbar('Erro ao remover área.', { variant: 'error' });
        }
    };

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h6" sx={{ color: 'primary.main', fontWeight: 700 }}>
                    📍 Gestão de Áreas & Zonas
                </Typography>
                <Button 
                    variant="contained" 
                    startIcon={<AddIcon />} 
                    onClick={() => { setFormData({ nome: '', capacidade_maxima: 0 }); setOpenDialog(true); }}
                    sx={{ fontWeight: 700 }}
                >
                    Nova Área
                </Button>
            </Box>

            <Grid container spacing={3}>
                <Grid item xs={12}>
                    <GlassCard sx={{ p: 2 }}>
                        <DataTable
                            columns={columns}
                            data={areas}
                            loading={loading}
                        />
                    </GlassCard>
                </Grid>
            </Grid>

            <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="xs" fullWidth>
                <DialogTitle sx={{ fontWeight: 700 }}>Nova Área de Acesso</DialogTitle>
                <DialogContent>
                    <Stack spacing={3} sx={{ mt: 1 }}>
                        <TextField 
                            label="Nome da Área" 
                            fullWidth 
                            value={formData.nome}
                            onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                        />
                        <TextField 
                            label="Capacidade Máxima" 
                            type="number" 
                            fullWidth 
                            value={formData.capacidade_maxima}
                            onChange={(e) => setFormData({ ...formData, capacidade_maxima: parseInt(e.target.value) })}
                        />
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ p: 3 }}>
                    <Button onClick={() => setOpenDialog(false)}>Cancelar</Button>
                    <Button variant="contained" onClick={handleSave} disabled={saving}>Salvar Área</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default ConfigAreas;
