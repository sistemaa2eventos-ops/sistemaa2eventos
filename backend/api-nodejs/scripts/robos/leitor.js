#!/usr/bin/env node
/**
 * Robô Leitor: imita um leitor facial Intelbras em modo online.
 * Manda o keepalive e o "rosto reconhecido" no formato do firmware e confere a decisão:
 *   pessoa aprovada → libera; segunda passagem → libera (saída); CPF de fora → nega;
 *   evento sem UserID → nega; alarme do aparelho (ChassisIntruded) → só confirma.
 *
 * Uso: node scripts/robos/leitor.js
 * Cria e apaga uma pessoa de teste pelo painel (precisa de ROBO_EMAIL/ROBO_SENHA).
 */
const { cfg, exigir, chamar, login, gerarCpf, criarPlacar } = require('./comum');

let idEvento = 1000;
/** Corpo igual ao que o SS 5541/5530 envia em /api/intelbras/online */
function passagem(userId, extra = {}) {
    idEvento++;
    return {
        id: idEvento,
        Events: [{ Code: 'AccessControl', Data: { UserID: userId, Similarity: 93, ErrorCode: 0, Method: 15, ...extra } }]
    };
}

const online = (token, corpo) => chamar('POST', `/api/intelbras/online?token=${encodeURIComponent(token)}`, { corpo, base: cfg.leitor, headers: { 'x-evento-id': '' } });
const liberou = (r) => r.status === 200 && r.json?.auth === 'true';
const negou = (r) => r.status === 200 && r.json?.auth === 'false';

(async () => {
    exigir('email', 'senha', 'eventoId', 'empresaId', 'tokenAcesso');
    const p = criarPlacar('Robô Leitor (modo online Intelbras)');

    // Keepalive: o leitor avisa que está vivo
    const ka = await chamar('GET', `/api/intelbras/keepalive?token=${encodeURIComponent(cfg.tokenAcesso)}`, { base: cfg.leitor });
    p.ok(ka.status === 200, 'keepalive aceito', ka);

    const token = await login();
    const cpf = gerarCpf();
    const nova = await chamar('POST', '/api/pessoas', {
        token, corpo: { nome_completo: `ROBO LEITOR ${Date.now().toString(36).slice(-4).toUpperCase()}`, cpf, empresa_id: cfg.empresaId, funcao: 'Teste automatizado' }
    });
    const pessoa = nova.json?.data;
    if (!p.ok(nova.status === 201 && pessoa?.id, 'cria pessoa de teste', nova)) return p.fim();

    try {
        // Antes de aprovar: o leitor deve negar
        const pendente = await online(cfg.tokenAcesso, passagem(cpf));
        p.ok(negou(pendente), 'pessoa ainda não aprovada → NEGA', pendente);

        const a = await chamar('POST', `/api/pessoas/${pessoa.id}/approve`, { token, corpo: {} });
        p.ok(a.status === 200, 'aprova a pessoa pelo painel', a);

        const entrada = await online(cfg.tokenAcesso, passagem(cpf));
        p.ok(liberou(entrada), `1ª passagem (entrada) → LIBERA  "${entrada.json?.message || ''}"`, entrada);
        p.ok(String(entrada.json?.id) === String(idEvento), 'resposta devolve o mesmo id do evento (exigência do firmware novo)', entrada);

        const saida = await online(cfg.tokenAcesso, passagem(cpf));
        p.ok(saida.status === 200 && saida.json?.auth !== undefined, `2ª passagem (saída ou anti-passback) → responde  "${saida.json?.message || ''}"`, saida);

        const estranho = await online(cfg.tokenAcesso, passagem(gerarCpf()));
        p.ok(negou(estranho), 'CPF que não está no evento → NEGA', estranho);

        const semId = await online(cfg.tokenAcesso, { id: ++idEvento, Events: [{ Code: 'AccessControl', Data: { ErrorCode: 0 } }] });
        p.ok(negou(semId), 'rosto desconhecido (sem UserID) → NEGA', semId);

        const alarme = await online(cfg.tokenAcesso, { id: ++idEvento, Events: [{ Code: 'ChassisIntruded', Data: {} }] });
        p.ok(liberou(alarme), 'alarme do aparelho (tampa aberta) → só confirma', alarme);

        const tokenErrado = await online('token-invalido-robo', passagem(cpf));
        p.ok(negou(tokenErrado), 'leitor desconhecido (token errado) → NEGA', tokenErrado);

        if (cfg.tokenCredenciamento) {
            const cred = await online(cfg.tokenCredenciamento, passagem(cpf));
            p.ok(liberou(cred), 'leitor de credenciamento identifica (abre o modal do operador)', cred);
        }

        // Tempo de resposta: o leitor espera poucos segundos antes de negar sozinho
        const tempos = [];
        for (let i = 0; i < 10; i++) tempos.push((await online(cfg.tokenAcesso, passagem(gerarCpf()))).ms);
        tempos.sort((x, y) => x - y);
        const p95 = tempos[Math.ceil(tempos.length * 0.95) - 1];
        p.ok(p95 < 2000, `tempo de decisão: mediana ${Math.round(tempos[5])} ms, pior ${Math.round(p95)} ms (limite 2000 ms)`);
    } finally {
        const d = await chamar('DELETE', `/api/pessoas/${pessoa.id}`, { token });
        p.ok(d.status === 200 || d.status === 204, 'apaga a pessoa de teste', d);
        p.fim();
    }
})();
