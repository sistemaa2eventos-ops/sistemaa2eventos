'use strict';

const express = require('express');
const router = express.Router();
const producaoService = require('./producao.service');
const portalAuth = require('./producaoPortalAuth');
const { authenticate, checkPermission } = require('../../middleware/auth');
const { requireEvent } = require('../../middleware/eventMiddleware');
const rateLimiter = require('../../middleware/rateLimiter');
const ApiResponse = require('../../utils/apiResponse');
const logger = require('../../services/logger');

// Login exclusivo do Portal Separado dos Produtores (sem usuário no Painel NZT)
router.post('/portal/login', rateLimiter.auth, async (req, res) => {
    try {
        const data = await producaoService.autenticarPortalProdutor(req.body || {});
        return ApiResponse.success(res, data);
    } catch (error) {
        const status = error.status || 401;
        logger.warn(`[Produção/Portal] Falha de login: ${error.message}`);
        return ApiResponse.error(res, error.message || 'Falha ao autenticar no Portal de Produção.', status);
    }
});

/**
 * Aceita sessão do Painel NZT (via Supabase + perfis) OU token dedicado do Portal do Produtor.
 */
const autenticarProducaoOuPortal = (req, res, next) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ')
        ? authHeader.slice(7).trim()
        : (req.headers['x-portal-produtor-token'] || req.query?.portal_token || '');

    const payloadPortal = portalAuth.verificarTokenProdutor(token);
    if (payloadPortal) {
        req.user = {
            id: payloadPortal.produtor_id,
            produtor_id: payloadPortal.produtor_id,
            email: payloadPortal.email || payloadPortal.login_acesso,
            login_acesso: payloadPortal.login_acesso,
            nome: payloadPortal.nome,
            nivel_acesso: 'produtor_portal',
            role: 'produtor_portal',
            eh_portal_produtor: true
        };
        req.event = { id: payloadPortal.evento_id };
        return next();
    }

    return authenticate(req, res, (err) => {
        if (err) return next(err);
        return requireEvent(req, res, next);
    });
};

const permitirAcessoProducao = (nivel = 'leitura') => (req, res, next) => {
    if (req.user?.eh_portal_produtor) {
        return next();
    }
    return checkPermission('producao', nivel)(req, res, next);
};

router.use(autenticarProducaoOuPortal);

const tratar = (acao, fn) => async (req, res) => {
    try {
        if (!req.event?.id) {
            return ApiResponse.error(res, 'Selecione um evento ativo para acessar a Produção.', 400);
        }
        return await fn(req, res);
    } catch (error) {
        const status = error.status || 400;
        logger.warn(`[Produção] Erro ao ${acao}: ${error.message}`);
        return ApiResponse.error(res, error.message || `Erro ao ${acao}.`, status);
    }
};

router.get('/resumo', permitirAcessoProducao('leitura'), tratar('carregar resumo', async (req, res) => {
    const data = await producaoService.obterResumo(req.event.id, req.user, req.headers);
    return ApiResponse.success(res, data);
}));

router.post('/seed', permitirAcessoProducao('escrita'), tratar('gerar dados de demonstração', async (req, res) => {
    if (req.user?.eh_portal_produtor) {
        return ApiResponse.error(res, 'Ação exclusiva do painel administrativo.', 403);
    }
    const data = await producaoService.carregarSeed(req.event.id, req.user, req.headers);
    return ApiResponse.success(res, data, 201);
}));

// Áreas de atuação
router.post('/areas', permitirAcessoProducao('escrita'), tratar('criar área', async (req, res) => {
    const data = await producaoService.criarArea(req.event.id, req.body || {}, req.user, req.headers);
    return ApiResponse.success(res, data, 201);
}));

// Cadastro de produtores (com proteção estrita de cachê e PIX)
router.post('/produtores', permitirAcessoProducao('escrita'), tratar('cadastrar produtor', async (req, res) => {
    const data = await producaoService.criarProdutor(req.event.id, req.body || {}, req.user, req.headers);
    return ApiResponse.success(res, data, 201);
}));

router.put('/produtores/:id', permitirAcessoProducao('escrita'), tratar('atualizar produtor', async (req, res) => {
    const data = await producaoService.atualizarProdutor(req.event.id, req.params.id, req.body || {}, req.user, req.headers);
    return ApiResponse.success(res, data);
}));

router.post('/produtores/:id/definir-acesso', permitirAcessoProducao('escrita'), tratar('definir login e senha do produtor', async (req, res) => {
    const data = await producaoService.definirAcessoProdutor(req.event.id, req.params.id, req.body || {}, req.user, req.headers);
    return ApiResponse.success(res, data);
}));

router.post('/produtores/:id/convite', permitirAcessoProducao('escrita'), tratar('gerar convite de produtor', async (req, res) => {
    const data = await producaoService.gerarConviteProdutor(req.event.id, req.params.id, req.user, req.headers);
    return ApiResponse.success(res, data);
}));

router.post('/produtores/:id/lgpd-anonimizar', permitirAcessoProducao('escrita'), tratar('anonimizar produtor LGPD', async (req, res) => {
    const data = await producaoService.anonimizarProdutorLgpd(req.event.id, req.params.id, req.user, req.headers);
    return ApiResponse.success(res, data);
}));

// Projetos e arquivos técnicos
router.post('/projetos', permitirAcessoProducao('escrita'), tratar('criar projeto', async (req, res) => {
    const data = await producaoService.criarProjeto(req.event.id, req.body || {}, req.user, req.headers);
    return ApiResponse.success(res, data, 201);
}));

router.post('/projetos/:id/arquivos', permitirAcessoProducao('escrita'), tratar('anexar versão de arquivo', async (req, res) => {
    const data = await producaoService.adicionarArquivoProjeto(req.event.id, req.params.id, req.body || {}, req.user, req.headers);
    return ApiResponse.success(res, data, 201);
}));

// Tarefas, templates, dependências, etapas e evidências
router.post('/tarefas', permitirAcessoProducao('escrita'), tratar('criar tarefa', async (req, res) => {
    const data = await producaoService.criarTarefa(req.event.id, req.body || {}, req.user, req.headers);
    return ApiResponse.success(res, data, 201);
}));

router.put('/tarefas/:id', permitirAcessoProducao('escrita'), tratar('atualizar tarefa', async (req, res) => {
    const data = await producaoService.atualizarTarefa(req.event.id, req.params.id, req.body || {}, req.user, req.headers);
    return ApiResponse.success(res, data);
}));

router.delete('/tarefas/:id', permitirAcessoProducao('escrita'), tratar('excluir tarefa', async (req, res) => {
    const data = await producaoService.excluirTarefa(req.event.id, req.params.id, req.user, req.headers);
    return ApiResponse.success(res, data);
}));

router.post('/tarefas/templates', permitirAcessoProducao('escrita'), tratar('aplicar template de tarefas', async (req, res) => {
    const data = await producaoService.aplicarTemplateTarefas(req.event.id, req.body || {}, req.user, req.headers);
    return ApiResponse.success(res, data, 201);
}));

router.post('/tarefas/dependencias', permitirAcessoProducao('escrita'), tratar('vincular dependência', async (req, res) => {
    const data = await producaoService.criarDependenciaTarefa(req.event.id, req.body || {}, req.user, req.headers);
    return ApiResponse.success(res, data, 201);
}));

router.post('/tarefas/:id/iniciar', permitirAcessoProducao('escrita'), tratar('iniciar tarefa', async (req, res) => {
    const data = await producaoService.iniciarTarefa(req.event.id, req.params.id, req.body || {}, req.user, req.headers);
    return ApiResponse.success(res, data);
}));

router.post('/tarefas/:id/etapas/:etapaId/toggle', permitirAcessoProducao('escrita'), tratar('atualizar etapa', async (req, res) => {
    const data = await producaoService.alternarEtapaTarefa(req.event.id, req.params.id, req.params.etapaId, req.body || {}, req.user, req.headers);
    return ApiResponse.success(res, data);
}));

router.post('/tarefas/:id/etapas/:etapaId/evidencias', permitirAcessoProducao('escrita'), tratar('anexar evidência', async (req, res) => {
    const data = await producaoService.adicionarEvidenciaEtapa(req.event.id, req.params.id, req.params.etapaId, req.body || {}, req.user, req.headers);
    return ApiResponse.success(res, data, 201);
}));

router.post('/tarefas/:id/revisao', permitirAcessoProducao('escrita'), tratar('avaliar tarefa', async (req, res) => {
    const data = await producaoService.avaliarTarefa(req.event.id, req.params.id, req.body || {}, req.user, req.headers);
    return ApiResponse.success(res, data);
}));

// Plantas baixas, camadas, setores e propostas colaborativas
router.post('/plantas', permitirAcessoProducao('escrita'), tratar('criar prancha de planta', async (req, res) => {
    const data = await producaoService.criarPlanta(req.event.id, req.body || {}, req.user, req.headers);
    return ApiResponse.success(res, data, 201);
}));

router.post('/plantas/:id/camadas', permitirAcessoProducao('escrita'), tratar('adicionar desenho ou camada na planta', async (req, res) => {
    const data = await producaoService.adicionarCamadaPlanta(req.event.id, req.params.id, req.body || {}, req.user, req.headers);
    return ApiResponse.success(res, data, 201);
}));

router.put('/plantas/:id/camadas/:camadaId', permitirAcessoProducao('escrita'), tratar('atualizar camada da planta', async (req, res) => {
    const data = await producaoService.atualizarCamadaPlanta(req.event.id, req.params.id, req.params.camadaId, req.body || {}, req.user, req.headers);
    return ApiResponse.success(res, data);
}));

router.delete('/plantas/:id/camadas/:camadaId', permitirAcessoProducao('escrita'), tratar('remover camada da planta', async (req, res) => {
    const data = await producaoService.excluirCamadaPlanta(req.event.id, req.params.id, req.params.camadaId, req.user, req.headers);
    return ApiResponse.success(res, data);
}));

router.post('/plantas/:id/setores', permitirAcessoProducao('escrita'), tratar('definir setor na planta', async (req, res) => {
    const data = await producaoService.criarSetorPlanta(req.event.id, req.params.id, req.body || {}, req.user, req.headers);
    return ApiResponse.success(res, data, 201);
}));

router.put('/plantas/:id/setores/:setorId', permitirAcessoProducao('escrita'), tratar('atualizar setor da planta', async (req, res) => {
    const data = await producaoService.atualizarSetorPlanta(req.event.id, req.params.id, req.params.setorId, req.body || {}, req.user, req.headers);
    return ApiResponse.success(res, data);
}));

router.delete('/plantas/:id/setores/:setorId', permitirAcessoProducao('escrita'), tratar('excluir setor da planta', async (req, res) => {
    const data = await producaoService.excluirSetorPlanta(req.event.id, req.params.id, req.params.setorId, req.user, req.headers);
    return ApiResponse.success(res, data);
}));

router.post('/plantas/:id/publicar-oficial', permitirAcessoProducao('escrita'), tratar('publicar versão oficial da planta', async (req, res) => {
    const data = await producaoService.publicarVersaoOficialPlanta(req.event.id, req.params.id, req.body || {}, req.user, req.headers);
    return ApiResponse.success(res, data, 201);
}));

router.post('/plantas/:id/gerar-plano-fases', permitirAcessoProducao('escrita'), tratar('gerar plano de 3 fases', async (req, res) => {
    const data = await producaoService.gerarPlanoFasesElemento(req.event.id, req.params.id, req.body || {}, req.user, req.headers);
    return ApiResponse.success(res, data, 201);
}));

// Cronograma, marcos e alertas
router.post('/marcos', permitirAcessoProducao('escrita'), tratar('criar marco', async (req, res) => {
    const data = await producaoService.criarMarco(req.event.id, req.body || {}, req.user, req.headers);
    return ApiResponse.success(res, data, 201);
}));

router.post('/marcos/:id/toggle', permitirAcessoProducao('escrita'), tratar('atualizar marco', async (req, res) => {
    const data = await producaoService.alternarMarco(req.event.id, req.params.id, req.user, req.headers);
    return ApiResponse.success(res, data);
}));

router.post('/cronograma/disparar-alertas', permitirAcessoProducao('escrita'), tratar('disparar alertas de prazo', async (req, res) => {
    const data = await producaoService.dispararAlertasPrazos(req.event.id, req.user, req.headers);
    return ApiResponse.success(res, data);
}));

router.post('/plantas/:id/propostas', permitirAcessoProducao('escrita'), tratar('propor intervenção na planta', async (req, res) => {
    const data = await producaoService.criarPropostaPlanta(req.event.id, req.params.id, req.body || {}, req.user, req.headers);
    return ApiResponse.success(res, data, 201);
}));

router.post('/plantas/propostas/:propostaId/avaliar', permitirAcessoProducao('escrita'), tratar('avaliar proposta de planta', async (req, res) => {
    const data = await producaoService.avaliarPropostaPlanta(req.event.id, req.params.propostaId, req.body || {}, req.user, req.headers);
    return ApiResponse.success(res, data);
}));

// Materiais e Visão Computacional
router.get('/materiais/catalogo-visao', permitirAcessoProducao('leitura'), tratar('obter catálogo visual para IA', async (req, res) => {
    const data = await producaoService.obterCatalogoVisaoMateriais(req.event.id, req.user, req.headers);
    return ApiResponse.success(res, data);
}));

router.post('/materiais/analisar-foto-ia', permitirAcessoProducao('escrita'), tratar('analisar foto de pilha com IA', async (req, res) => {
    const data = await producaoService.analisarFotoPilhaIa(req.event.id, req.body || {}, req.user, req.headers);
    return ApiResponse.success(res, data);
}));

router.post('/materiais/analisar-video-ia', permitirAcessoProducao('escrita'), tratar('analisar vídeo gravado com IA', async (req, res) => {
    const data = await producaoService.analisarVideoIa(req.event.id, req.body || {}, req.user, req.headers);
    return ApiResponse.success(res, data);
}));

router.post('/materiais', permitirAcessoProducao('escrita'), tratar('cadastrar material', async (req, res) => {
    const data = await producaoService.criarMaterial(req.event.id, req.body || {}, req.user, req.headers);
    return ApiResponse.success(res, data, 201);
}));

router.patch('/materiais/:id', permitirAcessoProducao('escrita'), tratar('atualizar material', async (req, res) => {
    const data = await producaoService.atualizarMaterial(req.event.id, req.params.id, req.body || {}, req.user, req.headers);
    return ApiResponse.success(res, data);
}));

router.post('/materiais/conferencia-ia', permitirAcessoProducao('escrita'), tratar('processar conferência IA', async (req, res) => {
    const data = await producaoService.registrarConferenciaIa(req.event.id, req.body || {}, req.user, req.headers);
    return ApiResponse.success(res, data, 201);
}));

router.post('/materiais/sessoes/:sessaoId/itens/:itemId/confirmar', permitirAcessoProducao('escrita'), tratar('confirmar contagem IA', async (req, res) => {
    const data = await producaoService.confirmarItemContagem(req.event.id, req.params.sessaoId, req.params.itemId, req.body || {}, req.user, req.headers);
    return ApiResponse.success(res, data);
}));

router.post('/materiais/sessoes/:sessaoId/confirmar', permitirAcessoProducao('escrita'), tratar('confirmar contagem IA', async (req, res) => {
    const data = await producaoService.confirmarItemContagem(req.event.id, req.params.sessaoId, req.body?.item_id, req.body || {}, req.user, req.headers);
    return ApiResponse.success(res, data);
}));

router.post('/materiais/nao-reconhecidos/:itemId/cadastrar', permitirAcessoProducao('escrita'), tratar('catalogar item não reconhecido', async (req, res) => {
    const data = await producaoService.cadastrarMaterialNaoReconhecido(req.event.id, req.params.itemId, req.body || {}, req.user, req.headers);
    return ApiResponse.success(res, data, 201);
}));

router.post('/materiais/:id/movimentar', permitirAcessoProducao('escrita'), tratar('movimentar material', async (req, res) => {
    const data = await producaoService.movimentarMaterial(req.event.id, req.params.id, req.body || {}, req.user, req.headers);
    return ApiResponse.success(res, data);
}));

// Presença, escalas, check-in e dobras
router.post('/presenca/registrar', permitirAcessoProducao('escrita'), tratar('registrar presença', async (req, res) => {
    const data = await producaoService.registrarPresenca(req.event.id, req.body || {}, req.user, req.headers);
    return ApiResponse.success(res, data, 201);
}));

router.post('/escalas', permitirAcessoProducao('escrita'), tratar('criar escala', async (req, res) => {
    const data = await producaoService.criarEscala(req.event.id, req.body || {}, req.user, req.headers);
    return ApiResponse.success(res, data, 201);
}));

// Orçamentos e relatórios PDF
router.post('/orcamentos', permitirAcessoProducao('escrita'), tratar('criar orçamento', async (req, res) => {
    const data = await producaoService.criarOrcamento(req.event.id, req.body || {}, req.user, req.headers);
    return ApiResponse.success(res, data, 201);
}));

router.put('/orcamentos/:id', permitirAcessoProducao('escrita'), tratar('atualizar orçamento', async (req, res) => {
    const data = await producaoService.atualizarOrcamento(req.event.id, req.params.id, req.body || {}, req.user, req.headers);
    return ApiResponse.success(res, data);
}));

router.delete('/orcamentos/:id', permitirAcessoProducao('escrita'), tratar('excluir orçamento', async (req, res) => {
    const data = await producaoService.excluirOrcamento(req.event.id, req.params.id, req.user, req.headers);
    return ApiResponse.success(res, data);
}));

router.put('/relatorios/template', permitirAcessoProducao('escrita'), tratar('salvar template de relatório', async (req, res) => {
    const data = await producaoService.salvarTemplateRelatorio(req.event.id, req.body || {}, req.user, req.headers);
    return ApiResponse.success(res, data);
}));

router.get('/relatorios/pdf', permitirAcessoProducao('leitura'), tratar('gerar relatório PDF', async (req, res) => {
    const pdfBuffer = await producaoService.gerarRelatorioPdf(req.event.id, {
        tipo: req.query.tipo || 'diario_automatico',
        dataReferencia: req.query.data || new Date().toISOString().slice(0, 10)
    }, req.user, req.headers);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="relatorio-producao-${req.query.tipo || 'diario'}.pdf"`);
    return res.send(pdfBuffer);
}));

// Sincronização em lote da fila offline do PWA
router.post('/sync-offline', permitirAcessoProducao('escrita'), tratar('sincronizar fila offline', async (req, res) => {
    const data = await producaoService.sincronizarFilaOffline(req.event.id, req.body?.itens || [], req.user, req.headers);
    return ApiResponse.success(res, data);
}));

module.exports = router;
