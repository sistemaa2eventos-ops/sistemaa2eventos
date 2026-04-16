const express = require('express');
const router = express.Router();
const os = require('os');

router.get('/', (req, res) => {
    const cpuLoad = os.loadavg()[0];
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    
    res.json({
        status: 'healthy',
        service: 'a2-eventos-backend',
        uptime: process.uptime(),
        memory: {
            total: Math.round(totalMem / 1024 / 1024 / 1024 * 100) / 100 + ' GB',
            used: Math.round(usedMem / 1024 / 1024 / 1024 * 100) / 100 + ' GB',
            free: Math.round(freeMem / 1024 / 1024 / 1024 * 100) / 100 + ' GB',
            percent: Math.round(usedMem / totalMem * 100)
        },
        cpu: {
            load: cpuLoad.toFixed(2),
            cores: os.cpus().length
        },
        node: {
            version: process.version,
            env: process.env.NODE_ENV || 'development'
        },
        timestamp: new Date().toISOString()
    });
});

router.get('/db', async (req, res) => {
    try {
        const { supabaseAdmin } = require('../config/supabase');
        const { data, error } = await supabaseAdmin.from('events').select('id').limit(1);
        
        if (error) throw error;
        
        res.json({ status: 'connected', database: 'supabase' });
    } catch (err) {
        res.status(500).json({ status: 'error', database: 'supabase', error: err.message });
    }
});

module.exports = router;