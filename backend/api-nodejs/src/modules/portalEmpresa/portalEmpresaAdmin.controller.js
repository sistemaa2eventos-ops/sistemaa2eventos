'use strict';

const logger = require('../../services/logger');
const auditService = require('../../services/audit.service');
const admin = require('./portalEmpresaAdmin.service');

const eventoDe = (req, res) => {
    const id = req.event?.id;
    if (!id) res.status(400).json({ error: 'Selecione um evento para continuar.' });
    return id;
};

const executar = (fn) => async (req, res) => {
    const eventoId = eventoDe(req, res);
    if (!eventoId) return;
    try {
        res.json({ success: true, data: await fn(req, eventoId) });
    } catch (error) {
        if (error.status && error.status < 500) return res.status(error.status).json({ error: error.message });
        logger.error(`[PortalEmpresa/painel] ${req.method} ${req.originalUrl}:`, error);
        return res.status(500).json({ error: 'Não foi possível concluir a operação.' });
    }
};

/** Rotas do painel para o portal da empresa (em /api/empresas). */
module.exports = {
    // Chave de acesso do responsável: ver é registrado na auditoria (é uma senha)
    obterAcesso: executar(async (req, eventoId) => {
        const acesso = await admin.obterAcesso(eventoId, req.params.id);
        if (acesso.chave) await auditService.logEntity(req, 'VIEW_COMPANY_PORTAL_KEY', 'EMPRESA', req.params.id, {});
        return acesso;
    }),
    gerarChave: executar(async (req, eventoId) => {
        const acesso = await admin.gerarChave(eventoId, req.params.id);
        await auditService.logEntity(req, 'GENERATE_COMPANY_PORTAL_KEY', 'EMPRESA', req.params.id, {});
        return acesso;
    }),

    listarSolicitacoes: executar((req, eventoId) => admin.listarSolicitacoes(eventoId, {
        status: req.query.status || 'pendente', empresaId: req.query.empresa_id || null
    })),
    contarSolicitacoes: executar(async (req, eventoId) => ({ pendentes: await admin.contarPendentes(eventoId) })),
    aprovar: executar(async (req, eventoId) => {
        const r = await admin.aprovar(eventoId, req.params.solicitacaoId, { usuarioId: req.user?.id, resposta: req.body?.resposta });
        await auditService.logEntity(req, 'APPROVE_COMPANY_REQUEST', 'EMPRESA', r.empresa_id, { solicitacao: r.id, tipo: r.tipo, alvo: r.alvo_resumo });
        return r;
    }),
    recusar: executar(async (req, eventoId) => {
        const r = await admin.recusar(eventoId, req.params.solicitacaoId, { usuarioId: req.user?.id, resposta: req.body?.resposta });
        await auditService.logEntity(req, 'REJECT_COMPANY_REQUEST', 'EMPRESA', r.empresa_id, { solicitacao: r.id, tipo: r.tipo, alvo: r.alvo_resumo });
        return r;
    })
};
