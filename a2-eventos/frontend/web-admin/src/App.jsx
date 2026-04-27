// Maintenance: Force HMR refresh - System stable
import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import theme from './styles/theme';
import GlobalErrorBoundary from './components/common/GlobalErrorBoundary';
import LoadingOverlay from './components/common/LoadingOverlay';
import { SnackbarProvider, useSnackbar } from 'notistack';
import { setGlobalSnackbar } from './services/api';

// Layout
import MainLayout from './components/layout/MainLayout';
import { Box } from '@mui/material';
import ProtectedRoute from './components/common/ProtectedRoute'; // FIX I-09

// Services
import localCheckinService from './services/LocalCheckinService';
import { useSystemAlerts } from './hooks/useSystemAlerts';

// Pages (Lazy Loaded for Bundle Splitting)
const Login = lazy(() => import('./pages/Login'));
const PortalCadastro = lazy(() => import('./pages/PortalCadastro'));
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
const AuditLogs = lazy(() => import('./pages/AuditLogs'));
const Configuracoes = lazy(() => import('./pages/Configuracoes'));
const ConfigEtiquetas = lazy(() => import('./pages/config/ConfigEtiquetas'));

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
const ConfigTerminais = lazy(() => import('./pages/config/ConfigTerminais'));
const ConfigPermissoes = lazy(() => import('./pages/config/ConfigPermissoes'));
const ConfigCron = lazy(() => import('./pages/config/ConfigCron'));
const DispositivosPage = lazy(() => import('./pages/config/DispositivosPage'));
// const Financeiro = lazy(() => import('./pages/Financeiro'));

const AppContent = () => {
  const { user, loading } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  
  // Ativar Alertas Proativos de Sistema
  useSystemAlerts();

  React.useEffect(() => {
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

      // FIX I-12: handlers nomeados para permitir cleanup correto (evita memory leak)
      const handleOffline = () => {
        enqueueSnackbar(`Sem conexão! Modo Offline ativado. Check-ins salvos localmente.`, { variant: 'warning' });
      };
      const handleOfflineSyncCompleted = () => {
        window.dispatchEvent(new CustomEvent('refresh-global-data'));
        enqueueSnackbar(`Dashboard atualizado com dados sincronizados.`, { variant: 'success' });
      };

      window.addEventListener('offline', handleOffline);
      window.addEventListener('offline-sync-completed', handleOfflineSyncCompleted);

      // Cleanup: remove listeners ao desmontar ou quando user/loading mudar
      return () => {
        window.removeEventListener('offline', handleOffline);
        window.removeEventListener('offline-sync-completed', handleOfflineSyncCompleted);
      };
    }
  }, [user, loading, enqueueSnackbar]);

  // Regra 22: Durante a validação, apenas o LoadingOverlay
  if (loading) {
    return <LoadingOverlay />;
  }

  // Regra 21: A jaula de exclusão isolada de rotas
  if (!user) {
    return (
      <Suspense fallback={<LoadingOverlay />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/portal" element={<PortalCadastro />} />
          <Route path="*" element={<Navigate to="/login" />} />
        </Routes>
      </Suspense>
    );
  }

  return (
    <MainLayout>
      <Suspense fallback={<LoadingOverlay />}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/eventos" element={<Eventos />} />
          <Route path="/empresas" element={<ProtectedRoute modulo="empresas"><Empresas /></ProtectedRoute>} />
          <Route path="/pessoas" element={<ProtectedRoute modulo="pessoas"><Pessoas /></ProtectedRoute>} />
          <Route path="/auditoria" element={<ProtectedRoute modulo="auditoria_documentos"><AuditoriaDocumental /></ProtectedRoute>} />
          <Route path="/veiculos" element={<ProtectedRoute modulo="veiculos"><Veiculos /></ProtectedRoute>} />
          <Route path="/reports" element={<ProtectedRoute modulo="relatorios"><Reports /></ProtectedRoute>} />
          <Route path="/checkin" element={<ProtectedRoute modulo="checkin"><Checkin /></ProtectedRoute>} />
          <Route path="/checkout" element={<ProtectedRoute modulo="checkin"><Checkout /></ProtectedRoute>} />
          <Route path="/monitor" element={<ProtectedRoute modulo="monitoramento"><Monitor /></ProtectedRoute>} />
          <Route path="/usuarios" element={<ProtectedRoute role="admin_master"><Usuarios /></ProtectedRoute>} />
          <Route path="/audit-logs" element={<ProtectedRoute role="admin_master"><AuditLogs /></ProtectedRoute>} />
          <Route path="/configuracoes" element={<ProtectedRoute role="admin_master"><Configuracoes /></ProtectedRoute>} />
          <Route path="/config/idiomas" element={<ProtectedRoute role="admin_master"><ConfigIdiomas /></ProtectedRoute>} />
          <Route path="/config/notificacoes" element={<ProtectedRoute role="admin_master"><ConfigNotificacoes /></ProtectedRoute>} />
          <Route path="/config/integracoes" element={<ProtectedRoute role="admin_master"><ConfigIntegracoes /></ProtectedRoute>} />
          <Route path="/config/etiquetas" element={<ProtectedRoute role="admin_master"><ConfigEtiquetas /></ProtectedRoute>} />
          <Route path="/config/dispositivos" element={<ProtectedRoute role="admin_master"><DispositivosPage /></ProtectedRoute>} />
          <Route path="/config/cameras" element={<ProtectedRoute role="admin_master"><ConfigCameras /></ProtectedRoute>} />
          <Route path="/config/banco-dados" element={<ProtectedRoute role="admin_master"><ConfigBancoDados /></ProtectedRoute>} />
          <Route path="/config/credenciamento" element={<ProtectedRoute role="admin_master"><ConfigCredenciamento /></ProtectedRoute>} />
          <Route path="/config/areas" element={<ProtectedRoute role="admin_master"><ConfigAreas /></ProtectedRoute>} />
          <Route path="/config/pulseiras" element={<ProtectedRoute role="admin_master"><ConfigPulseiras /></ProtectedRoute>} />
          <Route path="/config/terminais" element={<ProtectedRoute role="admin_master"><ConfigTerminais /></ProtectedRoute>} />
          <Route path="/config/checkin" element={<ProtectedRoute role="admin_master"><ConfigCheckin /></ProtectedRoute>} />
          <Route path="/config/veiculos" element={<ProtectedRoute role="admin_master"><ConfigVeiculos /></ProtectedRoute>} />
          <Route path="/config/seguranca" element={<ProtectedRoute role="admin_master"><ConfigSeguranca /></ProtectedRoute>} />
          <Route path="/config/logs" element={<ProtectedRoute role="admin_master"><ConfigLogs /></ProtectedRoute>} />
          <Route path="/config/comunicacao" element={<ProtectedRoute role="admin_master"><ConfigComunicacao /></ProtectedRoute>} />
          <Route path="/config/webhooks" element={<ProtectedRoute role="admin_master"><ConfigWebhooks /></ProtectedRoute>} />
          <Route path="/config/gamificacao" element={<ProtectedRoute role="admin_master"><ConfigGamificacao /></ProtectedRoute>} />
          <Route path="/config/permissoes" element={<ProtectedRoute role="admin_master"><ConfigPermissoes /></ProtectedRoute>} />
          <Route path="/config/cron" element={<ProtectedRoute role="admin_master"><ConfigCron /></ProtectedRoute>} />
          {/* <Route path="/financeiro" element={<Financeiro />} /> */}
          <Route path="/portal" element={<PortalCadastro />} />
          <Route path="/login" element={<Navigate to="/" />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Suspense>
    </MainLayout>
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