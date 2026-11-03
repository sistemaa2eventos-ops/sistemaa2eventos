const ExcelJS = require('exceljs');
const { supabase } = require('../../config/supabase');
const atendimento = require('./atendimento.service');

/**
 * Planilha orçamentária de um evento (Excel com fórmulas: as células amarelas são editáveis e
 * o resto recalcula). O tempo médio de atendimento vem das métricas reais do evento; sem
 * histórico, usa 60 s. Custo do operador por diária fixa.
 */
const PADROES = {
    pessoas: 3000, dias_credenciamento: 2, dias_operacao: 5, horas_dia: 10, pico_pct: 0.3,
    tempo_atendimento_seg: 60, ocupacao: atendimento.OCUPACAO, reserva_operadores: 1,
    diaria_operador: 250, alimentacao_transporte: 60, encargos_pct: 0.2,
    supervisores: 1, diaria_supervisor: 400,
    leitores_qtd: 2, leitor_dia: 80, computadores_qtd: 4, computador_dia: 60, impressoras_qtd: 1, impressora_dia: 40,
    pulseira_unit: 1.5, pulseira_reserva_pct: 0.1, etiqueta_unit: 0.5,
    impostos_pct: 0.15, margem_pct: 0.3
};

const AMARELO = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF4C2' } };
const CINZA = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF2F5' } };
const MOEDA = '"R$" #,##0.00';
const PCT = '0%';

async function montarPlanilha(eventoId, entrada = {}) {
    const { data: evento } = await supabase.from('eventos').select('nome').eq('id', eventoId).maybeSingle();
    const m = await atendimento.metricas(eventoId);
    const v = { ...PADROES };
    if (m.resumo.tempo_medio_seg) v.tempo_atendimento_seg = m.resumo.tempo_medio_seg;
    for (const [k, padrao] of Object.entries(PADROES)) {
        if (entrada[k] !== undefined && entrada[k] !== '' && !Number.isNaN(Number(entrada[k]))) v[k] = Number(entrada[k]);
        else if (padrao === undefined) delete v[k];
    }

    const wb = new ExcelJS.Workbook();
    wb.creator = 'NZT Intelligent Control System';
    const ws = wb.addWorksheet('Orçamento', { views: [{ showGridLines: false }] });
    ws.columns = [{ width: 52 }, { width: 18 }, { width: 46 }];
    ws.addRow([`Orçamento de credenciamento — ${evento?.nome || 'Evento'}`]).font = { bold: true, size: 14 };
    ws.addRow(['Células amarelas: edite à vontade. O resto recalcula sozinho.']).font = { italic: true, color: { argb: 'FF666666' } };
    ws.addRow([]);

    const celula = {}; // chave → endereço (ex.: B5)
    const secao = (titulo) => { const r = ws.addRow([titulo]); r.font = { bold: true }; r.getCell(1).fill = CINZA; r.getCell(2).fill = CINZA; r.getCell(3).fill = CINZA; };
    const entradaLinha = (chave, rotulo, nota, fmt) => {
        const r = ws.addRow([rotulo, v[chave], nota || '']);
        r.getCell(2).fill = AMARELO;
        if (fmt) r.getCell(2).numFmt = fmt;
        r.getCell(3).font = { color: { argb: 'FF777777' }, size: 9 };
        celula[chave] = `B${r.number}`;
    };
    const formula = (chave, rotulo, f, fmt, destaque) => {
        const expr = f.replace(/\{(\w+)\}/g, (_, k) => celula[k]);
        const r = ws.addRow([rotulo, { formula: expr }]);
        if (fmt) r.getCell(2).numFmt = fmt;
        if (destaque) { r.font = { bold: true }; r.getCell(2).font = { bold: true, size: 12 }; }
        celula[chave] = `B${r.number}`;
    };

    secao('Volume');
    entradaLinha('pessoas', 'Pessoas a credenciar', 'Funcionários previstos no evento');
    entradaLinha('dias_credenciamento', 'Dias de credenciamento', 'Dias em que as pessoas chegam para se credenciar');
    entradaLinha('dias_operacao', 'Dias de operação (equipe contratada)', 'Montagem + evento + desmontagem');
    entradaLinha('horas_dia', 'Horas de atendimento por dia');
    entradaLinha('pico_pct', 'Pessoas que chegam na hora de pico', 'Parte das pessoas do dia que chega na hora mais cheia', PCT);

    secao('Produtividade (dos seus eventos)');
    entradaLinha('tempo_atendimento_seg', 'Tempo médio por atendimento (segundos)', m.resumo.tempo_medio_seg ? `Medido nos atendimentos deste evento (${m.resumo.atendimentos})` : 'Sem histórico: valor de referência');
    entradaLinha('ocupacao', 'Ocupação do operador', 'Parte do tempo atendendo (o resto: pausas, dúvidas)', PCT);
    entradaLinha('reserva_operadores', 'Operadores de reserva por dia', 'Folga para faltas e intervalos');

    secao('Dimensionamento');
    formula('por_dia', 'Pessoas por dia de credenciamento', '{pessoas}/{dias_credenciamento}', '#,##0');
    formula('pico_hora', 'Pessoas na hora de pico', '{por_dia}*{pico_pct}', '#,##0');
    formula('op_pico', 'Operadores para o pico (sem fila)', 'ROUNDUP({pico_hora}*{tempo_atendimento_seg}/3600/{ocupacao},0)', '0');
    formula('op_volume', 'Operadores para o volume do dia', 'ROUNDUP({por_dia}*{tempo_atendimento_seg}/({horas_dia}*3600*{ocupacao}),0)', '0');
    formula('operadores', 'Operadores necessários', 'MAX({op_pico},{op_volume})+{reserva_operadores}', '0', true);

    secao('Equipe');
    entradaLinha('diaria_operador', 'Diária do operador', null, MOEDA);
    entradaLinha('alimentacao_transporte', 'Alimentação + transporte por operador/dia', null, MOEDA);
    entradaLinha('encargos_pct', 'Encargos sobre a diária', 'Impostos e encargos do contrato do operador', PCT);
    entradaLinha('supervisores', 'Supervisores');
    entradaLinha('diaria_supervisor', 'Diária do supervisor', null, MOEDA);
    formula('custo_op_dia', 'Custo de um operador por dia', '{diaria_operador}*(1+{encargos_pct})+{alimentacao_transporte}', MOEDA);
    formula('custo_equipe', 'Custo da equipe no evento', '{operadores}*{dias_operacao}*{custo_op_dia}+{supervisores}*{dias_operacao}*({diaria_supervisor}*(1+{encargos_pct})+{alimentacao_transporte})', MOEDA);

    secao('Equipamentos (por dia)');
    entradaLinha('leitores_qtd', 'Leitores faciais (quantidade)');
    entradaLinha('leitor_dia', 'Leitor facial: custo por dia', 'Aluguel ou depreciação', MOEDA);
    entradaLinha('computadores_qtd', 'Computadores de atendimento');
    entradaLinha('computador_dia', 'Computador: custo por dia', null, MOEDA);
    entradaLinha('impressoras_qtd', 'Impressoras de etiqueta');
    entradaLinha('impressora_dia', 'Impressora: custo por dia', null, MOEDA);
    formula('custo_equip', 'Custo de equipamentos no evento', '{dias_operacao}*({leitores_qtd}*{leitor_dia}+{computadores_qtd}*{computador_dia}+{impressoras_qtd}*{impressora_dia})', MOEDA);

    secao('Materiais');
    entradaLinha('pulseira_unit', 'Pulseira: custo unitário', null, MOEDA);
    entradaLinha('pulseira_reserva_pct', 'Pulseiras de reserva', 'Perdas e trocas', PCT);
    entradaLinha('etiqueta_unit', 'Etiqueta/crachá: custo unitário', null, MOEDA);
    formula('custo_mat', 'Custo de materiais', '{pessoas}*(1+{pulseira_reserva_pct})*{pulseira_unit}+{pessoas}*{etiqueta_unit}', MOEDA);

    secao('Preço');
    formula('custo_total', 'Custo total', '{custo_equipe}+{custo_equip}+{custo_mat}', MOEDA, true);
    entradaLinha('impostos_pct', 'Impostos sobre o faturamento', null, PCT);
    entradaLinha('margem_pct', 'Margem desejada', null, PCT);
    formula('preco', 'Preço sugerido', '{custo_total}/(1-{impostos_pct}-{margem_pct})', MOEDA, true);
    formula('custo_pessoa', 'Custo por pessoa credenciada', '{custo_total}/{pessoas}', MOEDA);
    formula('preco_pessoa', 'Preço por pessoa credenciada', '{preco}/{pessoas}', MOEDA, true);
    formula('lucro', 'Lucro estimado', '{preco}*{margem_pct}', MOEDA);

    // Aba de referência: como cada operador rendeu neste evento
    const h = wb.addWorksheet('Histórico do evento');
    h.columns = [{ header: 'Operador', width: 36 }, { header: 'Atendimentos', width: 14 }, { header: 'Tempo médio (s)', width: 16 }, { header: 'Mediana (s)', width: 13 }, { header: 'Por hora', width: 11 }, { header: 'Fonte', width: 12 }];
    h.getRow(1).font = { bold: true };
    for (const o of m.por_operador) h.addRow([o.operador, o.atendimentos, o.tempo_medio_seg, o.mediana_seg, o.por_hora, o.fonte]);
    h.addRow([]);
    h.addRow([m.diagnostico.texto]).font = { italic: true };

    return wb;
}

module.exports = { montarPlanilha, PADROES };
