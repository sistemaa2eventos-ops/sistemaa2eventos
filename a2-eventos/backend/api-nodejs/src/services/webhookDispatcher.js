const { supabase } = require('../config/supabase');
const logger = require('./logger');
const { TIMEOUT_CONFIG } = require('../config/timeouts');

/**
 * Serviço de Dispatch de Webhooks
 * Dispara webhooks quando eventos ocorrem no sistema
 */
class WebhookDispatcher {
    constructor() {
        this.retryAttempts = 3;
        this.retryDelay = 1000;
    }

    /**
     * Dispara webhooks para um evento específico
     * @param {string} evento_id - ID do evento
     * @param {string} tipo_evento - Tipo de evento (CHECKIN, CHECKOUT, NOVO_CADASTRO, PESSOA_BLOQUEADA)
     * @param {object} payload - Dados do evento
     */
    async dispatch(evento_id, tipo_evento, payload) {
        try {
            // Buscar webhooks ativos para o evento e tipo na tabela system_webhooks
            const { data: webhooks, error } = await supabase
                .from('system_webhooks')
                .select('*')
                .eq('is_active', true)
                .contains('eventos', [tipo_evento]);

            if (error) {
                logger.error('Erro ao buscar webhooks:', error.message);
                return;
            }

            if (!webhooks || webhooks.length === 0) {
                logger.info(`Nenhum webhook ativo para evento ${tipo_evento}`);
                return;
            }

            // Disparar cada webhook em background
            for (const webhook of webhooks) {
                this.fireAndForget(webhook.target_url, tipo_evento, payload, webhook.id);
            }

            logger.info(`Webhooks dispatched: ${webhooks.length} para evento ${tipo_evento}`);
        } catch (error) {
            logger.error('Erro ao dispatch webhooks:', error.message);
        }
    }

    /**
     * Dispara webhook de forma assíncrona (fire-and-forget)
     */
    async fireAndForget(url, tipo_evento, payload, webhookId) {
        setImmediate(async () => {
            for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_CONFIG.API_REQUEST);

                    const response = await fetch(url, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Webhook-Event': tipo_evento,
                            'X-Webhook-ID': webhookId
                        },
                        body: JSON.stringify({
                            event: tipo_evento,
                            timestamp: new Date().toISOString(),
                            data: payload
                        }),
                        signal: controller.signal
                    });

                    clearTimeout(timeoutId);

                    if (response.ok) {
                        logger.info(`Webhook ${webhookId} dispatchado com sucesso para ${url}`);
                        return;
                    } else {
                        logger.warn(`Webhook ${webhookId} retornou status ${response.status}`);
                    }
                } catch (error) {
                    logger.warn(`Tentativa ${attempt}/${this.retryAttempts} falhou para webhook ${webhookId}: ${error.message}`);
                    if (attempt < this.retryAttempts) {
                        await this.delay(this.retryDelay * attempt);
                    }
                }
            }

            logger.error(`Webhook ${webhookId} falhou após ${this.retryAttempts} tentativas`);
        });
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Métodos de conveniência
    async dispatchCheckin(evento_id, pessoa, terminal = null) {
        return this.dispatch(evento_id, 'CHECKIN', {
            pessoa_id: pessoa.id,
            nome: pessoa.nome_completo || pessoa.nome,
            cpf: pessoa.cpf,
            empresa: pessoa.empresas?.nome,
            funcao: pessoa.funcao,
            numero_pulseira: pessoa.numero_pulseira,
            terminal: terminal,
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
            terminal: terminal,
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
            motivo: motivo,
            timestamp: new Date().toISOString()
        });
    }
}

module.exports = new WebhookDispatcher();