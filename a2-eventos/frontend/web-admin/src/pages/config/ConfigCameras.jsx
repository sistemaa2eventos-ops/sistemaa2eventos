import React, { useState, useEffect } from 'react';
import { Box, Typography, Grid, TextField, Button, Chip, Stack, MenuItem, IconButton, CircularProgress } from '@mui/material';
import { Save as SaveIcon, Videocam as CameraIcon, MeetingRoom as DoorIcon, Add as AddIcon, Delete as DeleteIcon, Refresh as RefreshIcon } from '@mui/icons-material';
import { useSearchParams } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import api from '../../services/api';
import GlassCard from '../../components/common/GlassCard';
import NeonButton from '../../components/common/NeonButton';
import PageHeader from '../../components/common/PageHeader';

const ConfigHardware = () => {
    const { enqueueSnackbar } = useSnackbar();
    const [searchParams] = useSearchParams();
    const eventoId = searchParams.get('evento_id') || localStorage.getItem('active_evento_id');

    const [dispositivos, setDispositivos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const fetchDevices = async () => {
        if (!eventoId) {
            setLoading(false);
            return;
        }
        try {
            setLoading(true);
            const response = await api.get('/dispositivos', { params: { evento_id: eventoId } });
            // Filtrar para mostrar apenas cameras e catracas (exclui terminal_facial que está noutra tab)
            const edgeDevices = response.data.data.filter(d => ['camera', 'catraca'].includes(d.tipo));

            // Mapear campos do BD para nomes que o form já usa
            const formatted = edgeDevices.map(d => ({
                id: d.id,
                isNew: false, // Flag interna 
                tipo: d.tipo,
                nome: d.nome,
                ip: d.ip_address,
                porta: d.porta || (d.tipo === 'camera' ? 554 : 80),
                user: d.user_device || 'admin',
                pass: d.password_device || '',
                url: d.tipo === 'camera'
                    ? `rtsp://${d.user_device || 'admin'}:${d.password_device || ''}@${d.ip_address}:${d.porta || 554}/cam/realmonitor`
                    : `tcp://${d.ip_address}:${d.porta || 80}`
            }));

            setDispositivos(formatted);
        } catch (error) {
            enqueueSnackbar('Erro ao buscar hardware edge.', { variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDevices();
    }, [eventoId]);

    const handleUpdate = (id, field, value) => {
        setDispositivos(prev => prev.map(d => {
            if (d.id === id) {
                const updated = { ...d, [field]: value };
                // Autogera URL de conexão se o IP, porta, user ou senha mudarem
                if (['ip', 'porta', 'user', 'pass'].includes(field)) {
                    if (updated.tipo === 'camera') {
                        updated.url = `rtsp://${updated.user}:${updated.pass}@${updated.ip}:${updated.porta}/cam/realmonitor`;
                    } else {
                        updated.url = `tcp://${updated.ip}:${updated.porta}`;
                    }
                }
                return updated;
            }
            return d;
        }));
    };

    const handleAdd = (tipo) => {
        setDispositivos([
            ...dispositivos,
            {
                id: Date.now().toString(),
                isNew: true, // Flag para marcar como INSERT vs UPDATE post
                tipo,
                nome: `Novo(a) ${tipo === 'camera' ? 'Câmera' : 'Catraca'}`,
                ip: '192.168.1.100',
                porta: tipo === 'camera' ? '554' : '80',
                user: 'admin',
                pass: 'admin',
                url: ''
            }
        ]);
    };

    const handleDelete = async (indexOrId, isNew = false) => {
        if (isNew) {
            setDispositivos(prev => prev.filter(d => d.id !== indexOrId));
            return;
        }

        try {
            await api.delete(`/dispositivos/${indexOrId}`);
            setDispositivos(prev => prev.filter(d => d.id !== indexOrId));
        } catch (error) {
            enqueueSnackbar('Falha ao excluir dispositivo!', { variant: 'error' });
        }
    };

    const handleSave = async (e) => {
        if (e && e.preventDefault) e.preventDefault();
        if (!eventoId) {
            enqueueSnackbar('Selecione um evento na home primeiro!', { variant: 'warning' });
            return;
        }

        try {
            setSaving(true);

            // Disparar salvamento síncrono para cada item alterado ou novo
            for (const d of dispositivos) {
                const payload = {
                    evento_id: eventoId,
                    nome: d.nome,
                    tipo: d.tipo,
                    ip_address: d.ip,
                    porta: parseInt(d.porta, 10),
                    user_device: d.user,
                    password_device: d.pass
                };

                if (d.isNew) {
                    await api.post('/dispositivos', payload);
                } else {
                    await api.put(`/dispositivos/${d.id}`, payload);
                }
            }

            enqueueSnackbar('Configurações de Edge salvas. O driver reiniciará os nós.', { variant: 'success' });
            await fetchDevices(); // Reload p refrescar ids gerados

        } catch (error) {
            enqueueSnackbar('Ocorreu um problema ao salvar as configurações.', { variant: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const renderDeviceForm = (dispositivo) => {
        const isCamera = dispositivo.tipo === 'camera';
        return (
            <GlassCard key={dispositivo.id} sx={{ p: 2, mb: 2, position: 'relative', borderLeft: isCamera ? '4px solid #00D4FF' : '4px solid #FF0088' }}>
                <IconButton sx={{ position: 'absolute', top: 8, right: 8 }} color="error" size="small" onClick={() => handleDelete(dispositivo.id, dispositivo.isNew)}>
                    <DeleteIcon fontSize="small" />
                </IconButton>
                <Grid container spacing={2}>
                    <Grid item xs={12} md={3}>
                        <TextField
                            label="Nome de Identificação" fullWidth size="small"
                            value={dispositivo.nome} onChange={(e) => handleUpdate(dispositivo.id, 'nome', e.target.value)}
                        />
                    </Grid>
                    <Grid item xs={6} md={3}>
                        <TextField
                            label="Endereço IP" fullWidth size="small"
                            value={dispositivo.ip} onChange={(e) => handleUpdate(dispositivo.id, 'ip', e.target.value)}
                        />
                    </Grid>
                    <Grid item xs={6} md={2}>
                        <TextField
                            label="Porta" fullWidth size="small"
                            value={dispositivo.porta} onChange={(e) => handleUpdate(dispositivo.id, 'porta', e.target.value)}
                        />
                    </Grid>
                    <Grid item xs={6} md={2}>
                        <TextField
                            label="Usuário" fullWidth size="small"
                            value={dispositivo.user} onChange={(e) => handleUpdate(dispositivo.id, 'user', e.target.value)}
                        />
                    </Grid>
                    <Grid item xs={6} md={2}>
                        <TextField
                            label="Senha" fullWidth size="small" type="password"
                            value={dispositivo.pass} onChange={(e) => handleUpdate(dispositivo.id, 'pass', e.target.value)}
                        />
                    </Grid>
                    <Grid item xs={12}>
                        <TextField
                            label={isCamera ? "URL RTSP Gerada (Read-only)" : "URL API TCP/HTTP (Read-only)"}
                            fullWidth size="small" disabled
                            value={dispositivo.url}
                            sx={{ '& .MuiInputBase-input.Mui-disabled': { color: 'rgba(255,255,255,0.7)' } }}
                        />
                    </Grid>
                </Grid>
            </GlassCard>
        );
    };

    return (
        <Box sx={{ p: { xs: 2, md: 4 } }}>
            <PageHeader
                title="Câmeras IP e Catracas"
                subtitle="Integração RTMP/TCP com hardwares Edge de controle periférico."
                breadcrumbs={[{ text: 'Sistema' }, { text: 'Configurações' }, { text: 'Equipamentos' }]}
            />
            <Grid container spacing={4} sx={{ mt: 1 }}>
                <Grid item xs={12} lg={8}>
                    <form onSubmit={handleSave}>
                        <GlassCard sx={{ p: 3, mb: 4 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                    <CameraIcon sx={{ color: '#00D4FF' }} />
                                    <Typography variant="h6" sx={{ fontWeight: 700, color: '#fff' }}>
                                        MATRIZ DE DISPOSITIVOS
                                    </Typography>
                                </Box>
                                <Box sx={{ display: 'flex', gap: 2 }}>
                                    <Button startIcon={<AddIcon />} variant="outlined" size="small" sx={{ borderColor: '#00D4FF', color: '#00D4FF' }} onClick={() => handleAdd('camera')}>
                                        NOVA CÂMERA
                                    </Button>
                                    <Button startIcon={<AddIcon />} variant="outlined" size="small" sx={{ borderColor: '#FF0088', color: '#FF0088' }} onClick={() => handleAdd('catraca')}>
                                        NOVA CATRACA
                                    </Button>
                                </Box>
                            </Box>

                            <Stack spacing={1}>
                                {loading ? (
                                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                                        <CircularProgress color="secondary" />
                                    </Box>
                                ) : (
                                    <>
                                        {dispositivos.map(renderDeviceForm)}
                                        {dispositivos.length === 0 && (
                                            <Typography variant="caption" sx={{ color: 'text.secondary', textAlign: 'center', py: 4 }}>
                                                {!eventoId ? 'Selecione um evento para gerenciar Edge Hardware' : 'Nenhum dispositivo de edge vinculado ao evento.'}
                                            </Typography>
                                        )}
                                    </>
                                )}
                            </Stack>

                            <Box sx={{ mt: 4, display: 'flex', justifyContent: 'flex-end' }}>
                                <NeonButton type="submit" startIcon={<SaveIcon />} loading={saving}>
                                    SALVAR MUDANÇAS NO EDGE SERVICE
                                </NeonButton>
                            </Box>
                        </GlassCard>
                    </form>
                </Grid>

                <Grid item xs={12} lg={4}>
                    <GlassCard sx={{ p: 3, borderLeft: '1px solid #FF0088' }}>
                        <Typography variant="h6" sx={{ fontWeight: 700, color: '#FF0088', mb: 2 }}>
                            Integração Edge
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
                            Os dispositivos listados aqui serão provisionados instantaneamente para o micro-serviço Python de IA e para a Controladora de Acesso físico (Intelbras/Hikvision).
                            Nenhuma reinicialização do Docker é necessária.
                        </Typography>

                        <GlassCard sx={{ p: 2, background: 'rgba(255,255,255,0.02)' }}>
                            <Typography variant="subtitle2" sx={{ color: '#00D4FF', fontWeight: 600, mb: 1 }}>Motor de Reconhecimento</Typography>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dotted rgba(255,255,255,0.1)', pb: 1, mb: 1 }}>
                                <Typography variant="caption">Microserviço Face-Python</Typography>
                                <Chip size="small" label="ONLINE" color="success" />
                            </Box>
                            <Typography variant="subtitle2" sx={{ color: '#00D4FF', fontWeight: 600, mb: 1, mt: 2 }}>Driver de Catracas</Typography>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography variant="caption">Integração API Rest / TCP</Typography>
                                <Chip size="small" label="ATIVO" color="primary" />
                            </Box>
                        </GlassCard>
                    </GlassCard>
                </Grid>
            </Grid>
        </Box>
    );
};

export default ConfigHardware;
