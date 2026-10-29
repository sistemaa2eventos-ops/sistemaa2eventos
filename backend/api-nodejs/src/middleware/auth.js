const { supabase, createClientForUser } = require('../config/supabase');
const logger = require('../services/logger');
const User = require('../models/User');
const policyEngine = require('../modules/checkin/policy.service');
const authCache = require('../services/authCache');

/**
 * Normalização de papéis: master/admin são aliases de admin_master
 */
const ROLE_ALIASES = {
    'master': 'admin_master',
    'admin': 'admin',
    'supervisor': 'supervisor',
    'operador': 'operador'
};

const normalize = (role) => (role && ROLE_ALIASES[role]) || role;

/**
 * Utilitário para extração de Role normalizada
 */
const extractRole = (user) => {
    if (!user) return 'operador';
    return normalize(user.nivel_acesso || user.role);
};

/**
 * Middleware de autenticação
 * Verifica token JWT do Supabase e carrega o modelo de usuário
 */
async function authenticate(req, res, next) {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;

        if (!token) {
            return res.status(401).json({ error: 'Token não fornecido' });
        }

        let user = null;
        let authError = null;
        let role = null;
        let statusPerfil = null;

        // Validação recente deste mesmo token (60 s): evita 2 idas ao Supabase por requisição
        const emCache = authCache.obter(token);
        let dbPerfil = null;
        if (emCache) {
            user = { ...emCache.user, app_metadata: { ...emCache.user.app_metadata } };
            role = emCache.role;
            statusPerfil = emCache.statusPerfil;
            dbPerfil = emCache.perfil || null;
        }

        // --- HIGH PERFORMANCE IAM DECODING ---
        // Local JWT Verification elimina N+1 chamadas de rede ao Supabase.
        if (!user && process.env.SUPABASE_JWT_SECRET) {
            try {
                const jwt = require('jsonwebtoken');
                const decoded = jwt.verify(token, process.env.SUPABASE_JWT_SECRET);
                user = {
                    id: decoded.sub,
                    email: decoded.email,
                    user_metadata: decoded.user_metadata,
                    app_metadata: decoded.app_metadata
                };
            } catch (err) {
                // Assinatura local não confere (ex: chaves ECC/P-256 do Supabase).
                // Não rejeita aqui: valida via SDK oficial antes de devolver 401.
                user = null;
                authError = err;
            }
        }

        if (!user) {
            const { data, error } = await supabase.auth.getUser(token);
            user = data?.user;
            authError = error;
        }

        if (authError || !user) {
            const reason = authError?.message || 'Token inválido';

            // Falha de rede não deve derrubar a sessão do usuário
            if (reason.includes('fetch failed') || reason.includes('SocketError') || reason.includes('socket hang up') || reason.includes('timeout')) {
                logger.error(`⚠️ Falha de comunicação com o Auth Provider: ${reason}`);
                return res.status(502).json({
                    error: 'Instabilidade momentânea de rede na validação. Tente novamente.',
                    code: 'AUTH_NETWORK_ERROR',
                    detail: reason
                });
            }

            logger.warn(`⚠️ 401 UNAUTHORIZED: ${reason}`);
            return res.status(401).json({
                error: 'Token inválido',
                code: 'AUTH_FAILED',
                detail: reason
            });
        }

        if (!role) {
            // Fonte única da verdade: perfis (papel, status, evento e PERMISSÕES dos módulos).
            // Contas órfãs em auth.users sem registro em perfis não têm acesso à API.
            const { data } = await supabase
                .from('perfis')
                .select('nivel_acesso, evento_id, status, permissions')
                .eq('id', user.id)
                .maybeSingle();
            dbPerfil = data || null;

            role = dbPerfil?.nivel_acesso || 'operador';
            statusPerfil = dbPerfil?.status || null;

            authCache.guardar(token, { user, role, statusPerfil, perfil: dbPerfil });
        }

        // Sem perfil cadastrado no sistema (conta órfã no Auth): bloqueia o acesso
        if (!dbPerfil) {
            return res.status(403).json({
                error: 'Conta sem perfil ativo no sistema. Entre em contato com o administrador.',
                code: 'USER_NO_PROFILE'
            });
        }

        // Usuário inativado ou pendente não usa o sistema nem com sessão já aberta
        if (statusPerfil === 'inativo') {
            return res.status(403).json({ error: 'Usuário inativo. Entre em contato com o administrador.', code: 'USER_INACTIVE' });
        }
        if (statusPerfil === 'pendente') {
            return res.status(403).json({ error: 'Aguarde aprovação do administrador para acessar o sistema.', code: 'USER_PENDING' });
        }

        user.app_metadata = { ...user.app_metadata, nivel_acesso: role };

        // Mock profile com claims seguras para evitar latência
        const profileProxy = {
            nivel_acesso: role,
            nome_completo: user.user_metadata?.nome_completo || user.email,
            // Evento do perfil (atualizado ao trocar de evento) antes do gravado no cadastro da conta.
            // Sanitiza "undefined"/"null" vindos do frontend (bug de conversão de UUID)
            evento_id: (() => {
                const v = dbPerfil?.evento_id || user.user_metadata?.evento_id || user.app_metadata?.evento_id;
                return (v && v !== 'undefined' && v !== 'null') ? v : null;
            })(),
            // Permissões dos módulos, vínculo e eventos permitidos vêm do perfil (Usuários → Permissões)
            ...(dbPerfil?.permissions ? { permissions: dbPerfil.permissions } : {}),
            ativo: user.app_metadata?.ativo !== false // Trust by default unless banned via Supabase
        };

        // Criar instância do modelo User (RBAC)
        req.user = User.fromSupabase(user, profileProxy);

        if (!req.user.ativo) {
            return res.status(403).json({ error: 'Usuário desativado' });
        }

        // --- RLS ENFORCEMENT --- (injectSupabaseClient normalmente já criou o cliente)
        req.supabase = req.supabase || createClientForUser(token);

        next();
    } catch (error) {
        logger.error('Erro na autenticação:', error);
        return res.status(500).json({ error: 'Erro na autenticação' });
    }
}

/**
 * Middleware de autorização por papel (Role)
 */
function authorize(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Não autenticado' });
        }

        // Se não passar roles, apenas autenticado é suficiente
        if (roles.length === 0) return next();

        // Normalização: se o dev passou um Array em vez de múltiplos argumentos
        const allowedRoles = Array.isArray(roles[0]) ? roles[0] : roles;
        const allowed = allowedRoles.map(normalize);
        const userRole = extractRole(req.user);

        // Master/Admin/Admin Master sempre têm acesso total
        if (userRole === 'admin_master' || userRole === 'admin' || allowed.includes(userRole)) {
            return next();
        }

        logger.warn(`Acesso negado: Usuário ${req.user.id} com role ${req.user.role} tentou acessar rota restrita`);
        return res.status(403).json({
            error: 'Acesso negado',
            required: allowedRoles,
            current: req.user.role
        });
    };
}

/**
 * Middleware para API Key interna (microsserviços)
 */
function validateInternalApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'];

    if (apiKey !== process.env.INTERNAL_API_KEY) {
        logger.warn(`Tentativa de acesso interno com chave inválida`);
        return res.status(401).json({ error: 'API key inválida' });
    }

    next();
}

/**
 * Middleware para validar API Key via header X-API-Key ou Authorization Bearer
 * Usado por webhooks que não requerem autenticação de usuário
 */
function validateApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');

    if (!apiKey) {
        logger.warn(`🚫 Webhook sem API key: ${req.path}`);
        return res.status(401).json({
            error: 'API Key obrigatória',
            code: 'MISSING_API_KEY'
        });
    }

    const expectedKey = process.env.A2_API_KEY || process.env.INTERNAL_API_KEY || process.env.API_KEY;

    if (!expectedKey || apiKey !== expectedKey) {
        logger.warn(`🚫 API Key inválida para: ${req.path}`);
        return res.status(403).json({
            error: 'API Key inválida',
            code: 'INVALID_API_KEY'
        });
    }

    next();
}

/**
 * Middleware de autorização dinâmico (RBAC Engine)
 * Verifica na base de policies se o Perfil detém a permissão para aquele Recurso e Ação
 * + isolamento de Tenant (evento_id imutável vindo do JWT)
 */
// Ações que continuam só de administrador mesmo com o módulo liberado ao operador
// (monitor/escrita = cadastrar/apagar câmeras e reset diário do evento)
const ACOES_SO_ADMIN = { monitor: ['escrita'] };

function checkPermission(recurso, acao) {
    return async (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Não autenticado' });
        }

        const userRole = extractRole(req.user);

        // --- 🦅 SOBERANIA MASTER / ADMIN (Super Admin SaaS) ---
        if (userRole === 'admin_master' || userRole === 'admin') {
            const _s = (v) => (v && v !== 'undefined' && v !== 'null') ? v : null;
            req.tenantId = _s(req.headers['x-evento-id']) ||
                _s(req.query.evento_id) ||
                (recurso === 'eventos' ? req.params.id : null) ||
                _s(req.body?.evento_id);
            return next();
        }

        const _safe = (v) => (v && v !== 'undefined' && v !== 'null') ? v : null;
        const requestedEventId = _safe(req.headers['x-evento-id']) || _safe(req.query.evento_id) || _safe(req.body?.evento_id);
        const tenantId = requestedEventId || _safe(req.user.evento_id) || _safe(req.tenantId);

        if (!tenantId) {
            logger.warn(`⚠️ Sessão sem Evento vinculado: ${req.user.id}`);
            return res.status(400).json({ error: 'Sua sessão não possui um ID de Evento vinculado. Refaça o login.' });
        }

        // Se for operador, validar se o evento requisitado é permitido para este operador!
        if (req.user && typeof req.user.isAllowedEvent === 'function' && !req.user.isAllowedEvent(tenantId)) {
            logger.warn(`🚨 EVENTO NÃO AUTORIZADO: Operador ${req.user.id} tentou acessar evento ${tenantId}`);
            return res.status(403).json({ error: 'Acesso negado: Você não possui autorização para operar este evento.' });
        }

        req.tenantId = tenantId;

        // Verificar permissão efetiva do operador para este módulo no evento
        const moduloMap = {
            'dashboard': 'dashboard',
            'empresas': 'empresas',
            'pessoas': 'pessoas',
            'documentos': 'auditoria_documentos',
            'auditoria': 'auditoria_documentos',
            'relatorios': 'relatorios',
            'checkin': 'checkin',
            'checkout': 'checkout',
            'fiscalizacao': 'fiscalizacao',
            'monitor': 'monitoramento',
            'veiculos': 'veiculos'
        };
        const moduloPerm = moduloMap[recurso] || recurso;

        if (req.user && typeof req.user.getEffectivePermissions === 'function') {
            const effectivePerms = req.user.getEffectivePermissions(tenantId);
            if (effectivePerms && effectivePerms[moduloPerm] === false) {
                logger.warn(`Acesso bloqueado: Operador '${req.user.id}' não possui permissão '${moduloPerm}' no evento '${tenantId}'`);
                return res.status(403).json({
                    error: `Acesso negado: Sem permissão para acessar ${recurso} neste evento.`,
                    required_policy: { recurso, acao }
                });
            }
            // A permissão do operador (ligada pelo admin em Usuários) é a regra para os módulos dele.
            // Antes ela era seguida da tabela de papéis (sys_*), que usa outro vocabulário (view/visualizar
            // contra leitura/escrita) e estava vazia por evento: todo operador era barrado em câmeras,
            // relatórios, documentos e veículos, mesmo com o módulo liberado.
            const soAdmin = ACOES_SO_ADMIN[recurso]?.includes(acao);
            if (effectivePerms && effectivePerms[moduloPerm] === true && !soAdmin) {
                return next();
            }
        }

        const hasPerm = await policyEngine.hasPermission(userRole, recurso, acao, tenantId);

        if (hasPerm) {
            return next();
        }

        logger.warn(`Acesso bloqueado pelo PolicyEngine: Role '${userRole}' não possui '{${recurso}, ${acao}}'`);
        return res.status(403).json({
            error: 'Acesso negado: Perfil sem permissão para realizar esta ação.',
            required_policy: { recurso, acao }
        });
    };
}

/**
 * Restringe a rota ao Admin Master (watchlist é sigilosa, inclusive para admin comum).
 */
function requireAdminMaster(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado' });
    if (extractRole(req.user) !== 'admin_master') {
        logger.warn(`Acesso negado à área sigilosa: usuário ${req.user.id} (${req.user.nivel_acesso || req.user.role})`);
        return res.status(403).json({ error: 'Acesso restrito ao Admin Master' });
    }
    return next();
}

module.exports = {
    requireAdminMaster,
    authenticate,
    authorize,
    validateInternalApiKey,
    validateApiKey,
    checkPermission,
    normalize,
    extractRole
};
