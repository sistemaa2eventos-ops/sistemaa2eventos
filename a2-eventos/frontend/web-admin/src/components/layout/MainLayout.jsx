import React, { useState } from 'react';
import { Box, AppBar, Toolbar, IconButton, useTheme, useMediaQuery, Avatar } from '@mui/material';
import { Menu as MenuIcon } from '@mui/icons-material';
import Sidebar from './Sidebar';

const MainLayout = ({ children }) => {
    const [mobileOpen, setMobileOpen] = useState(false);
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    const handleDrawerToggle = () => {
        setMobileOpen(!mobileOpen);
    };

    return (
        <Box sx={{ display: 'flex', minHeight: '100vh', width: '100%' }}>
            {isMobile && (
                <AppBar position="fixed" sx={{ 
                    zIndex: (theme) => theme.zIndex.drawer + 1,
                    background: 'linear-gradient(90deg, #050B18 0%, #0A1628 100%)',
                    borderBottom: '1px solid rgba(0, 212, 255, 0.15)',
                    backdropFilter: 'blur(20px)'
                }}>
                    <Toolbar>
                        <IconButton
                            color="inherit"
                            onClick={handleDrawerToggle}
                            sx={{ mr: 2, color: '#00D4FF' }}
                        >
                            <MenuIcon />
                        </IconButton>
                        <Avatar
                            src="/assets/nzt-logo.jpg"
                            variant="rounded"
                            sx={{ width: 32, height: 32, ml: 'auto', border: '1px solid rgba(0, 212, 255, 0.3)' }}
                        >
                            NZT
                        </Avatar>
                    </Toolbar>
                </AppBar>
            )}

            <Sidebar open={isMobile ? mobileOpen : true} onClose={() => setMobileOpen(false)} />

            <Box 
                component="main" 
                sx={{ 
                    flexGrow: 1, 
                    bgcolor: 'background.default',
                    width: isMobile ? '100%' : `calc(100% - 280px)`,
                    pt: isMobile ? { xs: 8, sm: 9 } : 0, 
                    minHeight: '100vh',
                    overflowX: 'hidden'
                }}
            >
                {children}
            </Box>
        </Box>
    );
};

export default MainLayout;
