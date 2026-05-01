const { supabase } = require('../config/supabase');
const logger = require('./logger');
const { TIMEOUT_CONFIG } = require('../config/timeouts');

class WebhookDispatcher {
    constructor() {
        this.retryAttempts = 3;
        this.retryDelay = 1000;
    }

    async dispatch(evento_id, tipo_evento, payload) {
        try {
            const { data: webhooks, error } = await supabase
                .from('system_webhooks')
                .select('*')
                .eq('is_active', true)
                .eq('trigger_event', tipo_evento); // trigger_event é o campo configurado pelo usuário

            if (error) {
                logger.error({ err: error }, 'Failed to fetch webhooks');
                return;
            }

            if (!webhooks || webhooks.length === 0) {
                logger.info('No active webhooks found', { event_type: tipo_evento });
                return;
            }

            for (const webhook of webhooks) {
                this.fireAndForget(webhook, tipo_evento, payload);
            }

            logger.info('Webhooks dispatched', { webhook_count: webhooks.length, event_type: tipo_evento });
        } catch (error) {
            logger.error({ err: error }, 'Failed to dispatch webhooks');
        }
    }

    async fireAndForget(webhook, tipo_evento, payload) {
        setImmediate(async () => {
            let lastStatusCode = null;
            let lastError = null;
            let succeeded = false;

            for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_CONFIG.API_REQUEST);

                    const response = await fetch(webhook.target_url, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Webhook-Event': tipo_evento,
                            'X-Webhook-ID': webhook.id
                        },
                        body: JSON.stringify({
                            event: tipo_evento,
                            timestamp: new Date().toISOString(),
                            data: payload
                        }),
                        signal: controller.signal
                    });

                    clearTimeout(timeoutId);
                    lastStatusCode = response.status;

                    if (response.ok) {
                        logger.info('Webhook dispatched successfully', { webhook_id: webhook.id, status: response.status, event_type: tipo_evento });
                        succeeded = true;
                        break;
                    }

                    lastError = `HTTP ${response.status}`;
                    logger.warn('Webhook returned non-OK status', { webhook_id: webhook.id, status: response.status });
                } catch (err) {
                    lastError = err.message;
                    logger.warn('Webhook dispatch attempt failed', { webhook_id: webhook.id, attempt, error: err.message });
                    if (attempt < this.retryAttempts) {
                        await this.delay(this.retryDelay * attempt);
                    }
                }
            }

            if (!succeeded) {
                logger.error('Webhook failed after all retries', { webhook_id: webhook.id, event_type: tipo_evento });
            }

            // Atualizar status de rastreamento independente do resultado
            await supabase.from('system_webhooks').update({
                last_dispatch_at: new Date().toISOString(),
                last_status_code: lastStatusCode,
                failure_count: succeeded ? 0 : (webhook.failure_count || 0) + 1,
                last_error: succeeded ? null : lastError
            }).eq('id', webhook.id);
        });
    }

    // Disparo síncrono para testar webhook (retorna resultado ao caller)
    async testDispatch(targetUrl, triggerEvent) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        const startedAt = Date.now();

        try {
            const response = await fetch(targetUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Webhook-Event': triggerEvent,
                    'X-Webhook-Test': 'true'
                },
                body: JSON.stringify({
                    event: triggerEvent,
                    timestamp: new Date().toISOString(),
                    test: true,
                    data: { message: 'Webhook de teste do sistema A2 Eventos' }
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            return {
                success: response.ok,
                status_code: response.status,
                response_time_ms: Date.now() - startedAt
            };
        } catch (err) {
            clearTimeout(timeoutId);
            return {
                success: false,
                status_code: null,
                response_time_ms: Date.now() - startedAt,
                error: err.name === 'AbortError' ? 'Timeout (10s)' : err.message
            };
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async dispatchCheckin(evento_id, pessoa, terminal = null) {
        return this.dispatch(evento_id, 'CHECKIN', {
            pessoa_id: pessoa.id,
            nome: pessoa.nome_completo || pessoa.nome,
            cpf: pessoa.cpf,
            empresa: pessoa.empresas?.nome,
            funcao: pessoa.funcao,
            numero_pulseira: pessoa.numero_pulseira,
            terminal,
            timestamp: new Date().toISOString()
        });
    }

    async dispatchCheckout(evento_id, pessoa, terminal = null) {
        return this.dispatch(evento_id, 'CHECKOUT', {
            pessoa_id: pessoa.id,
            nome: pessoa.nome_completo || pessoa.nome,
            cpf: pessoa.cpf,
            empresa: pessoa.empresas?.nome,
            numero_pulseira: pessoa.numero_pulseira,
            terminal,
            timestamp: new Date().toISOString()
        });
    }

    async dispatchNovoCadastro(evento_id, pessoa) {
        return this.dispatch(evento_id, 'NOVO_CADASTRO', {
            pessoa_id: pessoa.id,
            nome: pessoa.nome_completo || pessoa.nome,
            cpf: pessoa.cpf,
            email: pessoa.email,
            tipo_pessoa: pessoa.tipo_pessoa,
            timestamp: new Date().toISOString()
        });
    }

    async dispatchPessoaBloqueada(evento_id, pessoa, motivo) {
        return this.dispatch(evento_id, 'PESSOA_BLOQUEADA', {
            pessoa_id: pessoa.id,
            nome: pessoa.nome_completo || pessoa.nome,
            cpf: pessoa.cpf,
            motivo,
            timestamp: new Date().toISOString()
        });
    }
}

module.exports = new WebhookDispatcher();
