const express = require('express');
const router = express.Router();
const accessController = require('./checkin.controller');
const liberacaoReentradaController = require('./liberacaoReentrada.controller');
const recusadosController = require('./recusados.controller');
const { authenticate, authorize, checkAnyPermission } = require('../../middleware/auth');
const { requireEvent } = require('../../middleware/eventMiddleware');
const rateLimiter = require('../../middleware/rateLimiter');

// ============================================
// ROTAS PÚBLICAS (sem autenticação - para terminais)
// ============================================
// Check-in/out via terminal facial (API key interna)

// ============================================
// Middleware para rotas autenticadas
// ============================================
const sessionMiddleware = [authenticate, requireEvent];

// PERMISSÕES POR TIPO DE OPERAÇÃO (B12 e A2): cada rota de acesso exige o módulo da operação que ela faz.
//   SAÍDA (checkout)                   → checkAnyPermission(['checkout'])
//   ENTRADA e CREDENCIAMENTO (checkin) → checkAnyPermission(['checkin'])
//   LEITOR RÁPIDO (entrada ou saída)   → checkAnyPermission(['checkin', 'checkout'])
//   CONSULTA (crachá, busca, último)   → checkAnyPermission(['checkin', 'checkout', 'fiscalizacao'])
// Operador só com o módulo checkout recebe 403 nas rotas de entrada (a tela de check-in some para ele no painel).
// Admin passa sempre (checkAnyPermission).
const PERM_ENTRADA = ['checkin'];
const PERM_SAIDA = ['checkout'];
const PERM_LEITOR = ['checkin', 'checkout'];
const PERM_CONSULTA = ['checkin', 'checkout', 'fiscalizacao'];

// Rotas que recebem o tipo no corpo (leitor rápido, pulseira, manual, qrcode): a permissão segue o tipo EFETIVO.
// tipo === 'checkout' exige o módulo checkout; qualquer outro valor (inclusive ausente) exige checkin.
// `recursos` declara os módulos que a rota pode exigir (usado pelos testes de permissão).
const exigePorTipo = (recursos) => {
    const entrada = checkAnyPermission(PERM_ENTRADA);
    const saida = checkAnyPermission(PERM_SAIDA);
    const middleware = (req, res, next) => (req.body?.tipo === 'checkout' ? saida : entrada)(req, res, next);
    middleware.recursos = recursos;
    return middleware;
};

// ============================================
// CHECK-IN / CHECK-OUT VIA PULSEIRA
// ============================================
router.post('/pulseira/checkin', sessionMiddleware, rateLimiter.access, exigePorTipo(PERM_ENTRADA), accessController.checkinPulseira);
router.post('/pulseira/checkout', sessionMiddleware, rateLimiter.access, checkAnyPermission(PERM_SAIDA), accessController.checkoutPulseira);
router.post('/checkout/corrigir-turno', sessionMiddleware, rateLimiter.access, checkAnyPermission(PERM_SAIDA), accessController.corrigirTurnoAnterior);
router.post('/pulseira/link-checkin', sessionMiddleware, rateLimiter.access, checkAnyPermission(PERM_ENTRADA), accessController.credenciarPulseira);
router.post('/link-checkin', sessionMiddleware, rateLimiter.access, checkAnyPermission(PERM_ENTRADA), accessController.credenciarPulseira);
router.get('/pulseira/buscar', sessionMiddleware, rateLimiter.consulta,
    checkAnyPermission(PERM_CONSULTA), accessController.buscarPessoaPulseira);
router.get('/pulseira/ultimo/:pessoa_id', sessionMiddleware, checkAnyPermission(PERM_CONSULTA), accessController.ultimoCheckin);

// ============================================
// CHECK-IN GENÉRICO (manual e qrcode — painel web)
// ============================================
router.post('/checkin/manual', sessionMiddleware, rateLimiter.access, exigePorTipo(PERM_ENTRADA), accessController.checkinManual);
router.post('/checkin/qrcode', sessionMiddleware, rateLimiter.access, exigePorTipo(PERM_ENTRADA), accessController.checkinQrcode);

// ============================================
// CREDENCIAMENTO & LEITOR RÁPIDO (CÓDIGO DE BARRAS / CPF / ENTRADA & SAÍDA SEM PULSEIRA)
// ============================================
router.post('/credenciar-pulseira', sessionMiddleware, rateLimiter.access, checkAnyPermission(PERM_ENTRADA), accessController.credenciarPulseira);
router.post('/leitor-rapido', sessionMiddleware, rateLimiter.access, exigePorTipo(PERM_LEITOR), accessController.leitorRapido);

// ============================================
// CONTROLE DE ENTRADA (PORTÃO): liberar nova entrada depois de saída em área que controla entrada
// ============================================
router.post('/liberar-reentrada', sessionMiddleware, checkAnyPermission(['checkin']),
    liberacaoReentradaController.liberarReentrada);

// ============================================
// RECUSAS DA FILA (passagens que o banco recusou depois de o operador ver "ok")
// ============================================
router.get('/recusados', sessionMiddleware, checkAnyPermission(['checkin']), recusadosController.listarRecusados);
router.post('/recusados/:id/resolver', sessionMiddleware, checkAnyPermission(['checkin']), recusadosController.resolverRecusado);

// ============================================
// CONSULTA E FISCALIZAÇÃO DE PULSEIRA / ÁREAS (painel web & app fiscal)
// ============================================
// Consulta do crachá: quem faz check-in, checkout ou fiscalização (qualquer um dos três módulos no evento)
router.get('/consultar-pulseira/:codigo', sessionMiddleware, rateLimiter.consulta,
    checkAnyPermission(['checkin', 'checkout', 'fiscalizacao']), accessController.consultarPulseira);
router.get('/fiscalizacoes-recentes', sessionMiddleware, accessController.getFiscalizacoesRecentes);
// /checkin/fiscalizar removido: nenhum cliente do repositório o usa (o app fiscal chama /access/fiscalizar)
router.post('/fiscalizar', sessionMiddleware, rateLimiter.access, checkAnyPermission(PERM_CONSULTA), accessController.fiscalizarAcesso);

// ============================================
// CONSULTAS
// ============================================
router.get('/logs', sessionMiddleware, accessController.getLogs);
// /stats/realtime devolve só contagens (sem nome ou CPF de pessoa). Exige ao menos um dos módulos das telas
// que a usam: Dashboard, Monitor, Check-in, Check-out e Fiscalização.
router.get('/stats/realtime', sessionMiddleware,
    require('../../middleware/moduloDesligado').exigirAlgumModulo(['dashboard', 'monitoramento', 'checkin', 'checkout', 'fiscalizacao']),
    accessController.getRealtimeStats);

// ============================================
// ADMINISTRATIVAS
// ============================================
router.post('/expulsar/:pessoa_id', sessionMiddleware, authorize('admin_master'), accessController.expulsar);

// ============================================
// DEPRECATED (ainda removidas):
// - /validate/qrcode
// - /checkin/barcode
// - /checkin/rfid
// - /checkout/qrcode
// - /vincular-pulseira-facial
// ============================================

module.exports = router;
