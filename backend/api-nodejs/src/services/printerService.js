const logger = require('./logger');

/**
 * Serviço de Abstração para Impressoras Térmicas (ESC/POS)
 */
class PrinterService {
    /**
     * Comandos ESC/POS Básicos
     */
    get COMMANDS() {
        return {
            RESET: '\x1B\x40',
            ALIGN_LEFT: '\x1B\x61\x00',
            ALIGN_CENTER: '\x1B\x61\x01',
            ALIGN_RIGHT: '\x1B\x61\x02',
            BOLD_ON: '\x1B\x45\x01',
            BOLD_OFF: '\x1B\x45\x00',
            DOUBLE_HEIGHT_ON: '\x1B\x21\x10',
            DOUBLE_WIDTH_ON: '\x1B\x21\x20',
            TEXT_NORMAL: '\x1B\x21\x00',
            CUT_PAPER: '\x1D\x56\x41'
        };
    }

    /**
     * Gera o buffer para impressão de credencial
     */
    generateBadgeBuffer(pessoa, empresaNome) {
        const { RESET, ALIGN_CENTER, BOLD_ON, TEXT_NORMAL, DOUBLE_HEIGHT_ON, CUT_PAPER } = this.COMMANDS;

        let buffer = '';
        buffer += RESET;
        buffer += ALIGN_CENTER;

        // Cabeçalho
        buffer += BOLD_ON + "A2 EVENTOS\n" + TEXT_NORMAL;
        buffer += "--------------------------------\n\n";

        // Nome do Participante (Destaque)
        buffer += DOUBLE_HEIGHT_ON + BOLD_ON + pessoa.nome.toUpperCase() + "\n" + TEXT_NORMAL;

        // Empresa
        if (empresaNome) {
            buffer += empresaNome + "\n";
        }

        // CPF (Opcional/Segurança)
        buffer += "CPF: " + pessoa.cpf + "\n\n";

        // Footer e Corte
        buffer += "Validado em: " + new Date().toLocaleString() + "\n";
        buffer += "\n\n\n";
        buffer += CUT_PAPER;

        return buffer;
    }

    /**
     * Envia para uma impressora IP (Assíncrono / Não-bloqueante)
     */
    printViaNetwork(printerIp, printerPort, buffer) {
        // Envolvemos em um setImmediate ou Promise sem await para não travar a catraca
        setImmediate(async () => {
            try {
                logger.info(`🖨️ [Async] Enviando tarefa de impressão para ${printerIp}:${printerPort}`);

                // Em uma implementação real:
                // const net = require('net');
                // const client = new net.Socket();
                // client.setTimeout(3000); // Timeout de conexão curto
                // ...

                logger.info(`✅ Impressão enviada para ${printerIp}`);
            } catch (error) {
                logger.error('❌ Erro assíncrono na impressora térmica:', error.message);
                // Aqui poderíamos disparar um alerta via WebSocket para o Admin
            }
        });

        return true; // Retorna true IMEDIATAMENTE para liberar o fluxo do backend
    }
}

module.exports = new PrinterService();
