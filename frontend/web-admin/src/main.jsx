import { iniciarAtualizacaoAutomatica, acompanharServiceWorker } from './utils/atualizacaoApp';

// Intercept browser extension errors to prevent console noise (harmless to application)
window.addEventListener('error', (event) => {
    const message = event.message || '';
    if (message.includes('Extension context invalidated') || message.includes('message channel closed')) {
        event.preventDefault();
        event.stopPropagation();
    }
}, true);

window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason?.message || String(event.reason || '');
    if (reason.includes('Extension context invalidated') || reason.includes('message channel closed')) {
        event.preventDefault();
        event.stopPropagation();
    }
}, true);

// Deploy novo com a aba aberta: recarrega sozinho (utils/atualizacaoApp.js)
iniciarAtualizacaoAutomatica();

// Migração de Service Worker: remove o /sw.js antigo (que ficou em cache no Cloudflare) e registra o /sw-v2.js
if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
        try {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (const reg of registrations) {
                const url = reg.active?.scriptURL || reg.installing?.scriptURL || reg.waiting?.scriptURL || '';
                if (url.endsWith('/sw.js')) {
                    await reg.unregister();
                }
            }
            const registro = await navigator.serviceWorker.register('/sw-v2.js', { updateViaCache: 'none' });
            acompanharServiceWorker(registro);
        } catch (err) {
            console.warn('SW setup warning:', err);
        }
    });
}

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { CssBaseline, ThemeProvider } from '@mui/material'
import theme from './styles/theme'
import './index.css'
import './config/i18n' // Global i18next initialization
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN_FRONTEND || "https://97ea5ad4a21e1883aa7ac725cf18e0a3@o4511978719346688.ingest.sentry.io/4511978767777792",
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],
  tracesSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <App />
        </ThemeProvider>
    </React.StrictMode>,
)
