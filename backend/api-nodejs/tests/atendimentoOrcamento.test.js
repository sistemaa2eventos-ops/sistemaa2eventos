/**
 * Métricas de atendimento (estimativa pelo intervalo entre atendimentos) e planilha orçamentária
 * (as fórmulas do Excel, calculadas aqui, dão o dimensionamento esperado).
 */
jest.mock('../src/services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../src/config/supabase', () => {
    const q = {
        select: () => q, eq: () => q, in: () => q, not: () => q, gte: () => q, lte: () => q, order: () => q,
        range: async () => ({ data: [], error: null }),
        maybeSingle: async () => ({ data: { nome: 'Show X' }, error: null }),
        then: (ok) => ok({ data: [], error: null })
    };
    return { supabase: { from: () => q } };
});

const atendimento = require('../src/modules/reports/atendimento.service');
const { montarPlanilha } = require('../src/modules/reports/orcamento.service');

it('estimativa: intervalos de até 15 min entre atendimentos do mesmo operador; pausa longa não conta', () => {
    const t0 = new Date('2026-11-10T12:00:00Z').getTime();
    const em = (min) => new Date(t0 + min * 60000);
    const amostras = atendimento.estimar([
        { operador_id: 'a', em: em(0), tipo: 'cadastro' },
        { operador_id: 'a', em: em(1), tipo: 'cadastro' },   // 60 s
        { operador_id: 'a', em: em(2.5), tipo: 'cadastro' }, // 90 s
        { operador_id: 'a', em: em(40), tipo: 'cadastro' },  // pausa: fora
        { operador_id: 'b', em: em(1), tipo: 'credenciamento' }
    ]);
    expect(amostras.map(a => a.duracao_seg).sort()).toEqual([60, 90]);
    expect(amostras.every(a => a.fonte === 'estimado' && a.operador_id === 'a')).toBe(true);
});

it('operadores para o pico: 450 pessoas/h × 60 s ÷ 85% = 9', () => {
    expect(atendimento.operadoresNecessarios(450, 60)).toBe(9);
    expect(atendimento.operadoresNecessarios(0, 60)).toBeNull();
});

/** Calcula as fórmulas simples da planilha (refs Bn, + - * /, ROUNDUP, MAX). */
function calcular(ws) {
    const valores = {};
    ws.eachRow((row) => {
        const c = row.getCell(2);
        const v = c.value;
        if (v && typeof v === 'object' && v.formula) {
            let expr = v.formula
                .replace(/ROUNDUP\(([^,]+),0\)/g, 'Math.ceil($1 - 1e-9)')
                .replace(/MAX\(/g, 'Math.max(')
                .replace(/B(\d+)/g, (_, n) => `(${valores[`B${n}`]})`);
            valores[c.address] = Function(`return ${expr}`)();
        } else if (typeof v === 'number') {
            valores[c.address] = v;
        }
    });
    const porRotulo = {};
    ws.eachRow((row) => { porRotulo[row.getCell(1).value] = valores[row.getCell(2).address]; });
    return porRotulo;
}

it('planilha: dimensiona operadores, custo e preço pelas fórmulas', async () => {
    const wb = await montarPlanilha('e1', { pessoas: 3000, dias_credenciamento: 2, pico_pct: 0.3, tempo_atendimento_seg: 60, reserva_operadores: 1 });
    const r = calcular(wb.getWorksheet('Orçamento'));
    expect(r['Pessoas na hora de pico']).toBeCloseTo(450);
    expect(r['Operadores para o pico (sem fila)']).toBe(9);
    expect(r['Operadores necessários']).toBe(10);
    // 10 operadores × 5 dias × (250×1,2 + 60) + supervisor 5 × (400×1,2 + 60)
    expect(r['Custo da equipe no evento']).toBeCloseTo(10 * 5 * 360 + 5 * 540);
    expect(r['Preço sugerido']).toBeCloseTo(r['Custo total'] / (1 - 0.15 - 0.3));
    expect(r['Preço por pessoa credenciada']).toBeCloseTo(r['Preço sugerido'] / 3000);
});
