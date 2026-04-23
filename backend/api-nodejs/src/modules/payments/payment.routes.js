const express = require('express');
const router = express.Router();

const MODULE_DISABLED = true;

router.use((req, res, next) => {
    if (MODULE_DISABLED) {
        return res.status(503).json({
            success: false,
            error: 'Módulo financeiro não disponível nesta versão.',
            code: 'MODULE_DISABLED'
        });
    }
    next();
});
const paymentController = require('./payment.controller');
const { authenticate } = require('../../middleware/auth');

const { verifyWebhookSignature } = require('../../middleware/webhook.middleware');

/**
 * @route POST /api/payments/webhook/:provider
 * @desc Recebe notificações de pagamento de gateways externos
 * @access Public (Validado por HMAC Signature)
 */
router.post('/webhook/:provider', verifyWebhookSignature, paymentController.handleWebhook);

/**
 * @route GET /api/payments/transactions
 * @desc Lista transações financeiras com filtros e KPIs
 * @access Private (Admin/Master)
 */
router.get('/transactions', authenticate, paymentController.listTransactions);

/**
 * @route PUT /api/payments/transactions/:id/reconcile
 * @desc Marca uma transação como reconciliada manualmente
 * @access Private (Admin/Master)
 */
router.put('/transactions/:id/reconcile', authenticate, paymentController.reconcileTransaction);

module.exports = router;

