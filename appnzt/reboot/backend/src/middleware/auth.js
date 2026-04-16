const { supabaseAdmin } = require('../config/supabase');
const logger = require('../services/logger');

async function authenticate(req, res, next) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Token não fornecido' });

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) {
      logger.warn('Autenticação falhou: ' + (error?.message || 'sem user'));
      return res.status(401).json({ error: 'Token inválido' });
    }

    req.user = data.user;
    next();
  } catch (err) {
    logger.error('Auth middleware error', err);
    res.status(500).json({ error: 'Erro interno de autenticação' });
  }
}

module.exports = { authenticate };
