/**
 * NZT - Intelligent Control System
 * Configuração centralizada do Backend API.
 * 
 * IMPORTANTE: No ambiente de deploy do evento, configure a variável
 * EXPO_PUBLIC_API_URL com o IP real do servidor (ex: http://192.168.1.100:3001/api).
 * Em produção cloud, o fallback usa o domínio nzt.app.br.
 */

export const BACKEND_URL = process.env.EXPO_PUBLIC_API_URL || 'https://api.nzt.app.br/api';
