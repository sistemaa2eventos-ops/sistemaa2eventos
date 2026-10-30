#!/usr/bin/env node
/**
 * Teste de estresse no evento de teste.
 *   1. cadastro: N pessoas (cadastro + aprovação) com C requisições em paralelo, num login só
 *   2. leitores: passagens no modo online em degraus de concorrência (sem limite de taxa,
 *      mesma validação de um check-in), por D segundos cada
 *   3. limite por login: rajada de leituras para ver onde entra o 429
 * Para no primeiro degrau com mais de 5% de erro ou p95 acima de 3 s.
 *
 * Uso: node scripts/robos/estresse.js [pessoas=200] [segundos=45] [saida.json]
 */
const fs = require('fs');
const { cfg, exigir, chamar, login, gerarCpf } = require('./comum');

const N = parseInt(process.argv[2], 10) || 200;
const D = (parseInt(process.argv[3], 10) || 45) * 1000;
const saida = process.argv[4];
const DEGRAUS = [5, 10, 25, 50, 100];

function resumo(amostras, ms) {
    const t = amostras.map(a => a.ms).sort((x, y) => x - y);
    const q = (f) => t.length ? Math.round(t[Math.min(t.length - 1, Math.ceil(t.length * f) - 1)]) : null;
    const erros = amostras.filter(a => !a.ok).length;
    const porStatus = {};
    for (const a of amostras) porStatus[a.status] = (porStatus[a.status] || 0) + 1;
    return { total: amostras.length, por_segundo: +(amostras.length / (ms / 1000)).toFixed(1), erros, pct_erro: +(100 * erros / Math.max(1, amostras.length)).toFixed(1), p50: q(0.5), p95: q(0.95), p99: q(0.99), max: q(1), status: porStatus };
}

async function emParalelo(itens, c, fn) {
    let i = 0;
    await Promise.all(Array.from({ length: c }, async () => { while (i < itens.length) await fn(itens[i++]); }));
}

(async () => {
    exigir('email', 'senha', 'eventoId', 'empresaId', 'tokenAcesso');
    const token = await login();
    const relatorio = { inicio: new Date().toISOString(), api: cfg.api, leitor: cfg.leitor, fases: {} };
    const log = (m) => console.log(`[${new Date().toLocaleTimeString('pt-BR')}] ${m}`);

    // 1. Cadastro + aprovação
    log(`cadastro: ${N} pessoas, 6 em paralelo`);
    const pessoas = [], amostrasCad = [], amostrasApr = [];
    const t0 = Date.now();
    await emParalelo(Array.from({ length: N }, (_, i) => i), 6, async (i) => {
        const cpf = gerarCpf();
        const r = await chamar('POST', '/api/pessoas', { token, corpo: { nome_completo: `ROBO CARGA ${i + 1}`, cpf, empresa_id: cfg.empresaId, funcao: 'Carga' } });
        amostrasCad.push({ ms: r.ms, status: r.status, ok: r.status === 201 });
        const id = r.json?.data?.id;
        if (!id) return;
        const a = await chamar('POST', `/api/pessoas/${id}/approve`, { token, corpo: {} });
        amostrasApr.push({ ms: a.ms, status: a.status, ok: a.status === 200 });
        if (a.status === 200) pessoas.push(cpf);
    });
    const msCad = Date.now() - t0;
    relatorio.fases.cadastro = { ...resumo(amostrasCad, msCad), aprovacao: resumo(amostrasApr, msCad), pessoas_prontas: pessoas.length, segundos: Math.round(msCad / 1000), cadastros_por_minuto: Math.round(pessoas.length / (msCad / 60000)) };
    log(`cadastro: ${JSON.stringify(relatorio.fases.cadastro)}`);
    if (pessoas.length < 10) { log('poucas pessoas prontas, abortando'); return fim(); }

    // 2. Leitores em degraus
    relatorio.fases.leitores = [];
    let idEv = 1;
    for (const c of DEGRAUS) {
        log(`leitores: ${c} passagens simultâneas por ${D / 1000}s`);
        const amostras = [], ate = Date.now() + D, ini = Date.now();
        let liberados = 0;
        await Promise.all(Array.from({ length: c }, async () => {
            while (Date.now() < ate) {
                const cpf = pessoas[Math.floor(Math.random() * pessoas.length)];
                const r = await chamar('POST', `/api/intelbras/online?token=${cfg.tokenAcesso}`, {
                    base: cfg.leitor, corpo: { id: idEv++, Events: [{ Code: 'AccessControl', Data: { UserID: cpf, Similarity: 93, ErrorCode: 0 } }] }
                });
                // Para o leitor, resposta acima de 3 s é falha (ele nega sozinho)
                const ok = r.status === 200 && (r.json?.auth === 'true' || r.json?.auth === 'false') && r.ms < 3000;
                if (r.json?.auth === 'true') liberados++;
                amostras.push({ ms: r.ms, status: r.status, ok });
            }
        }));
        const res = { concorrencia: c, ...resumo(amostras, Date.now() - ini), liberados };
        relatorio.fases.leitores.push(res);
        log(`  → ${JSON.stringify(res)}`);
        if (res.pct_erro > 5 || res.p95 > 3000) { log('  degradação: parando a subida'); break; }
        await new Promise(r => setTimeout(r, 10000)); // respiro entre degraus
    }

    // 3. Limite por login (painel): 400 leituras leves, 20 em paralelo
    log('limite por login: 400 leituras com o mesmo usuário');
    const amostrasLim = [], tl = Date.now();
    await emParalelo(Array.from({ length: 400 }), 20, async () => {
        const r = await chamar('GET', '/api/pessoas?limit=1', { token });
        amostrasLim.push({ ms: r.ms, status: r.status, ok: r.status === 200 });
    });
    relatorio.fases.limite_login = resumo(amostrasLim, Date.now() - tl);
    log(`  → ${JSON.stringify(relatorio.fases.limite_login)}`);

    fim();
    function fim() {
        relatorio.fim = new Date().toISOString();
        if (saida) fs.writeFileSync(saida, JSON.stringify(relatorio, null, 1));
        log('fim');
    }
})();
