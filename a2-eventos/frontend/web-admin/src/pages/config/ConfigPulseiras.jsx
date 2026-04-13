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
    Grid,
    Select,
    MenuItem,
    InputLabel,
    FormControl,
    OutlinedInput,
    Chip
} from '@mui/material';
import { useSnackbar } from 'notistack';
import {
    Add as AddIcon,
    Delete as DeleteIcon,
    Style as StyleIcon,
    Circle as CircleIcon
} from '@mui/icons-material';
import api from '../../services/api';
import GlassCard from '../../components/common/GlassCard';
import PageHeader from '../../components/common/PageHeader';
import NeonButton from '../../components/common/NeonButton';
import DataTable from '../../components/common/DataTable';
import { styled } from '@mui/material/styles';

const MenuProps = {
    PaperProps: {
        sx: {
            background: '#0A1628',
            border: '1px solid rgba(0, 212, 255, 0.2)',
        },
    },
};

const ConfigPulseiras = ({ embedded = false }) => {
    const [pulseiras, setPulseiras] = useState([]);
    const [areas, setAreas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [openDialog, setOpenDialog] = useState(false);
    const [openDeleteConfirm, setOpenDeleteConfirm] = useState(false);
    const [itemToDelete, setItemToDelete] = useState(null);
    const { enqueueSnackbar } = useSnackbar();

    const [formData, setFormData] = useState({
        nome_tipo: '',
        cor_hex: '#00D4FF',
        numero_inicial: '',
        numero_final: '',
        tipo_leitura: 'qr_code',
        areas_permitidas: []
    });

    const columns = [
        {
            id: 'cor_hex',
            label: 'COR',
            minWidth: 80,
            format: (val) => (
                <CircleIcon sx={{ color: val, border: '1px solid rgba(255,255,255,0.2)', borderRadius: '50%' }} />
            )
        },
        {
            id: 'nome_tipo',
            label: 'CÓDIGO SOCIAL',
            minWidth: 150,
            format: (val) => (
                <Typography variant="body2" sx={{ fontWeight: 700 }}>{val?.toUpperCase()}</Typography>
            )
        },
        {
            id: 'tipo_leitura',
            label: 'MÉTODO DE LEITURA',
            minWidth: 150,
            format: (val) => {
                const map = {
                    'qr_code': 'QR CODE',
                    'barcode_ean13': 'EAN-13',
                    'barcode_128': 'CODE 128',
                    'number_only': 'SOMENTE NÚMERO'
                };
                return (
                    <Chip
                        label={map[val] || 'QR CODE'}
                        size="small"
                        variant="outlined"
                        sx={{ borderColor: 'rgba(255,255,255,0.2)', color: 'text.secondary', fontSize: '0.6rem' }}
                    />
                );
            }
        },
        {
            id: 'lote',
            label: 'LOTE NUMÉRICO',
            minWidth: 150,
            format: (_, row) => (
                <Typography variant="body2" sx={{ fontFamily: 'monospace', letterSpacing: '1px' }}>
                    {row.numero_inicial} — {row.numero_final}
                </Typography>
            )
        },
        {
            id: 'pulseira_areas_permitidas',
            label: 'PERMISSÕES DE ZONA',
            minWidth: 200,
            format: (permits) => (
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {permits?.map((p, i) => (
                        <Chip
                            key={i}
                            label={p.evento_areas?.nome_area}
                            size="small"
                            sx={{ background: 'rgba(0, 212, 255, 0.1)', color: '#00D4FF', fontSize: '0.65rem', fontWeight: 700 }}
                        />
                    ))}
                    {!permits?.length && <Typography variant="caption" color="error">SEM ACESSO</Typography>}
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
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            const [respPulseiras, respAreas] = await Promise.all([
                api.get('/config/pulseiras'),
                api.get('/config/areas')
            ]);
            setPulseiras(respPulseiras.data.data || []);
            setAreas(respAreas.data.data || []);
        } catch (error) {
            enqueueSnackbar('Erro ao carregar dados das pulseiras e áreas.', { variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleOpenDialog = () => {
        setFormData({
            nome_tipo: '',
            cor_hex: '#00D4FF',
            numero_inicial: '',
            numero_final: '',
            tipo_leitura: 'qr_code',
            areas_permitidas: []
        });
        setOpenDialog(true);
    };

    const handleCloseDialog = () => {
        setOpenDialog(false);
    };

    const handleAreaChange = (event) => {
        const { target: { value } } = event;
        setFormData({
            ...formData,
            areas_permitidas: typeof value === 'string' ? value.split(',') : value,
        });
    };

    const handleSave = async () => {
        const { nome_tipo, numero_inicial, numero_final } = formData;
        if (!nome_tipo || numero_inicial === '' || numero_final === '') {
            enqueueSnackbar('Preencha as informações do lote numérico e nome da pulseira.', { variant: 'warning' });
            return;
        }

        try {
            setSaving(true);
            const payload = {
                ...formData,
                numero_inicial: parseInt(numero_inicial),
                numero_final: parseInt(numero_final)
            };

            await api.post('/config/pulseiras', payload);
            enqueueSnackbar('Lote de pulseira provisionado com sucesso!', { variant: 'success' });
            handleCloseDialog();
            loadData();
        } catch (error) {
            enqueueSnackbar(error.response?.data?.error || 'Erro Crítico no Provisionamento.', { variant: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = (id) => {
        setItemToDelete(id);
        setOpenDeleteConfirm(true);
    };

    const confirmDelete = async () => {
        try {
            await api.delete(`/config/pulseiras/${itemToDelete}`);
            enqueueSnackbar('Lote destruído com sucesso.', { variant: 'success' });
            setOpenDeleteConfirm(false);
            setItemToDelete(null);
            loadData();
        } catch (error) {
            enqueueSnackbar('Falha ao remover lote. Verifique se existem pessoas atreladas a este lote.', { variant: 'error' });
        }
    };

    return (
        <Box sx={{ p: embedded ? 0 : 4, maxWidth: 1000, margin: '0 auto' }}>
            {!embedded && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 4 }}>
                    <PageHeader
                        title="Matriz de Pulseiras"
                        subtitle="Provisione lotes e aplique políticas restritivas de zonas baseadas em matriz de cores."
                    />
                    <NeonButton
                        startIcon={<AddIcon />}
                        onClick={handleOpenDialog}
                        sx={{ mt: 2 }}
                    >
                        Provisionar Lote
                    </NeonButton>
                </Box>
            )}

            {embedded && (
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
                    <NeonButton
                        startIcon={<AddIcon />}
                        onClick={handleOpenDialog}
                        size="small"
                    >
                        Provisionar Novo Lote
                    </NeonButton>
                </Box>
            )}

            <GlassCard glowColor="#7B2FBE" sx={{ p: 3, mb: 3 }}>
                <DataTable
                    columns={columns}
                    data={pulseiras}
                    loading={loading}
                    sx={{
                        '& .MuiTableHead-root': { background: 'rgba(123,47,190,0.05)' },
                        border: '1px solid rgba(123,47,190,0.05)'
                    }}
                />
            </GlassCard>

            <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth disableRestoreFocus>
                <DialogTitle sx={{ fontFamily: '"Orbitron", sans-serif', fontWeight: 700, letterSpacing: '2px', color: '#00D4FF' }}>
                    PROVISIONAMENTO DE PULSEIRA
                </DialogTitle>
                <DialogContent>
                    <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <Grid container spacing={2}>
                            <Grid item xs={8}>
                                <TextField
                                    label="Classificação / Código (Ex: VIP DIAMANTE)"
                                    fullWidth
                                    value={formData.nome_tipo}
                                    onChange={(e) => setFormData({ ...formData, nome_tipo: e.target.value })}
                                />
                            </Grid>
                            <Grid item xs={4}>
                                <TextField
                                    label="Cor (HEX)"
                                    type="color"
                                    fullWidth
                                    value={formData.cor_hex}
                                    onChange={(e) => setFormData({ ...formData, cor_hex: e.target.value })}
                                />
                            </Grid>
                        </Grid>

                        <Grid container spacing={2}>
                            <Grid item xs={6}>
                                <TextField
                                    label="Corda Numérica Inicial"
                                    type="number"
                                    fullWidth
                                    value={formData.numero_inicial}
                                    onChange={(e) => setFormData({ ...formData, numero_inicial: e.target.value })}
                                />
                            </Grid>
                            <Grid item xs={6}>
                                <TextField
                                    label="Corda Numérica Final"
                                    type="number"
                                    fullWidth
                                    value={formData.numero_final}
                                    onChange={(e) => setFormData({ ...formData, numero_final: e.target.value })}
                                />
                            </Grid>
                        </Grid>

                        <FormControl fullWidth size="small">
                            <InputLabel>Método de Leitura Principal</InputLabel>
                            <Select
                                value={formData.tipo_leitura}
                                onChange={(e) => setFormData({ ...formData, tipo_leitura: e.target.value })}
                                input={<OutlinedInput label="Método de Leitura Principal" />}
                                MenuProps={MenuProps}
                            >
                                <MenuItem value="qr_code">QR Code (Padrão)</MenuItem>
                                <MenuItem value="barcode_ean13">Código de Barras (EAN-13)</MenuItem>
                                <MenuItem value="barcode_128">Código de Barras (CODE 128)</MenuItem>
                                <MenuItem value="number_only">Somente Número (Digitação)</MenuItem>
                            </Select>
                        </FormControl>

                        <FormControl fullWidth size="small">
                            <InputLabel id="areas-label">Zonas de Acesso Permitidas</InputLabel>
                            <Select
                                labelId="areas-label"
                                multiple
                                value={formData.areas_permitidas}
                                onChange={handleAreaChange}
                                input={<OutlinedInput label="Zonas de Acesso Permitidas" />}
                                renderValue={(selected) => (
                                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                        {selected.map((value) => {
                                            const areaObj = areas.find(a => a.id === value);
                                            return <Chip key={value} label={areaObj?.nome_area} size="small" />;
                                        })}
                                    </Box>
                                )}
                                MenuProps={MenuProps}
                            >
                                {areas.map((area) => (
                                    <MenuItem key={area.id} value={area.id}>
                                        {area.nome_area}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Box>
                </DialogContent>
                <DialogActions sx={{ p: 3 }}>
                    <Button onClick={handleCloseDialog} disabled={saving} sx={{ color: 'text.secondary' }}>CANCELAR</Button>
                    <NeonButton onClick={handleSave} loading={saving} autoFocus>EXECUTAR</NeonButton>
                </DialogActions>
            </Dialog>

            {/* Confirm Delete Dialog */}
            <Dialog open={openDeleteConfirm} onClose={() => setOpenDeleteConfirm(false)}>
                <DialogTitle>Confirmar Exclusão</DialogTitle>
                <DialogContent>
                    <Typography>Tem certeza que deseja destruir este lote de pulseiras? Esta ação é irreversível.</Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenDeleteConfirm(false)}>Não, Manter</Button>
                    <Button onClick={confirmDelete} color="error" variant="contained">Sim, Destruir</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default ConfigPulseiras;
