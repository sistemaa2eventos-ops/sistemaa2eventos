const { getPgConnection } = require('../../config/pgEdge');
const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');

// Adicionado ao configController.js
async function getDbMetrics(req, res) {
    try {
        const pool = await getPgConnection();

        // Medir latência
        const start = Date.now();
        await pool.query('SELECT 1');
        const latency = Date.now() - start;

        // Versão do Node
        const nodeVer = process.version;

        res.json({
            success: true,
            data: {
                latency,
                status: 'online',
                service: 'Supabase Nexus (Cloud)',
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
