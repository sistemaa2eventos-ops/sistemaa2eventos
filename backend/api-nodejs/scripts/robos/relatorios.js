#!/usr/bin/env node
/**
 * Robô Relatórios: abre cada relatório e cada exportação do evento de teste, mede o tempo,
 * confere o tipo do arquivo (Excel/PDF) e se os totais batem entre as telas.
 * Rode depois do operador/leitor/estresse para ter volume.
 *
 * Uso: node scripts/robos/relatorios.js [data=hoje]
 */
const { cfg, exigir, chamar, login, criarPlacar } = require('./comum');

const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const dia = process.argv[2] || hoje;
const periodo = `data_inicio=${dia}&data_fim=${dia}`;

async function baixar(rota, token) {
    const inicio = performance.now();
    const r = await fetch(cfg.api + rota, { headers: { Authorization: `Bearer ${token}`, 'x-evento-id': cfg.eventoId } });
    const buf = Buffer.from(await r.arrayBuffer());
    const assinatura = buf.subarray(0, 4).toString('latin1');
    const tipo = assinatura.startsWith('PK') ? 'xlsx' : assinatura.startsWith('%PDF') ? 'pdf' : 'outro';
    return { status: r.status, ms: performance.now() - inicio, tipo, kb: Math.round(buf.length / 1024), texto: tipo === 'outro' ? buf.toString('utf8', 0, 200) : '' };
}

(async () => {
    exigir('email', 'senha', 'eventoId');
    const p = criarPlacar(`Robô Relatórios — dia ${dia}`);
    const token = await login();
    const get = (rota) => chamar('GET', rota, { token });
    const lento = (r) => r.ms > 5000 ? ' ⚠ lento' : '';

    const telas = {
        'Diário consolidado': `/api/reports/diario-consolidado?data=${dia}`,
        'Logs do dia': `/api/reports/daily?${periodo}&limit=100`,
        'Por área': `/api/reports/por-area?${periodo}`,
        'Por empresa': `/api/reports/por-empresa?${periodo}`,
        'Por leitor': `/api/reports/por-leitor?${periodo}`,
        'Por função': `/api/reports/por-funcao?${periodo}`,
        'Por status': `/api/reports/por-status?${periodo}`,
        'Ponto': `/api/reports/ponto?${periodo}`,
        'Ponto (resumo)': `/api/reports/ponto-resumo?${periodo}`,
        'Fechamento do período': `/api/reports/fechamento-periodo?${periodo}`,
        'Resumo por empresa': `/api/reports/company-summary?${periodo}`,
        'Ranking': `/api/reports/ranking?${periodo}`,
        'Fechamentos diários': '/api/reports/fechamentos-diarios',
        'Histórico de pulseiras': `/api/pulseiras/historico?${periodo}`,
        'Dashboard: operação de hoje': '/api/monitor/dashboard/operacao'
    };
    const res = {};
    for (const [nome, rota] of Object.entries(telas)) {
        const r = await get(rota);
        res[nome] = r;
        p.ok(r.status === 200 && r.json?.success !== false, `${nome}${lento(r)}`, r);
    }

    // Coerência entre telas
    const diario = res['Diário consolidado'].json;
    const linhasDiario = Array.isArray(diario?.data) ? diario.data : [];
    console.log(`\n  diário: ${linhasDiario.length} turno(s); totais ${JSON.stringify(diario?.totais || {})}`);
    const porEmpresa = res['Por empresa'].json?.data;
    const entradasEmpresa = Array.isArray(porEmpresa) ? porEmpresa.reduce((s, e) => s + (e.checkins || e.entradas || 0), 0) : null;
    const op = res['Dashboard: operação de hoje'].json?.data;
    if (dia === hoje && op && entradasEmpresa !== null) {
        p.ok(op.entradas_hoje === entradasEmpresa, `entradas de hoje: Dashboard ${op.entradas_hoje} = Por empresa ${entradasEmpresa}`);
    }
    const fech = res['Fechamento do período'].json?.data;
    if (fech?.pessoas && linhasDiario.length) {
        const pessoasDiario = new Set(linhasDiario.map(l => l.cpf)).size;
        p.ok(fech.pessoas.length === pessoasDiario, `pessoas: Fechamento ${fech.pessoas.length} = Diário ${pessoasDiario}`);
    }
    const semNegativo = linhasDiario.every(l => !(l.tempo_minutos < 0));
    p.ok(semNegativo, 'nenhum turno com horas negativas');

    // Exportações
    console.log('');
    const arquivos = {
        'Diário (Excel)': [`/api/reports/diario-consolidado/xlsx?data=${dia}`, 'xlsx'],
        'Diário (PDF)': [`/api/reports/diario-consolidado/pdf?data=${dia}`, 'pdf'],
        'Fechamento (Excel)': [`/api/reports/fechamento-periodo/xlsx?${periodo}`, 'xlsx'],
        'Lista de presença (PDF)': [`/api/reports/attendance-pdf?${periodo}`, 'pdf']
    };
    for (const aba of ['logs', 'ponto', 'area', 'empresa', 'leitor', 'funcao', 'status', 'pulseiras']) {
        arquivos[`Aba ${aba} (Excel)`] = [`/api/reports/exportar-aba-xlsx?aba=${aba}&${periodo}`, 'xlsx'];
        arquivos[`Aba ${aba} (PDF)`] = [`/api/reports/exportar-aba-pdf?aba=${aba}&${periodo}`, 'pdf'];
    }
    for (const [nome, [rota, esperado]] of Object.entries(arquivos)) {
        const r = await baixar(rota, token);
        p.ok(r.status === 200 && r.tipo === esperado, `${nome}: ${r.tipo} ${r.kb} KB${lento(r)}`, r);
    }
    p.fim();
})();
