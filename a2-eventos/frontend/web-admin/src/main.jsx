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

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { CssBaseline, ThemeProvider } from '@mui/material'
import theme from './styles/theme'
import './index.css'
import './config/i18n' // Global i18next initialization

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <App />
        </ThemeProvider>
    </React.StrictMode>,
)
