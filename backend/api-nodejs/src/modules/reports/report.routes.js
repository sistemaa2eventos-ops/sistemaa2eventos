const express = require('express');
const router = express.Router();
const reportController = require('./report.controller');
const { authenticate, checkPermission } = require('../../middleware/auth');
const { requireEvent } = require('../../middleware/eventMiddleware');

// Relatórios requerem autenticação e contexto de evento — migrado para checkPermission
router.use(authenticate);
router.use(requireEvent);

router.get('/daily', checkPermission('relatorios', 'leitura'), reportController.dailyReport);
router.get('/company-summary', checkPermission('relatorios', 'leitura'), reportController.companySummary);
router.get('/ranking', checkPermission('relatorios', 'leitura'), reportController.getRanking);
router.get('/attendance-pdf', checkPermission('relatorios', 'leitura'), reportController.attendancePDF);

// Novos relatórios agregados
router.get('/por-area',    checkPermission('relatorios', 'leitura'), reportController.porArea);
router.get('/por-empresa', checkPermission('relatorios', 'leitura'), reportController.porEmpresa);
router.get('/por-leitor',  checkPermission('relatorios', 'leitura'), reportController.porLeitor);
router.get('/por-funcao',  checkPermission('relatorios', 'leitura'), reportController.porFuncao);
router.get('/por-status',  checkPermission('relatorios', 'leitura'), reportController.porStatus);

// Relatórios de Ponto (controle de jornada)
router.get('/ponto',         checkPermission('relatorios', 'leitura'), reportController.ponto);
router.get('/ponto-resumo',  checkPermission('relatorios', 'leitura'), reportController.pontoResumo);

// Fechamento do período: diárias, horas extras e valores pela regra de remuneração da empresa/função
router.get('/fechamento-periodo',      checkPermission('relatorios', 'leitura'), (req, res) => reportController.fechamentoPeriodo(req, res));
router.get('/fechamento-periodo/xlsx', checkPermission('relatorios', 'leitura'), (req, res) => reportController.exportarFechamentoXLSX(req, res));

// Relatórios Diários Consolidados (NZT Relatórios)
router.get('/diario-consolidado',      checkPermission('relatorios', 'leitura'), (req, res) => reportController.relatorioDiarioConsolidado(req, res));
router.get('/diario-consolidado/xlsx', checkPermission('relatorios', 'leitura'), (req, res) => reportController.exportarRelatorioDiarioXLSX(req, res));
router.get('/diario-consolidado/pdf',  checkPermission('relatorios', 'leitura'), (req, res) => reportController.exportarRelatorioDiarioPDF(req, res));
router.get('/fechamentos-diarios',     checkPermission('relatorios', 'leitura'), (req, res) => reportController.listarFechamentosDiarios(req, res));
router.get('/exportar-aba-pdf',        checkPermission('relatorios', 'leitura'), (req, res) => reportController.exportarAbaPDF(req, res));
// Métricas de atendimento por operador e planilha orçamentária
router.get('/atendimento', checkPermission('relatorios', 'leitura'), async (req, res) => {
    try {
        res.json({ success: true, data: await require('./atendimento.service').metricas(req.event.id, req.query) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
router.get('/orcamento/xlsx', checkPermission('relatorios', 'leitura'), async (req, res) => {
    try {
        const wb = await require('./orcamento.service').montarPlanilha(req.event.id, req.query);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="orcamento-credenciamento.xlsx"');
        await wb.xlsx.write(res);
        res.end();
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
router.get('/exportar-aba-xlsx',       checkPermission('relatorios', 'leitura'), (req, res) => reportController.exportarAbaXLSX(req, res));

module.exports = router;
