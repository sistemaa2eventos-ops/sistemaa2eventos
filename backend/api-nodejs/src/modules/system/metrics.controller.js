const { getConnection } = require('../../config/database');
const logger = require('../../services/logger');

// Adicionado ao configController.js
async function getDbMetrics(req, res) {
    try {
        const conn = await getConnection();

        // Medir latência
        const start = Date.now();
        await conn.request().query('SELECT 1 as result');
        const latency = Date.now() - start;

        // Versão do Node
        const nodeVer = process.version;

        res.json({
            success: true,
            data: {
                latency,
                status: 'online',
                service: 'SQL Server (Mestre)',
                nodeVersion: nodeVer,
                syncProgress: 100 // Ponto de partida
            }
        });
    } catch (error) {
        logger.error('Erro getDbMetrics:', error);
        res.json({
            success: false,
            data: { latency: 0, status: 'offline', service: 'Desconectado', nodeVersion: '-', syncProgress: 0 }
        });
    }
}

module.exports = { getDbMetrics };
