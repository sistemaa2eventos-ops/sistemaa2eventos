const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const router = express.Router();
const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');
const authController = require('./auth.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const { validateLogin, validateRegister } = require('../../middleware/validator');
const rateLimiter = require('../../middleware/rateLimiter');
const authCache = require('../../services/authCache');

// Alterações de usuário (papel, status, evento ativo, e-mail, logout...) limpam o cache de
// validação de token na hora, para valerem já na próxima requisição.
const ROTAS_SEM_INVALIDACAO = ['/login', '/register', '/forgot-password', '/definir-senha', '/refresh', '/quiosque/desbloquear'];
router.use((req, res, next) => {
    if (req.method === 'GET' || ROTAS_SEM_INVALIDACAO.includes(req.path)) return next();
    res.on('finish', () => {
        if (res.statusCode >= 400) return;
        if (req.path.startsWith('/permissions')) return authCache.invalidarTodos();
        authCache.invalidarUsuario(req.params?.userId || req.path.match(/^\/users\/([^/]+)/)?.[1]);
        authCache.invalidarUsuario(req.user?.id);
    });
    next();
});

// ============================================
// ROTAS PÚBLICAS
// ============================================
router.post('/login', rateLimiter.auth, validateLogin, authController.login);
router.post('/forgot-password', rateLimiter.auth, (req, res) => authController.forgotPassword(req, res));
router.post('/definir-senha', rateLimiter.auth, authController.definirSenha); // link do e-mail (convite / esqueci a senha)

// Sair do modo quiosque: confere a senha de um administrador ou supervisor. Não cria sessão
// (cliente sem persistência), não altera nada e não devolve token.
router.post('/quiosque/desbloquear', rateLimiter.auth, async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const senha = String(req.body?.senha || '');
    if (!email || !senha) {
        return res.status(400).json({ error: 'Informe o e-mail e a senha de um administrador ou supervisor.' });
    }
    try {
        const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
            auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
        });
        const { data, error } = await anon.auth.signInWithPassword({ email, password: senha });
        if (error || !data?.user) {
            return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
        }
        const { data: perfil } = await supabase.from('perfis')
            .select('nivel_acesso, status').eq('id', data.user.id).maybeSingle();
        if (!perfil || !['admin_master', 'admin', 'supervisor'].includes(perfil.nivel_acesso) || perfil.status === 'inativo') {
            return res.status(403).json({ error: 'Esta conta não pode liberar o quiosque.' });
        }
        logger.info(`🔓 Quiosque liberado por ${email} (${perfil.nivel_acesso})`);
        return res.json({ success: true, liberado_por: email });
    } catch (err) {
        logger.error(`[Quiosque] desbloqueio: ${err.message}`);
        return res.status(500).json({ error: 'Não foi possível verificar agora. Tente de novo.' });
    }
});
router.post('/refresh', rateLimiter.public, (req, res) => authController.refreshSession(req, res));

// ============================================
// ROTAS DE CONVITE E CRIAÇÃO DE OPERADORES (apenas admin_master)
// ============================================
router.post('/invite', authenticate, authorize('admin_master'), authController.invite); // FIX C-06: authorize ausente
router.post('/register', authenticate, authorize('admin_master'), validateRegister, authController.register);
router.post('/users/:userId/resend-invite', authenticate, authorize('admin_master'), authController.resendInvite);

// ============================================
// ROTAS PROTEGIDAS
// ============================================
router.post('/logout', authenticate, authController.logout);
router.get('/profile', authenticate, authController.getProfile);
router.put('/profile', authenticate, authController.updateProfile);
router.post('/avatar', authenticate, authController.updateAvatar);
router.get('/me', authenticate, authController.getProfile);
router.post('/profile/change-password', authenticate, authController.changeOwnPassword);
router.post('/active-event', authenticate, authController.setActiveEvent);

// Permissões de menu granulares
router.get('/permissions', authenticate, authorize('admin'), authController.listPermissions);
router.get('/permissions/:role', authenticate, authorize('admin'), authController.getPermissions);
router.put('/permissions/:role', authenticate, authorize('admin'), authController.savePermissions);
router.post('/permissions/:role/aplicar', authenticate, authorize('admin'), authController.applyPermissions);

// ============================================
// GESTÃO DE USUÁRIOS
// ============================================
// Listar usuários (admin_master vê todos, operador vê do seu evento)
router.get('/users', authenticate, authController.listUsers);

// Aprovar usuário (apenas admin_master) — FIX C-06
router.post('/users/:userId/approve', authenticate, authorize('admin_master'), authController.approveUser);

// Atualizar permissões (apenas admin_master) — FIX C-06
router.put('/users/:userId/permissions', authenticate, authorize('admin_master'), authController.updatePermissions);

// Atualizar dados do usuário (apenas admin_master) — FIX C-06
router.put('/users/:userId', authenticate, authorize('admin_master'), authController.updateUser);

// Alterar nível de acesso e vínculo de evento
router.put('/users/:userId/role', authenticate, authorize('admin'), authController.updateUserRole);

// Ativar/Inativar usuário (apenas admin_master) — FIX C-06
router.patch('/users/:userId/status', authenticate, authorize('admin_master'), authController.updateUserStatus);

// Deletar usuário (apenas admin_master) — FIX C-06
router.delete('/users/:userId', authenticate, authorize('admin_master'), authController.deleteUser);

// Atualizar email do usuário (apenas admin_master)
router.put('/users/:userId/email', authenticate, authorize('admin_master'), authController.updateEmail);

// ============================================
// ADMIN: Reset de senha
// ============================================
router.post('/users/:userId/reset-password', authenticate, authorize('admin_master'), authController.adminResetPassword);

module.exports = router;
