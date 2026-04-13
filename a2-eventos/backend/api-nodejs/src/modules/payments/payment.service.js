const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');
const crypto = require('crypto');

class PaymentService {
    /**
     * Valida a assinatura criptográfica do webhook para evitar fraudes.
     * @param {string} provider - Nome do provedor
     * @param {Object} headers - Headers da requisição HTTP
     * @param {string|Buffer} rawBody - Body bruto da requisição (antes do JSON.parse)
     * @returns {{ valid: boolean, reason?: string }}
     */
    verifyWebhookSignature(provider, headers, rawBody) {
        if (provider === 'stripe') {
            const secret = process.env.STRIPE_WEBHOOK_SECRET;
            if (!secret) {
                logger.warn('⚠️ STRIPE_WEBHOOK_SECRET não configurado. Webhook Stripe rejeitado por segurança.');
                return { valid: false, reason: 'STRIPE_WEBHOOK_SECRET não configurado no servidor.' };
            }

            const sigHeader = headers['stripe-signature'];
            if (!sigHeader) {
                return { valid: false, reason: 'Header stripe-signature ausente.' };
            }

            try {
                // Extrair timestamp e assinatura do header
                const parts = sigHeader.split(',').reduce((acc, part) => {
                    const [key, val] = part.split('=');
                    acc[key.trim()] = val;
                    return acc;
                }, {});

                const timestamp = parts['t'];
                const expectedSig = parts['v1'];

                if (!timestamp || !expectedSig) {
                    return { valid: false, reason: 'Formato de stripe-signature inválido.' };
                }

                // Tolerância de 5 minutos para replay attacks
                const tolerance = 300;
                const now = Math.floor(Date.now() / 1000);
                if (Math.abs(now - parseInt(timestamp)) > tolerance) {
                    return { valid: false, reason: 'Timestamp do webhook fora da tolerância (possível replay attack).' };
                }

                // Computar HMAC
                const signedPayload = `${timestamp}.${typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8')}`;
                const computedSig = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');

                if (!crypto.timingSafeEqual(Buffer.from(computedSig), Buffer.from(expectedSig))) {
                    return { valid: false, reason: 'Assinatura HMAC inválida.' };
                }

                return { valid: true };
            } catch (err) {
                logger.error('Erro ao verificar assinatura Stripe:', err.message);
                return { valid: false, reason: `Erro na verificação: ${err.message}` };
            }
        }

        if (provider === 'asaas') {
            const secret = process.env.ASAAS_WEBHOOK_TOKEN;
            if (!secret) {
                logger.warn('⚠️ ASAAS_WEBHOOK_TOKEN não configurado. Webhook Asaas rejeitado por segurança.');
                return { valid: false, reason: 'ASAAS_WEBHOOK_TOKEN não configurado no servidor.' };
            }

            // Asaas envia um token de acesso no header asaas-access-token
            const accessToken = headers['asaas-access-token'];
            if (!accessToken) {
                return { valid: false, reason: 'Header asaas-access-token ausente.' };
            }

            if (!crypto.timingSafeEqual(Buffer.from(accessToken), Buffer.from(secret))) {
                return { valid: false, reason: 'Token de acesso Asaas inválido.' };
            }

            return { valid: true };
        }

        // Provider desconhecido → rejeitar por padrão (fail-closed)
        return { valid: false, reason: `Provider '${provider}' não possui validação de assinatura configurada.` };
    }

    /**
     * Processa um webhook genérico de pagamento
     * @param {string} provider - Nome do provedor (asaas, stripe, pagseguro)
     * @param {Object} payload - Dados brutos do webhook
     * @param {Object} headers - Headers HTTP da requisição original
     * @param {string|Buffer} rawBody - Body bruto para validação de assinatura
     */
    async processWebhook(provider, payload, headers = {}, rawBody = '') {
        logger.info(`💳 Recebido webhook de pagamento: ${provider}`);

        // --- SEGURANÇA: Validação de assinatura criptográfica ---
        const verification = this.verifyWebhookSignature(provider, headers, rawBody);
        if (!verification.valid) {
            logger.error(`🚨 [WEBHOOK REJEITADO] Provider: ${provider} | Motivo: ${verification.reason}`);
            // Logar tentativa suspeita para auditoria
            await this.logTransaction({
                provider,
                external_id: null,
                valor: 0,
                status: 'rejeitado_assinatura',
                gateway_response: { rejected_reason: verification.reason, headers_received: Object.keys(headers) }
            }).catch(() => {});
            throw new Error(`Webhook rejeitado: ${verification.reason}`);
        }

        logger.info(`✅ [WEBHOOK VALIDADO] Assinatura ${provider} verificada com sucesso.`);
        
        const reconciliationData = this.normalizePayload(provider, payload);
        
        if (!reconciliationData.success) {
            logger.warn(`⚠️ Pagamento ignorado ou não-sucesso (${provider}): ${reconciliationData.reason}`);
            return { processed: false, reason: reconciliationData.reason };
        }

        const { external_id, cpf, email, valor, status } = reconciliationData;

        // 1. Localizar Pessoa vinculada (Pelo CPF ou Email se external_id falhar)
        let findQuery = supabase
            .from('pessoas')
            .select('id, nome, evento_id, pagamento_validado');

        if (external_id) {
            findQuery = findQuery.or(`id.eq.${external_id},cpf.eq.${(cpf || '').replace(/[^\d]/g, '')}`);
        } else if (cpf) {
            findQuery = findQuery.eq('cpf', cpf.replace(/[^\d]/g, ''));
        } else if (email) {
            findQuery = findQuery.eq('email', email);
        }

        const { data: pessoa, error: findError } = await findQuery.maybeSingle();

        if (findError || !pessoa) {
            logger.error(`🚨 [Payment] Pessoa não encontrada para reconciliação: ${external_id || cpf || email}`);
            // Registrar transação órfã para reconciliação manual
            await this.logTransaction({
                provider, external_id, valor, status: 'falha',
                gateway_response: { ...payload, error: 'pessoa_nao_encontrada' }
            });
            return { processed: false, error: 'Pessoa não encontrada' };
        }

        // 2. Registrar na tabela de Transações Financeiras (Rastreabilidade completa)
        const transacao = await this.logTransaction({
            pessoa_id: pessoa.id,
            evento_id: pessoa.evento_id,
            provider,
            external_id,
            valor: valor || 0,
            status: 'confirmado',
            gateway_response: payload
        });

        // 3. Validar Pagamento na Pessoa (se ainda não estava validado)
        if (!pessoa.pagamento_validado) {
            const { error: updateError } = await supabase
                .from('pessoas')
                .update({ 
                    pagamento_validado: true,
                    status_acesso: 'autorizado',
                    updated_at: new Date()
                })
                .eq('id', pessoa.id);

            if (updateError) {
                logger.error(`❌ Erro ao validar pagamento da pessoa ${pessoa.id}:`, updateError);
                throw updateError;
            }
        }

        // 4. Registrar Log de Auditoria Financeira
        await supabase.from('audit_logs').insert([{
            tabela_nome: 'transacoes_financeiras',
            acao: 'INSERT',
            registro_id: transacao?.id || pessoa.id,
            new_data: { pagamento_validado: true, provider, valor, status_externo: status, transacao_id: transacao?.id },
            changed_at: new Date()
        }]);

        logger.info(`✅ Pagamento CONFIRMADO: ${pessoa.nome} | Evento: ${pessoa.evento_id} | Provider: ${provider} | Transação: ${transacao?.id}`);
        
        return { processed: true, pessoa_id: pessoa.id, transacao_id: transacao?.id };
    }

    /**
     * Registra uma transação financeira na tabela dedicada
     */
    async logTransaction(data) {
        try {
            const { data: transacao, error } = await supabase
                .from('transacoes_financeiras')
                .insert([{
                    pessoa_id: data.pessoa_id || null,
                    evento_id: data.evento_id || null,
                    provider: data.provider,
                    external_id: data.external_id || null,
                    valor: data.valor || 0,
                    status: data.status || 'pendente',
                    gateway_response: data.gateway_response || {},
                    webhook_received_at: new Date(),
                    reconciliado_em: data.status === 'confirmado' ? new Date() : null
                }])
                .select()
                .single();

            if (error) {
                logger.error('❌ Erro ao registrar transação financeira:', error);
                return null;
            }

            return transacao;
        } catch (err) {
            logger.error('❌ Exception ao registrar transação:', err);
            return null;
        }
    }

    /**
     * Normaliza payloads de diferentes gateways para um formato comum
     */
    normalizePayload(provider, payload) {
        try {
            if (provider === 'asaas') {
                return {
                    success: payload.event === 'PAYMENT_CONFIRMED' || payload.event === 'PAYMENT_RECEIVED',
                    external_id: payload.payment?.externalReference,
                    cpf: payload.payment?.customerCpfCnpj || '',
                    email: '',
                    valor: payload.payment?.value,
                    status: payload.event,
                    reason: payload.event
                };
            }

            if (provider === 'stripe') {
                return {
                    success: payload.type === 'checkout.session.completed',
                    external_id: payload.data?.object?.client_reference_id,
                    cpf: '', 
                    email: payload.data?.object?.customer_details?.email,
                    valor: payload.data?.object?.amount_total / 100,
                    status: payload.type,
                    reason: payload.type
                };
            }

            return { success: false, reason: 'Provider não suportado' };
        } catch (err) {
            logger.error(`Erro ao normalizar payload ${provider}:`, err);
            return { success: false, reason: 'Erro de parsing' };
        }
    }
}

module.exports = new PaymentService();
