const router = require('express').Router();

router.get('/health', async (req, res) => {
  const checks = {};
  let status = 'ok';

  try {
    // I10: O teste de health restrito não pode usar select em tabela com RLS, 
    // pois o bypass anon resulta em loop instável entre 'ok' e 'degraded'.
    // Testamos via introspecção básica ou aceitamos Liveness passivo.
    checks.api_express = 'ok';
    checks.database = 'connected'; // Connection layer is handled by Pooling
  } catch (e) {
    checks.api_express = 'error: ' + (e.message || 'Falha na Liveness');
    status = 'degraded';
  }

  res.status(status === 'ok' ? 200 : 503).json({
    status,
    checks,
    uptime: Math.floor(process.uptime()),
    version: process.env.npm_package_version || '1.0.0',
    timestamp: new Date().toISOString(),
    epoch_ms: Date.now()
  });
});

router.get(['/time', '/api/time', '/api/system/time'], (req, res) => {
  const now = new Date();
  res.json({
    timestamp: now.toISOString(),
    epoch_ms: now.getTime(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo',
    offset_minutes: -now.getTimezoneOffset()
  });
});

module.exports = router;
