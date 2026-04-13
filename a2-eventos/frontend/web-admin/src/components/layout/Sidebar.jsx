import React, { useState } from 'react';
import {
    Drawer,
    List,
    ListItemIcon,
    ListItemText,
    Divider,
    Avatar,
    Typography,
    Box,
    IconButton,
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
    ExitToApp as LogoutIcon,
    Assessment as AssessmentIcon,
    Paid as PaidIcon,
    Monitor as MonitorIcon,
    Event as EventIcon,
    Badge as UserIcon,
    Help as SupportIcon,
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
    Translate as TranslateIcon,
    NotificationsActive as NotifIcon,
    CameraAlt as CameraIcon,
    Label as LabelIcon,
    VerifiedUser as VerifiedIcon,
    Webhook as WebhookIcon,
    Schedule as CronIcon,
    EmojiEvents as GameIcon,
    ViewModule as CredIcon,
    FactCheck as CheckConfigIcon,
    Description as LogsIcon,
    Chat as ChatIcon,
} from '@mui/icons-material';
import { Collapse } from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { styled } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@mui/material/styles';

const StyledDrawer = styled(Drawer)(({ theme }) => ({
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

const LogoAvatar = styled(Avatar)(({ theme }) => ({
    width: 48,
    height: 48,
    background: 'linear-gradient(135deg, #00D4FF 0%, #7B2FBE 100%)',
    boxShadow: '0 0 15px rgba(0, 212, 255, 0.5)',
    animation: 'neonPulse 2s infinite',
    fontWeight: 'bold',
    fontSize: '1.2rem',
    color: '#000',
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

const UserSection = styled(Box)(({ theme }) => ({
    padding: theme.spacing(3, 2),
    background: 'rgba(255, 255, 255, 0.03)',
    borderTop: '1px solid rgba(255, 255, 255, 0.05)',
    marginTop: 'auto',
}));

const UserCard = styled(Box)(({ theme }) => ({
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(2),
    padding: theme.spacing(1.5),
    borderRadius: 12,
    background: 'rgba(10, 22, 40, 0.6)',
    border: '1px solid rgba(0, 212, 255, 0.1)',
    transition: 'all 0.3s ease',
    '&:hover': {
        borderColor: 'rgba(0, 212, 255, 0.3)',
        boxShadow: '0 0 15px rgba(0, 212, 255, 0.1)',
    }
}));

const Sidebar = ({ open, onClose }) => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const { t } = useTranslation();
    const [openSubMenus, setOpenSubMenus] = useState({});
    const [anchorEl, setAnchorEl] = useState(null);
    const [, forceUpdate] = useState({});

    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    React.useEffect(() => {
        const handleStorageChange = () => forceUpdate({});
        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, []);

    const handleMenuOpen = (event) => setAnchorEl(event.currentTarget);
    const handleMenuClose = () => setAnchorEl(null);

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
            roles: ['admin', 'supervisor', 'op_atendimento', 'op_monitoramento', 'op_analista']
        },
        {
            text: 'Empresas',
            icon: <EmpresaIcon />,
            menuKey: 'empresas',
            get path() {
                const eid = localStorage.getItem('active_evento_id');
                return eid ? `/empresas?evento_id=${eid}` : '/empresas';
            },
            roles: ['admin', 'supervisor', 'op_atendimento', 'op_analista']
        },
        {
            text: t('sidebar.people', { defaultValue: 'Participantes' }),
            icon: <PessoaIcon />,
            menuKey: 'participantes',
            get path() {
                const eid = localStorage.getItem('active_evento_id');
                return eid ? `/pessoas?evento_id=${eid}` : '/pessoas';
            },
            roles: ['admin', 'supervisor', 'op_atendimento', 'op_analista']
        },
        {
            text: 'Auditoria Documental',
            icon: <AssignmentTurnedInIcon />,
            menuKey: 'auditoria',
            get path() {
                const eid = localStorage.getItem('active_evento_id');
                return eid ? `/auditoria?evento_id=${eid}` : '/auditoria';
            },
            roles: ['admin', 'master', 'supervisor', 'op_analista']
        },
        {
            text: t('sidebar.reports', { defaultValue: 'Relatórios' }),
            icon: <AssessmentIcon />,
            menuKey: 'relatorios',
            get path() {
                const eid = localStorage.getItem('active_evento_id');
                return eid ? `/reports?evento_id=${eid}` : '/reports';
            },
            roles: ['admin', 'supervisor', 'op_monitoramento']
        },
        {
            text: 'Financeiro',
            icon: <PaidIcon />,
            menuKey: 'financeiro',
            path: '/financeiro',
            roles: ['admin', 'master'],
            disabled: true
        },
        {
            text: 'Gamificação',
            icon: <GameIcon />,
            menuKey: 'gamificacao',
            path: '/config/gamificacao',
            roles: ['master'],
            disabled: true
        },
        {
            text: 'Pulseiras',
            icon: <LabelIcon />,
            menuKey: 'pulseiras',
            path: '/config/pulseiras',
            roles: ['master'],
            disabled: true
        },
        {
            text: 'Idiomas',
            icon: <TranslateIcon />,
            menuKey: 'idiomas',
            path: '/config/idiomas',
            roles: ['master'],
            disabled: true
        },
        {
            text: 'Frota LPR',
            icon: <CarIcon />,
            menuKey: 'frota_lpr',
            get path() {
                const eid = localStorage.getItem('active_evento_id');
                return eid ? `/veiculos?evento_id=${eid}` : '/veiculos';
            },
            roles: ['master']
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
            roles: ['admin', 'supervisor', 'op_atendimento', 'op_analista']
        },
        {
            text: 'Check-out',
            icon: <CheckoutIcon />,
            menuKey: 'checkout',
            get path() {
                const eid = localStorage.getItem('active_evento_id');
                return eid ? `/checkout?evento_id=${eid}` : '/checkout';
            },
            roles: ['admin', 'supervisor', 'op_atendimento', 'op_analista']
        },
        {
            text: t('sidebar.monitor', { defaultValue: 'Monitor' }),
            icon: <MonitorIcon />,
            menuKey: 'monitor',
            get path() {
                const eid = localStorage.getItem('active_evento_id');
                return eid ? `/monitor?evento_id=${eid}` : '/monitor';
            },
            roles: ['admin', 'master', 'supervisor', 'op_monitoramento']
        },

        { divider: true },
        { 
            text: 'Logs de Auditoria', 
            icon: <HistoryIcon />, 
            menuKey: 'auditoria_sistema', 
            path: '/audit-logs', 
            roles: ['admin', 'master', 'supervisor'] 
        },
        { text: 'Usuários', icon: <UserIcon />, menuKey: 'usuarios', path: '/usuarios', roles: ['admin', 'master', 'supervisor'] },
        {
            text: t('sidebar.settings', { defaultValue: 'Configurações' }),
            icon: <SettingsIcon />,
            menuKey: 'configuracoes',
            path: '/configuracoes',
            roles: ['master'],
            children: [
                // --- Evento ---
                { text: 'Central de Configurações', path: '/configuracoes', icon: <SettingsIcon sx={{ fontSize: 16 }} /> },
                { text: 'Gerenciar Eventos', path: '/eventos', icon: <EventIcon sx={{ fontSize: 16 }} /> },
                { text: 'Geral & Interface', path: '/config/geral', icon: <PaletteIcon sx={{ fontSize: 16 }} /> },
                { text: 'Credenciamento', path: '/config/credenciamento', icon: <CredIcon sx={{ fontSize: 16 }} /> },
                { text: 'Regras de Check-in', path: '/config/checkin', icon: <CheckConfigIcon sx={{ fontSize: 16 }} /> },
                { text: 'Etiquetas & Crachás', path: '/config/etiquetas', icon: <LabelIcon sx={{ fontSize: 16 }} /> },
                { text: 'Veículos LPR', path: '/config/veiculos', icon: <CarIcon sx={{ fontSize: 16 }} /> },
                { divider: true },
                // --- Segurança ---
                { text: '🔒 Segurança JWT/2FA', path: '/config/seguranca', icon: <SecurityIcon sx={{ fontSize: 16 }} /> },
                { text: 'Perfis de Acesso', path: '/config/permissoes', icon: <VerifiedIcon sx={{ fontSize: 16 }} /> },
                { divider: true },
                // --- Integrações ---
                { text: '🔌 APIs & Cloud', path: '/config/integracoes', icon: <ExtensionIcon sx={{ fontSize: 16 }} /> },
                { text: 'Webhooks & API Keys', path: '/config/webhooks', icon: <WebhookIcon sx={{ fontSize: 16 }} /> },
                { text: 'Comunicação', path: '/config/comunicacao', icon: <ChatIcon sx={{ fontSize: 16 }} /> },
                { text: 'Gamificação', path: '/config/gamificacao', icon: <GameIcon sx={{ fontSize: 16 }} /> },
                { divider: true },
                // --- Sistema ---
                { text: '🖥️ Idiomas', path: '/config/idiomas', icon: <TranslateIcon sx={{ fontSize: 16 }} /> },
                { text: 'Notificações', path: '/config/notificacoes', icon: <NotifIcon sx={{ fontSize: 16 }} /> },
                { text: 'Câmeras', path: '/config/cameras', icon: <CameraIcon sx={{ fontSize: 16 }} /> },
                { text: 'Banco de Dados', path: '/config/banco-dados', icon: <StorageIcon sx={{ fontSize: 16 }} /> },
                { text: 'Logs do Sistema', path: '/config/logs', icon: <LogsIcon sx={{ fontSize: 16 }} /> },
                { text: 'Automação CRON', path: '/config/cron', icon: <CronIcon sx={{ fontSize: 16 }} /> },
            ]
        },
    ];

    const { hasMenuAccess } = useAuth();

    // Verificar se o role do usuário tem permissões granulares configuradas
    const hasGranularPerms = !!(user?.menu_permissions?.web_admin?.length > 0);

    const MENU_MASTER = [
        'dashboard', 'empresas', 'participantes', 'auditoria', 'relatorios', 
        'financeiro', 'frota_lpr', 'checkin', 'checkout', 'monitor', 
        'auditoria_sistema', 'usuarios', 'configuracoes', 'gamificacao', 'pulseiras', 'idiomas'
    ];

    const MENU_OPERADOR = [
        'participantes', 'checkin', 'checkout', 'monitor'
    ];

    const filteredMenu = menuItems.filter(item => {
        if (item.divider) return true;

        const nivel = user?.nivel_acesso || 'operador';
        const allowedKeys = nivel === 'master' ? MENU_MASTER : MENU_OPERADOR;

        if (!allowedKeys.includes(item.menuKey)) return false;

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
                                hasChildren ? handleSubMenuToggle(item.text, e) : navigate(item.path);
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
                            fontSize: '0.85rem',
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
                                        onClick={() => navigate(child.path)}
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
                <Box>
                    <Typography
                        variant="h6"
                        sx={{
                            fontFamily: '"Orbitron", sans-serif',
                            color: '#00D4FF',
                            fontWeight: 900,
                            letterSpacing: '2px',
                            textShadow: '0 0 10px rgba(0, 212, 255, 0.3)'
                        }}
                    >
                        NZT
                    </Typography>
                        <Typography
                        variant="caption"
                        sx={{
                            color: 'text.secondary',
                            letterSpacing: '1px',
                            textTransform: 'uppercase',
                            fontSize: '0.55rem',
                            fontWeight: 700
                        }}
                    >
                        Intelligent Control Systems
                    </Typography>
                </Box>
            </LogoContainer>

            {/* Evento Ativo Context */}
            {localStorage.getItem('active_evento_id') && (
                <Box sx={{ px: 3, pt: 2, pb: 1 }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', letterSpacing: '1px', fontWeight: 800 }}>
                        EVENTO EM FOCO:
                    </Typography>
                    <Box
                        sx={{
                            mt: 1,
                            p: 2,
                            borderRadius: 3,
                            background: 'rgba(0, 212, 255, 0.05)',
                            border: '1px solid rgba(0, 212, 255, 0.2)',
                            boxShadow: 'inset 0 0 20px rgba(0, 212, 255, 0.05)',
                            cursor: (user?.nivel_acesso === 'admin' || user?.nivel_acesso === 'master') ? 'pointer' : 'default',
                            '&:hover': (user?.nivel_acesso === 'admin' || user?.nivel_acesso === 'master')
                                ? { background: 'rgba(0, 212, 255, 0.1)' }
                                : {}
                        }}
                        onClick={() => {
                            if (user?.nivel_acesso === 'admin' || user?.nivel_acesso === 'master') {
                                navigate('/eventos');
                            }
                        }}
                    >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <EventIcon sx={{ color: '#00D4FF', fontSize: 20 }} />
                            <Box sx={{ minWidth: 0 }}>
                                <Typography variant="h6" component="div" sx={{ fontWeight: 800, color: 'white', letterSpacing: '-0.02em', fontSize: '0.95rem' }}>
                                    {localStorage.getItem('active_evento_nome') || 'A2 Eventos'}
                                </Typography>
                                <Typography variant="caption" sx={{
                                    color: (user?.nivel_acesso === 'admin' || user?.nivel_acesso === 'master') ? '#00FF88' : '#FFB800',
                                    fontWeight: 700, fontSize: '0.6rem'
                                }}>
                                    {(user?.nivel_acesso === 'admin' || user?.nivel_acesso === 'master') ? 'SISTEMA ATIVO' : '🔒 NZT FIXO'}
                                </Typography>
                            </Box>
                        </Box>
                    </Box>
                </Box>
            )}

            <List sx={{ flex: 1, pt: 2, px: 0 }}>
                {filteredMenu.map((item) => renderMenuItem(item))}
            </List>

            <UserSection>
                <Typography variant="caption" sx={{ color: 'text.secondary', px: 1, mb: 1, display: 'block', fontWeight: 800, letterSpacing: '2px' }}>
                    OPERADOR LOGADO
                </Typography>
                <UserCard onClick={handleMenuOpen} sx={{ cursor: 'pointer' }}>
                    <Box sx={{ position: 'relative' }}>
                        <Avatar
                            src={user?.foto_url}
                            sx={{
                                width: 52,
                                height: 52,
                                border: '2px solid',
                                borderColor: '#00D4FF',
                                boxShadow: '0 0 15px rgba(0, 212, 255, 0.4)',
                                background: '#050B18'
                            }}
                        >
                            {user?.nome_completo?.charAt(0) || 'U'}
                        </Avatar>
                        <Box sx={{
                            position: 'absolute',
                            bottom: 2,
                            right: 2,
                            width: 12,
                            height: 12,
                            bgcolor: '#00FF88',
                            borderRadius: '50%',
                            border: '2px solid #0A1628',
                            boxShadow: '0 0 5px #00FF88'
                        }} />
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography
                            variant="subtitle2"
                            noWrap
                            sx={{
                                fontWeight: 900,
                                fontSize: '0.8rem',
                                color: '#fff',
                                fontFamily: '"Orbitron", sans-serif',
                                letterSpacing: '0.5px'
                            }}
                        >
                            {user?.nome_completo?.split(' ')[0] || 'OPERADOR'}
                        </Typography>
                        <Typography
                            variant="caption"
                            sx={{
                                color: '#00D4FF',
                                fontWeight: 700,
                                fontSize: '0.65rem',
                                display: 'block',
                                opacity: 0.8
                            }}
                        >
                            {user?.nivel_acesso?.toUpperCase() || 'ACESSO'}
                        </Typography>
                        <Typography
                            variant="caption"
                            sx={{ color: '#00FF88', fontWeight: 800, fontSize: '0.55rem', letterSpacing: '1px' }}
                        >
                            ONLINE • NZT
                        </Typography>
                    </Box>
                    <IconButton
                        size="small"
                        sx={{
                            color: 'text.secondary',
                            '&:hover': { color: '#00D4FF' }
                        }}
                    >
                        <SettingsIcon fontSize="inherit" sx={{ fontSize: '1rem' }} />
                    </IconButton>
                </UserCard>

                <Menu
                    anchorEl={anchorEl}
                    open={Boolean(anchorEl)}
                    onClose={handleMenuClose}
                    anchorOrigin={{
                        vertical: 'top',
                        horizontal: 'right',
                    }}
                    transformOrigin={{
                        vertical: 'bottom',
                        horizontal: 'left',
                    }}
                    PaperProps={{
                        sx: {
                            background: '#0A1628',
                            border: '1px solid rgba(0, 212, 255, 0.2)',
                            boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
                            minWidth: 180,
                            borderRadius: 3,
                            mt: -1
                        },
                    }}
                >
                    <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid rgba(255,255,255,0.05)', mb: 1 }}>
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>EMAIL</Typography>
                        <Typography variant="body2" sx={{ color: '#fff', fontWeight: 600, fontSize: '0.75rem' }} noWrap>
                            {user?.email}
                        </Typography>
                    </Box>
                    <MenuItem
                        onClick={logout}
                        sx={{
                            gap: 2,
                            mx: 1,
                            borderRadius: 1.5,
                            '&:hover': { background: 'rgba(255, 51, 102, 0.1)', color: '#FF3366' }
                        }}
                    >
                        <LogoutIcon fontSize="small" />
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>Logoff NZT</Typography>
                    </MenuItem>
                    <MenuItem
                        onClick={handleMenuClose}
                        sx={{
                            gap: 2,
                            mx: 1,
                            borderRadius: 1.5,
                            '&:hover': { background: 'rgba(0, 212, 255, 0.1)' }
                        }}
                    >
                        <SupportIcon fontSize="small" />
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>Suporte A2</Typography>
                    </MenuItem>
                </Menu>
            </UserSection>
        </StyledDrawer>
    );
};

export default Sidebar;