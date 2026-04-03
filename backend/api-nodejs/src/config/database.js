const sql = require('mssql');
require('dotenv').config();

// Formatar nome do servidor para driver mssql
function formatServerName(server) {
    if (!server) throw new Error('❌ SQL_SERVER_HOST não definido no .env');
    if (server.includes('\\\\')) return server;
    return server.replace(/\\/g, '\\\\');
}

// Configuração do SQL Server (todas as credenciais vêm do .env)
const sqlConfig = {
    server: formatServerName(process.env.SQL_SERVER_HOST),
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
};

let pool = null;

async function getConnection() {
    try {
        if (!pool) {
            console.log('🔌 Conectando ao SQL Server:', sqlConfig.server);
            pool = await sql.connect(sqlConfig);
            console.log('✅ Conectado ao SQL Server com sucesso!');

            // Teste rápido
            const result = await pool.request().query('SELECT @@VERSION as version');
            console.log('📊 Versão SQL Server:', result.recordset[0].version.substring(0, 50) + '...');
        }
        return pool;
    } catch (error) {
        console.error('❌ ERRO CRÍTICO - SQL Server:', error.message);

        // Solução alternativa: tentar sem instância nomeada
        if (error.message.includes('Instance name')) {
            console.log('🔄 Tentando conexão alternativa (sem instância nomeada)...');
            const baseHost = (process.env.SQL_SERVER_HOST || '').split('\\')[0];
            sqlConfig.server = baseHost;
            sqlConfig.options.instanceName = 'SQLEXPRESS';

            try {
                pool = await sql.connect(sqlConfig);
                console.log('✅ Conectado via conexão alternativa!');
                return pool;
            } catch (altError) {
                console.error('❌ Também falhou:', altError.message);
                throw altError;
            }
        }

        throw error;
    }
}

async function testConnection() {
    try {
        const conn = await getConnection();
        const result = await conn.request().query('SELECT GETDATE() as data');
        console.log('✅ SQL Server respondendo:', result.recordset[0].data.toLocaleString('pt-BR'));
        return true;
    } catch (error) {
        console.error('❌ SQL Server OFFLINE:', error.message);
        return false;
    }
}

// Para fechar conexão no graceful shutdown
async function closeConnection() {
    if (pool) {
        await pool.close();
        pool = null;
        console.log('🔒 Conexão SQL Server fechada');
    }
}

module.exports = {
    getConnection,
    testConnection,
    closeConnection,
    sql
};