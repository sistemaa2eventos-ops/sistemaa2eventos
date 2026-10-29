import React, { useState } from 'react';
import NotificationBell from './NotificationBell';
import {
    Drawer,
    List,
    ListItemIcon,
    ListItemText,
    Divider,
    Avatar,
    Typography,
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

    NotificationsActive as NotifIcon,
    CameraAlt as CameraIcon,
    Label as LabelIcon,
    VerifiedUser as VerifiedIcon,
    Webhook as WebhookIcon,
    Schedule as CronIcon,

    ViewModule as CredIcon,
    FactCheck as CheckConfigIcon,
    Description as LogsIcon,
    Chat as ChatIcon,
    Place as AreaIcon,
    QrCode2 as PulseiraIcon,
    Face as FaceIcon,
    EmojiEvents as TrophyIcon,
    SwapHoriz as SwapHorizIcon
} from '@mui/icons-material';
import { Collapse } from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { styled } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@mui/material/styles';
import api from '../../services/api';
import OperatorSection from './OperatorSection';

const StyledDrawer = styled(Drawer)(() => ({
    width: 280,
    flexShrink: 0,
    '& .MuiDrawer-paper': {
        width: 280,
        boxSizing: 'border-box',
        background: 'linear-gradient(180deg, #050B18 0%, #0A1628 100%)',
        borderRight: '1px solid rgba(0, 212, 255, 0.15)',
        backdropFilter: 'blur(20px)',
        display: 'flex',
        flexDirection: 'column',
    },
}));

const LogoContainer = styled(Box)(({ theme }) => ({
    padding: theme.spacing(4, 3),
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(2),
    position: 'relative',
    '&::after': {
        content: '""',
        position: 'absolute',
        bottom: 0,
        left: '10%',
        width: '80%',
        height: '1px',
        background: 'linear-gradient(90deg, transparent, rgba(0, 212, 255, 0.4), transparent)',
    }
}));

const NavItem = styled(ListItemButton, {
    shouldForwardProp: (prop) => prop !== 'active'
})(({ theme, active }) => ({
    margin: theme.spacing(0.5, 2),
    borderRadius: 12,
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    position: 'relative',
    overflow: 'hidden',
    ...(active && {
        background: 'linear-gradient(90deg, rgba(0, 212, 255, 0.15) 0%, rgba(0, 212, 255, 0.05) 100%)',
        '& .MuiListItemIcon-root': {
            color: '#00D4FF',
            filter: 'drop-shadow(0 0 5px rgba(0, 212, 255, 0.5))',
        },
        '& .MuiListItemText-primary': {
            color: '#00D4FF',
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
            backgroundColor: '#00D4FF',
            borderRadius: '0 4px 4px 0',
            boxShadow: '0 0 10px #00D4FF',
        }
    }),
    '&:hover': {
        background: 'rgba(0, 212, 255, 0.08)',
        transform: 'translateX(4px)',
    }
}));

const Sidebar = ({ open, onClose }) => {
    const { user, hasMenuAccess, changeActiveEvento } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const { t } = useTranslation();
    const [openSubMenus, setOpenSubMenus] = useState({});
    const [eventAnchorEl, setEventAnchorEl] = useState(null);
    const [availableEvents, setAvailableEvents] = useState([]);
    const [, forceUpdate] = useState({});

    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    React.useEffect(() => {
        const handleStorageChange = () => forceUpdate({});
        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
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

    const handleSubMenuToggle = (text, e) => {
        e.stopPropagation();
        setOpenSubMenus(prev => ({ ...prev, [text]: !prev[text] }));
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
            text: 'Empresas',
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
            text: 'Auditoria documental',
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
            text: 'Veículos',
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
            text: 'Check-in',
            icon: <CheckinIcon />,
            menuKey: 'checkin',
            get path() {
                const eid = localStorage.getItem('active_evento_id');
                return eid ? `/checkin?evento_id=${eid}` : '/checkin';
            },
            roles: ['admin_master', 'operador']
        },
        {
            text: 'Check-out',
            icon: <CheckoutIcon />,
            menuKey: 'checkout',
            get path() {
                const eid = localStorage.getItem('active_evento_id');
                return eid ? `/checkout?evento_id=${eid}` : '/checkout';
            },
            roles: ['admin_master', 'operador']
        },
        {
            text: 'Fiscalização de áreas',
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

        { divider: true },
        { 
            text: 'Logs de auditoria',
            icon: <HistoryIcon />, 
            menuKey: 'auditoria_sistema', 
            path: '/audit-logs', 
            roles: ['admin_master'] 
        },
        { text: 'Usuários', icon: <UserIcon />, menuKey: 'usuarios', path: '/usuarios', roles: ['admin_master'] },
        {
            text: t('sidebar.settings', { defaultValue: 'Configurações' }),
            icon: <SettingsIcon />,
            menuKey: 'configuracoes',
            path: '/configuracoes',
            roles: ['admin_master'],
            children: [
                // --- GRUPO 1: CONFIGURAÇÕES DO EVENTO ---
                { text: 'Geral', path: '/config/geral', icon: <TuneIcon sx={{ fontSize: 16 }} /> },
                {
                    text: 'Leitor facial',
                    icon: <FaceIcon sx={{ fontSize: 16 }} />,
                    get path() {
                        const eventoId = localStorage.getItem('active_evento_id');
                        return eventoId ? `/config/leitor-facial?evento_id=${eventoId}` : '/config/leitor-facial';
                    }
                },
                { text: 'Eventos', path: '/eventos', icon: <EventIcon sx={{ fontSize: 16 }} /> },
                { text: 'Credenciamento', path: '/config/credenciamento', icon: <CredIcon sx={{ fontSize: 16 }} /> },
                { text: 'Regras de acesso', path: '/config/checkin', icon: <CheckConfigIcon sx={{ fontSize: 16 }} /> },
                { text: 'Áreas', path: '/config/areas', icon: <AreaIcon sx={{ fontSize: 16 }} /> },
                { text: 'Pulseiras', path: '/config/pulseiras', icon: <PulseiraIcon sx={{ fontSize: 16 }} /> },
                { text: 'Leitores e dispositivos', path: '/config/dispositivos', icon: <FaceIcon sx={{ fontSize: 16 }} /> },
                { text: 'Etiquetas e crachás', path: '/config/etiquetas', icon: <LabelIcon sx={{ fontSize: 16 }} /> },
                { text: 'Veículos', path: '/config/veiculos', icon: <CarIcon sx={{ fontSize: 16 }} /> },
                { divider: true },
                // --- GRUPO 2: SEGURANÇA & USUÁRIOS ---
                { text: 'Perfis de acesso', path: '/config/permissoes', icon: <VerifiedIcon sx={{ fontSize: 16 }} /> },
                { text: 'Segurança', path: '/config/seguranca', icon: <SecurityIcon sx={{ fontSize: 16 }} /> },
                { text: 'Comunicação', path: '/config/comunicacao', icon: <ChatIcon sx={{ fontSize: 16 }} /> },
                { divider: true },
                // --- GRUPO 3: INTEGRAÇÕES & AUTOMAÇÃO ---
                { text: 'Integrações', path: '/config/integracoes', icon: <ExtensionIcon sx={{ fontSize: 16 }} /> },
                { text: 'Webhooks e chaves de API', path: '/config/webhooks', icon: <WebhookIcon sx={{ fontSize: 16 }} /> },
                { text: 'Câmeras', path: '/config/cameras', icon: <CameraIcon sx={{ fontSize: 16 }} /> },
                { text: 'Rotinas automáticas', path: '/config/cron', icon: <CronIcon sx={{ fontSize: 16 }} /> },
                { divider: true },
                // --- GRUPO 4: SISTEMA ---
                { text: 'Notificações', path: '/config/notificacoes', icon: <NotifIcon sx={{ fontSize: 16 }} /> },
                { text: 'Idiomas', path: '/config/idiomas', icon: <PaletteIcon sx={{ fontSize: 16 }} /> },
                { text: 'Banco de dados', path: '/config/banco-dados', icon: <StorageIcon sx={{ fontSize: 16 }} /> },
                { text: 'Gamificação', path: '/config/gamificacao', icon: <TrophyIcon sx={{ fontSize: 16 }} /> },
                { text: 'Logs do sistema', path: '/config/logs', icon: <LogsIcon sx={{ fontSize: 16 }} /> },

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
        const isActive = location.pathname === item.path;
        const hasChildren = item.children && item.children.length > 0;
        const isOpen = openSubMenus[item.text];

        if (item.divider) {
            return (
                <Divider
                    key={`divider-${Math.random()}`}
                    sx={{ my: 1, mx: 3, borderColor: 'rgba(0, 212, 255, 0.1)', borderStyle: 'dashed' }}
                />
            );
        }

        return (
            <React.Fragment key={item.text}>
                <Tooltip title={item.disabled ? "Em breve" : ""} placement="right">
                    <Box component="div">
                        <NavItem
                            active={isActive ? 1 : 0}
                            disabled={item.disabled}
                            onClick={(e) => {
                                if (item.disabled) return;
                                if (hasChildren) {
                                    handleSubMenuToggle(item.text, e);
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
                    {hasChildren && (isOpen ? <ExpandLess sx={{ color: '#00D4FF' }} /> : <ExpandMore sx={{ color: 'text.secondary' }} />)}
                        </NavItem>
                    </Box>
                </Tooltip>
                {hasChildren && (
                    <Collapse in={isOpen} timeout="auto" unmountOnExit>
                        <List component="div" disablePadding>
                            {item.children.map((child, idx) => {
                                if (child.divider) {
                                    return <Divider key={`sub-div-${idx}`} sx={{ my: 0.5, mx: 5, borderColor: 'rgba(0, 212, 255, 0.08)' }} />;
                                }
                                return (
                                    <NavItem
                                        key={child.text}
                                        active={location.pathname === child.path ? 1 : 0}
                                        onClick={() => {
                                            navigate(child.path);
                                            if (isMobile && onClose) onClose();
                                        }}
                                        sx={{ pl: child.icon ? 3.5 : 4, mb: 0.3, py: 0.5 }}
                                    >
                                        {child.icon && (
                                            <ListItemIcon sx={{ minWidth: 28, color: location.pathname === child.path ? '#00D4FF' : 'text.secondary' }}>
                                                {child.icon}
                                            </ListItemIcon>
                                        )}
                                        <ListItemText
                                            primary={child.text}
                                            primaryTypographyProps={{
                                                fontSize: '0.75rem',
                                                color: location.pathname === child.path ? '#00D4FF' : 'text.secondary',
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
            ModalProps={{
                keepMounted: true, // Better open performance on mobile.
            }}
        >
            <LogoContainer>
                <Avatar
                    src="/assets/nzt-logo.jpg"
                    variant="rounded"
                    sx={{ width: 48, height: 48, boxShadow: '0 0 15px rgba(0, 212, 255, 0.6)', border: '1px solid rgba(0, 212, 255, 0.3)' }}
                >
                    NZT
                </Avatar>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography
                        variant="h6"
                        sx={{
                            fontFamily: '"Space Grotesk", sans-serif',
                            color: '#00D4FF',
                            fontWeight: 700,
                            letterSpacing: '2px',
                            textShadow: '0 0 10px rgba(0, 212, 255, 0.3)'
                        }}
                    >
                        NZT
                    </Typography>
                        <Typography
                        variant="caption"
                        sx={{
                            display: 'block',
                            color: 'text.secondary',
                            fontSize: '0.75rem',
                            fontWeight: 500,
                            lineHeight: 1.3,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                        }}
                    >
                        Intelligent Control System
                    </Typography>
                </Box>
            </LogoContainer>

{/* Evento Ativo Context com Seletor Interativo */}
            {(localStorage.getItem('active_evento_id') || availableEvents.length > 0) && (
                <Box sx={{ px: 3, pt: 2, pb: 1 }}>
                    {/* Notificações são do evento: o sino fica junto do evento em foco */}
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                            Evento em foco
                        </Typography>
                        <NotificationBell />
                    </Box>
                    <Box
                        sx={{
                            mt: 1,
                            p: 1.5,
                            borderRadius: 1.5,
                            background: 'rgba(0, 212, 255, 0.05)',
                            border: '1px solid rgba(0, 212, 255, 0.2)',
                            boxShadow: 'inset 0 0 20px rgba(0, 212, 255, 0.05)',
                            cursor: (isSuper || availableEvents.length > 1) ? 'pointer' : 'default',
                            transition: 'all 0.2s ease',
                            '&:hover': (isSuper || availableEvents.length > 1)
                                ? { background: 'rgba(0, 212, 255, 0.12)', borderColor: 'rgba(0, 212, 255, 0.4)' }
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
                                <EventIcon sx={{ color: '#00D4FF', fontSize: 20, flexShrink: 0 }} />
                                <Box sx={{ minWidth: 0 }}>
                                    <Typography variant="subtitle2" noWrap sx={{ fontWeight: 700, color: 'white', letterSpacing: '-0.02em', fontSize: '0.875rem' }}>
                                        {localStorage.getItem('active_evento_nome') || availableEvents.find(e => e.id === localStorage.getItem('active_evento_id'))?.nome || 'A2 Eventos'}
                                    </Typography>
                                    <Typography variant="caption" sx={{
                                        color: availableEvents.length > 1 ? '#00D4FF' : (isSuper ? '#00FF88' : '#FFB800'),
                                        fontWeight: 700, fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 0.5
                                    }}>
                                        {availableEvents.length > 1 ? 'Clique para alterar' : (isSuper ? 'Gerenciar eventos' : 'Evento fixo')}
                                    </Typography>
                                </Box>
                            </Box>
                            {availableEvents.length > 1 && (
                                <SwapHorizIcon sx={{ color: '#00D4FF', fontSize: 18, opacity: 0.8 }} />
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
                                background: '#0A1628',
                                border: '1px solid rgba(0, 212, 255, 0.25)',
                                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.7)',
                                maxHeight: 300,
                                minWidth: 220
                            }
                        }}
                    >
                        <Box sx={{ px: 2, py: 1, borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                            <Typography variant="caption" sx={{ color: '#00D4FF', fontWeight: 700, }}>
                                Selecionar evento ativo
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
                                        setEventAnchorEl(null);
                                    }}
                                    sx={{
                                        fontSize: '0.875rem',
                                        fontWeight: isSelected ? 700 : 400,
                                        color: isSelected ? '#00D4FF' : '#FFFFFF',
                                        '&.Mui-selected': { background: 'rgba(0, 212, 255, 0.15)' }
                                    }}
                                >
                                    <EventIcon sx={{ fontSize: 16, mr: 1, color: isSelected ? '#00D4FF' : 'text.secondary' }} />
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

            <OperatorSection />
        </StyledDrawer>
    );
};

export default Sidebar;