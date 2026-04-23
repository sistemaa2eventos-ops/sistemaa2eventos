const crypto = require('crypto');
const logger = require('../services/logger');

/**
 * Middleware para validar assinaturas de webhooks (Stripe e Asaas)
 * Impede que atacantes forjem confirmações de pagamento via POST direto.
 */
function verifyWebhookSignature(req, res, next) {
    const provider = req.params.provider;

    try {
        if (provider === 'stripe') {
            const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
            const sig = req.headers['stripe-signature'];
            const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

            if (!sig || !endpointSecret) {
                throw new Error('Assinatura Stripe ou Secret ausente.');
            }

            // O Stripe exige o raw body para verificação. 
            // Certifique-se de que o express.json({ verify: ... }) está configurado ou use o rawBody se disponível.
            const event = stripe.webhooks.constructEvent(req.rawBody || JSON.stringify(req.body), sig, endpointSecret);
            req.webhookEvent = event;
            return next();
        } 
        
        if (provider === 'asaas') {
            const asaastoken = req.headers['asaas-access-token'];
            const localToken = process.env.ASAAS_WEBHOOK_TOKEN;

            if (!asaastoken || asaastoken !== localToken) {
                logger.warn(`🚨 Falha de HMAC Asaas: Token recebido ${asaastoken} não bate com o segredo local.`);
                return res.status(401).json({ error: 'Assinatura inválida' });
            }
            return next();
        }

        return res.status(400).json({ error: 'Provider de webhook desconhecido' });

    } catch (err) {
        logger.error(`🚨 Erro na validação de Webhook [${provider}]:`, err.message);
        return res.status(401).json({ error: `Falha na autenticação do webhook: ${err.message}` });
    }
}

module.exports = { verifyWebhookSignature };
