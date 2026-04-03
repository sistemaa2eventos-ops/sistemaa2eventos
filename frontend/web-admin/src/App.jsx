// Maintenance: Force HMR refresh - System stable
import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import theme from './styles/theme';
import GlobalErrorBoundary from './components/common/GlobalErrorBoundary';
import { SnackbarProvider, useSnackbar } from 'notistack';
import { setGlobalSnackbar } from './services/api';

// Layout
import Sidebar from './components/layout/Sidebar';
import { Box, CircularProgress } from '@mui/material';

// Services
import localCheckinService from './services/LocalCheckinService';

// Pages (Lazy Loaded for Bundle Splitting)
const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Empresas = lazy(() => import('./pages/Empresas'));
const Pessoas = lazy(() => import('./pages/Pessoas'));
const AuditoriaDocumental = lazy(() => import('./pages/AuditoriaDocumental'));
const Checkin = lazy(() => import('./pages/Checkin'));
const Checkout = lazy(() => import('./pages/Checkout'));
const Monitor = lazy(() => import('./pages/Monitor'));
const Eventos = lazy(() => import('./pages/Eventos'));
const Reports = lazy(() => import('./pages/Reports'));
const Veiculos = lazy(() => import('./pages/Veiculos'));
const Usuarios = lazy(() => import('./pages/Usuarios'));
const Configuracoes = lazy(() => import('./pages/Configuracoes'));
const ConfigEtiquetas = lazy(() => import('./pages/config/ConfigEtiquetas'));
const ConfigLeitorFacial = lazy(() => import('./pages/config/ConfigLeitorFacial'));
const ConfigCameras = lazy(() => import('./pages/config/ConfigCameras'));
const ConfigBancoDados = lazy(() => import('./pages/config/ConfigBancoDados'));
const ConfigGeral = lazy(() => import('./pages/config/ConfigGeral'));
const ConfigIdiomas = lazy(() => import('./pages/config/ConfigIdiomas'));
const ConfigNotificacoes = lazy(() => import('./pages/config/ConfigNotificacoes'));
const ConfigIntegracoes = lazy(() => import('./pages/config/ConfigIntegracoes'));
const ConfigCredenciamento = lazy(() => import('./pages/config/ConfigCredenciamento'));
const ConfigCheckin = lazy(() => import('./pages/config/ConfigCheckin'));
const ConfigVeiculos = lazy(() => import('./pages/config/ConfigVeiculos'));
const ConfigSeguranca = lazy(() => import('./pages/config/ConfigSeguranca'));
const ConfigLogs = lazy(() => import('./pages/config/ConfigLogs'));
const ConfigComunicacao = lazy(() => import('./pages/config/ConfigComunicacao'));
const ConfigWebhooks = lazy(() => import('./pages/config/ConfigWebhooks'));
const ConfigGamificacao = lazy(() => import('./pages/config/ConfigGamificacao'));
const ConfigAreas = lazy(() => import('./pages/config/ConfigAreas'));
const ConfigPulseiras = lazy(() => import('./pages/config/ConfigPulseiras'));
const PermissoesAcesso = lazy(() => import('./pages/config/PermissoesAcesso'));
const ConfigCron = lazy(() => import('./pages/config/ConfigCron'));

const AppContent = () => {
  const { user, loading } = useAuth();
  const { enqueueSnackbar } = useSnackbar();

  React.useEffect(() => {
    // Only register listener if user is logged in
    if (user && !loading) {
      localCheckinService.iniciarListenerConexao(
        (count) => {
          enqueueSnackbar(`Conexão restaurada. Sincronizando ${count} check-ins pendentes...`, { variant: 'info' });
        },
        () => {
          enqueueSnackbar(`Sincronização offline concluída com sucesso!`, { variant: 'success' });
        }
      );

      setGlobalSnackbar(enqueueSnackbar);

      window.addEventListener('offline', () => {
        enqueueSnackbar(`Sem conexão! Modo Offline ativado. Check-ins salvos localmente.`, { variant: 'warning' });
      });
    }
  }, [user, loading, enqueueSnackbar]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', bgcolor: '#050B18' }}>
        <CircularProgress color="secondary" />
      </Box>
    );
  }

  if (!user) {
    return (
      <Suspense fallback={<Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', bgcolor: '#050B18' }}><CircularProgress color="secondary" /></Box>}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Navigate to="/login" />} />
        </Routes>
      </Suspense>
    );
  }

  return (
    <Box sx={{ display: 'flex' }}>
      <Sidebar />
      <Box component="main" sx={{ flexGrow: 1, bgcolor: 'background.default', minHeight: '100vh' }}>
        <Suspense fallback={<Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', bgcolor: '#050B18' }}><CircularProgress color="secondary" /></Box>}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/eventos" element={<Eventos />} />
            <Route path="/empresas" element={<Empresas />} />
            <Route path="/pessoas" element={<Pessoas />} />
            <Route path="/auditoria" element={<AuditoriaDocumental />} />
            <Route path="/veiculos" element={<Veiculos />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/checkin" element={<Checkin />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/monitor" element={<Monitor />} />
            <Route path="/usuarios" element={<Usuarios />} />
            <Route path="/configuracoes" element={<Configuracoes />} />
            <Route path="/config/geral" element={<ConfigGeral />} />
            <Route path="/config/idiomas" element={<ConfigIdiomas />} />
            <Route path="/config/notificacoes" element={<ConfigNotificacoes />} />
            <Route path="/config/integracoes" element={<ConfigIntegracoes />} />
            <Route path="/config/etiquetas" element={<ConfigEtiquetas />} />
            <Route path="/config/leitor-facial" element={<ConfigLeitorFacial />} />
            <Route path="/config/cameras" element={<ConfigCameras />} />
            <Route path="/config/banco-dados" element={<ConfigBancoDados />} />
            <Route path="/config/credenciamento" element={<ConfigCredenciamento />} />
            <Route path="/config/areas" element={<ConfigAreas />} />
            <Route path="/config/pulseiras" element={<ConfigPulseiras />} />
            <Route path="/config/checkin" element={<ConfigCheckin />} />
            <Route path="/config/veiculos" element={<ConfigVeiculos />} />
            <Route path="/config/seguranca" element={<ConfigSeguranca />} />
            <Route path="/config/logs" element={<ConfigLogs />} />
            <Route path="/config/comunicacao" element={<ConfigComunicacao />} />
            <Route path="/config/webhooks" element={<ConfigWebhooks />} />
            <Route path="/config/gamificacao" element={<ConfigGamificacao />} />
            <Route path="/config/permissoes" element={<PermissoesAcesso />} />
            <Route path="/config/cron" element={<ConfigCron />} />
            {/* Redirect authenticated users away from login or unknown routes */}
            <Route path="/login" element={<Navigate to="/" />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </Suspense>
      </Box>
    </Box>
  );
};

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <SnackbarProvider maxSnack={3}>
        <GlobalErrorBoundary>
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <AuthProvider>
              <AppContent />
            </AuthProvider>
          </BrowserRouter>
        </GlobalErrorBoundary>
      </SnackbarProvider>
    </ThemeProvider>
  );
}

export default App;