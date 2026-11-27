import { cores, tom } from '../../styles/tokens';
import React, { useState } from 'react';
import NotificationBell from './NotificationBell';
import {
    Drawer,
    List,
    ListItemIcon,
    ListItemText,
    Divider,
    Typography,
    IconButton,
    Box,
    Menu,
    MenuItem,
    ListItemButton,
    Tooltip,
    useMediaQuery,
} from '@mui/material';
import {
    Dashboard as DashboardIcon,
    QrCodeScanner as CheckinIcon,
    Logout as CheckoutIcon,
    Business as EmpresaIcon,
    People as PessoaIcon,
    Settings as SettingsIcon,
    Assessment as AssessmentIcon,

    Monitor as MonitorIcon,
    Event as EventIcon,
    Badge as UserIcon,
    DirectionsCar as CarIcon,
    AssignmentTurnedIn as AssignmentTurnedInIcon,
    ExpandLess,
    ExpandMore,
    History as HistoryIcon,
    Tune as TuneIcon,
    Security as SecurityIcon,
    Extension as ExtensionIcon,
    Storage as StorageIcon,
    Palette as PaletteIcon,

    CameraAlt as CameraIcon,
    Label as LabelIcon,
    VerifiedUser as VerifiedIcon,
    Webhook as WebhookIcon,
    Schedule as CronIcon,

    ViewModule as CredIcon,
    FactCheck as CheckConfigIcon,
    Article as DocsIcon,
    TableChart as PlanilhaIcon,
    Place as AreaIcon,
    QrCode2 as PulseiraIcon,
    Face as FaceIcon,
    SwapHoriz as SwapHorizIcon,
    Engineering as EngineeringIcon
} from '@mui/icons-material';
import { Collapse } from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { styled } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@mui/material/styles';
import api from '../../services/api';
import OperatorSection from './OperatorSection';
import { ChevronLeft as RecolherIcon, ChevronRight as ExpandirIcon, ExpandMore as RecolherCartaoIcon } from '@mui/icons-material';
import nztEmblem from '../../assets/images/nzt-emblem.png';

// Largura do menu: 280px aberto (padrão da skill), 76px só com ícones
export const LARGURA_MENU = 280;
export const LARGURA_MENU_RECOLHIDO = 76;
import ManualIcon from '@mui/icons-material/MenuBook';
import nztLogoClean from '../../assets/images/nzt-logo-clean.png';
import { useSystemBranding } from '../../hooks/useSystemBranding';

const StyledDrawer = styled(Drawer, { shouldForwardProp: (p) => p !== 'recolhido' })(({ recolhido }) => {
    const largura = recolhido ? LARGURA_MENU_RECOLHIDO : LARGURA_MENU;
    return {
        width: largura,
        flexShrink: 0,
        transition: 'width 200ms cubic-bezier(0.4, 0, 0.2, 1)',
        '& .MuiDrawer-paper': {
            width: largura,
            boxSizing: 'border-box',
            overflowX: 'hidden',
            transition: 'width 200ms cubic-bezier(0.4, 0, 0.2, 1)',
            background: `linear-gradient(180deg, ${cores.fundo} 0%, ${cores.superficie} 100%)`,
            borderRight: '1px solid rgba(0, 212, 255, 0.15)',
            backdropFilter: 'blur(20px)',
            display: 'flex',
            flexDirection: 'column',
        },
        // Recolhido: só ícones, centralizados; rótulos e submenus somem
        ...(recolhido && {
            '& .MuiListItemText-root, & .MuiCollapse-root': { display: 'none' },
            '& .MuiListItemIcon-root': { minWidth: 0, justifyContent: 'center' },
            '& .MuiListItemButton-root': { justifyContent: 'center', px: 0, mx: 1 },
            '& .MuiListItem-root': { px: 0 },
        }),
    };
});

const LogoContainer = styled(Box)(() => ({
    padding: '16px 16px 14px 16px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    cursor: 'pointer',
    userSelect: 'none',
    transition: 'background-color 0.3s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.3s cubic-bezier(0.4, 0, 0.2, 1), color 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    '&::after': {
        content: '""',
        position: 'absolute',
        bottom: 0,
        left: '10%',
        width: '80%',
        height: '1px',
        background: 'linear-gradient(90deg, transparent, rgba(0, 212, 255, 0.35), transparent)',
    },
    '&:hover img': {
        filter: 'brightness(1.08) drop-shadow(0 4px 12px rgba(0, 0, 0, 0.7))',
        transform: 'scale(1.02)',
    }
}));

const NavItem = styled(ListItemButton, {
    shouldForwardProp: (prop) => prop !== 'active'
})(({ theme, active }) => ({
    margin: theme.spacing(0.5, 2),
    borderRadius: 12,
    transition: 'background-color 0.3s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.3s cubic-bezier(0.4, 0, 0.2, 1), color 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    position: 'relative',
    overflow: 'hidden',
    ...(active && {
        background: 'linear-gradient(90deg, rgba(0, 212, 255, 0.15) 0%, rgba(0, 212, 255, 0.05) 100%)',
        '& .MuiListItemIcon-root': {
            color: cores.primaria,
            filter: 'drop-shadow(0 0 5px rgba(0, 212, 255, 0.5))',
        },
        '& .MuiListItemText-primary': {
            color: cores.primaria,
            fontWeight: 700,
            textShadow: '0 0 10px rgba(0, 212, 255, 0.3)',
        },
        '&::before': {
            content: '""',
            position: 'absolute',
            left: 0,
            top: '20%',
            height: '60%',
            width: 3,
            backgroundColor: cores.primaria,
            borderRadius: '0 4px 4px 0',
            boxShadow: `0 0 10px ${cores.primaria}`,
        }
    }),
    '&:hover': {
        background: tom(cores.primaria, 0.08),
        transform: 'translateX(4px)',
    }
}));

const Sidebar = ({ open, onClose, recolhido = false, onAlternarMenu, usuarioRecolhido = false, onRecolherUsuario }) => {
    const { user, hasMenuAccess, changeActiveEvento } = useAuth();
    const { system_name: systemName, logo_url: customLogoUrl, emblem_url: customEmblemUrl } = useSystemBranding();
    const navigate = useNavigate();
    const location = useLocation();
    const { t, i18n } = useTranslation();
    const [openSubMenus, setOpenSubMenus] = useState({});
    const [eventAnchorEl, setEventAnchorEl] = useState(null);
    const [availableEvents, setAvailableEvents] = useState([]);
    const [, forceUpdate] = useState({});

    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    React.useEffect(() => {
        const handleStorageChange = () => forceUpdate({});
        const handleLangChange = () => forceUpdate({});
        window.addEventListener('storage', handleStorageChange);
        window.addEventListener('languagechange', handleLangChange);
        return () => {
            window.removeEventListener('storage', handleStorageChange);
            window.removeEventListener('languagechange', handleLangChange);
        };
    }, []);

    // changeActiveEvento é recriada a cada render do AuthContext: como dependência, refazia
    // GET /eventos a cada mudança de estado de autenticação. Lida pela ref, o efeito roda por usuário.
    const changeActiveEventoRef = React.useRef(changeActiveEvento);
    changeActiveEventoRef.current = changeActiveEvento;

    React.useEffect(() => {
        let isSubscribed = true;
        const fetchEvents = async () => {
            try {
                const res = await api.get('/eventos');
                const list = res.data?.data || res.data || [];
                if (isSubscribed) {
                    setAvailableEvents(list);
                    const currentActiveId = localStorage.getItem('active_evento_id');
                    // Sem evento ativo, ou o salvo não existe mais: escolhe um (de preferência ativo)
                    const salvoExiste = list.some((ev) => ev.id === currentActiveId);
                    if (!salvoExiste && list.length > 0) {
                        const first = list.find((ev) => ev.status === 'ativo') || list[0];
                        if (changeActiveEventoRef.current) {
                            changeActiveEventoRef.current(first.id, first.nome);
                        } else {
                            localStorage.setItem('active_evento_id', first.id);
                            localStorage.setItem('active_evento_nome', first.nome);
                            window.dispatchEvent(new Event('storage'));
                        }
                    }
                }
            } catch (err) {
                console.warn('Erro ao carregar eventos no sidebar:', err);
            }
        };
        fetchEvents();
        return () => { isSubscribed = false; };
    }, [user?.id]);

    const handleSubMenuToggle = (key, e) => {
        e.stopPropagation();
        setOpenSubMenus(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const menuItems = [
        {
            text: t('sidebar.dashboard', { defaultValue: 'Dashboard' }),
            icon: <DashboardIcon />,
            menuKey: 'dashboard',
            get path() {
                const eid = localStorage.getItem('active_evento_id');
                return eid ? `/?evento_id=${eid}` : '/';
            },
            roles: ['admin_master', 'operador']
        },
        {
            text: t('sidebar.empresas', { defaultValue: 'Empresas' }),
            icon: <EmpresaIcon />,
            menuKey: 'empresas',
            get path() {
                const eid = localStorage.getItem('active_evento_id');
                return eid ? `/empresas?evento_id=${eid}` : '/empresas';
            },
            roles: ['admin_master', 'operador']
        },
        {
            text: t('sidebar.people', { defaultValue: 'Participantes' }),
            icon: <PessoaIcon />,
            menuKey: 'pessoas',
            legacyMenuKey: 'participantes',
            get path() {
                const eid = localStorage.getItem('active_evento_id');
                return eid ? `/pessoas?evento_id=${eid}` : '/pessoas';
            },
            roles: ['admin_master', 'operador']
        },
        {
            text: t('sidebar.auditoria_documental', { defaultValue: 'Auditoria documental' }),
            icon: <AssignmentTurnedInIcon />,
            menuKey: 'auditoria_documentos',
            legacyMenuKey: 'auditoria',
            get path() {
                const eid = localStorage.getItem('active_evento_id');
                return eid ? `/auditoria?evento_id=${eid}` : '/auditoria';
            },
            roles: ['admin_master', 'operador']
        },
        {
            text: t('sidebar.reports', { defaultValue: 'Relatórios' }),
            icon: <AssessmentIcon />,
            menuKey: 'relatorios',
            get path() {
                const eid = localStorage.getItem('active_evento_id');
                return eid ? `/reports?evento_id=${eid}` : '/reports';
            },
            roles: ['admin_master', 'operador']
        },
        {
            text: t('sidebar.veiculos', { defaultValue: 'Veículos' }),
            icon: <CarIcon />,
            menuKey: 'veiculos',
            legacyMenuKey: 'frota_lpr',
            get path() {
                const eid = localStorage.getItem('active_evento_id');
                return eid ? `/veiculos?evento_id=${eid}` : '/veiculos';
            },
            roles: ['admin_master', 'operador']
        },
        { divider: true },
        {
            text: t('sidebar.checkin', { defaultValue: 'Check-in' }),
            icon: <CheckinIcon />,
            menuKey: 'checkin',
            get path() {
                const eid = localStorage.getItem('active_evento_id');
                return eid ? `/checkin?evento_id=${eid}` : '/checkin';
            },
            roles: ['admin_master', 'operador']
        },
        {
            text: t('sidebar.checkout', { defaultValue: 'Check-out' }),
            icon: <CheckoutIcon />,
            menuKey: 'checkout',
            get path() {
                const eid = localStorage.getItem('active_evento_id');
                return eid ? `/checkout?evento_id=${eid}` : '/checkout';
            },
            roles: ['admin_master', 'operador']
        },
        {
            text: t('sidebar.fiscalizacao', { defaultValue: 'Fiscalização de áreas' }),
            icon: <SecurityIcon />,
            menuKey: 'fiscalizacao',
            get path() {
                const eid = localStorage.getItem('active_evento_id');
                return eid ? `/fiscalizacao?evento_id=${eid}` : '/fiscalizacao';
            },
            roles: ['admin_master', 'operador']
        },
        {
            text: t('sidebar.monitor', { defaultValue: 'Monitor' }),
            icon: <MonitorIcon />,
            menuKey: 'monitoramento',
            legacyMenuKey: 'monitor',
            get path() {
                const eid = localStorage.getItem('active_evento_id');
                return eid ? `/monitor?evento_id=${eid}` : '/monitor';
            },
            roles: ['admin_master', 'operador']
        },
        {
            text: t('sidebar.producao', { defaultValue: 'Produção' }),
            icon: <EngineeringIcon />,
            menuKey: 'producao',
            get path() {
                const eid = localStorage.getItem('active_evento_id');
                return eid ? `/producao?evento_id=${eid}` : '/producao';
            },
            roles: ['admin_master', 'operador']
        },

        { divider: true },
        { 
            text: t('sidebar.auditoria_sistema', { defaultValue: 'Auditoria e logs' }),
            icon: <HistoryIcon />, 
            menuKey: 'auditoria_sistema', 
            path: '/audit-logs', 
            roles: ['admin_master'] 
        },
        { 
            text: t('sidebar.usuarios', { defaultValue: 'Usuários' }), 
            icon: <UserIcon />, 
            menuKey: 'usuarios', 
            path: '/usuarios', 
            roles: ['admin_master'] 
        },
        {
            text: t('sidebar.settings', { defaultValue: 'Configurações' }),
            icon: <SettingsIcon />,
            menuKey: 'configuracoes',
            path: '/configuracoes',
            roles: ['admin_master'],
            children: [
                // Um caminho só para cada tela; os títulos agrupam (a central /configuracoes é só um índice)
                { grupo: t('sidebar.grupo_evento', { defaultValue: 'Evento' }) },
                { text: t('sidebar.eventos', { defaultValue: 'Eventos' }), path: '/eventos', icon: <EventIcon sx={{ fontSize: 16 }} /> },
                { text: t('sidebar.areas', { defaultValue: 'Áreas' }), path: '/config/areas', icon: <AreaIcon sx={{ fontSize: 16 }} /> },
                { text: t('sidebar.regras_acesso', { defaultValue: 'Regras de acesso' }), path: '/config/checkin', icon: <CheckConfigIcon sx={{ fontSize: 16 }} /> },
                { text: t('sidebar.credenciamento', { defaultValue: 'Credenciamento' }), path: '/config/credenciamento', icon: <CredIcon sx={{ fontSize: 16 }} /> },
                { text: t('sidebar.documentos', { defaultValue: 'Documentos' }), path: '/config/documentos', icon: <DocsIcon sx={{ fontSize: 16 }} /> },
                { text: t('sidebar.planilha', { defaultValue: 'Planilha de participantes' }), path: '/config/planilha', icon: <PlanilhaIcon sx={{ fontSize: 16 }} /> },
                { grupo: t('sidebar.grupo_credenciais', { defaultValue: 'Credenciais físicas' }) },
                { text: t('sidebar.pulseiras', { defaultValue: 'Pulseiras' }), path: '/config/pulseiras', icon: <PulseiraIcon sx={{ fontSize: 16 }} /> },
                { text: t('sidebar.etiquetas', { defaultValue: 'Etiquetas e crachás' }), path: '/config/etiquetas', icon: <LabelIcon sx={{ fontSize: 16 }} /> },
                { grupo: t('sidebar.grupo_equipamentos', { defaultValue: 'Equipamentos' }) },
                { text: t('sidebar.dispositivos', { defaultValue: 'Leitores e dispositivos' }), path: '/config/dispositivos', icon: <FaceIcon sx={{ fontSize: 16 }} /> },
                { text: t('sidebar.cameras', { defaultValue: 'Câmeras e IA facial' }), path: '/config/cameras', icon: <CameraIcon sx={{ fontSize: 16 }} /> },
                { text: t('sidebar.modelos_camera', { defaultValue: 'Modelos de câmera' }), path: '/config/modelos-camera', icon: <CameraIcon sx={{ fontSize: 16 }} /> },
                { text: t('sidebar.veiculos_config', { defaultValue: 'Veículos' }), path: '/config/veiculos', icon: <CarIcon sx={{ fontSize: 16 }} /> },
                { text: t('sidebar.manual_equipamentos', { defaultValue: 'Manual de equipamentos' }), path: '/manual-equipamentos', icon: <ManualIcon sx={{ fontSize: 16 }} /> },
                { grupo: t('sidebar.grupo_comunicacao', { defaultValue: 'Comunicação' }) },
                { text: t('sidebar.comunicacao', { defaultValue: 'Comunicação & Integrações' }), path: '/config/comunicacao', icon: <ExtensionIcon sx={{ fontSize: 16 }} /> },
                { text: t('sidebar.webhooks', { defaultValue: 'Webhooks e chaves de API' }), path: '/config/webhooks', icon: <WebhookIcon sx={{ fontSize: 16 }} /> },
                { grupo: t('sidebar.grupo_sistema', { defaultValue: 'Sistema' }) },
                { text: t('sidebar.geral', { defaultValue: 'Geral' }), path: '/config/geral', icon: <TuneIcon sx={{ fontSize: 16 }} /> },
                { text: t('sidebar.permissoes', { defaultValue: 'Perfis de acesso' }), path: '/config/permissoes', icon: <VerifiedIcon sx={{ fontSize: 16 }} /> },
                { text: t('sidebar.seguranca', { defaultValue: 'Segurança' }), path: '/config/seguranca', icon: <SecurityIcon sx={{ fontSize: 16 }} /> },
                { text: t('sidebar.cron', { defaultValue: 'Rotinas automáticas' }), path: '/config/cron', icon: <CronIcon sx={{ fontSize: 16 }} /> },
                { text: t('sidebar.idiomas', { defaultValue: 'Idiomas' }), path: '/config/idiomas', icon: <PaletteIcon sx={{ fontSize: 16 }} /> },
                { text: t('sidebar.banco_dados', { defaultValue: 'Banco de dados' }), path: '/config/banco-dados', icon: <StorageIcon sx={{ fontSize: 16 }} /> },

            ]
        },
    ];

    const isSuper = user?.nivel_acesso === 'admin_master';

    const filteredMenu = menuItems
        .filter(item => {
            if (item.divider) return true;
            if (isSuper) return true;

            // Para operadores, só exibe itens expressamente autorizados
            if (item.menuKey) {
                return hasMenuAccess(item.menuKey);
            }
            return false;
        })
        .filter((item, idx, arr) => {
            if (item.divider) {
                if (idx === 0 || idx === arr.length - 1) return false;
                if (arr[idx - 1]?.divider) return false;
            }
            return true;
        });

    const renderMenuItem = (item) => {
        const basePath = (item.path || '').split('?')[0];
        const isActive = basePath === '/producao'
            ? location.pathname.startsWith('/producao')
            : location.pathname === item.path;
        const hasChildren = item.children && item.children.length > 0;
        const itemKey = item.menuKey || item.path || item.text;
        const isOpen = openSubMenus[itemKey];

        if (item.divider) {
            return (
                <Divider
                    key={`divider-${Math.random()}`}
                    sx={{ my: 1, mx: 3, borderColor: tom(cores.primaria, 0.1), borderStyle: 'dashed' }}
                />
            );
        }

        return (
            <React.Fragment key={itemKey}>
                <Tooltip title={item.disabled ? "Em breve" : ""} placement="right">
                    <Box component="div">
                        <NavItem
                            active={isActive ? 1 : 0}
                            disabled={item.disabled}
                            onClick={(e) => {
                                if (item.disabled) return;
                                if (hasChildren) {
                                    handleSubMenuToggle(itemKey, e);
                                } else {
                                    navigate(item.path);
                                    if (isMobile && onClose) onClose();
                                }
                            }}
                            sx={{
                                opacity: item.disabled ? 0.3 : 1,
                                cursor: item.disabled ? 'not-allowed' : 'pointer'
                            }}
                        >
                    <ListItemIcon sx={{ minWidth: 40, color: 'text.secondary' }}>
                        {item.icon}
                    </ListItemIcon>
                    <ListItemText
                        primary={item.text}
                        primaryTypographyProps={{
                            fontSize: '0.875rem',
                            fontWeight: 600,
                            letterSpacing: '0.5px'
                        }}
                    />
                    {hasChildren && (isOpen ? <ExpandLess sx={{ color: cores.primaria }} /> : <ExpandMore sx={{ color: 'text.secondary' }} />)}
                        </NavItem>
                    </Box>
                </Tooltip>
                {hasChildren && (
                    <Collapse in={isOpen} timeout="auto" unmountOnExit>
                        <List component="div" disablePadding>
                            {item.children.map((child, idx) => {
                                if (child.divider) {
                                    return <Divider key={`sub-div-${idx}`} sx={{ my: 0.5, mx: 5, borderColor: tom(cores.primaria, 0.08) }} />;
                                }
                                if (child.grupo) {
                                    return (
                                        <Typography key={`grupo-${child.grupo}`} variant="overline"
                                            sx={{ display: 'block', pl: 6.5, pt: idx === 0 ? 0.5 : 1.25, pb: 0.25, lineHeight: 1.6, fontSize: '0.65rem', fontWeight: 700, letterSpacing: 1, color: 'rgba(148, 163, 184, 0.7)' }}>
                                            {child.grupo}
                                        </Typography>
                                    );
                                }
                                return (
                                    <NavItem
                                        key={child.path || child.text}
                                        active={location.pathname === child.path ? 1 : 0}
                                        onClick={() => {
                                            navigate(child.path);
                                            if (isMobile && onClose) onClose();
                                        }}
                                        sx={{ pl: child.icon ? 3.5 : 4, mb: 0.3, py: 0.5 }}
                                    >
                                        {child.icon && (
                                            <ListItemIcon sx={{ minWidth: 28, color: location.pathname === child.path ? cores.primaria : 'text.secondary' }}>
                                                {child.icon}
                                            </ListItemIcon>
                                        )}
                                        <ListItemText
                                            primary={child.text}
                                            primaryTypographyProps={{
                                                fontSize: '0.75rem',
                                                color: location.pathname === child.path ? cores.primaria : 'text.secondary',
                                                fontWeight: location.pathname === child.path ? 700 : 400
                                            }}
                                        />
                                    </NavItem>
                                );
                            })}
                        </List>
                    </Collapse>
                )}
            </React.Fragment>
        );
    };

    return (
        <StyledDrawer
            variant={isMobile ? "temporary" : "permanent"}
            open={isMobile ? open : true}
            onClose={onClose}
            recolhido={!isMobile && recolhido}
            ModalProps={{
                keepMounted: true, // Better open performance on mobile.
            }}
        >
            {/* Cabeçalho: logo pequeno + botão de recolher. Recolhido, o emblema fica no topo e o botão embaixo dele */}
            <Box sx={{
                display: 'flex',
                flexDirection: !isMobile && recolhido ? 'column' : 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 1,
                px: !isMobile && recolhido ? 1 : 2,
                pt: 2,
                pb: 1.5,
                minHeight: 64,
                flexShrink: 0,
            }}>
            <LogoContainer
                onClick={() => {
                    const eid = localStorage.getItem('active_evento_id');
                    navigate(eid ? `/?evento_id=${eid}` : '/');
                }}
                title={`${systemName || 'NZT Intelligent Control Systems'} - Início`}
                sx={{ p: 0, minWidth: 0, flex: 1, alignItems: !isMobile && recolhido ? 'center' : 'flex-start' }}
            >
                <Box
                    component="img"
                    src={recolhido && !isMobile ? (customEmblemUrl || nztEmblem) : (customLogoUrl || nztLogoClean)}
                    alt={systemName || 'NZT Intelligent Control Systems'}
                    sx={{
                        width: recolhido && !isMobile ? 36 : '100%',
                        maxWidth: recolhido && !isMobile ? 36 : 145,
                        height: recolhido && !isMobile ? 36 : 'auto',
                        maxHeight: recolhido && !isMobile ? 36 : 48,
                        objectFit: 'contain',
                        filter: 'drop-shadow(0 2px 8px rgba(0, 0, 0, 0.5))',
                        transition: 'background-color 0.3s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.3s cubic-bezier(0.4, 0, 0.2, 1), color 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        userSelect: 'none'
                    }}
                />
            </LogoContainer>
            {!isMobile && (
                <IconButton
                    onClick={onAlternarMenu}
                    aria-label={recolhido ? 'Expandir menu' : 'Recolher menu'}
                    aria-expanded={!recolhido}
                    sx={{
                        width: 36,
                        height: 36,
                        flexShrink: 0,
                        color: cores.textoSecundario,
                        border: `1px solid ${cores.borda}`,
                        borderRadius: 1.5,
                        '&:hover': { color: cores.textoForte, borderColor: cores.bordaDestaque, bgcolor: 'transparent' },
                        '&:focus-visible': { outline: `2px solid ${cores.primaria}`, outlineOffset: 2 }
                    }}
                >
                    {recolhido ? <ExpandirIcon sx={{ fontSize: 20 }} /> : <RecolherIcon sx={{ fontSize: 20 }} />}
                </IconButton>
            )}
            </Box>

{/* Evento Ativo Context com Seletor Interativo (some com o menu recolhido: só ícones) */}
            {!recolhido && (localStorage.getItem('active_evento_id') || availableEvents.length > 0) && (
                <Box sx={{ px: 3, pt: 2, pb: 1 }}>
                    {/* Notificações são do evento: o sino fica junto do evento em foco */}
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                            {t('operator.focus_event', { defaultValue: 'Evento em foco' })}
                        </Typography>
                        <NotificationBell />
                    </Box>
                    <Box
                        sx={{
                            mt: 1,
                            p: 1.5,
                            borderRadius: 1.5,
                            background: tom(cores.primaria, 0.05),
                            border: '1px solid rgba(0, 212, 255, 0.2)',
                            boxShadow: 'inset 0 0 20px rgba(0, 212, 255, 0.05)',
                            cursor: (isSuper || availableEvents.length > 1) ? 'pointer' : 'default',
                            transition: 'background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease, opacity 0.2s ease, transform 0.2s ease',
                            '&:hover': (isSuper || availableEvents.length > 1)
                                ? { background: tom(cores.primaria, 0.12), borderColor: tom(cores.primaria, 0.4) }
                                : {}
                        }}
                        onClick={(e) => {
                            if (availableEvents.length > 1) {
                                setEventAnchorEl(e.currentTarget);
                            } else if (isSuper) {
                                navigate('/eventos');
                            }
                        }}
                    >
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2, minWidth: 0 }}>
                                <EventIcon sx={{ color: cores.primaria, fontSize: 20, flexShrink: 0 }} />
                                <Box sx={{ minWidth: 0 }}>
                                    <Typography variant="subtitle2" noWrap sx={{ fontWeight: 700, color: 'white', letterSpacing: '-0.02em', fontSize: '0.875rem' }}>
                                        {localStorage.getItem('active_evento_nome') || availableEvents.find(e => e.id === localStorage.getItem('active_evento_id'))?.nome || 'A2 Eventos'}
                                    </Typography>
                                    <Typography variant="caption" sx={{
                                        color: availableEvents.length > 1 ? cores.primaria : (isSuper ? cores.sucesso : cores.alerta),
                                        fontWeight: 700, fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 0.5
                                    }}>
                                        {availableEvents.length > 1 
                                            ? t('operator.click_to_change', { defaultValue: 'Clique para alterar' }) 
                                            : (isSuper ? t('operator.manage_events', { defaultValue: 'Gerenciar eventos' }) : t('operator.fixed_event', { defaultValue: 'Evento fixo' }))}
                                    </Typography>
                                </Box>
                            </Box>
                            {availableEvents.length > 1 && (
                                <SwapHorizIcon sx={{ color: cores.primaria, fontSize: 18, opacity: 0.8 }} />
                            )}
                        </Box>
                    </Box>

                    {/* Menu seletor de eventos disponíveis */}
                    <Menu
                        anchorEl={eventAnchorEl}
                        open={Boolean(eventAnchorEl)}
                        onClose={() => setEventAnchorEl(null)}
                        PaperProps={{
                            sx: {
                                background: cores.superficie,
                                border: '1px solid rgba(0, 212, 255, 0.25)',
                                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.7)',
                                maxHeight: 300,
                                minWidth: 220
                            }
                        }}
                    >
                        <Box sx={{ px: 2, py: 1, borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                            <Typography variant="caption" sx={{ color: cores.primaria, fontWeight: 700, }}>
                                {t('operator.select_active_event', { defaultValue: 'Selecionar evento ativo' })}
                            </Typography>
                        </Box>
                        {availableEvents.map(ev => {
                            const isSelected = ev.id === localStorage.getItem('active_evento_id');
                            return (
                                <MenuItem
                                    key={ev.id}
                                    selected={isSelected}
                                    onClick={() => {
                                        if (changeActiveEvento) {
                                            changeActiveEvento(ev.id, ev.nome);
                                        } else {
                                            localStorage.setItem('active_evento_id', ev.id);
                                            localStorage.setItem('active_evento_nome', ev.nome);
                                            window.dispatchEvent(new Event('storage'));
                                        }
                                        // A URL também carrega o evento (?evento_id=): troca junto, mantendo os outros parâmetros
                                        const params = new URLSearchParams(location.search);
                                        params.set('evento_id', ev.id);
                                        navigate({ pathname: location.pathname, search: `?${params.toString()}` }, { replace: true });
                                        setEventAnchorEl(null);
                                    }}
                                    sx={{
                                        fontSize: '0.875rem',
                                        fontWeight: isSelected ? 700 : 400,
                                        color: isSelected ? cores.primaria : cores.textoForte,
                                        '&.Mui-selected': { background: tom(cores.primaria, 0.15) }
                                    }}
                                >
                                    <EventIcon sx={{ fontSize: 16, mr: 1, color: isSelected ? cores.primaria : 'text.secondary' }} />
                                    {ev.nome}
                                </MenuItem>
                            );
                        })}
                    </Menu>
                </Box>
            )}

                <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', pb: 2 }}>
                <List sx={{ pt: 2, px: 0 }}>
                    {filteredMenu.map((item) => renderMenuItem(item))}
                </List>
            </Box>

            {/* Cartão grande do operador: recolhível. Recolhido, vira um cartão pequeno no topo da tela. */}
            {!recolhido && !usuarioRecolhido && (
                <Box sx={{ borderTop: `1px solid ${cores.borda}`, flexShrink: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, pt: 1.25 }}>
                        <Typography variant="caption" sx={{ color: cores.textoSecundario, fontWeight: 600 }}>Operador</Typography>
                        <IconButton
                            size="small"
                            onClick={onRecolherUsuario}
                            aria-label="Recolher cartão do operador"
                            aria-expanded
                            sx={{ color: cores.textoSecundario, minWidth: 44, minHeight: 44, '&:focus-visible': { outline: `2px solid ${cores.primaria}`, outlineOffset: 2 } }}
                        >
                            <RecolherCartaoIcon sx={{ fontSize: 20 }} />
                        </IconButton>
                    </Box>
                    <OperatorSection />
                </Box>
            )}
        </StyledDrawer>
    );
};

export default Sidebar;