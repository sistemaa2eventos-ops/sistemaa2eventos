import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Grid, Switch, FormControlLabel, FormGroup,
    Select, MenuItem, Stack, Divider, Chip, CircularProgress
} from '@mui/material';
import {
    Security as SecurityIcon,
    DesktopWindows as WebIcon,
    PhoneAndroid as MobileIcon,
    Language as PublicIcon,
    Save as SaveIcon,
} from '@mui/icons-material';
import api from '../../services/api';
import GlassCard from '../../components/common/GlassCard';
import NeonButton from '../../components/common/NeonButton';
import PageHeader from '../../components/common/PageHeader';
import { useSnackbar } from 'notistack';

// ============================================================
// KEY MAP — Todas as chaves de menu para cada plataforma
// ============================================================
const WEB_ADMIN_ITEMS = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'empresas', label: 'Empresas' },
    { key: 'participantes', label: 'Participantes' },
    { key: 'auditoria', label: 'Auditoria Documental' },
    { key: 'relatorios', label: 'Relatórios' },
    { key: 'frota_lpr', label: 'Frota LPR' },
    { key: 'checkin', label: 'Check-in' },
    { key: 'checkout', label: 'Check-out' },
    { key: 'monitor', label: 'Monitor' },
    { key: 'usuarios', label: 'Usuários' },
    { key: 'configuracoes', label: 'Configurações' },
];

const MOBILE_APP_ITEMS = [
    { key: 'mob_scanner', label: 'Scanner QR' },
    { key: 'mob_explore', label: 'Explorar' },
    { key: 'mob_monitoring', label: 'Monitoramento' },
    { key: 'mob_profile', label: 'Perfil' },
];

const PUBLIC_WEB_ITEMS = [
    { key: 'pub_inscricao', label: 'Inscrição' },
    { key: 'pub_consulta', label: 'Consulta de Status' },
    { key: 'pub_documentos', label: 'Documentos' },
];

const ROLES = [
    { value: 'supervisor', label: 'Supervisor' },
    { value: 'operador', label: 'Operador' },
    { value: 'op_atendimento', label: 'Op. Atendimento' },
    { value: 'op_monitoramento', label: 'Op. Monitoramento' },
    { value: 'op_analista', label: 'Op. Analista' },
    { value: 'empresa', label: 'Empresa' },
    { value: 'cliente', label: 'Cliente' },
];

const PermissoesAcesso = () => {
    const { enqueueSnackbar } = useSnackbar();
    const [selectedRole, setSelectedRole] = useState('supervisor');
    const [webAdmin, setWebAdmin] = useState([]);
    const [mobileApp, setMobileApp] = useState([]);
    const [publicWeb, setPublicWeb] = useState([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetchPermissions(selectedRole);
    }, [selectedRole]);

    const fetchPermissions = async (role) => {
        try {
            setLoading(true);
            const response = await api.get(`/auth/permissions/${role}`);
            const perms = response.data.data;
            if (perms) {
                setWebAdmin(perms.web_admin || []);
                setMobileApp(perms.mobile_app || []);
                setPublicWeb(perms.public_web || []);
            } else {
                // Sem permissões configuradas = todas ativadas
                setWebAdmin(WEB_ADMIN_ITEMS.map(i => i.key));
                setMobileApp(MOBILE_APP_ITEMS.map(i => i.key));
                setPublicWeb(PUBLIC_WEB_ITEMS.map(i => i.key));
            }
        } catch (error) {
            console.error('Erro ao buscar permissões:', error);
            enqueueSnackbar('Erro ao carregar permissões', { variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleToggle = (platform, key) => {
        const setter = platform === 'web_admin' ? setWebAdmin : platform === 'mobile_app' ? setMobileApp : setPublicWeb;
        const current = platform === 'web_admin' ? webAdmin : platform === 'mobile_app' ? mobileApp : publicWeb;

        if (current.includes(key)) {
            setter(current.filter(k => k !== key));
        } else {
            setter([...current, key]);
        }
    };

    const handleSelectAll = (platform, items) => {
        const setter = platform === 'web_admin' ? setWebAdmin : platform === 'mobile_app' ? setMobileApp : setPublicWeb;
        setter(items.map(i => i.key));
    };

    const handleDeselectAll = (platform) => {
        const setter = platform === 'web_admin' ? setWebAdmin : platform === 'mobile_app' ? setMobileApp : setPublicWeb;
        setter([]);
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            await api.put(`/auth/permissions/${selectedRole}`, {
                web_admin: webAdmin,
                mobile_app: mobileApp,
                public_web: publicWeb,
            });
            enqueueSnackbar(`Permissões do perfil "${selectedRole}" salvas com sucesso!`, { variant: 'success' });
        } catch (error) {
            console.error('Erro ao salvar:', error);
            enqueueSnackbar('Erro ao salvar permissões', { variant: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const renderChecklist = (platform, items, activeKeys, icon, title, color) => (
        <GlassCard sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    {icon}
                    <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#fff', letterSpacing: 1 }}>
                        {title}
                    </Typography>
                </Box>
                <Chip
                    label={`${activeKeys.length}/${items.length}`}
                    size="small"
                    sx={{
                        bgcolor: activeKeys.length === items.length ? 'rgba(0,255,136,0.15)' : 'rgba(255,184,0,0.15)',
                        color: activeKeys.length === items.length ? '#00FF88' : '#FFB800',
                        fontWeight: 700, fontSize: '0.7rem'
                    }}
                />
            </Box>

            <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                <NeonButton size="small" variant="outlined" onClick={() => handleSelectAll(platform, items)}>
                    Marcar Todos
                </NeonButton>
                <NeonButton size="small" variant="outlined" color="error" onClick={() => handleDeselectAll(platform)}>
                    Desmarcar Todos
                </NeonButton>
            </Stack>

            <FormGroup>
                {items.map(item => (
                    <FormControlLabel
                        key={item.key}
                        control={
                            <Switch
                                checked={activeKeys.includes(item.key)}
                                onChange={() => handleToggle(platform, item.key)}
                                sx={{
                                    '& .MuiSwitch-switchBase.Mui-checked': { color },
                                    '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: color },
                                }}
                            />
                        }
                        label={
                            <Typography variant="body2" sx={{
                                color: activeKeys.includes(item.key) ? '#fff' : 'text.secondary',
                                fontWeight: activeKeys.includes(item.key) ? 600 : 400,
                                transition: 'all 0.2s'
                            }}>
                                {item.label}
                            </Typography>
                        }
                        sx={{ ml: 0, mb: 0.5 }}
                    />
                ))}
            </FormGroup>
        </GlassCard>
    );

    return (
        <Box sx={{ p: { xs: 2, md: 4 } }}>
            <PageHeader
                title="Perfis de Acesso"
                subtitle="Controle granular de permissões de menu por nível de acesso."
                breadcrumbs={[{ text: 'Sistema' }, { text: 'Configurações' }, { text: 'Perfis de Acesso' }]}
            />

            <GlassCard sx={{ p: 3, mb: 4 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                    <SecurityIcon sx={{ color: '#00D4FF', fontSize: 28 }} />
                    <Box sx={{ minWidth: 200 }}>
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, letterSpacing: 1, display: 'block', mb: 0.5 }}>
                            SELECIONE O PERFIL
                        </Typography>
                        <Select
                            value={selectedRole}
                            onChange={(e) => setSelectedRole(e.target.value)}
                            size="small"
                            fullWidth
                            sx={{
                                color: '#fff',
                                '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(0,212,255,0.3)' },
                                '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#00D4FF' },
                            }}
                        >
                            {ROLES.map(r => (
                                <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>
                            ))}
                        </Select>
                    </Box>

                    <Box sx={{ ml: 'auto' }}>
                        <NeonButton
                            startIcon={<SaveIcon />}
                            onClick={handleSave}
                            loading={saving}
                        >
                            SALVAR PERMISSÕES
                        </NeonButton>
                    </Box>
                </Box>

                <Typography variant="caption" sx={{ color: 'text.secondary', mt: 2, display: 'block' }}>
                    ⚠️ Admin e Master sempre têm acesso total. Itens desmarcados ficam invisíveis para o perfil selecionado.
                </Typography>
            </GlassCard>

            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                    <CircularProgress sx={{ color: '#00D4FF' }} />
                </Box>
            ) : (
                <Grid container spacing={3}>
                    <Grid item xs={12} md={4}>
                        {renderChecklist(
                            'web_admin', WEB_ADMIN_ITEMS, webAdmin,
                            <WebIcon sx={{ color: '#00D4FF' }} />,
                            'WEB ADMIN', '#00D4FF'
                        )}
                    </Grid>
                    <Grid item xs={12} md={4}>
                        {renderChecklist(
                            'mobile_app', MOBILE_APP_ITEMS, mobileApp,
                            <MobileIcon sx={{ color: '#7B2FBE' }} />,
                            'MOBILE APP', '#7B2FBE'
                        )}
                    </Grid>
                    <Grid item xs={12} md={4}>
                        {renderChecklist(
                            'public_web', PUBLIC_WEB_ITEMS, publicWeb,
                            <PublicIcon sx={{ color: '#00FF88' }} />,
                            'PUBLIC WEB', '#00FF88'
                        )}
                    </Grid>
                </Grid>
            )}
        </Box>
    );
};

export default PermissoesAcesso;
