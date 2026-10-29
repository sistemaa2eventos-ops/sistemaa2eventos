import React, { useState, useEffect } from 'react';
import { Box, AppBar, Toolbar, IconButton, useTheme, useMediaQuery, Avatar, Typography } from '@mui/material';
import { Menu as MenuIcon, Event as EventIcon } from '@mui/icons-material';
import Sidebar from './Sidebar';
import NotificationBell from './NotificationBell';

const MainLayout = ({ children }) => {
    const [mobileOpen, setMobileOpen] = useState(false);
    const [eventoNome, setEventoNome] = useState(() => localStorage.getItem('active_evento_nome') || 'NZT Eventos');
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    useEffect(() => {
        const syncEvento = () => {
            setEventoNome(localStorage.getItem('active_evento_nome') || 'NZT Eventos');
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
                    background: 'linear-gradient(90deg, #050B18 0%, #0A1628 100%)',
                    borderBottom: '1px solid rgba(0, 212, 255, 0.15)',
                    backdropFilter: 'blur(20px)'
                }}>
                    <Toolbar sx={{ minHeight: { xs: 56, sm: 60 }, px: { xs: 1.5, sm: 2 }, gap: 1 }}>
                        <IconButton
                            color="inherit"
                            onClick={handleDrawerToggle}
                            aria-label="Abrir menu lateral"
                            sx={{ color: '#00D4FF', p: 1 }}
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
                                bgcolor: 'rgba(0, 212, 255, 0.06)',
                                border: '1px solid rgba(0, 212, 255, 0.18)'
                            }}
                        >
                            <EventIcon sx={{ fontSize: 16, color: '#00D4FF', flexShrink: 0 }} />
                            <Typography
                                variant="caption"
                                noWrap
                                sx={{ fontWeight: 700, color: '#FFFFFF', fontSize: '0.8125rem' }}
                            >
                                {eventoNome}
                            </Typography>
                        </Box>

                        <Box sx={{ flexShrink: 0 }}>
                            <NotificationBell />
                        </Box>
                        <Avatar
                            src="/assets/nzt-logo.jpg"
                            variant="rounded"
                            sx={{ width: 30, height: 30, border: '1px solid rgba(0, 212, 255, 0.3)', flexShrink: 0 }}
                        >
                            NZT
                        </Avatar>
                    </Toolbar>
                </AppBar>
            )}

            {/* Classes usadas pelo modo quiosque (index.css) para esconder menu e barra */}
            <Box className="app-menu" sx={{ display: 'contents' }}>
                <Sidebar open={isMobile ? mobileOpen : true} onClose={() => setMobileOpen(false)} />
            </Box>

            <Box 
                component="main" 
                className="app-conteudo"
                sx={{ 
                    flexGrow: 1, 
                    bgcolor: 'background.default',
                    width: isMobile ? '100%' : `calc(100% - 280px)`,
                    pt: isMobile ? { xs: '56px', sm: '60px' } : 0, 
                    minHeight: '100dvh',
                    overflowX: 'hidden'
                }}
            >
                {children}
            </Box>
        </Box>
    );
};

export default MainLayout;
