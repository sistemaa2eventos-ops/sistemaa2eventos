const { createClientForUser } = require('../config/supabase');
const logger = require('../services/logger');

/**
 * FIX 4.7: Middleware que injeta um cliente Supabase escopado ao token JWT do usuário.
 *
 * Por que existe:
 * - O cliente `supabase` padrão usa service_role (bypass de RLS).
 * - Para operações que devem respeitar o isolamento por evento (RLS multi-tenant),
 *   usamos um cliente criado com o token do usuário (anon key + Bearer token).
 * - Isso garante que o PostgreSQL aplique as políticas RLS corretamente.
 *
 * Uso nos controllers:
 *   const supabaseClient = req.supabase || supabase; // já existente em todos os controllers
 *
 * O middleware popula req.supabase automaticamente quando há um token válido.
 * Controllers não precisam de alteração.
 */
const injectSupabaseClient = (req, res, next) => {
    // Se authenticate já rodou, req.user existe com o token
    const token = req.headers.authorization?.replace('Bearer ', '')
        || req.headers['x-access-token'];

    if (token) {
        req.supabase = createClientForUser(token);
        logger.info({
            userId: req.user?.id,
            path: req.path
        }, '[Supabase] Cliente com escopo de usuário injetado');
    }
    // Se não há token, req.supabase fica undefined e os controllers
    // fazem fallback para o supabase de service_role (rotas públicas de terminal)

    next();
};

module.exports = { injectSupabaseClient };
