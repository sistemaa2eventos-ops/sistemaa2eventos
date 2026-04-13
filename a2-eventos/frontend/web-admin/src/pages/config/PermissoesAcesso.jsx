import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Grid, Switch, FormControlLabel, FormGroup,
    Select, MenuItem, Stack, Divider, Chip, CircularProgress, Alert
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

const PermissoesAcesso = () => {
    const { enqueueSnackbar } = useSnackbar();
    const [roles, setRoles] = useState([]);
    const [selectedRole, setSelectedRole] = useState('');
    
    // Novo estado: Dicionário Global de permissões que existem no banco (agrupado por plataforma)
    const [availablePermissions, setAvailablePermissions] = useState({ web: [], mobile: [], public: [] });
    // Novo estado unificado: UUIDs ativados para a role selecionada
    const [activePermissionIds, setActivePermissionIds] = useState([]);
    
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [errorMsg, setErrorMsg] = useState(null);

    useEffect(() => {
        loadInitialData();
    }, []);

    useEffect(() => {
        if (selectedRole) fetchRolePermissions(selectedRole);
    }, [selectedRole]);

    const loadInitialData = async () => {
        try {
            setLoading(true);
            setErrorMsg(null);
            
            // Requisita Roles E Catálogo de Permissões em paralelo
            const [rolesResp, catalogResp] = await Promise.all([
                api.get('/auth/roles'),
                api.get('/auth/available-permissions')
            ]);
            
            const rolesData = rolesResp.data.data || [];
            setRoles(rolesData);
            if (rolesData.length > 0) {
                setSelectedRole(rolesData[0].nome);
            }

            // Agrupa dinamicamente o catálogo retornado do banco de dados na tríade de layout
            const catalog = catalogResp.data.data || [];
            const grouped = { web: [], mobile: [], public: [] };
            
            catalog.forEach(perm => {
                const plat = perm.plataforma || 'web'; // Default para web caso null no BD
                if (plat.includes('mobile')) grouped.mobile.push(perm);
                else if (plat.includes('public')) grouped.public.push(perm);
                else grouped.web.push(perm);
            });
            
            setAvailablePermissions(grouped);

        } catch (error) {
            setErrorMsg('Erro de comunicação ao carregar a Estrutura de Segurança.');
            enqueueSnackbar('Falha ao conectar com Política RBAC.', { variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const fetchRolePermissions = async (roleName) => {
        try {
            setLoading(true);
            const response = await api.get(`/auth/permissions/${roleName}`);
            const perms = response.data.data || [];
            
            // O backend da Fase 1 agora retorna objeto sys_permissions completos. Mapeamos apenas os IDs ativados.
            const activeIds = perms.map(p => p.id);
            setActivePermissionIds(activeIds);

        } catch (error) {
            enqueueSnackbar('Erro ao carregar permissões deste papel', { variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleToggle = (permId) => {
        setActivePermissionIds(prev => 
            prev.includes(permId) ? prev.filter(id => id !== permId) : [...prev, permId]
        );
    };

    const handleSelectAll = (items) => {
        const itemIds = items.map(i => i.id);
        setActivePermissionIds(prev => {
            const onlyOthers = prev.filter(id => !itemIds.includes(id));
            return [...onlyOthers, ...itemIds];
        });
    };

    const handleDeselectAll = (items) => {
        const itemIds = items.map(i => i.id);
        setActivePermissionIds(prev => prev.filter(id => !itemIds.includes(id)));
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            await api.put(`/auth/permissions/${selectedRole}`, {
                permissionIds: activePermissionIds
            });
            enqueueSnackbar(`Matriz RBAC do perfil "${selectedRole.toUpperCase()}" salva!`, { variant: 'success' });
        } catch (error) {
            enqueueSnackbar('Falha de privilégios ou erro ao salvar configuração', { variant: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const renderChecklist = (items, icon, title, color) => (
        <GlassCard sx={{ p: 3, height: '100%' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    {icon}
                    <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#fff', letterSpacing: 1 }}>
                        {title}
                    </Typography>
                </Box>
                <Chip
                    label={`${items.filter(i => activePermissionIds.includes(i.id)).length}/${items.length}`}
                    size="small"
                    sx={{
                        bgcolor: items.every(i => activePermissionIds.includes(i.id)) && items.length > 0 ? 'rgba(0,255,136,0.15)' : 'rgba(255,184,0,0.15)',
                        color: items.every(i => activePermissionIds.includes(i.id)) && items.length > 0 ? '#00FF88' : '#FFB800',
                        fontWeight: 700, fontSize: '0.7rem'
                    }}
                />
            </Box>

            <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                <NeonButton size="small" variant="outlined" onClick={() => handleSelectAll(items)} disabled={items.length === 0}>
                    Marcar Todos
                </NeonButton>
                <NeonButton size="small" variant="outlined" color="error" onClick={() => handleDeselectAll(items)} disabled={items.length === 0}>
                    Desmarcar Todos
                </NeonButton>
            </Stack>
            
            {items.length === 0 && (
                <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic', display: 'block', mt: 2 }}>
                    Nenhuma permissão catalogada para este segmento.
                </Typography>
            )}

            <FormGroup>
                {items.map(item => {
                    // Formata a label bonita vinda do banco -> ex: "eventos.configurar" vira "Eventos: Configurar"
                    const formattedLabel = `${item.recurso.charAt(0).toUpperCase() + item.recurso.slice(1)}: ${item.acao.charAt(0).toUpperCase() + item.acao.slice(1)}`;
                    const isActive = activePermissionIds.includes(item.id);
                    
                    return (
                        <FormControlLabel
                            key={item.id}
                            control={
                                <Switch
                                    checked={isActive}
                                    onChange={() => handleToggle(item.id)}
                                    sx={{
                                        '& .MuiSwitch-switchBase.Mui-checked': { color },
                                        '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: color },
                                    }}
                                />
                            }
                            label={
                                <Typography variant="body2" sx={{
                                    color: isActive ? '#fff' : 'text.secondary',
                                    fontWeight: isActive ? 600 : 400,
                                    transition: 'all 0.2s'
                                }}>
                                    {formattedLabel} {item.is_menu_item ? ' (Menu)' : ''}
                                </Typography>
                            }
                            sx={{ ml: 0, mb: 0.5 }}
                        />
                    );
                })}
            </FormGroup>
        </GlassCard>
    );

    return (
        <Box sx={{ p: { xs: 2, md: 4 } }}>
            <PageHeader
                title="Perfis de Acesso (Matriz RBAC)"
                subtitle="Controle dinâmico direto nas políticas de segurança do Banco de Dados."
                breadcrumbs={[{ text: 'Sistema' }, { text: 'Configurações' }, { text: 'Perfis de Acesso' }]}
            />
            
            {errorMsg && <Alert severity="error" sx={{ mb: 3 }}>{errorMsg}</Alert>}

            <GlassCard sx={{ p: 3, mb: 4 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                    <SecurityIcon sx={{ color: '#00D4FF', fontSize: 28 }} />
                    <Box sx={{ minWidth: 200 }}>
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, letterSpacing: 1, display: 'block', mb: 0.5 }}>
                            SELECIONE O PAPEL (ROLE)
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
                            {roles.map(r => (
                                <MenuItem key={r.id} value={r.nome}>{r.nome.toUpperCase()}</MenuItem>
                            ))}
                        </Select>
                    </Box>

                    <Box sx={{ ml: 'auto' }}>
                        <NeonButton
                            startIcon={<SaveIcon />}
                            onClick={handleSave}
                            loading={saving}
                            disabled={!selectedRole || roles.length === 0}
                        >
                            SALVAR MATRIZ RBAC
                        </NeonButton>
                    </Box>
                </Box>

                <Typography variant="caption" sx={{ color: 'text.secondary', mt: 2, display: 'block' }}>
                    ⚠️ Admin e Master têm by-pass nativo de restrições globais. As marcações operam em Live-Sync no controle de segurança.
                </Typography>
            </GlassCard>

            {loading && activePermissionIds.length === 0 ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                    <CircularProgress sx={{ color: '#00D4FF' }} />
                </Box>
            ) : (
                <Grid container spacing={3} alignItems="stretch">
                    <Grid item xs={12} md={4}>
                        {renderChecklist(
                            availablePermissions.web,
                            <WebIcon sx={{ color: '#00D4FF' }} />,
                            'WEB APP & ADMIN', '#00D4FF'
                        )}
                    </Grid>
                    <Grid item xs={12} md={4}>
                        {renderChecklist(
                            availablePermissions.mobile,
                            <MobileIcon sx={{ color: '#7B2FBE' }} />,
                            'MOBILE PLATFORMS', '#7B2FBE'
                        )}
                    </Grid>
                    <Grid item xs={12} md={4}>
                        {renderChecklist(
                            availablePermissions.public,
                            <PublicIcon sx={{ color: '#00FF88' }} />,
                            'PORTAIS PÚBLICOS', '#00FF88'
                        )}
                    </Grid>
                </Grid>
            )}
        </Box>
    );
};

export default PermissoesAcesso;
