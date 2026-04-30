const { Pool } = require('pg');
const logger = require('../services/logger');
require('dotenv').config();

// Se não houver PG_EDGE_HOST no dotenv, fallback para o docker-compose service neme ou localhost
const pool = new Pool({
    user: process.env.PG_EDGE_USER || 'a2_edge_user',
    host: process.env.PG_EDGE_HOST || 'localhost', 
    database: process.env.PG_EDGE_DB || 'a2_edge_db',
    password: process.env.PG_EDGE_PASSWORD || 'a2_edge_password',
    port: process.env.PG_EDGE_PORT || 5432,
    max: 20, // Max clients in pool
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});

pool.on('error', (err, client) => {
    logger.error('❌ ERRO CRÍTICO - PostgreSQL Edge (Background Error):', err.message);
});

async function getPgConnection() {
    return pool;
}

async function testPgConnection() {
    try {
        const result = await pool.query('SELECT version()');
        logger.info(`✅ PostgreSQL Edge respondendo: ${result.rows[0].version.substring(0, 30)}...`);
        return true;
    } catch (error) {
        logger.error('❌ PostgreSQL Edge OFFLINE:', error.message);
        return false;
    }
}

async function closePgConnection() {
    logger.info('🔒 Conexão PostgreSQL Edge fechada');
    await pool.end();
}

module.exports = {
    getPgConnection,
    testPgConnection,
    closePgConnection
};
