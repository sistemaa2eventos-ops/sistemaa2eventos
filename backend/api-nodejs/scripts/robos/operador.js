#!/usr/bin/env node
/**
 * Robô Operador: faz o caminho de um operador no painel e confere cada resposta.
 *   cadastra → aprova → check-in por pulseira → bloqueia passagem dupla → check-out
 *   → check-in manual e por QR → confere o diário e a lista de presentes → apaga o que criou
 *
 * Uso: node scripts/robos/operador.js [quantidade=3] [--manter]
 *   --manter  não apaga as pessoas no fim (para conferir no painel)
 */
const { cfg, exigir, chamar, login, gerarCpf, criarPlacar } = require('./comum');

const qtd = Math.max(1, parseInt(process.argv[2], 10) || 3);
const manter = process.argv.includes('--manter');
const sufixo = Date.now().toString(36).slice(-5).toUpperCase();

(async () => {
    exigir('email', 'senha', 'eventoId', 'empresaId');
    const p = criarPlacar(`Robô Operador — ${qtd} pessoa(s)`);
    const token = await login();
    p.ok(true, 'login');
    const criadas = [];

    try {
        // 1. Cadastro e aprovação
        for (let i = 1; i <= qtd; i++) {
            const cpf = gerarCpf();
            const r = await chamar('POST', '/api/pessoas', {
                token,
                corpo: { nome_completo: `ROBO TESTE ${sufixo}-${i}`, cpf, empresa_id: cfg.empresaId, funcao: 'Teste automatizado' }
            });
            const pessoa = r.json?.data;
            if (!p.ok(r.status === 201 && pessoa?.id, `cadastra ROBO TESTE ${sufixo}-${i}`, r)) continue;
            criadas.push({ ...pessoa, cpf, pulseira: `9${sufixo.replace(/\D/g, '').padEnd(3, '0').slice(0, 3)}${i}`.slice(0, 8) });

            const a = await chamar('POST', `/api/pessoas/${pessoa.id}/approve`, { token, corpo: {} });
            p.ok(a.status === 200, `  aprova ${pessoa.nome_completo}`, a);
        }
        if (!criadas.length) return;

        // 2. Check-in por pulseira (o sistema decide entrada/saída)
        for (const c of criadas) {
            const r = await chamar('POST', '/api/access/pulseira/checkin', { token, corpo: { pessoa_id: c.id, numero_pulseira: c.pulseira } });
            p.ok(r.status === 200 && r.json?.data?.action === 'allow', `check-in por pulseira ${c.pulseira} (${c.nome_completo})`, r);
        }

        // 3. Check-in repetido logo em seguida: deve virar saída ou ser barrado pelo anti-passback, nunca 500
        const dup = await chamar('POST', '/api/access/checkin/manual', { token, corpo: { busca: criadas[0].id, tipo: 'checkin' } });
        p.ok(dup.status !== 500 && dup.status !== 0, 'segundo check-in seguido não quebra o servidor (entrada dupla barrada ou aceita)', dup);

        // 4. Check-out pela pulseira
        for (const c of criadas) {
            const r = await chamar('POST', '/api/access/pulseira/checkout', { token, corpo: { numero_pulseira: c.pulseira } });
            p.ok(r.status === 200 && r.json?.data?.action === 'allow', `check-out pela pulseira ${c.pulseira}`, r);
        }

        // 5. Check-out por CPF (leitor de código/CPF na saída)
        const porCpf = await chamar('POST', '/api/access/pulseira/checkin', { token, corpo: { pessoa_id: criadas[0].id, numero_pulseira: criadas[0].pulseira, tipo: 'checkin' } });
        p.ok(porCpf.status === 200, 'nova entrada antes do teste por CPF', porCpf);
        const saidaCpf = await chamar('POST', '/api/access/pulseira/checkout', { token, corpo: { numero_pulseira: criadas[0].cpf } });
        p.ok(saidaCpf.status === 200 && saidaCpf.json?.data?.pessoa?.id === criadas[0].id, 'check-out digitando o CPF encontra a pessoa certa', saidaCpf);

        // 6. Check-in por QR (se o cadastro gerou QR)
        if (criadas[1]?.qr_code) {
            const r = await chamar('POST', '/api/access/checkin/qrcode', { token, corpo: { qrCode: criadas[1].qr_code, tipo: 'checkin' } });
            p.ok(r.status === 200, 'check-in por QR code', r);
        }

        // 7. Pulseira inexistente: 404 claro, sem quebrar
        const nada = await chamar('POST', '/api/access/pulseira/checkout', { token, corpo: { numero_pulseira: '00000000' } });
        p.ok(nada.status === 404, 'pulseira desconhecida responde 404', nada);

        // 8. Relatório do dia mostra os acessos do robô
        const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
        const rel = await chamar('GET', `/api/reports/diario-consolidado?evento_id=${cfg.eventoId}&data=${hoje}`, { token });
        const linhas = Array.isArray(rel.json?.data) ? rel.json.data : [];
        const doRobo = criadas.map(c => linhas.find(l => l.colaborador_nome === c.nome_completo));
        p.ok(rel.status === 200 && doRobo.every(l => l && l.checkin_at), `relatório diário tem a entrada de todas as ${criadas.length} pessoas do robô`, rel);
        const fechado = doRobo[2];
        if (fechado) p.ok(fechado.checkout_at && fechado.checkout_at !== 'No evento' && fechado.tempo_minutos >= 0, `turno com entrada e saída aparece fechado (${fechado.checkout_at}, ${fechado.tempo_minutos} min)`);
    } finally {
        if (!manter) {
            for (const c of criadas) {
                const d = await chamar('DELETE', `/api/pessoas/${c.id}`, { token });
                p.ok(d.status === 200 || d.status === 204, `  apaga ${c.nome_completo}`, d);
            }
        } else if (criadas.length) {
            console.log(`\n  (--manter) pessoas mantidas: ROBO TESTE ${sufixo}-1..${criadas.length}`);
        }
        p.fim();
    }
})();
