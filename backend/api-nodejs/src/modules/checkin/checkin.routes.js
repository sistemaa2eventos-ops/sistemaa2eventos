const express = require('express');
const router = express.Router();
const accessController = require('./checkin.controller');
const liberacaoReentradaController = require('./liberacaoReentrada.controller');
const recusadosController = require('./recusados.controller');
const { authenticate, authorize, checkAnyPermission } = require('../../middleware/auth');
const { requireEvent } = require('../../middleware/eventMiddleware');
const rateLimiter = require('../../middleware/rateLimiter');
const ApiResponse = require('../../utils/apiResponse');

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
//   tipo 'checkout' → exige o módulo checkout;
//   tipo 'checkin'  → exige o módulo checkin;
//   tipo AUSENTE    → exige pelo menos checkin OU checkout (sem nenhum dos dois: 403).
// Com o tipo ausente, NENHUM tipo é forçado aqui: o sistema (toggle, determineSmartAccessType) decide entrada ou saída.
// `recursos` declara os módulos que a rota pode exigir (usado pelos testes de permissão).

// Tipo do corpo normalizado (trim + minúsculas): 'CHECKOUT' e ' checkout ' são saída. Só 'checkin' e 'checkout'
// (ou ausente: null, undefined, vazio) são aceitos; qualquer outro valor (ex.: 'fiscalizacao', 'negado',
// 'expulsao', número, lista) é inválido → 400. Não é string → inválido.
const lerTipoDoCorpo = (valor) => {
    if (valor === undefined || valor === null) return { tipo: null };
    if (typeof valor !== 'string') return { invalido: true };
    const normalizado = valor.trim().toLowerCase();
    if (normalizado === '') return { tipo: null };
    return ['checkin', 'checkout'].includes(normalizado) ? { tipo: normalizado } : { invalido: true };
};

const exigePorTipo = (recursos) => {
    const entrada = checkAnyPermission(PERM_ENTRADA);
    const saida = checkAnyPermission(PERM_SAIDA);
    const entradaOuSaida = checkAnyPermission(PERM_LEITOR);
    const middleware = async (req, res, next) => {
        const { tipo, invalido } = lerTipoDoCorpo(req.body?.tipo);
        if (invalido) return ApiResponse.error(res, 'Tipo inválido: use checkin ou checkout', 400);
        if (!req.body) req.body = {};
        // O controller recebe o tipo já normalizado; ausente continua ausente (o sistema decide)
        req.body.tipo = tipo || undefined;

        const checagem = tipo === 'checkout' ? saida : (tipo === 'checkin' ? entrada : entradaOuSaida);
        // checkAnyPermission: se responder 403/401/400, não chama o callback e a rota para aqui
        let passou = false;
        await checagem(req, res, () => { passou = true; });
        if (!passou) return undefined;
        return next();
    };
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
// Situação de hoje de uma pessoa (ficha do participante em Check-in, Check-out, janela e dashboard)
router.get('/situacao/:pessoa_id', sessionMiddleware, checkAnyPermission(PERM_CONSULTA), accessController.situacaoPessoa);

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
router.get('/fiscalizacoes-recentes', sessionMiddleware, checkAnyPermission(PERM_CONSULTA), accessController.getFiscalizacoesRecentes);
// /checkin/fiscalizar removido: nenhum cliente do repositório o usa (o app fiscal chama /access/fiscalizar)
router.post('/fiscalizar', sessionMiddleware, rateLimiter.access, checkAnyPermission(PERM_CONSULTA), accessController.fiscalizarAcesso);

// ============================================
// CONSULTAS
// ============================================
// /logs devolve nome, CPF e foto das pessoas: só quem faz check-in, check-out ou fiscalização (ou admin).
router.get('/logs', sessionMiddleware, checkAnyPermission(PERM_CONSULTA), accessController.getLogs);
// /stats/realtime devolve só contagens, nomes de área e de empresa (sem nome ou CPF de pessoa). Exige ao
// menos um dos módulos das telas que a usam: Dashboard, Monitor, Check-in, Check-out e Fiscalização.
router.get('/stats/realtime', sessionMiddleware,
    require('../../middleware/moduloDesligado').exigirAlgumModulo(['dashboard', 'monitoramento', 'checkin', 'checkout', 'fiscalizacao']),
    accessController.getRealtimeStats);

// ============================================
// ADMINISTRATIVAS
// ============================================
router.post('/expulsar/:pessoa_id', sessionMiddleware, authorize('admin_master'), accessController.expulsar);

// ============================================
// QR CODE: validação e abertura de ficha
// ============================================
router.get('/qrcode/validar/:pessoa_id', sessionMiddleware, async (req, res) => {
    try {
        const { pessoa_id } = req.params;
        if (!pessoa_id) return res.status(400).json({ error: 'pessoa_id é obrigatório.' });

        const { supabase } = require('../../config/supabase');
        const { data: pessoa, error } = await supabase.from('pessoas')
            .select('id, nome_completo, cpf, foto_url, funcao, numero_pulseira, status_acesso, empresas:empresa_id(nome)')
            .eq('id', pessoa_id)
            .eq('evento_id', req.event.id)
            .single();

        if (error || !pessoa) return res.status(404).json({ error: 'Pessoa não encontrada ou não autorizada neste evento.' });
        if (pessoa.status_acesso === 'bloqueado') return res.status(403).json({ error: 'Pessoa bloqueada neste evento.' });

        return res.json({
            data: {
                id: pessoa.id,
                nome_completo: pessoa.nome_completo,
                cpf: pessoa.cpf,
                foto_url: pessoa.foto_url,
                funcao: pessoa.funcao,
                numero_pulseira: pessoa.numero_pulseira,
                empresa_nome: pessoa.empresas?.nome || 'Avulso',
                autorizado: true
            }
        });
    } catch (error) {
        require('../../services/logger').error('Erro ao validar QR code:', error.message);
        return res.status(500).json({ error: 'Erro ao validar QR code.' });
    }
});

// ============================================
// DEPRECATED (ainda removidas):
// - /validate/qrcode
// - /checkin/barcode
// - /checkin/rfid
// - /checkout/qrcode
// - /vincular-pulseira-facial
// ============================================

module.exports = router;
