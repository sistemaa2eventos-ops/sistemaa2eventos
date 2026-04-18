const express = require('express');
const router = express.Router();
const { supabase, createClientForUser } = require('../../config/supabase');
const { authenticate, checkPermission } = require('../../middleware/auth');
const logger = require('../../services/logger');

// Todas as requisições deste portal requerem login
router.use(authenticate);

// Validação extra de segurança: Apenas a própria empresa pode acessar essas rotas
const roleGuard = (req, res, next) => {
    if (req.user.role !== 'empresa') {
        return res.status(403).json({ error: 'Acesso negado. Portal exclusivo B2B.' });
    }

    // Usa o utilitário centralizado para criar um cliente RLS-scoped
    const token = req.headers.authorization?.replace('Bearer ', '');
    req.userClient = createClientForUser(token);

    next();
};
router.use(roleGuard);

/**
 * 🏢 GET /api/portal/empresa/dashboard
 * Retorna os dados da empresa e a métrica de colaboradores
 */
router.get('/dashboard', async (req, res) => {
    try {
        const empresaId = req.user.id; // No auth login de empresa, o user.id será o empresa_id

        const { data: empresa, error } = await req.userClient
            .from('empresas')
            .select('*')
            .eq('id', empresaId)
            .single();

        if (error) throw error;

        // Contar colaboradores vinculados
        const { count, error: countErr } = await req.userClient
            .from('pessoas')
            .select('id', { count: 'exact', head: true });
        // .eq('empresa_id', empresaId) // Removido de propósito para testar RLS no banco!

        res.json({ success: true, empresa, total_colaboradores: count || 0 });
    } catch (error) {
        logger.error('Portal B2B: Erro dashboard:', error);
        res.status(500).json({ error: 'Falha ao carregar dashboard.' });
    }
});

/**
 * 📈 GET /api/portal/empresa/stats
 * Dashboard Real-Time: Cotas, Check-ins, e ECM Pendentes
 */
router.get('/stats', async (req, res) => {
    try {
        const empresaId = req.user.id;

        // 1. Info da Empresa (Cota Total)
        const { data: empresa } = await req.userClient
            .from('empresas')
            .select('quota')
            .eq('id', empresaId)
            .single();

        const cotaTotal = empresa?.quota || 0;

        // 2. Colaboradores Aprovados (Pivot)
        const { data: pivotAprovados } = await req.userClient
            .from('pessoa_evento_empresa')
            .select('pessoa_id')
            .eq('status_aprovacao', 'aprovado');

        const totalCredenciados = pivotAprovados ? pivotAprovados.length : 0;

        // 3. Documentos Pendentes / ECM
        // RLS cuidará para puxarmos apenas documentos atrelados a pessoas vinculadas a essa empresa
        const { data: docsPendentes } = await req.userClient
            .from('pessoa_documentos')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pendente');

        // 4. Pessoas com Check-in (M:N)
        const { data: listCheckins } = await req.userClient
            .from('pessoa_evento_empresa')
            .select('pessoa_id, pessoas!inner(id, nome, status_acesso)')
            .eq('status_aprovacao', 'aprovado')
            .eq('pessoas.status_acesso', 'checkin_feito');

        const presentesDesteMomento = listCheckins ? listCheckins.length : 0;

        // Últimos Check-ins (Logs Recentes)
        // Isso requer join. O RLS isola as Pessoas para esta tela
        const { data: recentLogs } = await req.userClient
            .from('logs_acesso')
            .select('*, pessoas!inner(nome, cpf)')
            .eq('tipo', 'CHECKIN')
            .order('data_hora', { ascending: false })
            .limit(5);

        res.json({
            success: true,
            stats: {
                cotaTotal,
                totalCredenciados,
                cotaUsadaPerc: cotaTotal > 0 ? ((totalCredenciados / cotaTotal) * 100).toFixed(1) : 0,
                presentesAgora: presentesDesteMomento,
                ecmPendentes: docsPendentes ? docsPendentes.count : 0
            },
            recent_activity: recentLogs || []
        });

    } catch (error) {
        logger.error('Portal B2B: Erro nos stats em tempo real:', error);
        res.status(500).json({ error: 'Falha ao processar métricas de inteligência.' });
    }
});

/**
 * 👷 GET /api/portal/empresa/colaboradores
 * Retorna APENAS os colaboradores pertencentes a esta empresa. (RLS Simulado no Node)
 */
router.get('/colaboradores', async (req, res) => {
    try {
        const empresaId = req.user.id;

        // Utilizando a nova tabela Pivot N:N para relacionamentos escaláveis de Freelancers
        // RLS no banco garante que essa consulta só traga as pessoas que pertencem à agência JWT
        const { data: pivots, error } = await req.userClient
            .from('pessoa_evento_empresa')
            .select('*, pessoas(*, pessoa_documentos(id, tipo_doc, status, titulo))')
            .order('data_vinculo', { ascending: false });

        if (error) throw error;

        // Achatamento da Payload para manter retrocompatibilidade com o frontend
        const data = pivots.map(p => ({
            ...p.pessoas,
            status_pivot: p.status_aprovacao,
            vinculo_funcao: p.cargo_funcao
        }));

        res.json({ success: true, data });
    } catch (error) {
        logger.error('Portal B2B: Erro listagem colaboradores:', error);
        res.status(500).json({ error: 'Falha ao buscar equipe.' });
    }
});

const crypto = require('crypto');
const emailService = require('../../services/emailService');

/**
 * ➕ POST /api/portal/empresa/colaboradores
 * Permite que a empresa insira um colaborador diretamente no seu contexto
 */
router.post('/colaboradores', async (req, res) => {
    try {
        const empresaId = req.user.id;
        const payload = req.body;

        // 1. Gerar Token de Registro para o Colaborador
        const token = crypto.randomUUID();
        const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 dias

        // Force security: Ignore whatever empresa_id the frontend sent and hardcode the token's ID
        payload.empresa_id = empresaId;
        payload.status_acesso = 'pendente'; 
        payload.registration_token = token;
        payload.registration_token_expires_at = expires.toISOString();

        // Utilizamos req.userClient para que as policies RLS de INSERT sejam respeitadas
        const { data, error } = await req.userClient
            .from('pessoas')
            .insert([payload])
            .select()
            .single();

        if (error) throw error;

        // 2. Registra o vínculo M:N na tabela Pivot
        const { error: pivotErr } = await req.userClient.from('pessoa_evento_empresa').insert([{
            pessoa_id: data.id,
            empresa_id: empresaId,
            evento_id: payload.evento_id || null,
            status_aprovacao: 'pendente',
            cargo_funcao: data.funcao || 'N/D'
        }]);

        if (pivotErr) logger.error('Falha ao registrar Pivot Table do Portal empresa', pivotErr);

        // 3. Obter nome da empresa para o e-mail
        const { data: empresa } = await req.userClient
            .from('empresas')
            .select('nome')
            .eq('id', empresaId)
            .single();

        // 4. Enviar e-mail de convite ao colaborador
        if (payload.email) {
            const inviteLink = `${process.env.PUBLIC_PORTAL_URL || 'http://localhost:3000'}/register/${token}`;
            emailService.sendEmployeeInvite(payload.email, data.nome, empresa?.nome || 'Empresa Parceira', inviteLink)
                .catch(e => logger.error('❌ Erro silencioso ao enviar convite ao colaborador:', e));
        }

        logger.info(`Empresa [${empresaId}] cadastrou novo colaborador: ${payload.cpf}. Token gerado: ${token}`);
        res.status(201).json({ success: true, message: 'Colaborador cadastrado e convite enviado.', data });
    } catch (error) {
        logger.error('Portal B2B: Erro insert colaborador:', error);
        res.status(500).json({ error: 'Falha ao registrar colaborador.' });
    }
});


module.exports = router;
