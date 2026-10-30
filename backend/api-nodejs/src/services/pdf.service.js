const PDFDocument = require('pdfkit');
const logger = require('./logger');

class PDFService {
    /**
     * Gera Relatório de Lista de Presença em PDF
     */
    async generateAttendanceList(evento, pessoas) {
        return new Promise((resolve, reject) => {
            try {
                // bufferPages: o rodapé "Página X de Y" volta às páginas anteriores (sem isso,
                // switchToPage quebrava qualquer lista com mais de uma página)
                const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
                let buffers = [];

                doc.on('data', buffers.push.bind(buffers));
                doc.on('end', () => {
                    const pdfData = Buffer.concat(buffers);
                    resolve(pdfData);
                });

                // Cabeçalho Premium
                doc.fillColor('#0A1929').rect(0, 0, 600, 80).fill();
                doc.fillColor('#00D4FF').fontSize(18).text('NZT Intelligent Control - LISTA DE CREDENCIAMENTO', 50, 30, { align: 'left' });
                doc.fillColor('#FFFFFF').fontSize(10).text(`EVENTO: ${evento?.nome?.toUpperCase() || 'EVENTO'}`, 50, 55);

                // Data de Geração
                doc.fillColor('#94A3B8').fontSize(8).text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 400, 35, { align: 'right' });

                doc.moveDown(4);

                // Cabeçalho da Tabela
                const tableTop = 110;
                doc.fillColor('#00D4FF').fontSize(9).text('NOME COMPLETO', 50, tableTop, { bold: true });
                doc.text('DOC/CPF', 250, tableTop);
                doc.text('EMPRESA', 350, tableTop);
                doc.text('ASSINATURA', 460, tableTop);

                doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).strokeColor('#CCCCCC').stroke();

                let rowY = tableTop + 25;

                // Linhas
                pessoas.forEach((p) => {
                    if (rowY > 740) {
                        doc.addPage();
                        rowY = 50;
                        doc.fillColor('#00D4FF').fontSize(9).text('NOME COMPLETO', 50, rowY);
                        doc.text('DOC/CPF', 250, rowY);
                        doc.text('EMPRESA', 350, rowY);
                        doc.text('ASSINATURA', 460, rowY);
                        doc.moveTo(50, rowY + 15).lineTo(550, rowY + 15).stroke();
                        rowY += 25;
                    }

                    doc.fillColor('#333333').fontSize(9).text((p.nome_completo || p.nome || 'N/D').substring(0, 35).toUpperCase(), 50, rowY);
                    doc.text(p.cpf || 'N/D', 250, rowY);
                    doc.text(p.empresas?.nome?.substring(0, 15) || 'N/D', 350, rowY);

                    // Linha para assinatura
                    doc.moveTo(460, rowY + 10).lineTo(550, rowY + 10).strokeColor('#EEEEEE').stroke();
                    rowY += 25;
                });

                // Rodapé
                const pages = doc.bufferedPageRange();
                for (let i = pages.start; i < pages.start + pages.count; i++) {
                    doc.switchToPage(i);
                    // y=800 fica abaixo da margem inferior: sem zerar a margem, o texto abria uma página nova
                    const margemInferior = doc.page.margins.bottom;
                    doc.page.margins.bottom = 0;
                    doc.fillColor('#999999').fontSize(8).text(`Página ${i + 1} de ${pages.count} • NZT Relatórios • A2 Eventos`, 50, 800, { align: 'center', lineBreak: false });
                    doc.page.margins.bottom = margemInferior;
                }

                doc.end();

            } catch (error) {
                logger.error('Erro na geração do PDF de presença:', error);
                reject(error);
            }
        });
    }

    /**
     * Gera Relatório Diário Consolidado de Acessos em PDF (Paisagem / Landscape)
     * Atende às 8 colunas exigidas:
     * 1. Empresa
     * 2. Colaborador
     * 3. CPF
     * 4. Função
     * 5. Nº Pulseira
     * 6. Data e Hora Check-in
     * 7. Data e Hora Check-out
     * 8. Tempo de Permanência
     */
    async generateDailyReportPDF({ evento, dataReferencia, registros = [], totais = {} }) {
        return new Promise((resolve, reject) => {
            try {
                // A4 Landscape: 841.89 x 595.28 pt
                const doc = new PDFDocument({ 
                    layout: 'landscape', 
                    size: 'A4', 
                    margin: 36,
                    bufferPages: true 
                });
                let buffers = [];

                doc.on('data', buffers.push.bind(buffers));
                doc.on('end', () => {
                    const pdfData = Buffer.concat(buffers);
                    resolve(pdfData);
                });

                const drawHeader = (pageNumber = 1) => {
                    // Barra Superior Escura com tema NZT
                    doc.fillColor('#07101E').rect(0, 0, 842, 65).fill();
                    
                    // Logo / Título
                    doc.fillColor('#00D4FF').fontSize(15).font('Helvetica-Bold')
                        .text('NZT RELATÓRIOS • FECHAMENTO DIÁRIO DE ACESSOS', 36, 16);
                    
                    doc.fillColor('#FFFFFF').fontSize(9).font('Helvetica')
                        .text(`EVENTO: ${(evento?.nome || 'EVENTO').toUpperCase()}   |   DATA DE REFERÊNCIA: ${dataReferencia || 'HOJE'}`, 36, 36);
                    
                    // Metadata à direita
                    doc.fillColor('#94A3B8').fontSize(8)
                        .text(`Emitido em: ${new Date().toLocaleString('pt-BR')}`, 580, 20, { align: 'right', width: 226 });
                    doc.fillColor('#00FF88').fontSize(8).font('Helvetica-Bold')
                        .text(`Total: ${registros.length} Colaboradores`, 580, 36, { align: 'right', width: 226 });

                    // Linha de acento neon
                    doc.fillColor('#00D4FF').rect(0, 65, 842, 2).fill();

                    // Cabeçalho da Tabela
                    const tableTop = 75;
                    doc.fillColor('#0F172A').rect(36, tableTop, 770, 22).fill();

                    doc.fillColor('#00D4FF').fontSize(8).font('Helvetica-Bold');
                    doc.text('EMPRESA', 42, tableTop + 7, { width: 120 });
                    doc.text('COLABORADOR', 165, tableTop + 7, { width: 135 });
                    doc.text('CPF', 305, tableTop + 7, { width: 80 });
                    doc.text('FUNÇÃO', 390, tableTop + 7, { width: 95 });
                    doc.text('PULSEIRA', 490, tableTop + 7, { width: 65 });
                    doc.text('CHECK-IN', 560, tableTop + 7, { width: 80 });
                    doc.text('CHECK-OUT', 645, tableTop + 7, { width: 80 });
                    doc.text('PERMANÊNCIA', 730, tableTop + 7, { width: 70, align: 'right' });

                    return tableTop + 24;
                };

                let rowY = drawHeader(1);

                if (registros.length === 0) {
                    doc.fillColor('#64748B').fontSize(10).font('Helvetica-Oblique')
                        .text('Nenhum registro de acesso encontrado para esta data.', 36, rowY + 30, { align: 'center', width: 770 });
                } else {
                    registros.forEach((reg, index) => {
                        // Verifica se precisa quebrar de página
                        if (rowY > 530) {
                            doc.addPage();
                            rowY = drawHeader(doc.bufferedPageRange().count);
                        }

                        // Zebra striping
                        if (index % 2 === 0) {
                            doc.fillColor('#F8FAFC').rect(36, rowY, 770, 18).fill();
                        } else {
                            doc.fillColor('#FFFFFF').rect(36, rowY, 770, 18).fill();
                        }

                        // Borda inferior suave
                        doc.moveTo(36, rowY + 18).lineTo(806, rowY + 18).strokeColor('#E2E8F0').lineWidth(0.5).stroke();

                        // Textos das colunas
                        doc.fillColor('#0F172A').fontSize(7.5).font('Helvetica');
                        
                        const empNome = (reg.empresa_nome || 'Sem Empresa').substring(0, 24);
                        const colabNome = (reg.colaborador_nome || '—').substring(0, 26);
                        const cpf = reg.cpf || '—';
                        const funcao = (reg.funcao || '—').substring(0, 18);
                        const pulseira = reg.numero_pulseira || '—';
                        const checkin = reg.checkin_at || '—';
                        const checkout = reg.checkout_at || (reg.checkin_at && reg.checkin_at !== '—' ? 'No evento' : '—');
                        const perm = reg.tempo_permanencia || '—';

                        doc.text(empNome, 42, rowY + 5, { width: 120, ellipsis: true });
                        doc.font('Helvetica-Bold').text(colabNome, 165, rowY + 5, { width: 135, ellipsis: true });
                        doc.font('Helvetica').text(cpf, 305, rowY + 5, { width: 80 });
                        doc.text(funcao, 390, rowY + 5, { width: 95, ellipsis: true });
                        doc.text(pulseira, 490, rowY + 5, { width: 65 });
                        
                        // Checkin (cor verde)
                        doc.fillColor(checkin !== '—' ? '#059669' : '#64748B').text(checkin, 560, rowY + 5, { width: 80 });
                        
                        // Checkout (cor azul ou laranja)
                        const isNoEvento = checkout === 'No evento';
                        doc.fillColor(isNoEvento ? '#D97706' : (checkout !== '—' ? '#2563EB' : '#64748B'))
                            .text(checkout, 645, rowY + 5, { width: 80 });

                        // Permanência
                        doc.fillColor('#0F172A').font('Helvetica-Bold')
                            .text(perm, 730, rowY + 5, { width: 70, align: 'right' });

                        rowY += 18;
                    });
                }

                // Rodapé de todas as páginas
                const range = doc.bufferedPageRange();
                for (let i = 0; i < range.count; i++) {
                    doc.switchToPage(i);
                    doc.fillColor('#07101E').rect(0, 565, 842, 30).fill();
                    doc.fillColor('#94A3B8').fontSize(7.5).font('Helvetica')
                        .text('NZT Intelligent Control © 2026 • Plataforma de Gestão e Controle de Acesso para Grandes Eventos', 36, 575);
                    doc.fillColor('#00D4FF').fontSize(7.5).font('Helvetica-Bold')
                        .text(`Página ${i + 1} de ${range.count}`, 600, 575, { align: 'right', width: 206 });
                }

                doc.end();

            } catch (error) {
                logger.error('Erro na geração do PDF do relatório diário:', error);
                reject(error);
            }
        });
    }

    /**
     * Gera Relatório Agregado em PDF (Qualquer tabela do menu: Área, Empresa, Leitor, Função, Status)
     */
    async generateAggregatedPDF({ titulo, evento, colunas = [], linhas = [], subtitulo = '' }) {
        return new Promise((resolve, reject) => {
            try {
                const doc = new PDFDocument({ 
                    layout: 'landscape', 
                    size: 'A4', 
                    margin: 36, 
                    bufferPages: true 
                });
                let buffers = [];

                doc.on('data', buffers.push.bind(buffers));
                doc.on('end', () => {
                    const pdfData = Buffer.concat(buffers);
                    resolve(pdfData);
                });

                const drawHeader = (pageNumber = 1) => {
                    doc.fillColor('#07101E').rect(0, 0, 842, 65).fill();
                    doc.fillColor('#00D4FF').fontSize(15).font('Helvetica-Bold')
                        .text(`NZT RELATÓRIOS • ${titulo.toUpperCase()}`, 36, 16);
                    doc.fillColor('#FFFFFF').fontSize(9).font('Helvetica')
                        .text(`EVENTO: ${(evento?.nome || 'EVENTO').toUpperCase()} ${subtitulo ? ` | ${subtitulo}` : ''}`, 36, 36);
                    
                    doc.fillColor('#94A3B8').fontSize(8)
                        .text(`Emitido em: ${new Date().toLocaleString('pt-BR')}`, 580, 20, { align: 'right', width: 226 });
                    doc.fillColor('#00FF88').fontSize(8).font('Helvetica-Bold')
                        .text(`Total: ${linhas.length} Registros`, 580, 36, { align: 'right', width: 226 });

                    doc.fillColor('#00D4FF').rect(0, 65, 842, 2).fill();

                    const tableTop = 75;
                    doc.fillColor('#0F172A').rect(36, tableTop, 770, 22).fill();
                    doc.fillColor('#00D4FF').fontSize(8.5).font('Helvetica-Bold');

                    const colWidth = Math.floor(760 / Math.max(colunas.length, 1));
                    colunas.forEach((col, idx) => {
                        const x = 42 + idx * colWidth;
                        doc.text(col.label.toUpperCase(), x, tableTop + 7, { width: colWidth - 8, align: col.align || 'left' });
                    });

                    return tableTop + 24;
                };

                let rowY = drawHeader(1);
                const colWidth = Math.floor(760 / Math.max(colunas.length, 1));

                if (linhas.length === 0) {
                    doc.fillColor('#64748B').fontSize(10).font('Helvetica-Oblique')
                        .text('Nenhum registro encontrado para este filtro.', 36, rowY + 30, { align: 'center', width: 770 });
                } else {
                    linhas.forEach((linha, index) => {
                        if (rowY > 530) {
                            doc.addPage();
                            rowY = drawHeader(doc.bufferedPageRange().count);
                        }

                        if (index % 2 === 0) {
                            doc.fillColor('#F8FAFC').rect(36, rowY, 770, 20).fill();
                        } else {
                            doc.fillColor('#FFFFFF').rect(36, rowY, 770, 20).fill();
                        }

                        doc.moveTo(36, rowY + 20).lineTo(806, rowY + 20).strokeColor('#E2E8F0').lineWidth(0.5).stroke();

                        doc.fillColor('#0F172A').fontSize(8).font('Helvetica');

                        colunas.forEach((col, idx) => {
                            const x = 42 + idx * colWidth;
                            const val = linha[col.id] !== undefined && linha[col.id] !== null ? String(linha[col.id]) : '—';
                            doc.text(val, x, rowY + 6, { width: colWidth - 8, align: col.align || 'left', ellipsis: true });
                        });

                        rowY += 20;
                    });
                }

                const range = doc.bufferedPageRange();
                for (let i = 0; i < range.count; i++) {
                    doc.switchToPage(i);
                    doc.fillColor('#07101E').rect(0, 565, 842, 30).fill();
                    doc.fillColor('#94A3B8').fontSize(7.5).font('Helvetica')
                        .text('NZT Intelligent Control © 2026 • Plataforma de Gestão e Controle de Acesso para Grandes Eventos', 36, 575);
                    doc.fillColor('#00D4FF').fontSize(7.5).font('Helvetica-Bold')
                        .text(`Página ${i + 1} de ${range.count}`, 600, 575, { align: 'right', width: 206 });
                }

                doc.end();

            } catch (error) {
                logger.error('Erro na geração do PDF agregado:', error);
                reject(error);
            }
        });
    }
}

module.exports = new PDFService();
