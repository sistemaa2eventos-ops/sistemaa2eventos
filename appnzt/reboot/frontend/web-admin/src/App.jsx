import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Box, CssBaseline, AppBar, Toolbar, Typography, Drawer, List, ListItem, ListItemIcon, ListItemText, ListItemButton, IconButton, Avatar, Menu, MenuItem } from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import BusinessIcon from '@mui/icons-material/Business';
import PeopleIcon from '@mui/icons-material/People';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import DescriptionIcon from '@mui/icons-material/Description';
import SettingsIcon from '@mui/icons-material/Settings';
import LogoutIcon from '@mui/icons-material/Logout';
import EventIcon from '@mui/icons-material/Event';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Companies from './pages/Companies';
import People from './pages/People';
import Vehicles from './pages/Vehicles';
import Documents from './pages/Documents';
import Events from './pages/Events';
import DevicesIcon from '@mui/icons-material/Devices';
import Devices from './pages/Devices';
import Settings from './pages/Settings';

const DRAWER_WIDTH = 260;

function App() {
  const [user, setUser] = useState(null);
  const [anchorEl, setAnchorEl] = useState(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
  }, []);

  const handleLogin = (userData) => {
    setUser(userData);
    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.setItem('token', userData.token);
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('user');
    localStorage.removeItem('token');
  };

  const handleMenu = (event) => {
    setAnchorEl(event.currentTarget);
  };

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  const menuItems = [
    { text: 'Dashboard', icon: <DashboardIcon />, path: '/' },
    { text: 'Eventos', icon: <EventIcon />, path: '/events' },
    { text: 'Empresas', icon: <BusinessIcon />, path: '/companies' },
    { text: 'Pessoas', icon: <PeopleIcon />, path: '/people' },
    { text: 'Veículos', icon: <DirectionsCarIcon />, path: '/vehicles' },
    { text: 'Documentos', icon: <DescriptionIcon />, path: '/documents' },
    { text: 'Dispositivos', icon: <DevicesIcon />, path: '/devices' },
    { text: 'Configurações', icon: <SettingsIcon />, path: '/settings' },
  ];

  return (
    <BrowserRouter>
      <Box sx={{ display: 'flex' }}>
        <CssBaseline />
        
        <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1, bgcolor: '#111', borderBottom: '1px solid #222' }}>
          <Toolbar>
            <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1, fontWeight: 700, color: '#00d4ff' }}>
              NZT - Intelligent Control Systems
            </Typography>
            <IconButton onClick={handleMenu} sx={{ p: 0 }}>
              <Avatar sx={{ bgcolor: '#00d4ff', color: '#000' }}>{user.name?.[0] || 'U'}</Avatar>
            </IconButton>
            <Menu
              anchorEl={anchorEl}
              open={Boolean(anchorEl)}
              onClose={() => setAnchorEl(null)}
              PaperProps={{ sx: { mt: 1, bgcolor: '#1a1a1a', color: '#fff' } }}
            >
              <MenuItem disabled>
                <Typography variant="body2">{user.email}</Typography>
              </MenuItem>
              <MenuItem onClick={handleLogout}>
                <ListItemIcon><LogoutIcon sx={{ color: '#fff' }} /></ListItemIcon>
                Sair
              </MenuItem>
            </Menu>
          </Toolbar>
        </AppBar>

        <Drawer
          variant="permanent"
          sx={{
            width: DRAWER_WIDTH,
            flexShrink: 0,
            '& .MuiDrawer-paper': {
              width: DRAWER_WIDTH,
              boxSizing: 'border-box',
              bgcolor: '#111',
              borderRight: '1px solid #222',
            },
          }}
        >
          <Toolbar />
          <List>
            {menuItems.map((item) => (
              <ListItem key={item.text} disablePadding>
                <ListItemButton component="a" href={item.path} sx={{ color: '#ccc', '&:hover': { bgcolor: '#222' } }}>
                  <ListItemIcon sx={{ color: '#00d4ff' }}>{item.icon}</ListItemIcon>
                  <ListItemText primary={item.text} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Drawer>

        <Box component="main" sx={{ flexGrow: 1, p: 3, bgcolor: '#0a0a0a', minHeight: '100vh' }}>
          <Toolbar />
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/events" element={<Events />} />
            <Route path="/companies" element={<Companies />} />
            <Route path="/people" element={<People />} />
            <Route path="/vehicles" element={<Vehicles />} />
            <Route path="/documents" element={<Documents />} />
            <Route path="/devices" element={<Devices />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </Box>
      </Box>
    </BrowserRouter>
  );
}

export default App;