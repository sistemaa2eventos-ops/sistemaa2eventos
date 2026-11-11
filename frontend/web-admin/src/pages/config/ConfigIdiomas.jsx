import React, { useState, useEffect } from 'react';
import {
    Box, Typography, List, ListItem, ListItemIcon, ListItemText,
    ListItemSecondaryAction, MenuItem, Select, CircularProgress,
    Grid, Card, CardActionArea, CardContent, Chip, Button, Stack
} from '@mui/material';
import { useSnackbar } from 'notistack';
import {
    Language as LangIcon,
    CheckCircle as CheckCircleIcon,
    Refresh as RefreshIcon,
    Save as SaveIcon
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import PageHeader from '../../components/common/PageHeader';
import GlassCard from '../../components/common/GlassCard';
import NeonButton from '../../components/common/NeonButton';
import api from '../../services/api';

const normalizeLanguageCode = (code) => {
    if (!code) return 'pt-BR';
    const c = String(code).toLowerCase();
    if (c.startsWith('en')) return 'en';
    if (c.startsWith('es')) return 'es';
    if (c.startsWith('de')) return 'de';
    if (c.startsWith('pt')) return 'pt-BR';
    return code;
};

const IDIOMAS_DISPONIVEIS = [
    {
        code: 'pt-BR',
        flag: '🇧🇷',
        name: 'Português',
        country: 'Brasil',
        desc: 'Idioma nativo do sistema e do painel'
    },
    {
        code: 'en',
        flag: '🇺🇸',
        name: 'English',
        country: 'US / UK / Global',
        desc: 'Global administrative and user interface'
    },
    {
        code: 'es',
        flag: '🇪🇸',
        name: 'Español',
        country: 'Internacional',
        desc: 'Interfaz completa en español'
    },
    {
        code: 'de',
        flag: '🇩🇪',
        name: 'Deutsch',
        country: 'Deutschland / DACH',
        desc: 'Deutsche Benutzeroberfläche'
    }
];

const ConfigIdiomas = () => {
    const { t, i18n } = useTranslation();
    const [settings, setSettings] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const { enqueueSnackbar } = useSnackbar();

    // O idioma atualmente ativo no motor i18n do navegador
    const activeLang = normalizeLanguageCode(i18n.language || localStorage.getItem('i18nextLng') || 'pt-BR');
    const [selectedLang, setSelectedLang] = useState(activeLang);

    useEffect(() => {
        let isMounted = true;
        const fetchSettings = async () => {
            try {
                const response = await api.get('/settings');
                const data = response.data?.data || {};
                if (!isMounted) return;
                setSettings(data);

                // Determina o idioma ideal: preferência salva no browser ou salva no banco
                const localLang = localStorage.getItem('i18nextLng');
                const targetLang = normalizeLanguageCode(localLang || data.language || 'pt-BR');

                setSelectedLang(targetLang);

                // Se o motor i18n estiver diferente da preferência salva, força sincronização
                if (normalizeLanguageCode(i18n.language) !== targetLang) {
                    await i18n.changeLanguage(targetLang);
                }
            } catch (error) {
                console.error('Erro ao buscar configurações:', error);
            } finally {
                if (isMounted) setLoading(false);
            }
        };
        fetchSettings();
        return () => { isMounted = false; };
    }, [i18n]);

    const aplicarIdioma = async (novoCodigo, recarregar = false) => {
        const codigoNormalizado = normalizeLanguageCode(novoCodigo);
        setSelectedLang(codigoNormalizado);
        setSaving(true);

        try {
            // 1. Muda imediatamente no motor i18next do React
            await i18n.changeLanguage(codigoNormalizado);

            // 2. Grava no localStorage para persistência
            localStorage.setItem('i18nextLng', codigoNormalizado);

            // 3. Persiste no banco de dados
            await api.put('/settings', { language: codigoNormalizado });
            setSettings(prev => ({ ...(prev || {}), language: codigoNormalizado }));

            // 4. Notifica o usuário
            enqueueSnackbar(
                t('idiomas.updated_success', { defaultValue: 'Idioma atualizado com sucesso!' }),
                { variant: 'success' }
            );

            // Dispara evento global caso outros componentes estejam ouvindo
            window.dispatchEvent(new Event('languagechange'));

            if (recarregar) {
                setTimeout(() => window.location.reload(), 300);
            }
        } catch (error) {
            console.error('Erro ao aplicar idioma:', error);
            enqueueSnackbar(
                t('idiomas.update_error', { defaultValue: 'Falha ao salvar configuração.' }),
                { variant: 'error' }
            );
        } finally {
            setSaving(false);
        }
    };

    if (loading) return (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50dvh' }}>
            <CircularProgress color="secondary" />
        </Box>
    );

    return (
        <Box sx={{ p: { xs: 2, md: 4 } }}>
            <PageHeader
                title={t('idiomas.title', { defaultValue: 'Idiomas' })}
                subtitle={t('idiomas.subtitle', { defaultValue: 'Idioma das telas do painel e do portal de cadastro.' })}
                breadcrumbs={[
                    { text: t('sidebar.grupo_sistema', { defaultValue: 'Sistema' }) },
                    { text: t('sidebar.settings', { defaultValue: 'Configurações' }) },
                    { text: t('idiomas.title', { defaultValue: 'Idiomas' }) }
                ]}
            />

            <GlassCard sx={{ p: { xs: 2, md: 4 }, mt: 4 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3, pb: 2, borderBottom: '1px solid rgba(255,255,255,0.05)', flexWrap: 'wrap', gap: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <LangIcon sx={{ color: '#00D4FF', fontSize: 32 }} />
                        <Box>
                            <Typography variant="h5" sx={{ fontWeight: 700, color: '#FFFFFF' }}>
                                {t('idiomas.default_language', { defaultValue: 'Idioma padrão' })}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                {t('idiomas.description', { defaultValue: 'Selecione abaixo o idioma desejado. A mudança é aplicada imediatamente em todo o painel.' })}
                            </Typography>
                        </Box>
                    </Box>

                    <Button
                        variant="outlined"
                        size="small"
                        startIcon={<RefreshIcon />}
                        onClick={() => window.location.reload()}
                        sx={{
                            color: '#00D4FF',
                            borderColor: 'rgba(0, 212, 255, 0.4)',
                            '&:hover': { borderColor: '#00D4FF', bgcolor: 'rgba(0, 212, 255, 0.1)' }
                        }}
                    >
                        Recarregar página
                    </Button>
                </Box>

                {/* Seleção visual por Cards com bandeiras */}
                <Typography variant="subtitle2" sx={{ color: '#00D4FF', fontWeight: 700, mb: 2, textTransform: 'uppercase', letterSpacing: 1 }}>
                    Escolha o idioma do sistema:
                </Typography>

                <Grid container spacing={2} sx={{ mb: 4 }}>
                    {IDIOMAS_DISPONIVEIS.map((item) => {
                        const isAtivo = activeLang === item.code;
                        return (
                            <Grid item xs={12} sm={6} md={3} key={item.code}>
                                <Card
                                    sx={{
                                        background: isAtivo ? 'rgba(0, 212, 255, 0.12)' : 'rgba(10, 22, 40, 0.6)',
                                        border: isAtivo ? '2px solid #00D4FF' : '1px solid rgba(255, 255, 255, 0.1)',
                                        boxShadow: isAtivo ? '0 0 20px rgba(0, 212, 255, 0.25)' : 'none',
                                        borderRadius: 2,
                                        transition: 'all 0.25s ease',
                                        cursor: 'pointer',
                                        '&:hover': {
                                            transform: 'translateY(-3px)',
                                            borderColor: '#00D4FF',
                                            boxShadow: '0 8px 24px rgba(0, 212, 255, 0.2)'
                                        }
                                    }}
                                    onClick={() => !saving && aplicarIdioma(item.code)}
                                >
                                    <CardActionArea sx={{ p: 2.5, minHeight: 140, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', mb: 1 }}>
                                            <Typography variant="h3" sx={{ fontSize: '2.5rem', lineHeight: 1 }}>
                                                {item.flag}
                                            </Typography>
                                            {isAtivo ? (
                                                <Chip
                                                    icon={<CheckCircleIcon sx={{ fontSize: '16px !important', color: '#00FF88 !important' }} />}
                                                    label="Ativo"
                                                    size="small"
                                                    sx={{
                                                        bgcolor: 'rgba(0, 255, 136, 0.15)',
                                                        color: '#00FF88',
                                                        border: '1px solid rgba(0, 255, 136, 0.4)',
                                                        fontWeight: 700
                                                    }}
                                                />
                                            ) : (
                                                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                                                    Clique para ativar
                                                </Typography>
                                            )}
                                        </Box>

                                        <Box sx={{ width: '100%' }}>
                                            <Typography variant="h6" sx={{ fontWeight: 700, color: isAtivo ? '#00D4FF' : '#FFFFFF', mb: 0.2 }}>
                                                {item.name}
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', display: 'block' }}>
                                                {item.country} &bull; {item.desc}
                                            </Typography>
                                        </Box>
                                    </CardActionArea>
                                </Card>
                            </Grid>
                        );
                    })}
                </Grid>

                {/* Seleção alternativa por Dropdown com botão Aplicar */}
                <Box sx={{ p: 2.5, borderRadius: 2, bgcolor: 'rgba(0, 0, 0, 0.25)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                    <Grid container spacing={2} alignItems="center">
                        <Grid item xs={12} md={7}>
                            <Typography variant="body1" sx={{ fontWeight: 600, color: '#FFFFFF' }}>
                                {t('idiomas.system_default', { defaultValue: 'Idioma padrão do sistema' })}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                {t('idiomas.system_default_hint', { defaultValue: 'O idioma principal usado na interface do painel.' })}
                            </Typography>
                        </Grid>
                        <Grid item xs={12} md={5}>
                            <Stack direction="row" spacing={1.5} alignItems="center" justifyContent={{ xs: 'flex-start', md: 'flex-end' }}>
                                <Select
                                    size="small"
                                    value={selectedLang}
                                    onChange={(e) => setSelectedLang(e.target.value)}
                                    disabled={saving}
                                    sx={{
                                        minWidth: 180,
                                        color: '#00D4FF',
                                        '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(0, 212, 255, 0.4)' }
                                    }}
                                >
                                    <MenuItem value="pt-BR">🇧🇷 Português (Brasil)</MenuItem>
                                    <MenuItem value="en">🇺🇸 English (US / UK)</MenuItem>
                                    <MenuItem value="es">🇪🇸 Español</MenuItem>
                                    <MenuItem value="de">🇩🇪 Deutsch</MenuItem>
                                </Select>

                                <NeonButton
                                    onClick={() => aplicarIdioma(selectedLang)}
                                    disabled={saving}
                                    startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
                                >
                                    {saving ? 'Aplicando...' : 'Aplicar'}
                                </NeonButton>
                            </Stack>
                        </Grid>
                    </Grid>
                </Box>
            </GlassCard>
        </Box>
    );
};

export default ConfigIdiomas;
