const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

dotenv.config();

const requiredVars = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'JWT_SECRET'
];

const missing = requiredVars.filter(v => !process.env[v]);

if (missing.length > 0) {
    console.error(`❌ Variáveis de ambiente faltando: ${missing.join(', ')}`);
    console.error('Copie .env.example para .env e preencha as variáveis.');
    process.exit(1);
}

console.log('✅ Todas as variáveis de ambiente estão presentes.');
console.log(`📌 Supabase URL: ${process.env.SUPABASE_URL}`);
console.log(`📌 JWT Secret: ${process.env.JWT_SECRET ? '✓ configurado' : '✗ não configurado'}`);