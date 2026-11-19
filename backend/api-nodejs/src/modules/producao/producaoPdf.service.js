'use strict';

const PDFDocument = require('pdfkit');
const { podeVerOrcamentos, calcularAnalisePrazoTarefa } = require('./producaoCalculos');

const formatarMoeda = (centavos) => {
    const val = Number(centavos || 0) / 100;
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

/**
 * Desenha marca d'água diagonal translúcida na página atual do PDF.
 */
function aplicarMarcaDagua(doc, texto, opacidade = 0.08) {
    if (!texto) return;
    doc.save();
    doc.fillOpacity(Math.min(0.45, Math.max(0.02, Number(opacidade) || 0.08)));
    doc.fillColor('#64748B');
    doc.fontSize(38);
    doc.translate(297, 420);
    doc.rotate(-35);
    doc.text(String(texto), -240, -20, { align: 'center', width: 480 });
    doc.restore();
    doc.fillOpacity(1);
}

/**
 * Gera buffer de relatório em PDF personalizado do Módulo de Produção.
 */
async function gerarRelatorioPdfBuffer(evento, estado, opcoes = {}, ctx = {}) {
    const tipo = opcoes.tipo || 'diario_automatico';
    const dataRef = opcoes.dataReferencia || new Date().toISOString().slice(0, 10);
    const tpl = estado?.template_relatorio || {};
    const corCabecalho = tpl.cor_cabecalho_hex || '#0A1628';
    const marcaTexto = tpl.marca_dagua_texto || 'USO INTERNO • PRODUÇÃO NZT';
    const marcaOpacidade = tpl.marca_dagua_opacidade ?? 0.08;
    const rodape = tpl.rodape_personalizado || 'Relatório oficial de produção • NZT Eventos';
    const podeFinanceiro = podeVerOrcamentos(ctx);

    const areasMap = new Map((estado?.areas || []).map((a) => [a.id, a]));
    const produtoresMap = new Map((estado?.produtores || []).map((p) => [p.id, p]));

    const tarefas = (estado?.tarefas || []).map((t) => ({
        ...t,
        ...calcularAnalisePrazoTarefa(t)
    }));

    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 45, size: 'A4', bufferPages: true });
            const chunks = [];
            doc.on('data', (c) => chunks.push(c));
            doc.on('end', () => resolve(Buffer.concat(chunks)));

            // Cabeçalho customizado
            doc.fillColor(corCabecalho).rect(0, 0, 595.28, 86).fill();
            doc.fillColor('#00D4FF').fontSize(17).text('NZT PRODUÇÃO • RELATÓRIO OPERACIONAL', 45, 24);
            doc.fillColor('#FFFFFF').fontSize(10).text(
                `Evento: ${evento?.nome || 'Evento em produção'}  |  Tipo: ${tipo.replace(/_/g, ' ')}  |  Data ref.: ${dataRef}`,
                45,
                48
            );
            doc.fillColor('#CBD5E1').fontSize(8).text(
                `Gerado por: ${ctx?.nome || 'Sistema'} em ${new Date().toLocaleString('pt-BR')}`,
                45,
                64
            );

            doc.y = 104;
            let y = 104;

            const garantirEspaco = (alturaNecessaria = 40) => {
                if (y + alturaNecessaria > 750) {
                    doc.addPage();
                    y = 50;
                }
            };

            const escreverTituloSecao = (titulo) => {
                garantirEspaco(45);
                doc.fillColor('#0A1628').fontSize(12).text(titulo, 45, y);
                y += 16;
                doc.moveTo(45, y).lineTo(550, y).strokeColor('#00D4FF').lineWidth(1).stroke();
                y += 10;
            };

            // Resumo executivo
            const concluidas = tarefas.filter((t) => t.status === 'concluida').length;
            const emRisco = tarefas.filter((t) => t.saude_prazo === 'em_risco' || t.saude_prazo === 'atrasada').length;
            const presencas = estado?.registros_presenca || [];
            const dobras = presencas.filter((r) => r.eh_dobra_detectada).length;

            escreverTituloSecao('1. Resumo executivo da produção');
            doc.fillColor('#1E293B').fontSize(9.5);
            doc.text(`• Total de tarefas: ${tarefas.length} (${concluidas} concluídas, ${emRisco} em risco ou atrasadas)`, 45, y);
            y += 14;
            doc.text(`• Propostas de planta pendentes: ${(estado?.propostas_planta || []).filter((p) => p.status === 'pendente').length}`, 45, y);
            y += 14;
            doc.text(`• Registros de presença no evento: ${presencas.length} (${dobras} dobra(s) detectada(s))`, 45, y);
            y += 22;

            // Tarefas e etapas
            escreverTituloSecao('2. Tarefas e andamento por área');
            for (const t of tarefas) {
                garantirEspaco(48);
                const area = areasMap.get(t.area_id)?.nome || 'Geral';
                const resp = produtoresMap.get(t.produtor_atribuido_id)?.nome || 'Disponível';
                doc.fillColor('#0F172A').fontSize(10).text(`${t.titulo} [${area}]`, 45, y);
                y += 13;
                doc.fillColor('#475569').fontSize(8.5).text(
                    `Status: ${t.status} | Progresso: ${t.percentual_concluido}% | Saúde prazo: ${t.saude_prazo} | Responsável: ${resp}`,
                    55,
                    y
                );
                y += 12;
                const evidenciasCount = (t.etapas || []).reduce((acc, e) => acc + (e.evidencias?.length || 0), 0);
                if (evidenciasCount > 0) {
                    doc.fillColor('#0369A1').fontSize(8).text(`Evidências anexadas: ${evidenciasCount} registro(s) de campo`, 55, y);
                    y += 11;
                }
                y += 5;
            }

            // Materiais & IA
            if ((estado?.materiais || []).length > 0) {
                escreverTituloSecao('3. Materiais e conferência por visão computacional');
                for (const m of estado.materiais) {
                    garantirEspaco(24);
                    const div = Number(m.quantidade_recebida || 0) - Number(m.quantidade_planejada || 0);
                    doc.fillColor('#1E293B').fontSize(9).text(
                        `• ${m.nome} (${m.categoria}): Previsto ${m.quantidade_planejada} | Recebido ${m.quantidade_recebida} | Divergência: ${div >= 0 ? `+${div}` : div} | Estado: ${m.status_movimentacao}`,
                        45,
                        y
                    );
                    y += 14;
                }
                y += 8;
            }

            // Presença e Dobras
            if (presencas.length > 0) {
                escreverTituloSecao('4. Presença da equipe e controle de dobras');
                for (const p of presencas.slice(0, 20)) {
                    garantirEspaco(20);
                    const nome = produtoresMap.get(p.produtor_id)?.nome || 'Produtor';
                    const dobraTag = p.eh_dobra_detectada ? ' [DOBRA DETECTADA]' : '';
                    doc.fillColor(p.eh_dobra_detectada ? '#B45309' : '#1E293B').fontSize(8.5).text(
                        `• ${nome} — ${p.tipo} em ${new Date(p.data_hora).toLocaleString('pt-BR')} (${p.metodo})${dobraTag}`,
                        45,
                        y
                    );
                    y += 13;
                }
                y += 8;
            }

            // Seção Financeira — Restrita estritamente no servidor
            if (podeFinanceiro && (estado?.orcamentos || []).length > 0) {
                escreverTituloSecao('5. Orçamentos e custos (restrito ao financeiro)');
                let totalPrev = 0;
                let totalReal = 0;
                for (const o of estado.orcamentos) {
                    garantirEspaco(22);
                    totalPrev += Number(o.valor_previsto_centavos || 0);
                    totalReal += Number(o.valor_realizado_centavos || 0);
                    doc.fillColor('#1E293B').fontSize(9).text(
                        `• ${o.titulo} (${o.fornecedor_nome || 'Fornecedor'}): Previsto ${formatarMoeda(o.valor_previsto_centavos)} | Realizado ${formatarMoeda(o.valor_realizado_centavos)} [${o.status}]`,
                        45,
                        y
                    );
                    y += 14;
                }
                garantirEspaco(22);
                doc.fillColor('#0F172A').fontSize(9.5).text(
                    `Total consolidado: Previsto ${formatarMoeda(totalPrev)} | Realizado ${formatarMoeda(totalReal)}`,
                    45,
                    y + 4
                );
            }

            // Aplicar marca d'água e numeração de página em todas as páginas geradas
            const range = doc.bufferedPageRange();
            for (let i = range.start; i < range.start + range.count; i++) {
                doc.switchToPage(i);
                aplicarMarcaDagua(doc, marcaTexto, marcaOpacidade);
                const margemInferior = doc.page.margins.bottom;
                doc.page.margins.bottom = 0;
                doc.fillColor('#64748B').fontSize(8).text(
                    `${rodape}  •  Página ${i + 1} de ${range.count}`,
                    45,
                    800,
                    { align: 'center', width: 505, lineBreak: false }
                );
                doc.page.margins.bottom = margemInferior;
            }

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
}

module.exports = {
    gerarRelatorioPdfBuffer
};
