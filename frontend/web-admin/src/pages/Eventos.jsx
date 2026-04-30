import React, { useState, useEffect } from 'react';
import {
    Box,
    Grid,
    Typography,
    IconButton,
    Tooltip,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    Button,
    Stack,
    Chip,
    Avatar,
} from '@mui/material';
import {
    Add as AddIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    Event as EventIcon,
    LocationOn as LocationIcon,
    People as PeopleIcon,
    Business as BusinessIcon,
    CalendarToday as CalendarIcon,
    PlayArrow as StartIcon,
    CheckCircle as ActiveIcon,
    History as ResetIcon
} from '@mui/icons-material';
import api from '../services/api';
import GlassCard from '../components/common/GlassCard';
import PageHeader from '../components/common/PageHeader';
import NeonButton from '../components/common/NeonButton';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { styled } from '@mui/material/styles';
import { format, eachDayOfInterval, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import {
    Divider,
    Switch,
    FormControlLabel,
    Tabs,
    Tab,
    FormGroup,
    Checkbox,
    Alert
} from '@mui/material';

const EventBadge = styled(Chip)(({ status }) => ({
    fontWeight: 700,
    fontSize: '0.65rem',
    height: 24,
    background: status === 'ativo' ? 'rgba(0, 255, 136, 0.1)' : 'rgba(255, 184, 0, 0.1)',
    color: status === 'ativo' ? '#00FF88' : '#FFB800',
    border: `1px solid ${status === 'ativo' ? 'rgba(0, 255, 136, 0.2)' : 'rgba(255, 184, 0, 0.2)'}`,
    textTransform: 'uppercase',
    letterSpacing: '1px'
}));

const Eventos = ({ isEmbedded = false }) => {
    const navigate = useNavigate();
    const [eventos, setEventos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [openDialog, setOpenDialog] = useState(false);
    const [openDeleteConfirm, setOpenDeleteConfirm] = useState(false);
    const [eventoToDelete, setEventoToDelete] = useState(null);
    const [selectedEvento, setSelectedEvento] = useState(null);
    const [tabValue, setTabValue] = useState(0);
    const [formData, setFormData] = useState({
        nome: '',
        descricao: '',
        local: '',
        data_inicio: '',
        data_fim: '',
        capacidade_total: '',
        datas_montagem: [],
        datas_evento: [],
        datas_desmontagem: [],
        horario_reset: '00:00',
        tipos_checkin: ['qrcode', 'barcode', 'manual'],
        tipos_checkout: ['qrcode', 'barcode', 'manual'],
        impressao_etiquetas: false,
        modules: []
    });

    useEffect(() => {
        loadEventos();
    }, []);

    const loadEventos = async () => {
        try {
            setLoading(true);
            const response = await api.get('/eventos');
            setEventos(response.data.data || []);
        } catch (error) {
            console.error('Erro ao carregar eventos:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenDialog = (evento = null) => {
        setTabValue(0);
        if (evento) {
            setSelectedEvento(evento);
            setFormData({
                nome: evento.nome || '',
                descricao: evento.descricao || '',
                local: evento.local || '',
                data_inicio: evento.data_inicio ? format(new Date(evento.data_inicio), "yyyy-MM-dd") : '',
                data_fim: evento.data_fim ? format(new Date(evento.data_fim), "yyyy-MM-dd") : '',
                capacidade_total: evento.capacidade_total || '',
                datas_montagem: evento.datas_montagem || [],
                datas_evento: evento.datas_evento || [],
                datas_desmontagem: evento.datas_desmontagem || [],
                horario_reset: evento.horario_reset || '00:00',
                tipos_checkin: evento.tipos_checkin || ['qrcode', 'barcode', 'manual'],
                tipos_checkout: evento.tipos_checkout || ['qrcode', 'barcode', 'manual'],
                impressao_etiquetas: !!evento.impressao_etiquetas,
                modules: evento.event_modules || []
            });
        } else {
            setSelectedEvento(null);
            setFormData({
                nome: '',
                descricao: '',
                local: '',
                data_inicio: '',
                data_fim: '',
                capacidade_total: '',
                datas_montagem: [],
                datas_evento: [],
                datas_desmontagem: [],
                horario_reset: '00:00',
                tipos_checkin: ['qrcode', 'barcode', 'manual'],
                tipos_checkout: ['qrcode', 'barcode', 'manual'],
                impressao_etiquetas: false,
                modules: []
            });
        }
        setOpenDialog(true);
    };

    const handleCloseDialog = () => {
        setOpenDialog(false);
        setSelectedEvento(null);
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            const { modules, ...payload } = formData;
            if (selectedEvento) {
                await api.put(`/eventos/${selectedEvento.id}`, payload);
            } else {
                await api.post('/eventos', payload);
            }
            handleCloseDialog();
            loadEventos();
        } catch (error) {
            console.error('Erro ao salvar evento:', error);
            alert('Falha ao salvar evento. Verifique o console para mais detalhes.');
        } finally {
            setSaving(false);
        }
    };

    const handleToggleModule = async (moduleKey, isEnabled) => {
        if (!selectedEvento) return;
        try {
            await api.patch(`/eventos/${selectedEvento.id}/toggle-module`, {
                module_key: moduleKey,
                is_enabled: isEnabled
            });

            setFormData(prev => ({
                ...prev,
                modules: prev.modules.map(m =>
                    m.module_key === moduleKey ? { ...m, is_enabled: isEnabled } : m
                )
            }));
        } catch (error) {
            console.error('Erro ao alternar módulo:', error);
            alert('Falha ao atualizar configuração do módulo.');
        }
    };

    const toggleStatus = async (evento) => {
        try {
            const action = evento.status === 'ativo' ? 'deactivate' : 'activate';
            await api.patch(`/eventos/${evento.id}/${action}`);
            loadEventos();
        } catch (error) {
            alert('Falha ao alterar status do evento');
        }
    };

    const handleDelete = (id) => {
        setEventoToDelete(id);
        setOpenDeleteConfirm(true);
    };

    const confirmDelete = async () => {
        try {
            setDeleteLoading(true);
            await api.delete(`/eventos/${eventoToDelete}`);
            setOpenDeleteConfirm(false);
            setEventoToDelete(null);
            loadEventos();
        } catch (error) {
            alert('Erro ao excluir evento');
        } finally {
            setDeleteLoading(false);
        }
    };

    const handleGerenciar = async (evento) => {
        try {
            await api.post('/auth/active-event', { evento_id: evento.id });
            localStorage.setItem('active_evento_id', evento.id);
            localStorage.setItem('active_evento_nome', evento.nome);

            // Forçar atualização do dashboard/sidebar recarregando ou via evento global
            window.dispatchEvent(new Event('storage'));

            navigate(`/empresas?evento_id=${evento.id}`);
        } catch (error) {
            console.error('Erro ao vincular evento ao perfil:', error);
            alert('Falha ao vincular evento ao seu perfil de acesso.');
        }
    };

    const handleDateToggle = (date, phase) => {
        const field = `datas_${phase}`;
        setFormData(prev => {
            const current = [...(prev[field] || [])];
            const index = current.indexOf(date);
            if (index === -1) {
                current.push(date);
            } else {
                current.splice(index, 1);
            }
            return { ...prev, [field]: current };
        });
    };

    const handleSelectAll = (phase) => {
        const allDates = generateDateRange();
        setFormData(prev => ({ ...prev, [`datas_${phase}`]: allDates }));
    };

    const handleClearAll = (phase) => {
        setFormData(prev => ({ ...prev, [`datas_${phase}`]: [] }));
    };

    const generateDateRange = () => {
        if (!formData.data_inicio || !formData.data_fim) return [];
        try {
            return eachDayOfInterval({
                start: parseISO(formData.data_inicio),
                end: parseISO(formData.data_fim)
            }).map(d => format(d, 'yyyy-MM-dd'));
        } catch (e) {
            return [];
        }
    };

    return (
        <Box sx={{ p: isEmbedded ? 2 : 4 }}>
            <Box sx={{ display: 'flex', justifyContent: isEmbedded ? 'flex-end' : 'space-between', alignItems: 'flex-start', mb: 4 }}>
                {!isEmbedded && (
                    <PageHeader
                        title="Central de Eventos"
                        subtitle="Crie e gerencie os hubs de acesso do sistema."
                        breadcrumbs={[{ text: 'Dashboard' }, { text: 'Eventos' }]}
                    />
                )}
                <NeonButton
                    startIcon={<AddIcon />}
                    onClick={() => handleOpenDialog()}
                    sx={{ mt: isEmbedded ? 0 : 2 }}
                >
                    Novo Evento
                </NeonButton>
            </Box>

            <Grid container spacing={3}>
                {eventos.map((evento) => (
                    <Grid item xs={12} md={6} lg={4} key={evento.id}>
                        <GlassCard glowColor="#00D4FF">
                            <Box sx={{ p: 3 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                                    <Avatar sx={{ bgcolor: 'rgba(0, 212, 255, 0.1)', color: '#00D4FF', width: 56, height: 56 }}>
                                        <EventIcon fontSize="large" />
                                    </Avatar>
                                    <Stack alignItems="flex-end">
                                        <EventBadge status={evento.status} label={evento.status} />
                                        <FormControlLabel
                                            control={
                                                <Switch
                                                    size="small"
                                                    checked={evento.status === 'ativo'}
                                                    onChange={() => toggleStatus(evento)}
                                                    color="success"
                                                />
                                            }
                                            label={<Typography variant="caption" sx={{ color: 'text.secondary' }}>ATIVO</Typography>}
                                            labelPlacement="start"
                                        />
                                    </Stack>
                                </Box>

                                <Typography variant="h5" sx={{ fontWeight: 800, color: '#fff', mb: 1, textTransform: 'uppercase', letterSpacing: '1px' }}>
                                    {evento.nome}
                                </Typography>

                                <Stack spacing={1} sx={{ mb: 3 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
                                        <LocationIcon sx={{ fontSize: 16 }} />
                                        <Typography variant="body2">{evento.local || 'Local não definido'}</Typography>
                                    </Box>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
                                        <CalendarIcon sx={{ fontSize: 16 }} />
                                        <Typography variant="body2">
                                            {evento.data_inicio ? format(new Date(evento.data_inicio), "dd/MM/yy") : '??'} até {evento.data_fim ? format(new Date(evento.data_fim), "dd/MM/yy") : '??'}
                                        </Typography>
                                    </Box>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#00FF88' }}>
                                        <ResetIcon sx={{ fontSize: 16 }} />
                                        <Typography variant="caption" sx={{ fontWeight: 700 }}>REDO LOGS: {evento.horario_reset || '00:00'}</Typography>
                                    </Box>
                                </Stack>

                                <Box
                                    sx={{
                                        display: 'flex',
                                        gap: 1.5,
                                        p: 2,
                                        background: 'rgba(0,0,0,0.2)',
                                        borderRadius: 3,
                                        border: '1px solid rgba(0,212,255,0.05)',
                                        mb: 3
                                    }}
                                >
                                    <Box sx={{ flex: 1, textAlign: 'center' }}>
                                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>EMPRESAS</Typography>
                                        <Typography variant="h6" sx={{ color: '#00D4FF', fontWeight: 800 }}>
                                            {String(evento.total_empresas || 0).padStart(2, '0')}
                                        </Typography>
                                    </Box>
                                    <Box sx={{ width: '1px', background: 'rgba(255,255,255,0.05)' }} />
                                    <Box sx={{ flex: 1, textAlign: 'center' }}>
                                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>PESSOAS</Typography>
                                        <Typography variant="h6" sx={{ color: '#7B2FBE', fontWeight: 800 }}>
                                            {evento.total_pessoas > 1000
                                                ? `${(evento.total_pessoas / 1000).toFixed(1)}k`
                                                : evento.total_pessoas || 0}
                                        </Typography>
                                    </Box>
                                </Box>

                                <Box sx={{ display: 'flex', gap: 1 }}>
                                    <NeonButton
                                        fullWidth
                                        variant="outlined"
                                        size="small"
                                        startIcon={<StartIcon />}
                                        onClick={() => handleGerenciar(evento)}
                                    >
                                        Gerenciar
                                    </NeonButton>
                                    <Tooltip title="Editar">
                                        <IconButton
                                            onClick={() => handleOpenDialog(evento)}
                                            sx={{ border: '1px solid rgba(0,212,255,0.1)', borderRadius: 2 }}
                                        >
                                            <EditIcon fontSize="small" sx={{ color: '#00D4FF' }} />
                                        </IconButton>
                                    </Tooltip>
                                    <Tooltip title="Excluir">
                                        <IconButton
                                            onClick={() => handleDelete(evento.id)}
                                            sx={{ border: '1px solid rgba(255, 51, 102, 0.1)', borderRadius: 2 }}
                                        >
                                            <DeleteIcon fontSize="small" sx={{ color: '#FF3366' }} />
                                        </IconButton>
                                    </Tooltip>
                                </Box>
                            </Box>
                        </GlassCard>
                    </Grid>
                ))}

                {eventos.length === 0 && !loading && (
                    <Grid item xs={12}>
                        <Box sx={{ py: 10, textAlign: 'center', opacity: 0.5 }}>
                            <EventIcon sx={{ fontSize: 80, mb: 2 }} />
                            <Typography variant="h5">NENHUM EVENTO ENCONTRADO</Typography>
                            <Typography>Initialize um novo nexus de controle clicando em "Novo Evento".</Typography>
                        </Box>
                    </Grid>
                )}
            </Grid>

            <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ fontFamily: '"Orbitron", sans-serif', fontWeight: 700, letterSpacing: '2px' }}>
                    {selectedEvento ? 'MODIFICAR EVENTO' : 'INICIAR NOVO EVENTO'}
                </DialogTitle>
                <DialogContent>
                    <Tabs
                        value={tabValue}
                        onChange={(e, v) => setTabValue(v)}
                        sx={{ borderBottom: '1px solid rgba(255,255,255,0.1)', mb: 3 }}
                    >
                        <Tab label="INFORMAÇÕES" sx={{ fontWeight: 700 }} />
                        <Tab label="FASES & DATAS" sx={{ fontWeight: 700 }} />
                    </Tabs>

                    {tabValue === 0 ? (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <TextField
                                label="Nome do Evento"
                                fullWidth
                                value={formData.nome}
                                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                            />
                            <TextField
                                label="Localização"
                                fullWidth
                                value={formData.local}
                                onChange={(e) => setFormData({ ...formData, local: e.target.value })}
                            />
                            <Grid container spacing={2}>
                                <Grid item xs={6}>
                                    <TextField
                                        label="Data Início"
                                        type="date"
                                        fullWidth
                                        InputLabelProps={{ shrink: true }}
                                        value={formData.data_inicio}
                                        onChange={(e) => setFormData({ ...formData, data_inicio: e.target.value })}
                                    />
                                </Grid>
                                <Grid item xs={6}>
                                    <TextField
                                        label="Data Fim"
                                        type="date"
                                        fullWidth
                                        InputLabelProps={{ shrink: true }}
                                        value={formData.data_fim}
                                        onChange={(e) => setFormData({ ...formData, data_fim: e.target.value })}
                                    />
                                </Grid>
                                <Grid item xs={6}>
                                    <TextField
                                        label="Horário Reset Diário"
                                        type="time"
                                        fullWidth
                                        InputLabelProps={{ shrink: true }}
                                        value={formData.horario_reset}
                                        onChange={(e) => setFormData({ ...formData, horario_reset: e.target.value })}
                                        helperText="Horário que os logs expiram para novo check-in"
                                    />
                                </Grid>
                                <Grid item xs={6}>
                                    <TextField
                                        label="Capacidade"
                                        type="number"
                                        fullWidth
                                        value={formData.capacidade_total}
                                        onChange={(e) => setFormData({ ...formData, capacidade_total: e.target.value })}
                                    />
                                </Grid>
                            </Grid>

                            <Divider sx={{ my: 1, borderColor: 'rgba(255,255,255,0.05)' }} />

                            <Typography variant="subtitle2" sx={{ color: '#00D4FF', fontWeight: 700, mb: 1 }}>
                                CONFIGURAÇÕES DE FLUXO
                            </Typography>

                            <Box sx={{ p: 2, background: 'rgba(0,0,0,0.2)', borderRadius: 3, border: '1px solid rgba(0,212,255,0.1)' }}>
                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={formData.impressao_etiquetas}
                                            onChange={(e) => setFormData({ ...formData, impressao_etiquetas: e.target.checked })}
                                            color="primary"
                                        />
                                    }
                                    label={<Typography variant="body2">Habilitar Impressão de Etiquetas</Typography>}
                                />
                                <Typography variant="caption" display="block" sx={{ color: 'text.secondary', mb: 2, ml: 1 }}>
                                    Ditará se o check-in dispara comando de impressão térmica.
                                </Typography>

                                <Typography variant="caption" sx={{ color: '#fff', fontWeight: 700, display: 'block', mb: 1, ml: 1 }}>
                                    MÉTODOS DE CHECK-IN PERMITIDOS
                                </Typography>
                                <FormGroup row sx={{ ml: 1, mb: 2 }}>
                                    {[
                                        { id: 'qrcode', label: 'QR Code' },
                                        { id: 'barcode', label: 'Barras' },
                                        { id: 'manual', label: 'Manual' },
                                        { id: 'rfid', label: 'Pulseira/RFID' },
                                        { id: 'face', label: 'Leitor Facial' }
                                    ].map(method => (
                                        <FormControlLabel
                                            key={method.id}
                                            control={
                                                <Checkbox
                                                    size="small"
                                                    checked={formData.tipos_checkin?.includes(method.id)}
                                                    onChange={(e) => {
                                                        const current = [...(formData.tipos_checkin || [])];
                                                        if (e.target.checked) {
                                                            if (!current.includes(method.id)) current.push(method.id);
                                                        } else {
                                                            const idx = current.indexOf(method.id);
                                                            if (idx > -1) current.splice(idx, 1);
                                                        }
                                                        setFormData({ ...formData, tipos_checkin: current });
                                                    }}
                                                />
                                            }
                                            label={<Typography variant="caption" sx={{ textTransform: 'uppercase' }}>{method.label}</Typography>}
                                        />
                                    ))}
                                </FormGroup>

                                <Typography variant="caption" sx={{ color: '#fff', fontWeight: 700, display: 'block', mb: 1, ml: 1 }}>
                                    MÉTODOS DE CHECK-OUT PERMITIDOS
                                </Typography>
                                <FormGroup row sx={{ ml: 1 }}>
                                    {[
                                        { id: 'qrcode', label: 'QR Code' },
                                        { id: 'barcode', label: 'Barras' },
                                        { id: 'manual', label: 'Manual' },
                                        { id: 'rfid', label: 'Pulseira/RFID' },
                                        { id: 'face', label: 'Leitor Facial' }
                                    ].map(method => (
                                        <FormControlLabel
                                            key={method.id}
                                            control={
                                                <Checkbox
                                                    size="small"
                                                    checked={formData.tipos_checkout?.includes(method.id)}
                                                    onChange={(e) => {
                                                        const current = [...(formData.tipos_checkout || [])];
                                                        if (e.target.checked) {
                                                            if (!current.includes(method.id)) current.push(method.id);
                                                        } else {
                                                            const idx = current.indexOf(method.id);
                                                            if (idx > -1) current.splice(idx, 1);
                                                        }
                                                        setFormData({ ...formData, tipos_checkout: current });
                                                    }}
                                                />
                                            }
                                            label={<Typography variant="caption" sx={{ textTransform: 'uppercase' }}>{method.label}</Typography>}
                                        />
                                    ))}
                                </FormGroup>
                            </Box>
                        </Box>
                    ) : (
                        <Box>
                            {!formData.data_inicio || !formData.data_fim ? (
                                <Alert severity="info">Defina as datas de início e fim na aba Informações para configurar as fases.</Alert>
                            ) : (
                                <Stack spacing={3}>
                                    {['montagem', 'evento', 'desmontagem'].map(phase => (
                                        <Box key={phase}>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                                                <Typography variant="subtitle2" sx={{ color: '#00D4FF', textTransform: 'uppercase', fontWeight: 800 }}>
                                                    {phase}
                                                </Typography>
                                                <Stack direction="row" spacing={1}>
                                                    <Button size="small" onClick={() => handleSelectAll(phase)} sx={{ fontSize: '0.65rem' }}>TUDO</Button>
                                                    <Button size="small" onClick={() => handleClearAll(phase)} color="error" sx={{ fontSize: '0.65rem' }}>LIMPAR</Button>
                                                </Stack>
                                            </Box>
                                            <FormGroup row sx={{ gap: 1 }}>
                                                {generateDateRange().map(date => (
                                                    <FormControlLabel
                                                        key={date}
                                                        control={
                                                            <Checkbox
                                                                size="small"
                                                                checked={formData[`datas_${phase}`]?.includes(date)}
                                                                onChange={() => handleDateToggle(date, phase)}
                                                                sx={{ color: 'rgba(255,255,255,0.2)', '&.Mui-checked': { color: '#00FF88' } }}
                                                            />
                                                        }
                                                        label={
                                                            <Box sx={{ lineHeigh: 1 }}>
                                                                <Typography variant="caption" sx={{ fontWeight: 700, display: 'block' }}>
                                                                    {format(new Date(date + 'T00:00:00'), "dd/MM")}
                                                                </Typography>
                                                                <Typography variant="caption" sx={{ fontSize: '0.6rem', color: 'text.secondary' }}>
                                                                    {format(new Date(date + 'T00:00:00'), "EEE", { locale: ptBR })}
                                                                </Typography>
                                                            </Box>
                                                        }
                                                        sx={{
                                                            mr: 0,
                                                            p: 1,
                                                            borderRadius: 2,
                                                            border: '1px solid rgba(255,255,255,0.05)',
                                                            '&:hover': { background: 'rgba(255,255,255,0.02)' }
                                                        }}
                                                    />
                                                ))}
                                            </FormGroup>
                                            <Divider sx={{ mt: 2, borderColor: 'rgba(255,255,255,0.05)' }} />
                                        </Box>
                                    ))}
                                </Stack>
                            )}
                        </Box>
                    )}
                </DialogContent>
                <DialogActions sx={{ p: 3 }}>
                    <Button onClick={handleCloseDialog} disabled={saving} sx={{ color: 'text.secondary' }}>ABORTAR</Button>
                    <NeonButton onClick={handleSave} loading={saving}>SALVAR E ATIVAR</NeonButton>
                </DialogActions>
            </Dialog>

            <ConfirmDialog
                open={openDeleteConfirm}
                onConfirm={confirmDelete}
                onCancel={() => setOpenDeleteConfirm(false)}
                loading={deleteLoading}
                title="DESATIVAR NEXUS"
                message="Esta ação irá remover permanentemente o evento e todas as suas configurações de cota. Deseja prosseguir?"
            />
        </Box>
    );
};

export default Eventos;
