const paymentService = require('./payment.service');
const logger = require('../../services/logger');
const { supabase } = require('../../config/supabase');

class PaymentController {
    /**
     * Endpoint padrão para Webhooks Bancários.
     * 
     * IMPORTANTE: Este handler utiliza o raw body preservado pelo middleware
     * express.raw() ou express.json({ verify }) para validação de assinatura.
     */
    async handleWebhook(req, res) {
        try {
            const { provider } = req.params;
            const payload = req.body;
            
            // --- 🛡️ BLINDAGEM CONTRA REPLAY ATTACK (IDEMPOTÊNCIA) ---
            // Stripe: payload.id (evt_...) | Asaas: payload.id
            const providerEventId = payload.id || payload.event_id || `manual_${Date.now()}`;
            
            const { error: idempotenciaError } = await supabase
                .from('webhook_events')
                .insert([{ 
                    provider, 
                    provider_event_id: providerEventId, 
                    payload,
                    status: 'processing'
                }]);

            if (idempotenciaError) {
                if (idempotenciaError.code === '23505') {
                    logger.info(`♻️ [WEBHOOK] Evento duplicado ignorado: ${provider}:${providerEventId}`);
                    return res.status(200).json({ received: true, status: 'duplicate_ignored' });
                }
                logger.error('❌ Erro ao registrar idempotência:', idempotenciaError);
            }

            // Log de recepção
            logger.info(`📥 Webhook recebido [${provider}] - EventID: ${providerEventId}`);

            try {
                const rawBody = req.rawBody || JSON.stringify(payload);
                await paymentService.processWebhook(provider, payload, req.headers, rawBody);
                
                // Marcar como concluído
                await supabase
                    .from('webhook_events')
                    .update({ status: 'completed', processed_at: new Date() })
                    .eq('provider', provider)
                    .eq('provider_event_id', providerEventId);

            } catch (webhookErr) {
                await supabase
                    .from('webhook_events')
                    .update({ status: 'failed' })
                    .eq('provider', provider)
                    .eq('provider_event_id', providerEventId);

                if (webhookErr.message?.includes('Webhook rejeitado')) {
                    return res.status(403).json({ error: 'Forbidden', detail: 'Assinatura inválida.' });
                }
                logger.error(`❌ Erro no processamento do webhook ${provider}:`, webhookErr);
            }

            return res.status(200).json({ received: true });
        } catch (error) {
            logger.error('Erro fatal no handleWebhook:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    /**
     * Lista transações financeiras com filtros, paginação e KPIs
     * GET /api/payments/transactions?evento_id=X&status=Y&provider=Z&page=1&limit=25
     */
    async listTransactions(req, res) {
        try {
            const { evento_id, status, provider, date_from, date_to, page = 1, limit = 25 } = req.query;
            const offset = (parseInt(page) - 1) * parseInt(limit);

            let query = supabase
                .from('transacoes_financeiras')
                .select('*, pessoas(nome, cpf)', { count: 'exact' })
                .order('webhook_received_at', { ascending: false })
                .range(offset, offset + parseInt(limit) - 1);

            // Filtros
            if (evento_id) query = query.eq('evento_id', evento_id);
            if (status) query = query.eq('status', status);
            if (provider) query = query.eq('provider', provider);
            if (date_from) query = query.gte('webhook_received_at', date_from);
            if (date_to) query = query.lte('webhook_received_at', date_to);

            const { data: transactions, count, error } = await query;

            if (error) throw error;

            // KPIs filtrados por evento ativo
            let kpiQuery = supabase.from('transacoes_financeiras').select('status, valor');
            if (evento_id) kpiQuery = kpiQuery.eq('evento_id', evento_id);

            const { data: allTx } = await kpiQuery;

            const kpis = {
                total_recebido: (allTx || []).filter(t => t.status === 'confirmado').reduce((s, t) => s + (parseFloat(t.valor) || 0), 0),
                pendentes: (allTx || []).filter(t => t.status === 'pendente').length,
                rejeitados: (allTx || []).filter(t => t.status === 'rejeitado' || t.status === 'cancelado').length,
                total: (allTx || []).length,
                taxa_sucesso: (allTx || []).length > 0
                    ? Math.round(((allTx || []).filter(t => t.status === 'confirmado').length / (allTx || []).length) * 100)
                    : 0
            };

            res.json({
                success: true,
                transactions,
                kpis,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: count || 0,
                    pages: Math.ceil((count || 0) / parseInt(limit))
                }
            });

        } catch (error) {
            logger.error('Erro ao listar transações:', error);
            res.status(500).json({ error: 'Erro ao buscar transações financeiras' });
        }
    }

    /**
     * Reconcilia manualmente uma transação
     * PUT /api/payments/transactions/:id/reconcile
     */
    async reconcileTransaction(req, res) {
        try {
            const { id } = req.params;
            const userId = req.user?.id;

            // --- ⚛️ ATOMICIDADE ACID (Postgres RPC) ---
            // Resolve o problema de estado inconsistente (Pagamento OK, Acesso Pendente)
            const { data, error } = await supabase.rpc('reconcile_transaction', { t_id: id });

            if (error || (data && !data.success)) {
                logger.error(`❌ Falha na reconciliação RPC da transação ${id}:`, error || data.error);
                return res.status(400).json({ error: 'Falha na reconciliação atômica', detail: error?.message || data?.error });
            }

            // Logar quem fez a reconciliação manual na tabela de transações (audit trail)
            await supabase
                .from('transacoes_financeiras')
                .update({ 
                    reconciliado_por: userId,
                    reconciliado_em: new Date(),
                    observacao: 'Reconciliação manual via Admin'
                })
                .eq('id', id);

            logger.info(`✅ Transação ${id} reconciliada ATOMICAMENTE por ${userId}`);
            res.json({ success: true, transaction: data });

        } catch (error) {
            logger.error('Erro ao reconciliar transação:', error);
            res.status(500).json({ error: 'Erro ao reconciliar transação' });
        }
    }
}

module.exports = new PaymentController();

