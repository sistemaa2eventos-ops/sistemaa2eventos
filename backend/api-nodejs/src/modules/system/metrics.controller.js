const { getConnection } = require('../../config/database');
const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');

const OFFLINE = { latency: 0, status: 'offline', service: 'Desconectado', nodeVersion: '-', syncProgress: 0 };

// Adicionado ao configController.js
async function getDbMetrics(req, res) {
    try {
        const start = Date.now();

        // SQL Server legado só se estiver configurado; senão mede o banco em uso (Supabase)
        if (process.env.SQL_SERVER_HOST) {
            const conn = await getConnection();
            await conn.request().query('SELECT 1 as result');
        } else {
            const { error } = await supabase.from('eventos').select('id', { head: true, count: 'exact' }).limit(1);
            if (error) throw error;
        }

        res.json({
            success: true,
            data: {
                latency: Date.now() - start,
                status: 'online',
                service: process.env.SQL_SERVER_HOST ? 'SQL Server (Mestre)' : 'Supabase (PostgreSQL)',
                nodeVersion: process.version,
                syncProgress: 100 // Ponto de partida
            }
        });
    } catch (error) {
        logger.error('Erro getDbMetrics:', error);
        res.json({ success: false, data: OFFLINE });
    }
}

module.exports = { getDbMetrics };
