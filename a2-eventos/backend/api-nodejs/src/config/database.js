const sql = require('mssql');
require('dotenv').config();

// Formatar nome do servidor para driver mssql
function formatServerName(server) {
    if (!server) {
        console.warn('⚠️ SQL_SERVER_HOST não definido no .env. Ignorando conexão MSSQL legado.');
        return null;
    }
    if (server.includes('\\\\')) return server;
    return server.replace(/\\/g, '\\\\');
}

// Configuração do SQL Server (todas as credenciais vêm do .env)
const host = process.env.SQL_SERVER_HOST;
const sqlConfig = host ? {
    server: formatServerName(host),
    database: process.env.SQL_SERVER_DATABASE || 'A2Eventos',
    user: process.env.SQL_SERVER_USER,
    password: process.env.SQL_SERVER_PASSWORD,
    options: {
        encrypt: false,  // IMPORTANTE: false para rede local
        trustServerCertificate: true,  // IMPORTANTE: true para self-signed
        enableArithAbort: true,
        connectTimeout: 30000,
        requestTimeout: 30000,
        appName: 'A2Eventos-API',
        useUTC: false // Força o driver a usar o fuso horário local do Node.js (TZ=America/Sao_Paulo)
    },
    pool: {
        max: 20,
        min: 5,
        idleTimeoutMillis: 30000
    }
} : null;

let pool = null;

async function getConnection() {
    // DESATIVADO: Operação Êxodo Supremo v27.5
    // console.log('🔌 Conexão SQL Server legado ignorada por design.');
    return null;
}

async function testConnection() {
    // DESATIVADO: Operação Êxodo Supremo v27.5
    return true; // Bypass para não interromper o boot
}

// Para fechar conexão no graceful shutdown
async function closeConnection() {
    // DESATIVADO: Operação Êxodo Supremo v27.5
    return Promise.resolve();
}

module.exports = {
    getConnection,
    testConnection,
    closeConnection,
    sql
};