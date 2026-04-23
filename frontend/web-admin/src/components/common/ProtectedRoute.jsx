import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Box, Typography, Button } from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';

/**
 * FIX I-09: ProtectedRoute
 * Wrapper que verifica se o usuário tem permissão para acessar uma rota.
 * Bloqueia acesso direto pela URL (antes só o Sidebar escondia o menu).
 *
 * Uso:
 *   <Route path="/usuarios" element={
 *     <ProtectedRoute modulo="usuarios">
 *       <Usuarios />
 *     </ProtectedRoute>
 *   } />
 *
 * Admin masters passam automaticamente.
 * Se não tiver permissão, mostra página de acesso negado em vez de redirecionar.
 */
const ProtectedRoute = ({ children, modulo, role }) => {
  const { user, hasPermission } = useAuth();

  // Não autenticado → Login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Verificação de role explícita (ex: apenas admin_master)
  if (role) {
    const userRole = user.nivel_acesso || user.user_metadata?.nivel_acesso || user.user_metadata?.role;
    if (userRole !== role && userRole !== 'admin_master' && userRole !== 'master') {
      return <AccessDenied />;
    }
  }

  // Verificação de módulo via hasPermission do AuthContext
  if (modulo && !hasPermission(modulo)) {
    return <AccessDenied />;
  }

  return children;
};

const AccessDenied = () => (
  <Box
    sx={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      gap: 2,
      color: 'text.secondary'
    }}
  >
    <LockOutlinedIcon sx={{ fontSize: 64, color: 'warning.main', opacity: 0.7 }} />
    <Typography variant="h5" fontWeight={600}>
      Acesso Restrito
    </Typography>
    <Typography variant="body2" textAlign="center" maxWidth={360}>
      Você não tem permissão para acessar esta página.
      Entre em contato com o administrador do sistema.
    </Typography>
    <Button variant="outlined" onClick={() => window.history.back()}>
      Voltar
    </Button>
  </Box>
);

export default ProtectedRoute;
