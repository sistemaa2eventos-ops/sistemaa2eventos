import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Grid, List, ListItem, ListItemIcon, ListItemText,
    Switch, Button, IconButton, CircularProgress, Tabs, Tab, TextField, Divider, Stack
} from '@mui/material';
import {
    AssignmentInd as CredIcon, Edit as EditIcon,
    DragIndicator as DragIcon, Save as SaveIcon,
    Security as SecurityIcon,
    AutoGraph as AutoIcon
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import api from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
import GlassCard from '../../components/common/GlassCard';
import NeonButton from '../../components/common/NeonButton';

const ConfigCredenciamento = () => {
    const { enqueueSnackbar } = useSnackbar();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState('Participante');

    const [registration, setRegistration] = useState({
        fields: {
            Participante: [],
            Expositor: [],
            Staff: []
        },
        auto_approve: true,
        double_optin: false,
        lgpd_text: ''
    });

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            setLoading(true);
            const { data } = await api.get('/config/registration-settings');
            if (data?.success && data?.data) {
                setRegistration(data.data);
            }
        } catch (error) {
            console.error('Erro ao carregar configurações:', error);
            enqueueSnackbar('Falha ao carregar configurações dinâmicas.', { variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await api.put('/config/registration-settings', registration);
            enqueueSnackbar('Configurações de Credenciamento salvas com sucesso!', { variant: 'success' });
        } catch (error) {
            console.error('Erro ao salvar settings:', error);
            enqueueSnackbar('Equívoco ao salvar dados no banco.', { variant: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const handleFieldToggle = (type, fieldId, property) => {
        const newFields = registration.fields[type].map(f => {
            if (f.id === fieldId) {
                return { ...f, [property]: !f[property] };
            }
            return f;
        });

        setRegistration({
            ...registration,
            fields: {
                ...registration.fields,
                [type]: newFields
            }
        });
    };

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
                <CircularProgress color="secondary" />
            </Box>
        );
    }

    const currentFields = registration.fields[activeTab] || [];

    return (
        <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 1200, margin: '0 auto' }}>
            <PageHeader
                title="Configuração de Credenciamento"
                subtitle="Personalize os campos de cadastro, regras de aprovação e termos LGPD."
                breadcrumbs={[{ text: 'Configurações' }, { text: 'Credenciamento' }]}
            />

            <Grid container spacing={4} sx={{ mt: 1 }}>
                <Grid item xs={12} md={8}>
                    <GlassCard sx={{ p: 0, overflow: 'hidden' }}>
                        <Box sx={{ p: 3, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                                <CredIcon sx={{ color: '#00D4FF', fontSize: 28 }} />
                                <Typography variant="h6" sx={{ fontWeight: 700, color: '#fff' }}>
                                    MATRIZ DE CAMPOS POR TIPO
                                </Typography>
                            </Box>
                            <Tabs
                                value={activeTab}
                                onChange={(e, val) => setActiveTab(val)}
                                textColor="primary"
                                indicatorColor="primary"
                                sx={{ '& .MuiTab-root': { color: 'rgba(255,255,255,0.5)', fontWeight: 700 } }}
                            >
                                <Tab label="PARTICIPANTE" value="Participante" />
                                <Tab label="EXPOSITOR" value="Expositor" />
                                <Tab label="STAFF / EQUIPE" value="Staff" />
                            </Tabs>
                        </Box>

                        <Box sx={{ p: 3 }}>
                            <List sx={{ bgcolor: 'rgba(0,0,0,0.2)', borderRadius: 2 }}>
                                {currentFields.map((field) => (
                                    <ListItem
                                        key={field.id}
                                        sx={{
                                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                                            py: 2,
                                            '&:hover': { bgcolor: 'rgba(0,212,255,0.03)' }
                                        }}
                                    >
                                        <ListItemIcon sx={{ minWidth: 40 }}>
                                            <DragIcon sx={{ color: 'rgba(255,255,255,0.2)' }} />
                                        </ListItemIcon>
                                        <ListItemText
                                            primary={field.label}
                                            secondary={field.id.toUpperCase()}
                                            primaryTypographyProps={{ color: '#fff', fontWeight: 600 }}
                                            secondaryTypographyProps={{ fontSize: '0.65rem' }}
                                        />
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <Typography variant="caption" color="text.secondary">Habilitado</Typography>
                                                <Switch
                                                    checked={field.active}
                                                    onChange={() => handleFieldToggle(activeTab, field.id, 'active')}
                                                    color="primary"
                                                    size="small"
                                                />
                                            </Box>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <Typography variant="caption" color="text.secondary">Obrigatório</Typography>
                                                <Switch
                                                    checked={field.required}
                                                    onChange={() => handleFieldToggle(activeTab, field.id, 'required')}
                                                    color="secondary"
                                                    size="small"
                                                />
                                            </Box>
                                        </Box>
                                    </ListItem>
                                ))}
                                {currentFields.length === 0 && (
                                    <Box sx={{ p: 4, textAlign: 'center' }}>
                                        <Typography color="text.secondary">Nenhum campo configurado para este tipo.</Typography>
                                    </Box>
                                )}
                            </List>

                            <Box sx={{ mt: 4, display: 'flex', justifyContent: 'flex-end' }}>
                                <NeonButton onClick={handleSave} loading={saving} startIcon={<SaveIcon />}>
                                    SALVAR MATRIZ DE CAMPOS
                                </NeonButton>
                            </Box>
                        </Box>
                    </GlassCard>
                </Grid>

                <Grid item xs={12} md={4}>
                    <Stack spacing={4}>
                        <GlassCard sx={{ p: 3 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
                                <AutoIcon sx={{ color: '#00D4FF' }} />
                                <Typography variant="subtitle1" sx={{ color: '#fff', fontWeight: 800 }}>
                                    AUTO-APROVAÇÃO
                                </Typography>
                            </Box>

                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                <Typography variant="body2" color="text.secondary">Aprovar cadastros públicos instantaneamente?</Typography>
                                <Switch
                                    checked={registration.auto_approve}
                                    onChange={(e) => setRegistration({ ...registration, auto_approve: e.target.checked })}
                                    color="primary"
                                />
                            </Box>
                            <Typography variant="caption" color="warning.main" sx={{ display: 'block', mt: 1 }}>
                                * Ativado: O participante recebe o QR Code logo após o cadastro.<br />
                                * Desativado: O cadastro fica "Pendente" para moderação manual.
                            </Typography>
                        </GlassCard>

                        <GlassCard sx={{ p: 3 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
                                <SecurityIcon sx={{ color: '#7B2FBE' }} />
                                <Typography variant="subtitle1" sx={{ color: '#fff', fontWeight: 800 }}>
                                    LGPD & DOUBLE OPT-IN
                                </Typography>
                            </Box>

                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                                <Box>
                                    <Typography variant="body2" sx={{ color: '#fff', fontWeight: 600 }}>Verificação de E-mail</Typography>
                                    <Typography variant="caption" color="text.secondary">Exigir clique antes de liberar o acesso.</Typography>
                                </Box>
                                <Switch
                                    checked={registration.double_optin}
                                    onChange={(e) => setRegistration({ ...registration, double_optin: e.target.checked })}
                                    color="secondary"
                                />
                            </Box>

                            <Divider sx={{ mb: 3, opacity: 0.1 }} />

                            <TextField
                                label="Texto de Consentimento (Privacy Policy)"
                                multiline
                                rows={4}
                                fullWidth
                                variant="outlined"
                                value={registration.lgpd_text}
                                onChange={(e) => setRegistration({ ...registration, lgpd_text: e.target.value })}
                                placeholder="Descreva aqui o texto resumido que o participante deve aceitar..."
                                sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'rgba(0,0,0,0.2)' } }}
                            />
                        </GlassCard>
                    </Stack>
                </Grid>
            </Grid>
        </Box>
    );
};

export default ConfigCredenciamento;
