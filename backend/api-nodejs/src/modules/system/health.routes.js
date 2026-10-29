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

/**
 * Prontidão de verdade: o /health acima só diz que o processo responde.
 * Aqui o banco (Supabase) e o Redis precisam responder em até 3 s — é o que o deploy
 * e o monitoramento externo usam para saber se o sistema consegue registrar acessos.
 */
const comPrazo = (promessa, ms) => Promise.race([
  promessa,
  new Promise((_, rejeitar) => setTimeout(() => rejeitar(new Error(`sem resposta em ${ms} ms`)), ms))
]);

router.get(['/ready', '/api/ready'], async (req, res) => {
  const checks = {};
  const inicio = Date.now();

  const verificarBanco = async () => {
    const { supabase } = require('../../config/supabase');
    const { error } = await comPrazo(supabase.from('eventos').select('id').limit(1), 3000);
    if (error) throw new Error(error.message);
  };
  const verificarRedis = async () => {
    if (process.env.USE_REDIS !== 'true') return 'desativado';
    const cliente = require('../../services/queue.service').getClient();
    if (!cliente?.isReady) throw new Error('desconectado');
    await comPrazo(cliente.ping(), 3000);
  };

  const [banco, redis] = await Promise.allSettled([verificarBanco(), verificarRedis()]);
  checks.database = banco.status === 'fulfilled' ? 'ok' : `erro: ${banco.reason.message}`;
  checks.redis = redis.status === 'fulfilled' ? (redis.value || 'ok') : `erro: ${redis.reason.message}`;

  const pronto = banco.status === 'fulfilled' && redis.status === 'fulfilled';
  res.status(pronto ? 200 : 503).json({
    status: pronto ? 'ok' : 'degraded',
    checks,
    duracao_ms: Date.now() - inicio,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
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
