const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const required = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NODE_ENV',
  'FRONTEND_URL',
  'JWT_SECRET',
  'PORT'
  // Omitimos algumas integrações opcionais para não congelar o boot (Stripe, Asaas, SMPT),
  // mas as chaves estruturais base estão todas rastreadas.
];

const missing = required.filter(k => !process.env[k]);

if (missing.length > 0) {
  console.error('\n[check_env] VARIÁVEIS AUSENTES NO AMBIENTE:');
  missing.forEach(k => console.error(`  - ${k}`));
  console.error('\nDeploy abortado. Configure o .env na VPS antes de continuar.\n');
  process.exit(1);
}

console.log('[check_env] Todas as varáveis de ambiente estruturais presentes.');
