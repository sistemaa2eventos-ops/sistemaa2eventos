const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { supabaseAdmin } = require('../../config/supabase');
const logger = require('../../services/logger');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    next();
};

const generateToken = (user) => {
    const secret = process.env.JWT_SECRET || 'a2-eventos-secret-change-me';
    return jwt.sign(
        { id: user.id, email: user.email, role: user.role, evento_id: user.evento_id },
        secret,
        { expiresIn: '7d' }
    );
};

function requireAuth(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
        return res.status(401).json({ error: 'Token não fornecido' });
    }

    const secret = process.env.JWT_SECRET || 'a2-eventos-secret-change-me';
    try {
        const decoded = jwt.verify(token, secret);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Token inválido' });
    }
}

router.post('/login',
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
    validate,
    async (req, res) => {
        try {
            const { email, password } = req.body;

            const { data: user, error } = await supabaseAdmin
                .from('users')
                .select('*')
                .eq('email', email)
                .eq('active', true)
                .single();

            if (error || !user) {
                return res.status(401).json({ error: 'Credenciais inválidas' });
            }

            const validPassword = user.password_hash 
                ? await bcrypt.compare(password, user.password_hash)
                : password === user.password_plain;

            if (!validPassword) {
                return res.status(401).json({ error: 'Credenciais inválidas' });
            }

            const token = generateToken(user);

            logger.info(`Login bem-sucedido: ${email} (${user.role})`);

            res.json({
                success: true,
                token,
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    role: user.role,
                    evento_id: user.evento_id,
                    permissions: user.permissions
                }
            });
        } catch (err) {
            logger.error('Erro no login:', err);
            res.status(500).json({ error: 'Erro interno' });
        }
    }
);

router.post('/register',
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('name').notEmpty().trim(),
    validate,
    async (req, res) => {
        try {
            const { email, password, name, invite_token } = req.body;

            if (invite_token) {
                const { data: invite } = await supabaseAdmin
                    .from('user_invites')
                    .select('*')
                    .eq('invite_token', invite_token)
                    .gt('expires_at', new Date().toISOString())
                    .eq('used', false)
                    .single();

                if (!invite) {
                    return res.status(400).json({ error: 'Convite inválido ou expirado' });
                }

                const password_hash = await bcrypt.hash(password, 10);
                const { data: user, error } = await supabaseAdmin
                    .from('users')
                    .insert([{
                        email,
                        name,
                        password_hash,
                        role: invite.role,
                        evento_id: invite.evento_id,
                        permissions: invite.permissions,
                        active: true
                    }])
                    .select()
                    .single();

                if (error) {
                    if (error.code === '23505') {
                        return res.status(400).json({ error: 'Email já cadastrado' });
                    }
                    throw error;
                }

                await supabaseAdmin
                    .from('user_invites')
                    .update({ used: true })
                    .eq('id', invite.id);

                const token = generateToken(user);
                return res.status(201).json({ success: true, token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
            }

            return res.status(400).json({ error: 'Convite necessário para cadastro' });

        } catch (err) {
            logger.error('Erro no register:', err);
            res.status(500).json({ error: 'Erro interno' });
        }
    }
);

router.post('/forgot-password',
    body('email').isEmail().normalizeEmail(),
    validate,
    async (req, res) => {
        try {
            const { email } = req.body;
            
            const { data: user } = await supabaseAdmin
                .from('users')
                .select('id')
                .eq('email', email)
                .single();

            if (!user) {
                return res.json({ success: true, message: 'Se o email existir, enviaremos instruções' });
            }

            logger.info(`Forgot password solicitado para: ${email}`);
            
            res.json({ success: true, message: 'Se o email existir, enviaremos instruções' });
        } catch (err) {
            logger.error('Erro no forgot-password:', err);
            res.status(500).json({ error: 'Erro interno' });
        }
    }
);

router.post('/change-password',
    requireAuth,
    body('current_password').notEmpty(),
    body('new_password').isLength({ min: 6 }),
    validate,
    async (req, res) => {
        try {
            const { current_password, new_password } = req.body;
            const userId = req.user.id;

            const { data: user } = await supabaseAdmin
                .from('users')
                .select('password_hash')
                .eq('id', userId)
                .single();

            if (!user) {
                return res.status(404).json({ error: 'Usuário não encontrado' });
            }

            if (user.password_hash) {
                const valid = await bcrypt.compare(current_password, user.password_hash);
                if (!valid) {
                    return res.status(400).json({ error: 'Senha atual incorreta' });
                }
            } else {
                return res.status(400).json({ error: 'Conta não tem senha definida' });
            }

            const new_hash = await bcrypt.hash(new_password, 10);
            await supabaseAdmin
                .from('users')
                .update({ password_hash: new_hash })
                .eq('id', userId);

            res.json({ success: true, message: 'Senha alterada com sucesso' });
        } catch (err) {
            logger.error('Erro ao alterar senha:', err);
            res.status(500).json({ error: 'Erro interno' });
        }
    }
);

router.get('/me', requireAuth, async (req, res) => {
    try {
        const { data: user } = await supabaseAdmin
            .from('users')
            .select('*')
            .eq('id', req.user.id)
            .single();

        if (!user) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }

        res.json({ success: true, user });
    } catch (err) {
        logger.error('Erro ao buscar perfil:', err);
        res.status(500).json({ error: 'Erro interno' });
    }
});

module.exports = { router, requireAuth };