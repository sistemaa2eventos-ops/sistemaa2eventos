import { cores, tom } from '../../styles/tokens';
import React, { useState, useEffect } from 'react';
import { Box, AppBar, Toolbar, IconButton, useTheme, useMediaQuery, Avatar, Typography, Tooltip, Dialog, DialogTitle, DialogContent, DialogActions, Button } from '@mui/material';
import { Menu as MenuIcon, Event as EventIcon, LockOpen as LockOpenIcon, Logout as LogoutIcon, Fullscreen as FullscreenIcon } from '@mui/icons-material';
import Sidebar, { LARGURA_MENU, LARGURA_MENU_RECOLHIDO } from './Sidebar';
import UsuarioChip from './UsuarioChip';
import NotificationBell from './NotificationBell';
import AjudaContextual from '../ajuda/AjudaContextual';
import nztEmblem from '../../assets/images/nzt-emblem.png';
import { useSystemBranding } from '../../hooks/useSystemBranding';
import { useAuth } from '../../contexts/AuthContext';

const MainLayout = ({ children }) => {
    const { user, logout } = useAuth();
    const { system_name: systemName, logo_url: customLogoUrl, emblem_url: customEmblemUrl } = useSystemBranding();
    const [mobileOpen, setMobileOpen] = useState(false);
    // Menu e cartão do operador: recolher é a escolha de quem opera, então fica salva neste navegador
    const [menuRecolhido, setMenuRecolhido] = useState(() => localStorage.getItem('nzt_menu_recolhido') === '1');
    const [usuarioRecolhido, setUsuarioRecolhido] = useState(() => localStorage.getItem('nzt_usuario_recolhido') === '1');
    useEffect(() => { localStorage.setItem('nzt_menu_recolhido', menuRecolhido ? '1' : '0'); }, [menuRecolhido]);
    useEffect(() => { localStorage.setItem('nzt_usuario_recolhido', usuarioRecolhido ? '1' : '0'); }, [usuarioRecolhido]);
    const larguraMenu = menuRecolhido ? LARGURA_MENU_RECOLHIDO : LARGURA_MENU;
    // Cartão grande só aparece com o menu aberto e não recolhido; senão o pequeno fica no topo
    const cartaoGrandeVisivel = !menuRecolhido && !usuarioRecolhido;
    const [eventoNome, setEventoNome] = useState(() => localStorage.getItem('active_evento_nome') || '');
    const [eventoId, setEventoId] = useState(() => localStorage.getItem('active_evento_id') || 'sem-evento');
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    // Modo Quiosque / Tela Cheia definido nas permissões do operador
    const isOperador = user?.nivel_acesso === 'operador';
    const modoTela = isOperador ? (user?.permissions?.modo_tela || 'normal') : 'normal';
    const modoKioskAtivo = isOperador && (modoTela === 'quiosque' || modoTela === 'tela_cheia');
    const [kioskLiberadoTemp, setKioskLiberadoTemp] = useState(false);
    const [modalSairKiosk, setModalSairKiosk] = useState(false);

    useEffect(() => {
        const deveAplicarQuiosque = modoKioskAtivo && !kioskLiberadoTemp;
        if (deveAplicarQuiosque) {
            document.body.classList.add('modo-quiosque');
        } else {
            document.body.classList.remove('modo-quiosque');
        }
        return () => {
            document.body.classList.remove('modo-quiosque');
        };
    }, [modoKioskAtivo, kioskLiberadoTemp]);

    useEffect(() => {
        const syncEvento = () => {
            setEventoNome(localStorage.getItem('active_evento_nome') || '');
            setEventoId(localStorage.getItem('active_evento_id') || 'sem-evento');
        };
        window.addEventListener('storage', syncEvento);
        return () => window.removeEventListener('storage', syncEvento);
    }, []);

    const handleDrawerToggle = () => {
        setMobileOpen(!mobileOpen);
    };

    return (
        <Box sx={{ display: 'flex', minHeight: '100dvh', width: '100%' }}>
            {isMobile && (
                <AppBar position="fixed" className="app-barra" sx={{ 
                    zIndex: (t) => t.zIndex.drawer + 1,
                    background: `linear-gradient(90deg, ${cores.fundo} 0%, ${cores.superficie} 100%)`,
                    borderBottom: '1px solid rgba(0, 212, 255, 0.15)',
                    backdropFilter: 'blur(20px)'
                }}>
                    <Toolbar sx={{ minHeight: { xs: 56, sm: 60 }, px: { xs: 1.5, sm: 2 }, gap: 1 }}>
                        <IconButton
                            color="inherit"
                            onClick={handleDrawerToggle}
                            aria-label="Abrir menu lateral"
                            sx={{ color: cores.primaria, p: 1 }}
                        >
                            <MenuIcon />
                        </IconButton>

                        <Box
                            onClick={handleDrawerToggle}
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 0.75,
                                minWidth: 0,
                                flex: 1,
                                cursor: 'pointer',
                                py: 0.5,
                                px: 1,
                                borderRadius: 1.5,
                                bgcolor: tom(cores.primaria, 0.06),
                                border: '1px solid rgba(0, 212, 255, 0.18)'
                            }}
                        >
                            <EventIcon sx={{ fontSize: 16, color: cores.primaria, flexShrink: 0 }} />
                            <Typography
                                variant="caption"
                                noWrap
                                sx={{ fontWeight: 700, color: cores.textoForte, fontSize: '0.8125rem' }}
                            >
                                {eventoNome || systemName || 'NZT Eventos'}
                            </Typography>
                        </Box>

                        <Box sx={{ flexShrink: 0 }}>
                            <NotificationBell />
                        </Box>
                        <Avatar
                            src={customEmblemUrl || customLogoUrl || nztEmblem}
                            variant="circular"
                            sx={{ width: 34, height: 34, border: '1px solid rgba(0, 212, 255, 0.4)', bgcolor: cores.fundo, flexShrink: 0 }}
                        >
                            NZT
                        </Avatar>
                    </Toolbar>
                </AppBar>
            )}

            {/* Classes usadas pelo modo quiosque (index.css) para esconder menu e barra */}
            <Box className="app-menu" sx={{ display: 'contents' }}>
                <Sidebar
                    open={isMobile ? mobileOpen : true}
                    onClose={() => setMobileOpen(false)}
                    recolhido={menuRecolhido}
                    onAlternarMenu={() => setMenuRecolhido(v => !v)}
                    usuarioRecolhido={usuarioRecolhido}
                    onRecolherUsuario={() => setUsuarioRecolhido(true)}
                />
            </Box>

            <Box 
                component="main" 
                className="app-conteudo"
                sx={{ 
                    flexGrow: 1,
                    bgcolor: 'background.default',
                    width: isMobile ? '100%' : `calc(100% - ${larguraMenu}px)`,
                    transition: 'width 200ms cubic-bezier(0.4, 0, 0.2, 1)',
                    pt: isMobile ? { xs: '56px', sm: '60px' } : 0,
                    minHeight: '100dvh',
                    overflowX: 'hidden'
                }}
            >
                {/* Barra superior (desktop): evento em foco à esquerda e o cartão pequeno do operador à direita */}
                {!isMobile && (menuRecolhido || !cartaoGrandeVisivel) && (
                    <Box
                        component="header"
                        className="app-barra"
                        sx={{
                            position: 'sticky',
                            top: 0,
                            zIndex: (t) => t.zIndex.appBar,
                            height: 60,
                            px: 3,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 2,
                            bgcolor: cores.fundo,
                            borderBottom: `1px solid ${cores.borda}`
                        }}
                    >
                        {/* Evento em foco aparece aqui só com o menu recolhido (com o menu aberto, ele já está na lateral) */}
                        {menuRecolhido ? (
                            <Typography noWrap sx={{ fontSize: '0.8125rem', color: cores.textoSecundario, minWidth: 0 }}>
                                <Box component="span" sx={{ color: cores.textoFraco }}>Evento em foco: </Box>
                                <Box component="span" sx={{ color: cores.textoForte, fontWeight: 600 }}>{eventoNome || 'nenhum'}</Box>
                            </Typography>
                        ) : <Box />}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexShrink: 0, ml: 'auto' }}>
                            {!cartaoGrandeVisivel && (
                                <UsuarioChip onExpandir={() => setUsuarioRecolhido(false)} />
                            )}
                        </Box>
                    </Box>
                )}

                {/* key pelo evento: trocar o evento em foco remonta a tela e ela busca os dados do novo evento */}
                <React.Fragment key={eventoId}>{children}</React.Fragment>
                <AjudaContextual />

                {/* Botão de desbloqueio discreto exclusivo para quando o modo quiosque / tela cheia estiver ativo */}
                {modoKioskAtivo && !kioskLiberadoTemp && (
                    <Box sx={{
                        position: 'fixed',
                        bottom: 12,
                        right: 12,
                        zIndex: 9999,
                        opacity: 0.25,
                        transition: 'opacity 0.2s',
                        '&:hover': { opacity: 0.95 }
                    }}>
                        <Tooltip title="Opções do Quiosque / Sair" placement="left">
                            <IconButton
                                size="small"
                                onClick={() => setModalSairKiosk(true)}
                                sx={{
                                    bgcolor: 'rgba(5, 11, 24, 0.85)',
                                    color: cores.primaria,
                                    border: '1px solid rgba(0, 212, 255, 0.3)',
                                    backdropFilter: 'blur(8px)',
                                    boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
                                    '&:hover': { bgcolor: tom(cores.primaria, 0.15) }
                                }}
                            >
                                <LockOpenIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                        </Tooltip>
                    </Box>
                )}

                {/* Diálogo de controle de saída do Quiosque */}
                <Dialog 
                    open={modalSairKiosk} 
                    onClose={() => setModalSairKiosk(false)}
                    PaperProps={{
                        sx: {
                            bgcolor: cores.superficie,
                            border: '1px solid rgba(0, 212, 255, 0.3)',
                            borderRadius: 3,
                            color: cores.textoForte,
                            p: 1,
                            maxWidth: 380
                        }
                    }}
                >
                    <DialogTitle sx={{ color: cores.primaria, fontWeight: 700, fontSize: '1rem', pb: 1 }}>
                        Modo {modoTela === 'quiosque' ? 'Quiosque' : 'Tela Cheia'}
                    </DialogTitle>
                    <DialogContent sx={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem' }}>
                        Deseja liberar temporariamente o menu de navegação ou encerrar a sessão deste posto?
                    </DialogContent>
                    <DialogActions sx={{ px: 3, pb: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <Button
                            fullWidth
                            variant="outlined"
                            startIcon={<MenuIcon />}
                            onClick={() => {
                                setKioskLiberadoTemp(true);
                                setModalSairKiosk(false);
                            }}
                            sx={{ borderColor: tom(cores.primaria, 0.4), color: cores.primaria }}
                        >
                            Exibir Menu Temporariamente
                        </Button>
                        <Button
                            fullWidth
                            variant="contained"
                            color="error"
                            startIcon={<LogoutIcon />}
                            onClick={() => {
                                setModalSairKiosk(false);
                                logout();
                            }}
                            sx={{ bgcolor: cores.erro }}
                        >
                            Encerrar Sessão (Logout)
                        </Button>
                        <Button
                            fullWidth
                            onClick={() => setModalSairKiosk(false)}
                            sx={{ color: 'rgba(255,255,255,0.5)', textTransform: 'none' }}
                        >
                            Continuar no Modo Quiosque
                        </Button>
                    </DialogActions>
                </Dialog>
            </Box>
        </Box>
    );
};

export default MainLayout;
