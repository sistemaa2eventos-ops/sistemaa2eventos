import React from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Box, Typography, Button } from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';

import { botaoSecundario } from '../../styles/tokens';
const MODULE_ROUTES = [
  { modulo: 'checkin', path: '/checkin', label: 'Check-in' },
  { modulo: 'checkout', path: '/checkout', label: 'Check-out' },
  { modulo: 'fiscalizacao', path: '/fiscalizacao', label: 'Fiscalização' },
  { modulo: 'monitoramento', path: '/monitor', label: 'Monitor' },
  { modulo: 'pessoas', path: '/pessoas', label: 'Participantes' },
  { modulo: 'empresas', path: '/empresas', label: 'Empresas' },
  { modulo: 'relatorios', path: '/reports', label: 'Relatórios' },
  { modulo: 'veiculos', path: '/veiculos', label: 'Veículos LPR' },
  { modulo: 'auditoria_documentos', path: '/auditoria', label: 'Auditoria' },
  { modulo: 'dashboard', path: '/', label: 'Dashboard' }
];

/**
 * FIX I-09 & Multi-Event Guard: ProtectedRoute
 * Bloqueia estritamente qualquer rota para a qual o operador não tenha permissão liberada.
 */
const ProtectedRoute = ({ children, modulo, role }) => {
  const { user, hasPermission } = useAuth();

  // Não autenticado → Login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // admin_master é o único perfil administrador: acesso total a qualquer rota
  if (user.nivel_acesso === 'admin_master') {
    return children;
  }

  // Rota restrita a um perfil específico (ex: role="admin_master")
  if (role && user.nivel_acesso !== role) {
    return <AccessDenied />;
  }

  // Verificação de módulo via hasPermission do AuthContext
  if (modulo && !hasPermission(modulo)) {
    return <AccessDenied />;
  }

  return children;
};

const AccessDenied = () => {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();

  const firstAllowed = MODULE_ROUTES.find(m => hasPermission(m.modulo));

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '65vh',
        gap: 2.5,
        p: 3,
        textAlign: 'center'
      }}
    >
      <Box
        sx={{
          p: 3,
          borderRadius: '50%',
          background: 'rgba(255, 51, 102, 0.1)',
          border: '1px solid rgba(255, 51, 102, 0.3)',
          boxShadow: '0 0 25px rgba(255, 51, 102, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <LockOutlinedIcon sx={{ fontSize: 56, color: '#FF3366' }} />
      </Box>
      <Typography variant="h5" fontWeight={700} sx={{ color: '#FFFFFF', fontFamily: '"Space Grotesk", sans-serif' }}>
        Acesso restrito
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 420, lineHeight: 1.6 }}>
        Seu usuário não possui permissão para acessar esta página no evento ativo. Solicite a liberação ao administrador master.
      </Typography>
      <Box sx={{ display: 'flex', gap: 2, mt: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
        {firstAllowed && (
          <Button
            variant="contained"
            onClick={() => navigate(firstAllowed.path)}
            sx={{
              background: 'linear-gradient(135deg, #00D4FF 0%, #7B2FBE 100%)',
              color: '#000000',
              fontWeight: 700,
              boxShadow: '0 0 15px rgba(0, 212, 255, 0.4)'
            }}
          >
            Ir para {firstAllowed.label}
          </Button>
        )}
        <Button variant="outlined"
         
          onClick={() => window.history.back()} sx={botaoSecundario}>
          Voltar
        </Button>
      </Box>
    </Box>
  );
};

export default ProtectedRoute;
