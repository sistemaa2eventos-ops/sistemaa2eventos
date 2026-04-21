const PDFDocument = require('pdfkit');
const logger = require('./logger');

class PDFService {
    /**
     * Gera Relatório de Lista de Presença em PDF
     */
    async generateAttendanceList(evento, pessoas) {
        return new Promise((resolve, reject) => {
            try {
                const doc = new PDFDocument({ margin: 50, size: 'A4' });
                let buffers = [];

                doc.on('data', buffers.push.bind(buffers));
                doc.on('end', () => {
                    const pdfData = Buffer.concat(buffers);
                    resolve(pdfData);
                });

                // Cabeçalho Premium
                doc.fillColor('#0A1929').rect(0, 0, 600, 80).fill();
                doc.fillColor('#00D4FF').fontSize(20).text('NZT Intelligent Control - LISTA DE CREDENCIAMENTO', 50, 30, { align: 'left' });
                doc.fillColor('#FFFFFF').fontSize(10).text(`EVENTO: ${evento.nome?.toUpperCase()}`, 50, 55);

                // Data de Geração
                doc.fillColor('#666666').fontSize(8).text(`Gerado em: ${new Date().toLocaleString()}`, 450, 30, { align: 'right' });

                doc.moveDown(4);

                // Cabeçalho da Tabela
                const tableTop = 120;
                doc.fillColor('#00D4FF').fontSize(10).text('NOME COMPLETO', 50, tableTop, { bold: true });
                doc.text('DOC/CPF', 250, tableTop);
                doc.text('EMPRESA', 350, tableTop);
                doc.text('ASSINATURA', 460, tableTop);

                doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).strokeColor('#CCCCCC').stroke();

                let rowY = tableTop + 25;

                // Linhas
                pessoas.forEach((p, index) => {
                    // Check if we need a new page
                    if (rowY > 750) {
                        doc.addPage();
                        rowY = 50;
                        doc.fillColor('#00D4FF').fontSize(10).text('NOME COMPLETO', 50, rowY);
                        doc.text('DOC/CPF', 250, rowY);
                        doc.text('EMPRESA', 350, rowY);
                        doc.text('ASSINATURA', 460, rowY);
                        doc.moveTo(50, rowY + 15).lineTo(550, rowY + 15).stroke();
                        rowY += 25;
                    }

                    doc.fillColor('#333333').fontSize(9).text((p.nome_completo || p.nome)?.substring(0, 35).toUpperCase(), 50, rowY);
                    doc.text(p.cpf || 'N/D', 250, rowY);
                    doc.text(p.empresas?.nome?.substring(0, 15) || 'N/D', 350, rowY);

                    // Linha para assinatura
                    doc.moveTo(460, rowY + 10).lineTo(550, rowY + 10).strokeColor('#EEEEEE').stroke();

                    rowY += 25;
                });

                // Rodapé
                const pages = doc.bufferedPageRange();
                for (let i = 0; i < pages.count; i++) {
                    doc.switchToPage(i);
                    doc.fillColor('#999999').fontSize(8).text(`Página ${i + 1} de ${pages.count} - A2 Eventos SaaS Nexus`, 50, 800, { align: 'center' });
                }

                doc.end();

            } catch (error) {
                logger.error('Erro na geração do PDF:', error);
                reject(error);
            }
        });
    }
}

module.exports = new PDFService();
