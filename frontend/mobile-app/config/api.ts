/**
 * NZT - Intelligent Control System
 * Configuração centralizada do Backend API.
 * 
 * IMPORTANTE: No ambiente de deploy do evento, configure a variável
 * EXPO_PUBLIC_API_URL com o IP real do servidor (ex: http://192.168.1.100:3001/api).
 * O fallback 'localhost' funciona apenas para desenvolvimento local.
 */

export const BACKEND_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001/api';
