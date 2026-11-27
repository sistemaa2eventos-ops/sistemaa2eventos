import React, { useState, useEffect, useCallback } from 'react';
import {
    Box, Typography, Stack, IconButton, Dialog, 
    DialogTitle, DialogContent, DialogActions, 
    TextField, Button, CircularProgress, Grid,
    MenuItem
} from '@mui/material';

// Tipo de operação da área (espelha TIPOS_AREA do backend, services/tipoArea.js)
const TIPOS_AREA = [
    { valor: 'checkin_checkout', rotulo: 'Check-in e check-out', descricao: 'Registra entrada e saída de pulseira. Circulação livre, sem limite de passagens.' },
    { valor: 'liberacao_acesso', rotulo: 'Só liberação de acesso (portão)', descricao: 'Entrada única por etapa e dia. Reentrada só com liberação do controlador.' },
    { valor: 'monitoramento', rotulo: 'Só monitoramento', descricao: 'Aparece no Monitor e nas câmeras. Não registra entrada nem saída.' }
];
const rotuloTipo = (valor) => TIPOS_AREA.find(t => t.valor === valor)?.rotulo || TIPOS_AREA[0].rotulo;
import { useSnackbar } from 'notistack';
import {
    Add as AddIcon,
    Delete as DeleteIcon,
    Edit as EditIcon,
    Place as PlaceIcon
} from '@mui/icons-material';
import api from '../../services/api';
import GlassCard from '../../components/common/GlassCard';
import DataTable from '../../components/common/DataTable';
import PageHeader from '../../components/common/PageHeader';
import NeonButton from '../../components/common/NeonButton';
import { useConfirmacao } from '../../contexts/ConfirmacaoContext';

import { botaoSecundario, cores, tom } from '../../styles/tokens';
const ConfigAreas = () => {
    const confirmar = useConfirmacao();
    const [areas, setAreas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [openDialog, setOpenDialog] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState({ nome_area: '', capacidade_maxima: '', tipo_area: 'checkin_checkout' });
    const { enqueueSnackbar } = useSnackbar();

    const columns = [
        {
            id: 'nome_area',
            label: 'Nome da área',
            minWidth: 200,
            format: (val) => (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <PlaceIcon sx={{ color: 'primary.main', fontSize: 20 }} />
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>{val?.toUpperCase()}</Typography>
                </Box>
            )
        },
        {
            id: 'tipo_area',
            label: 'Tipo',
            minWidth: 180,
            format: (val) => <Typography variant="body2">{rotuloTipo(val)}</Typography>
        },
        {
            id: 'capacidade_maxima',
            label: 'Capacidade',
            minWidth: 100,
            align: 'center',
            format: (val) => val || 'Ilimitada'
        },
        {
            id: 'acoes',
            label: 'Ações',
            minWidth: 120,
            align: 'center',
            format: (value, row) => (
                <Stack direction="row" spacing={1} justifyContent="center">
                    <IconButton
                        size="small"
                        onClick={() => handleOpenDialog(row)}
                        sx={{ color: 'primary.main', bgcolor: tom(cores.primaria, 0.05) }}
                    >
                        <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                        size="small"
                        onClick={() => handleDelete(row.id)}
                        sx={{ color: 'error.main', bgcolor: 'rgba(255, 51, 102, 0.05)' }}
                    >
                        <DeleteIcon fontSize="small" />
                    </IconButton>
                </Stack>
            ),
        },
    ];

    const loadAreas = useCallback(async () => {
        try {
            const eventoId = sessionStorage.getItem('active_evento_id') || localStorage.getItem('active_evento_id');
            if (!eventoId) {
                enqueueSnackbar('Selecione um evento para gerenciar as áreas.', { variant: 'info' });
                setLoading(false);
                return;
            }

            setLoading(true);
            const response = await api.get('/config/areas', { 
                params: { evento_id: eventoId } 
            });
            setAreas(response.data.data || []);
        } catch (error) {
            console.error('Erro ao carregar áreas:', error);
            enqueueSnackbar('Falha ao carregar áreas. Verifique sua conexão.', { variant: 'error' });
        } finally {
            setLoading(false);
        }
    }, [enqueueSnackbar]);

    useEffect(() => {
        loadAreas();
    }, [loadAreas]);

    const handleOpenDialog = (area = null) => {
        if (area) {
            setEditingId(area.id);
            setFormData({
                nome_area: area.nome_area || '',
                capacidade_maxima: area.capacidade_maxima || '',
                tipo_area: area.tipo_area || (area.controla_entrada !== false ? 'liberacao_acesso' : 'checkin_checkout')
            });
        } else {
            setEditingId(null);
            setFormData({ nome_area: '', capacidade_maxima: '', tipo_area: 'checkin_checkout' });
        }
        setOpenDialog(true);
    };

    const handleSave = async () => {
        if (!formData.nome_area) return enqueueSnackbar('Nome é obrigatório.', { variant: 'warning' });
        try {
            setSaving(true);
            if (editingId) {
                await api.put(`/config/areas/${editingId}`, {
                    nome_area: formData.nome_area,
                    capacidade_maxima: formData.capacidade_maxima ? parseInt(formData.capacidade_maxima) : null,
                    tipo_area: formData.tipo_area
                });
                enqueueSnackbar('Área atualizada!', { variant: 'success' });
            } else {
                await api.post('/config/areas', {
                    nome_area: formData.nome_area,
                    capacidade_maxima: formData.capacidade_maxima ? parseInt(formData.capacidade_maxima) : null,
                    tipo_area: formData.tipo_area
                });
                enqueueSnackbar('Área criada com sucesso!', { variant: 'success' });
            }
            setOpenDialog(false);
            loadAreas();
        } catch (error) {
            enqueueSnackbar('Erro ao salvar área.', { variant: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id) => {
        if (!(await confirmar({ titulo: 'Excluir área', mensagem: 'Excluir esta área permanentemente?', textoConfirmar: 'Excluir' }))) return;
        try {
            await api.delete(`/config/areas/${id}`);
            enqueueSnackbar('Área removida.', { variant: 'success' });
            loadAreas();
        } catch (error) {
            enqueueSnackbar('Erro ao remover área.', { variant: 'error' });
        }
    };

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;

    return (
        <Box sx={{ p: { xs: 2, sm: 3, md: 4 }, maxWidth: 1600, mx: 'auto', width: '100%' }}>
            <PageHeader
                title="Áreas"
                subtitle="Crie e gerencie as áreas de acesso do evento. Cada área pode ser associada a um ou mais leitores."
                action={
                    <NeonButton startIcon={<AddIcon />} onClick={() => handleOpenDialog()}>
                        Nova área
                    </NeonButton>
                }
            />

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
                <DialogTitle sx={{ fontWeight: 700 }}>
                    {editingId ? 'Editar área' : 'Nova área de acesso'}
                </DialogTitle>
                <DialogContent>
                    <Stack spacing={3} sx={{ mt: 1 }}>
                        <TextField 
                            label="Nome da área" 
                            fullWidth 
                            value={formData.nome_area}
                            onChange={(e) => setFormData({ ...formData, nome_area: e.target.value })}
                        />
                        <TextField 
                            label="Capacidade máxima (0 = ilimitada)" 
                            type="number" 
                            fullWidth 
                            value={formData.capacidade_maxima}
                            onChange={(e) => setFormData({ ...formData, capacidade_maxima: e.target.value })}
                        />
                        <TextField
                            select
                            label="Tipo de operação"
                            fullWidth
                            value={formData.tipo_area}
                            onChange={(e) => setFormData({ ...formData, tipo_area: e.target.value })}
                            helperText={TIPOS_AREA.find(t => t.valor === formData.tipo_area)?.descricao}
                        >
                            {TIPOS_AREA.map(t => (
                                <MenuItem key={t.valor} value={t.valor}>{t.rotulo}</MenuItem>
                            ))}
                        </TextField>
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ p: 3 }}>
                    <Button variant="outlined" onClick={() => setOpenDialog(false)} sx={botaoSecundario}>Cancelar</Button>
                    <Button variant="contained" onClick={handleSave} disabled={saving}>
                        {editingId ? 'Salvar' : 'Criar'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default ConfigAreas;
