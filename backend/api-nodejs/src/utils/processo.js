const logger = require('../services/logger');

/**
 * Proteções do processo compartilhadas pela API e pelo worker dos leitores:
 * - erro não tratado vira log/Sentry em vez de derrubar o processo calado;
 * - SIGTERM/SIGINT (docker stop, deploy) param de aceitar conexões e deixam
 *   as requisições em andamento (check-ins) terminarem antes de sair.
 */
function protegerProcesso({ nome, server, websocket = null, aoEncerrar = [], Sentry = null, prazoMs = 20000 }) {
    process.on('unhandledRejection', (motivo) => {
        logger.error(`[${nome}] Promise rejeitada sem tratamento: ${motivo?.stack || motivo}`);
        Sentry?.captureException?.(motivo);
    });

    process.on('uncaughtException', (err) => {
        // Estado do processo é incerto: registra e sai para o Docker reiniciar limpo
        logger.error(`[${nome}] Exceção não tratada, reiniciando: ${err?.stack || err}`);
        Sentry?.captureException?.(err);
        encerrar('uncaughtException', 1);
    });

    let encerrando = false;
    async function encerrar(sinal, codigo = 0) {
        if (encerrando) return;
        encerrando = true;
        logger.info(`[${nome}] ${sinal} recebido: encerrando com segurança...`);

        // Garante a saída mesmo se algo travar
        setTimeout(() => process.exit(codigo), prazoMs).unref();

        // Sockets abertos seguram o server.close: fecha o socket.io antes (os clientes reconectam no novo container)
        try { websocket?.io?.close(); } catch (_) { /* já fechado */ }
        await new Promise((resolve) => {
            if (!server) return resolve();
            server.close(() => resolve());
            server.closeIdleConnections?.(); // keep-alive ocioso não espera o prazo
        });
        for (const passo of aoEncerrar) {
            try { await passo(); } catch (e) { logger.warn(`[${nome}] Falha ao encerrar: ${e.message}`); }
        }
        await Sentry?.close?.(2000).catch?.(() => {});
        process.exit(codigo);
    }

    process.on('SIGTERM', () => encerrar('SIGTERM'));
    process.on('SIGINT', () => encerrar('SIGINT'));
    return encerrar;
}

module.exports = { protegerProcesso };
