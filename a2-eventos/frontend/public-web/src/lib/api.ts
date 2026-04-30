import axios from 'axios';

// Em produção, usar path relativo /api para evitar CORS (nginx proxy).
// Em dev, usar a URL absoluta configurada via env.
const isServer = typeof window === 'undefined';
const baseURL = isServer
    ? (process.env.NEXT_PUBLIC_API_URL || 'https://api.nzt.app.br') + '/api'
    : '/api';

const api = axios.create({
    baseURL,
    headers: {
        'Content-Type': 'application/json',
    },
});

export default api;
