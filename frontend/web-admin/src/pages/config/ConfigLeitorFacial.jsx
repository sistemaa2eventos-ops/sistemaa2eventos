import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    Box,
    Typography,
    Grid,
    TextField,
    Slider,
    Button,
    Chip,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Stack,
    IconButton,
    MenuItem,
    Tooltip,
    CircularProgress,
    FormControlLabel,
    Switch
} from '@mui/material';
import {
    Save as SaveIcon,
    FaceRetouchingNatural as FaceIcon,
    Add as AddIcon,
    Sync as SyncIcon,
    Delete as DeleteIcon,
    Settings as SettingsIcon,
    Refresh as RefreshIcon,
    Wifi as WifiIcon,
    WifiOff as WifiOffIcon,
    PowerSettingsNew as PowerIcon,
    VpnKey as VpnKeyIcon
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import api from '../../services/api';
import GlassCard from '../../components/common/GlassCard';
import NeonButton from '../../components/common/NeonButton';
import DataTable from '../../components/common/DataTable';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import PageHeader from '../../components/common/PageHeader';

const ConfigLeitorFacial = () => {
    const { enqueueSnackbar } = useSnackbar();
    const [searchParams] = useSearchParams();
    // Prioridade: URL param > localStorage (evento ativo selecionado)
    const eventoId = searchParams.get('evento_id') || localStorage.getItem('active_evento_id');

    const [readers, setReaders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [syncingId, setSyncingId] = useState(null);
    const [testingId, setTestingId] = useState(null);
    const [openDialog, setOpenDialog] = useState(false);
    const [openDeleteConfirm, setOpenDeleteConfirm] = useState(false);
    const [deviceToDelete, setDeviceToDelete] = useState(null);
    const [sensitivity, setSensitivity] = useState(85);
    const [liveness, setLiveness] = useState(true);
    const [authError, setAuthError] = useState(false);

    const [formData, setFormData] = useState({
        nome: '',
        marca: 'intelbras',
        tipo: 'terminal_facial',
        ip_address: '',
        porta: 80,
        user: 'admin',
        password: '',
        evento_id: eventoId,
        config: { modo_identificacao: false }
    });

    useEffect(() => {
        if (eventoId) {
            fetchReaders();
        } else {
            setLoading(false);
        }
        fetchGlobalSettings();
    }, [eventoId]);

    const fetchGlobalSettings = async () => {
        try {
            const response = await api.get('/settings');
            if (response.data.success) {
                setSensitivity(response.data.data.biometric_sensitivity || 85);
                setLiveness(!!response.data.data.liveness_check_enabled);
            }
        } catch (error) {
            console.error('Erro ao buscar configurações globais:', error);
        }
    };

    const fetchReaders = async () => {
        try {
            setLoading(true);
            setAuthError(false);
            const response = await api.get('/dispositivos', { params: { evento_id: eventoId } });
            // Filtrar apenas terminais faciais
            const facialReaders = response.data.data.filter(d => d.tipo === 'terminal_facial');
            setReaders(facialReaders);
        } catch (error) {
            console.error('Erro ao buscar leitores:', error);
            if (error.response?.status === 401) {
                setAuthError(true);
            }
        } finally {
            setLoading(false);
        }
    };


    const handleOpenDialog = (device = null) => {
        if (device) {
            setFormData({
                id: device.id,
                nome: device.nome,
                marca: device.marca || 'intelbras',
                tipo: device.tipo,
                ip_address: device.ip_address,
                porta: device.porta || 80,
                user: device.user_device || 'admin',
                password: device.password_device || '',
                evento_id: device.evento_id || eventoId,
                config: device.config || { modo_identificacao: false }
            });
        } else {
            setFormData({
                nome: '',
                marca: 'intelbras',
                tipo: 'terminal_facial',
                ip_address: '',
                porta: 80,
                user: 'admin',
                password: '',
                evento_id: eventoId,
                config: { modo_identificacao: false }
            });
        }
        setOpenDialog(true);
    };

    const handleSave = async (e) => {
        if (e && e.preventDefault) e.preventDefault();
        try {
            if (!eventoId) {
                enqueueSnackbar('Erro: Evento não selecionado.', { variant: 'error' });
                return;
            }

            const payload = {
                nome: formData.nome,
                marca: formData.marca,
                tipo: formData.tipo,
                ip_address: formData.ip_address,
                porta: parseInt(formData.porta, 10),
                user_device: formData.user,
                password_device: formData.password,
                evento_id: eventoId,
                config: formData.config
            };

            if (formData.id) {
                await api.put(`/dispositivos/${formData.id}`, payload);
            } else {
                await api.post('/dispositivos', payload);
            }
            setOpenDialog(false);
            enqueueSnackbar('Terminal facial salvo com sucesso!', { variant: 'success' });
            fetchReaders();
        } catch (error) {
            console.error('Erro ao salvar dispositivo:', error);
            const msg = error.response?.data?.error || error.message;
            enqueueSnackbar(`Falha ao salvar terminal: ${msg}`, { variant: 'error' });
        }
    };

    const handleDelete = async () => {
        try {
            await api.delete(`/dispositivos/${deviceToDelete.id}`);
            setOpenDeleteConfirm(false);
            enqueueSnackbar('Dispositivo removido.', { variant: 'info' });
            fetchReaders();
        } catch (error) {
            console.error('Erro ao deletar dispositivo:', error);
            enqueueSnackbar('Falha ao remover dispositivo.', { variant: 'error' });
        }
    };

    const handleSync = async (id) => {
        try {
            setSyncingId(id);
            const response = await api.post(`/dispositivos/${id}/sync`);

            if (response.data.success) {
                enqueueSnackbar(`🚀 Sincronização Finalizada: ${response.data.count}/${response.data.total} faces atualizadas.`, { variant: 'success' });
            } else {
                enqueueSnackbar(`⚠️ Atenção: ${response.data.error || 'Erro desconhecido na comunicação com o hardware.'}`, { variant: 'warning' });
            }
        } catch (error) {
            console.error('Erro na sincronização:', error);
            const errorMsg = error.response?.data?.error || 'Verifique se o terminal está ligado e na mesma rede.';
            enqueueSnackbar(`Falha Crítica na Sincronização: ${errorMsg}`, { variant: 'error' });
        } finally {
            setSyncingId(null);
        }
    };

    const handleTestDevice = async (device) => {
        try {
            setTestingId(device.id);
            const response = await api.post('/dispositivos/test-connection', {
                ip_address: device.ip_address,
                porta: device.porta
            });
            if (response.data.success) {
                enqueueSnackbar(`Conexão OK: ${device.nome} está respondendo!`, { variant: 'success' });
            }
        } catch (error) {
            const msg = error.response?.data?.error || 'Terminal inalcançável na rede local';
            enqueueSnackbar(`Falha: ${device.nome} (${device.ip_address}) - ${msg}`, { variant: 'error' });
        } finally {
            setTestingId(null);
        }
    };

    const handleSaveGlobal = async () => {
        try {
            setLoading(true);
            const response = await api.put('/settings', {
                biometric_sensitivity: sensitivity,
                liveness_check_enabled: liveness
            });
            if (response.data.success) {
                enqueueSnackbar('Configurações biométricas globais salvas!', { variant: 'success' });
            }
        } catch (error) {
            console.error('Erro ao salvar settings globais:', error);
            enqueueSnackbar('Falha ao salvar configurações globais.', { variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const columns = [
        {
            id: 'nome',
            label: 'DISPOSITIVO',
            minWidth: 150,
            format: (val, row) => (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <FaceIcon sx={{ color: '#00D4FF', fontSize: 20 }} />
                    <Box>
                        <Stack direction="row" alignItems="center" spacing={1}>
                            <Typography variant="body2" sx={{ fontWeight: 700 }}>{val}</Typography>
                            {row.config?.modo_identificacao && (
                                <Tooltip title="Modo Identificação (Não libera catraca, apenas identifica)">
                                    <VpnKeyIcon sx={{ fontSize: 14, color: '#FFC107' }} />
                                </Tooltip>
                            )}
                        </Stack>
                        <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase' }}>
                            {row.marca}
                        </Typography>
                    </Box>
                </Box>
            )
        },
        { id: 'ip_address', label: 'ENDEREÇO IP', minWidth: 120 },
        {
            id: 'status',
            label: 'STATUS',
            minWidth: 100,
            format: (val) => (
                <Chip
                    icon={val === 'online' ? <WifiIcon /> : <WifiOffIcon />}
                    label={val === 'online' ? 'ONLINE' : 'OFFLINE'}
                    color={val === 'online' ? 'success' : 'error'}
                    size="small"
                    variant="outlined"
                    sx={{ fontWeight: 700 }}
                />
            )
        },
        {
            id: 'acoes',
            label: 'AÇÕES',
            minWidth: 180,
            align: 'center',
            format: (_, row) => (
                <Stack direction="row" spacing={1} justifyContent="center">
                    <Tooltip title="Testar Conexão">
                        <IconButton
                            size="small"
                            onClick={() => handleTestDevice(row)}
                            disabled={testingId === row.id}
                            sx={{ color: '#00FF88', background: 'rgba(0,255,136,0.05)' }}
                        >
                            {testingId === row.id ? <CircularProgress size={20} color="inherit" /> : <PowerIcon fontSize="small" />}
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Sincronizar Faces">
                        <IconButton
                            size="small"
                            onClick={() => handleSync(row.id)}
                            disabled={syncingId === row.id}
                            sx={{ color: '#00D4FF', background: 'rgba(0,212,255,0.05)' }}
                        >
                            {syncingId === row.id ? <CircularProgress size={20} color="inherit" /> : <SyncIcon fontSize="small" />}
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Editar">
                        <IconButton
                            size="small"
                            onClick={() => handleOpenDialog(row)}
                            sx={{ color: '#fff', background: 'rgba(255,255,255,0.05)' }}
                        >
                            <SettingsIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Remover">
                        <IconButton
                            size="small"
                            onClick={() => { setDeviceToDelete(row); setOpenDeleteConfirm(true); }}
                            sx={{ color: '#FF3366', background: 'rgba(255,51,102,0.05)' }}
                        >
                            <DeleteIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </Stack>
            )
        },
    ];

    return (
        <Box sx={{ p: { xs: 2, md: 4 } }}>
            <PageHeader
                title="Leitores Faciais"
                subtitle="Provisione endpoints de detecção biométrica standalone."
                breadcrumbs={[{ text: 'Sistema' }, { text: 'Configurações' }, { text: 'Biometria' }]}
            />
            {/* Alerta: Nenhum evento selecionado */}
            {!eventoId && (
                <GlassCard sx={{ p: 3, mb: 3, border: '1px solid rgba(255, 193, 7, 0.4)', background: 'rgba(255, 193, 7, 0.05)' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <WifiOffIcon sx={{ color: '#FFC107', fontSize: 28 }} />
                        <Box>
                            <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#FFC107' }}>
                                NENHUM EVENTO SELECIONADO
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                Selecione um evento ativo na tela de Eventos e depois volte aqui.
                            </Typography>
                        </Box>
                    </Box>
                </GlassCard>
            )}

            {/* Alerta: Sessão expirada */}
            {authError && (
                <GlassCard sx={{ p: 3, mb: 3, border: '1px solid rgba(255, 51, 102, 0.4)', background: 'rgba(255, 51, 102, 0.05)' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <WifiOffIcon sx={{ color: '#FF3366', fontSize: 28 }} />
                        <Box>
                            <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#FF3366' }}>
                                SESSÃO EXPIRADA
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                Sua sessão expirou. Faça logout e login novamente para continuar.
                            </Typography>
                        </Box>
                    </Box>
                </GlassCard>
            )}

            <Grid container spacing={4}>
                <Grid item xs={12} lg={8}>

                    <GlassCard sx={{ p: 3, mb: 4 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                <RefreshIcon
                                    sx={{ color: '#00D4FF', cursor: 'pointer' }}
                                    onClick={fetchReaders}
                                    className={loading ? 'ani-spin' : ''}
                                />
                                <Typography variant="h6" sx={{ fontWeight: 700, color: '#fff' }}>
                                    TERMINAIS FACIAIS
                                </Typography>
                            </Box>
                            <NeonButton startIcon={<AddIcon />} size="small" onClick={() => handleOpenDialog()}>
                                NOVO TERMINAL
                            </NeonButton>
                        </Box>
                        <DataTable
                            columns={columns}
                            data={readers}
                            loading={loading}
                        />
                    </GlassCard>
                </Grid>

                <Grid item xs={12} lg={4}>
                    <GlassCard sx={{ p: 3 }}>
                        <Typography variant="h6" sx={{ fontWeight: 700, color: '#fff', mb: 3 }}>
                            PARÂMETROS BIOMÉTRICOS
                        </Typography>

                        <Box sx={{ mb: 4 }}>
                            <Typography gutterBottom sx={{ color: 'text.secondary' }}>Limiar de Reconhecimento ({sensitivity}%)</Typography>
                            <Slider
                                value={sensitivity}
                                onChange={(e, val) => setSensitivity(val)}
                                valueLabelDisplay="auto"
                                sx={{ color: '#00D4FF' }}
                            />
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                Confiança mínima para abertura da catraca.
                            </Typography>
                        </Box>

                        <Box sx={{ mb: 4 }}>
                            <Typography gutterBottom sx={{ color: 'text.secondary' }}>Anti-Fake (Liveness)</Typography>
                            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                <Chip
                                    label="ATIVADO"
                                    onClick={() => setLiveness(true)}
                                    color={liveness ? "primary" : "default"}
                                    variant={liveness ? "filled" : "outlined"}
                                />
                                <Chip
                                    label="DESATIVADO"
                                    onClick={() => setLiveness(false)}
                                    color={!liveness ? "error" : "default"}
                                    variant={!liveness ? "filled" : "outlined"}
                                />
                            </Box>
                        </Box>

                        <NeonButton startIcon={<SaveIcon />} fullWidth onClick={handleSaveGlobal} disabled={loading}>
                            {loading ? 'SALVANDO...' : 'SALVAR CONFIGURAÇÕES GLOBAIS'}
                        </NeonButton>
                    </GlassCard>
                </Grid>
            </Grid>

            {/* Dialog de Cadastro */}
            <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
                <form onSubmit={handleSave}>
                    <DialogTitle>
                        <Typography variant="h6" component="span" sx={{ fontWeight: 800 }}>
                            {formData.id ? 'EDITAR TERMINAL' : 'NOVO TERMINAL FACIAL'}
                        </Typography>
                    </DialogTitle>
                    <DialogContent>
                        <Grid container spacing={2} sx={{ mt: 1 }}>
                            <Grid item xs={12} md={8}>
                                <TextField
                                    fullWidth label="Nome do Dispositivo"
                                    value={formData.nome}
                                    required
                                    onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                                />
                            </Grid>
                            <Grid item xs={12} md={4}>
                                <TextField
                                    select fullWidth label="Marca"
                                    value={formData.marca}
                                    required
                                    onChange={(e) => setFormData({ ...formData, marca: e.target.value })}
                                >
                                    <MenuItem value="intelbras">Intelbras (Bio-T/Face)</MenuItem>
                                    <MenuItem value="hikvision">Hikvision (MinMoe)</MenuItem>
                                </TextField>
                            </Grid>
                            <Grid item xs={12}>
                                <Box sx={{ p: 2, bgcolor: 'rgba(0, 212, 255, 0.05)', borderRadius: 1, border: '1px dashed rgba(0, 212, 255, 0.2)' }}>
                                    <Typography variant="caption" sx={{ color: '#00D4FF', display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <WifiIcon sx={{ fontSize: 14 }} />
                                        Dica Bio-T (SS 5541 MF W): Use IP Fixo no leitor para evitar perda de comunicação.
                                    </Typography>
                                </Box>
                            </Grid>
                            <Grid item xs={12} md={8}>
                                <TextField
                                    fullWidth label="Endereço IP"
                                    placeholder="192.168.1.100"
                                    value={formData.ip_address}
                                    required
                                    onChange={(e) => setFormData({ ...formData, ip_address: e.target.value })}
                                />
                            </Grid>
                            <Grid item xs={12} md={4}>
                                <TextField
                                    fullWidth label="Porta API"
                                    type="number"
                                    value={formData.porta}
                                    required
                                    onChange={(e) => setFormData({ ...formData, porta: e.target.value })}
                                />
                            </Grid>
                            <Grid item xs={12}>
                                <GlassCard sx={{ p: 2, background: 'rgba(255,193,7,0.05)', borderColor: 'rgba(255,193,7,0.2)' }}>
                                    <FormControlLabel
                                        control={
                                            <Switch
                                                checked={!!formData.config?.modo_identificacao}
                                                onChange={(e) => setFormData({
                                                    ...formData,
                                                    config: { ...formData.config, modo_identificacao: e.target.checked }
                                                })}
                                                color="warning"
                                            />
                                        }
                                        label={
                                            <Box>
                                                <Typography variant="subtitle2" sx={{ color: '#FFC107', fontWeight: 800 }}>Modo Identidade (Recepção)</Typography>
                                                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                                                    Neste modo, o terminal NÃO realiza validação ou acesso. Ele apenas captura a digital/face e envia o perfil para a tela do Terminal Web do operador vinculado validar e emitir pulseira.
                                                </Typography>
                                            </Box>
                                        }
                                    />
                                </GlassCard>
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <TextField
                                    fullWidth label="Usuário Dispositivo"
                                    value={formData.user}
                                    required
                                    onChange={(e) => setFormData({ ...formData, user: e.target.value })}
                                />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <TextField
                                    fullWidth label="Senha Dispositivo"
                                    type="password"
                                    value={formData.password}
                                    required
                                    autoComplete="current-password"
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                />
                            </Grid>
                        </Grid>
                    </DialogContent>
                    <DialogActions sx={{ p: 3 }}>
                        <Button onClick={() => setOpenDialog(false)} sx={{ color: 'text.secondary' }}>CANCELAR</Button>
                        <NeonButton type="submit">SALVAR TERMINAL</NeonButton>
                    </DialogActions>
                </form>
            </Dialog>

            <ConfirmDialog
                open={openDeleteConfirm}
                title="Remover Terminal"
                message={`Deseja realmente remover o dispositivo "${deviceToDelete?.nome}"? Isso não afetará os dados no leitor físico.`}
                onConfirm={handleDelete}
                onCancel={() => setOpenDeleteConfirm(false)}
            />
        </Box >
    );
};

export default ConfigLeitorFacial;
