const { Pool } = require('pg');
const logger = require('../services/logger');
require('dotenv').config();

/**
 * Banco local "Edge" (PostgreSQL na borda).
 * Hoje todos os registros vão direto para o Supabase e o Edge fica vazio: ele só é usado
 * se EDGE_DB_ENABLED=true. Desligado, não há health check, alerta nem sincronização com ele.
 */
const EDGE_ATIVO = process.env.EDGE_DB_ENABLED === 'true';

let pool = null;
function obterPool() {
    if (!pool) {
        pool = new Pool({
            user: process.env.PG_EDGE_USER || 'a2_edge_user',
            host: process.env.PG_EDGE_HOST || 'localhost',
            database: process.env.PG_EDGE_DB || 'a2_edge_db',
            password: process.env.PG_EDGE_PASSWORD || 'a2_edge_password',
            port: process.env.PG_EDGE_PORT || 5432,
            max: 20, // Max clients in pool
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000,
        });
        pool.on('error', (err) => {
            logger.error('❌ ERRO CRÍTICO - PostgreSQL Edge (Background Error):', err.message);
        });
    }
    return pool;
}

function edgeAtivo() {
    return EDGE_ATIVO;
}

async function getPgConnection() {
    if (!EDGE_ATIVO) throw new Error('Banco local (Edge) desativado (EDGE_DB_ENABLED != true).');
    return obterPool();
}

/**
 * @returns {Promise<boolean|null>} true/false = online/offline; null = Edge desativado
 */
async function testPgConnection() {
    if (!EDGE_ATIVO) return null;
    try {
        const result = await obterPool().query('SELECT version()');
        logger.debug(`✅ PostgreSQL Edge respondendo: ${result.rows[0].version.substring(0, 30)}...`);
        return true;
    } catch (error) {
        logger.error('❌ PostgreSQL Edge OFFLINE:', error.message);
        return false;
    }
}

async function closePgConnection() {
    if (!pool) return;
    logger.info('🔒 Conexão PostgreSQL Edge fechada');
    await pool.end();
}

module.exports = {
    edgeAtivo,
    getPgConnection,
    testPgConnection,
    closePgConnection
};
