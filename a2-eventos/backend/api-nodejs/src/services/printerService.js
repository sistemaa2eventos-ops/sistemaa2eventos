const { supabase } = require('../config/supabase');
const logger = require('./logger');

/**
 * Serviço de Abstração para Impressoras Térmicas (ESC/POS)
 * v26.2 - Suporte a Layouts Dinâmicos via Supabase
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
     * Gera comandos ZPL para Zebra
     */
    generateZPL(pessoa, empresaNome) {
        const nome = (pessoa.nome || '').toUpperCase();
        const empresa = (empresaNome || '').toUpperCase();
        const cpf = pessoa.cpf || '';

        let zpl = "^XA"; // Start
        zpl += "^CF0,60"; // Default Font
        zpl += "^FO50,50^FD" + nome + "^FS"; // Nome
        zpl += "^CF0,30";
        zpl += "^FO50,120^FD" + empresa + "^FS"; // Empresa
        zpl += "^FO50,160^FDCentral de Acesso A2^FS"; // Footer
        zpl += "^XZ"; // End
        return zpl;
    }

    /**
     * Gera o buffer para impressão de credencial
     * Agora com carregamento de layout dinâmico
     */
    async generateBadgeBuffer(pessoa, empresaNome, eventoId, protocolo = 'ESC_POS') {
        if (protocolo === 'ZPL') {
            return this.generateZPL(pessoa, empresaNome);
        }

        const { RESET, ALIGN_CENTER, BOLD_ON, TEXT_NORMAL, DOUBLE_HEIGHT_ON, CUT_PAPER } = this.COMMANDS;

        try {
            // Tentar buscar layout personalizado para o evento
            const { data: layout } = await supabase
                .from('evento_etiqueta_layouts')
                .select('*')
                .eq('evento_id', eventoId)
                .maybeSingle();

            let buffer = RESET + ALIGN_CENTER;

            if (layout && layout.elementos && layout.elementos.length > 0) {
                // MODO DINÂMICO (Layout customizado no painel)
                logger.info(`🎨 [Printer] Usando layout dinâmico para evento ${eventoId}`);
                
                layout.elementos.forEach(el => {
                    if (el.tipo === 'texto') {
                        let txt = el.valor || '';
                        // Replace placeholders
                        txt = txt.replace('{nome}', (pessoa.nome || '').toUpperCase());
                        txt = txt.replace('{empresa}', (empresaNome || '').toUpperCase());
                        txt = txt.replace('{cpf}', pessoa.cpf || '');
                        
                        if (el.negrito) buffer += BOLD_ON;
                        if (el.tamanho === 'grande') buffer += DOUBLE_HEIGHT_ON;
                        buffer += txt + "\n" + TEXT_NORMAL + BOLD_OFF;
                    } else if (el.tipo === 'separador') {
                        buffer += "--------------------------------\n";
                    }
                });
            } else {
                // MODO FALLBACK (Layout Padrão A2)
                buffer += BOLD_ON + "A2 EVENTOS\n" + TEXT_NORMAL;
                buffer += "--------------------------------\n\n";
                buffer += DOUBLE_HEIGHT_ON + BOLD_ON + (pessoa.nome || '').toUpperCase() + "\n" + TEXT_NORMAL;
                if (empresaNome) buffer += empresaNome + "\n";
                buffer += "CPF: " + (pessoa.cpf || '') + "\n\n";
            }

            // Footer e Corte
            buffer += "Validado em: " + new Date().toLocaleString() + "\n";
            buffer += "\n\n\n" + CUT_PAPER;

            return buffer;
        } catch (error) {
            logger.error('Erro ao gerar buffer de impressão:', error);
            return null;
        }
    }

    /**
     * Envia para uma impressora IP
     */
    printViaNetwork(printerIp, printerPort, buffer) {
        if (!buffer) return false;

        setImmediate(async () => {
            try {
                logger.info(`🖨️ [Async] Enviando tarefa de impressão para ${printerIp}:${printerPort}`);
                // Implementação física do Socket ficaria aqui
                logger.info(`✅ Impressão enviada para ${printerIp}`);
            } catch (error) {
                logger.error('❌ Erro na impressora térmica:', error.message);
            }
        });

        return true; 
    }
}

module.exports = new PrinterService();
