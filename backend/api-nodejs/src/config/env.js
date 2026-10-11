/**
 * Validação de variáveis de ambiente críticas
 * Executa no startup e falha rápido se algo estiver missing
 */

const logger = require('../services/logger');

// Lista de variáveis OBRIGATÓRIAS
const REQUIRED_ENV_VARS = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'NODE_ENV'
];

// Lista de variáveis OPCIONAIS (com fallback)
const OPTIONAL_ENV_VARS = {
  'PORT': '3001',
  'JWT_SECRET': 'dev-secret-change-in-production',
  'LOG_LEVEL': 'info',
  'SENTRY_DSN': null,
  'SMTP_HOST': 'smtp.gmail.com',
  'SMTP_PORT': '587',
  'INTELBRAS_DEFAULT_USER': 'admin',
  'INTELBRAS_DEFAULT_PASS': 'admin123'
};

/**
 * Valida e retorna configuração de environment
 * @returns {Object} Configuração validada
 */
function validateEnvironment() {
  const missing = [];
  const warnings = [];

  // Validar variáveis obrigatórias
  for (const envVar of REQUIRED_ENV_VARS) {
    if (!process.env[envVar]) {
      missing.push(envVar);
    }
  }

  // Se faltar variável obrigatória, falha
  if (missing.length > 0) {
    const errorMsg = `❌ ERRO CRÍTICO: Variáveis de ambiente faltando: ${missing.join(', ')}`;
    logger.error(errorMsg);
    console.error('\n' + '='.repeat(80));
    console.error(errorMsg);
    console.error('\nConfigure as variáveis no arquivo .env:');
    missing.forEach(v => {
      console.error(`  export ${v}="seu_valor_aqui"`);
    });
    console.error('='.repeat(80) + '\n');
    process.exit(1);
  }

  // Validar URL do Supabase
  if (!process.env.SUPABASE_URL.includes('supabase.co')) {
    missing.push('SUPABASE_URL (não é uma URL Supabase válida)');
  }

  // Validar API_URL em produção
  if (process.env.NODE_ENV === 'production' && process.env.API_URL) {
    if (!process.env.API_URL.startsWith('https://')) {
      warnings.push('API_URL em produção deveria ser HTTPS');
    }
  }

  // Log de avisos
  if (warnings.length > 0) {
    warnings.forEach(w => logger.warn(`⚠️ ${w}`));
  }

  // Log de sucesso
  logger.info('✅ Validação de ambiente: OK', {
    NODE_ENV: process.env.NODE_ENV,
    SUPABASE_URL: process.env.SUPABASE_URL.substring(0, 30) + '...',
    API_URL: process.env.API_URL
  });

  return {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    NODE_ENV: process.env.NODE_ENV,
    API_URL: process.env.API_URL,
    PORT: parseInt(process.env.PORT || OPTIONAL_ENV_VARS.PORT),
    JWT_SECRET: process.env.JWT_SECRET || OPTIONAL_ENV_VARS.JWT_SECRET,
    LOG_LEVEL: process.env.LOG_LEVEL || OPTIONAL_ENV_VARS.LOG_LEVEL,
    SENTRY_DSN: process.env.SENTRY_DSN || null,
    SMTP_HOST: process.env.SMTP_HOST || OPTIONAL_ENV_VARS.SMTP_HOST,
    SMTP_PORT: parseInt(process.env.SMTP_PORT || OPTIONAL_ENV_VARS.SMTP_PORT),
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
    SMTP_EMAIL: process.env.SMTP_EMAIL,
    INTELBRAS_DEFAULT_USER: process.env.INTELBRAS_DEFAULT_USER || OPTIONAL_ENV_VARS.INTELBRAS_DEFAULT_USER,
    INTELBRAS_DEFAULT_PASS: process.env.INTELBRAS_DEFAULT_PASS || OPTIONAL_ENV_VARS.INTELBRAS_DEFAULT_PASS
  };
}

module.exports = { validateEnvironment };
