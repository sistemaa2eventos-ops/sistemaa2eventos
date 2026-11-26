import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Portal da empresa (empresa.nzt.app.br). Em desenvolvimento, /api vai para a API local.
export default defineConfig({
    plugins: [react()],
    server: {
        port: 5175,
        proxy: { '/api': 'http://localhost:3001' }
    }
});
