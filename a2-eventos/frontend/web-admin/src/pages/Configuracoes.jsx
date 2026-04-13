import React, { useState, useEffect, Suspense, lazy } from 'react';
import {
    Box,
    Tabs,
    Tab,
    Typography,
    Paper,
    Container,
    CircularProgress,
    Fade,
    styled,
    useTheme,
    useMediaQuery,
    Divider
} from '@mui/material';
import {
    Settings as SettingsIcon,
    Event as EventIcon,
    QrCodeScanner as CheckinIcon,
    PersonAdd as CredIcon,
    Place as AreaIcon,
    ScreenshotMonitor as TerminalIcon,
    NotificationsActive as AlertIcon,
    Webhook as WebhookIcon,
    Security as SecurityIcon,
    Schedule as CronIcon,
    Extension as IntegrIcon
} from '@mui/icons-material';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '../components/common/PageHeader';
import { useTranslation } from 'react-i18next';

// Lazy loading de abas para performance
const ConfigGeral = lazy(() => import('./config/ConfigGeral'));
const ConfigEvento = lazy(() => import('./config/ConfigEvento')); // Nova ou adaptada
const ConfigCheckin = lazy(() => import('./config/ConfigCheckin'));
const ConfigCredenciamento = lazy(() => import('./config/ConfigCredenciamento'));
const ConfigAreas = lazy(() => import('./config/ConfigAreas'));
const ConfigLeitorFacial = lazy(() => import('./config/ConfigLeitorFacial'));
const ConfigNotificacoes = lazy(() => import('./config/ConfigNotificacoes'));
const ConfigWebhooks = lazy(() => import('./config/ConfigWebhooks'));
const ConfigSeguranca = lazy(() => import('./config/ConfigSeguranca'));
const ConfigCron = lazy(() => import('./config/ConfigCron'));
const ConfigIntegracoes = lazy(() => import('./config/ConfigIntegracoes')); // Nova

const StyledTabs = styled(Tabs)(({ theme }) => ({
    borderRight: `1px solid ${theme.palette.divider}`,
    minWidth: 200,
    '& .MuiTabs-indicator': {
        width: 4,
        borderRadius: '0 4px 4px 0',
        backgroundColor: theme.palette.primary.main,
        boxShadow: `0 0 10px ${theme.palette.primary.main}`,
    },
}));

const StyledTab = styled(Tab)(({ theme }) => ({
    justifyContent: 'flex-start',
    textAlign: 'left',
    minHeight: 52,
    fontSize: '0.85rem',
    fontWeight: 600,
    textTransform: 'none',
    color: theme.palette.text.secondary,
    borderRadius: theme.spacing(1),
    margin: theme.spacing(0.5, 1),
    transition: 'all 0.2s',
    '&.Mui-selected': {
        color: theme.palette.primary.main,
        background: `linear-gradient(90deg, ${theme.palette.primary.main}15 0%, transparent 100%)`,
    },
    '&:hover': {
        background: theme.palette.action.hover,
    },
}));

const TabPanel = (props) => {
    const { children, value, index, ...other } = props;
    return (
        <div role="tabpanel" hidden={value !== index} {...other} style={{ width: '100%' }}>
            {value === index && (
                <Fade in={true} timeout={400}>
                    <Box sx={{ p: { xs: 1, md: 3 } }}>
                        {children}
                    </Box>
                </Fade>
            )}
        </div>
    );
};

const Configuracoes = () => {
    const { t } = useTranslation();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    const [searchParams, setSearchParams] = useSearchParams();
    
    // Mapeamento de abas para URL
    const tabMap = [
        'geral', 'evento', 'checkin', 'credenciamento', 'areas', 
        'terminais', 'alertas', 'webhooks', 'seguranca', 'automacao', 'integracoes'
    ];

    const currentTabId = searchParams.get('aba') || 'geral';
    const [value, setValue] = useState(tabMap.indexOf(currentTabId) !== -1 ? tabMap.indexOf(currentTabId) : 0);

    const handleChange = (event, newValue) => {
        setValue(newValue);
        setSearchParams({ aba: tabMap[newValue] });
    };

    // Sincronizar estado se a URL mudar externamente
    useEffect(() => {
        const idx = tabMap.indexOf(currentTabId);
        if (idx !== -1 && idx !== value) {
            setValue(idx);
        }
    }, [currentTabId]);

    const tabs = [
        { label: 'Geral', icon: <SettingsIcon /> },
        { label: 'Evento', icon: <EventIcon /> },
        { label: 'Check-in', icon: <CheckinIcon /> },
        { label: 'Credenc.', icon: <CredIcon /> },
        { label: 'Áreas', icon: <AreaIcon /> },
        { label: 'Terminais', icon: <TerminalIcon /> },
        { label: 'Alertas', icon: <AlertIcon /> },
        { label: 'Webhooks', icon: <WebhookIcon /> },
        { label: 'Segurança', icon: <SecurityIcon /> },
        { label: 'Automação', icon: <CronIcon /> },
        { label: 'Integr.', icon: <IntegrIcon /> },
    ];

    return (
        <Container maxWidth="xl" sx={{ py: 3 }}>
            <PageHeader 
                title="Configurações do Sistema" 
                subtitle="Central de controle NZT v4.0 — Gerenciamento consolidado de hardware e segurança" 
            />

            <Paper 
                elevation={0}
                sx={{ 
                    mt: 3, 
                    display: 'flex', 
                    flexDirection: isMobile ? 'column' : 'row',
                    minHeight: '70vh',
                    borderRadius: 4,
                    overflow: 'hidden',
                    border: `1px solid ${theme.palette.divider}`,
                    background: theme.palette.background.paper,
                }}
            >
                <Box sx={{ 
                    width: isMobile ? '100%' : 240, 
                    bgcolor: 'background.default',
                    borderRight: isMobile ? 0 : `1px solid ${theme.palette.divider}`,
                    borderBottom: isMobile ? `1px solid ${theme.palette.divider}` : 0,
                    pt: 2
                }}>
                    <StyledTabs
                        orientation={isMobile ? "horizontal" : "vertical"}
                        variant="scrollable"
                        value={value}
                        onChange={handleChange}
                        scrollButtons="auto"
                        sx={{ 
                            borderRight: isMobile ? 0 : 1,
                            '& .MuiTabs-flexContainer': {
                                gap: 0.5
                            }
                        }}
                    >
                        {tabs.map((tab, idx) => (
                            <StyledTab 
                                key={idx}
                                icon={tab.icon} 
                                iconPosition="start" 
                                label={tab.label} 
                            />
                        ))}
                    </StyledTabs>
                </Box>

                <Box sx={{ flex: 1, overflowY: 'auto', bgcolor: theme.palette.background.paper }}>
                    <Suspense fallback={
                        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                            <CircularProgress size={40} thickness={4} />
                        </Box>
                    }>
                        <TabPanel value={value} index={0}><ConfigGeral /></TabPanel>
                        <TabPanel value={value} index={1}><ConfigEvento /></TabPanel>
                        <TabPanel value={value} index={2}><ConfigCheckin /></TabPanel>
                        <TabPanel value={value} index={3}><ConfigCredenciamento /></TabPanel>
                        <TabPanel value={value} index={4}><ConfigAreas /></TabPanel>
                        <TabPanel value={value} index={5}><ConfigLeitorFacial /></TabPanel>
                        <TabPanel value={value} index={6}><ConfigNotificacoes /></TabPanel>
                        <TabPanel value={value} index={7}><ConfigWebhooks /></TabPanel>
                        <TabPanel value={value} index={8}><ConfigSeguranca /></TabPanel>
                        <TabPanel value={value} index={9}><ConfigCron /></TabPanel>
                        <TabPanel value={value} index={10}><ConfigIntegracoes /></TabPanel>
                    </Suspense>
                </Box>
            </Paper>
        </Container>
    );
};

export default Configuracoes;
