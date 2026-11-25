'use strict';
/**
 * Central de Monitoramento local: acesso por chave, proteção de Host, sessões e marcação da watchlist.
 * Rodar: npm test (em backend/agent-local). Não usa câmera nem motor: o vídeo e o motor são simulados.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'central-teste-'));
const CHAVE = 'k'.repeat(48);
fs.writeFileSync(path.join(pasta, 'chave'), CHAVE);
process.env.CENTRAL_CHAVE_ARQ = path.join(pasta, 'chave');
process.env.CENTRAL_ALVOS_ARQ = path.join(pasta, 'alvos.json');
process.env.CENTRAL_OPERADORES_ARQ = path.join(pasta, 'operadores.json');
process.env.CENTRAL_AUDITORIA_ARQ = path.join(pasta, 'auditoria.json');

// Vídeo simulado: só a câmera "cam1" existe
const senhasTapo = [];
const videoPath = require.resolve('../src/video');
require.cache[videoPath] = {
    id: videoPath, filename: videoPath, loaded: true, exports: {
        conhece: (id) => id === 'cam1',
        status: () => ({ disponivel: true, pronto: true }),
        abrirWebrtc: async (id, q, sdp) => `v=0\r\nresposta-${q}-${sdp.length}`,
        definirSenhaTapo: async (id, senha) => { senhasTapo.push([id, senha]); }
    }
};
const central = require('../src/central');

// Motor simulado: uma pessoa reconhecida na cam1
const pessoa = { id: 'p-alvo', nome: 'Fulano', similarity: 0.91, bloqueado: false, status_acesso: 'liberado' };
const fetchIa = async (caminho) => {
    if (caminho.startsWith('/api/track/lote')) {
        return new Response(JSON.stringify({ cameras: { cam1: { conectada: true, ia_ms: 12, results: [{ track_id: 1, bbox_n: [0.1, 0.1, 0.2, 0.2], quality_status: 'optimal', matched_person: pessoa, face_crop_base64: 'x' }] } } }), { status: 200 });
    }
    return new Response('{}', { status: 404 });
};

let servidor;
let porta;
before(async () => {
    servidor = http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://127.0.0.1');
        if (!(await central.tratar(req, res, url))) { res.statusCode = 404; res.end(); }
    });
    await new Promise(ok => servidor.listen(0, '127.0.0.1', ok));
    porta = servidor.address().port;
    central.iniciar({ log: () => {}, fetchIa, porta, soLocal: true });
    central.configurarCameras([{ id: 'cam1', nome: 'Portaria', ia_ativa: true }, { id: 'fora', nome: 'Fora do retransmissor' }]);
});
after(() => { servidor.close(); fs.rmSync(pasta, { recursive: true, force: true }); });

function pedir(caminho, { metodo = 'GET', cookie, host, corpo, tipo } = {}) {
    return new Promise((ok, falha) => {
        const req = http.request({
            host: '127.0.0.1', port: porta, path: caminho, method: metodo,
            headers: { Host: host || `127.0.0.1:${porta}`, ...(cookie ? { Cookie: cookie } : {}), ...(tipo ? { 'Content-Type': tipo } : {}) }
        }, (res) => {
            let dados = '';
            res.on('data', d => { dados += d; });
            res.on('end', () => ok({ status: res.statusCode, headers: res.headers, corpo: dados }));
        });
        req.on('error', falha);
        if (corpo) req.write(corpo);
        req.end();
    });
}

async function entrar() {
    const r = await pedir(`/central/entrar?chave=${CHAVE}`);
    assert.strictEqual(r.status, 303);
    return String(r.headers['set-cookie'][0]).split(';')[0];
}

test('sem sessão: página manda para a entrada e a API recusa', async () => {
    assert.strictEqual((await pedir('/central/')).status, 303);
    assert.strictEqual((await pedir('/central/api/estado')).status, 401);
    assert.strictEqual((await pedir('/central/api/camera/cam1/webrtc', { metodo: 'POST', corpo: 'v=0' })).status, 401);
});

test('chave errada não entra; certa vira cookie HttpOnly e SameSite=Strict', async () => {
    const errada = await pedir('/central/entrar?chave=errada');
    assert.strictEqual(errada.status, 401);
    assert.ok(!errada.headers['set-cookie']);
    const certa = await pedir(`/central/entrar?chave=${CHAVE}`);
    assert.strictEqual(certa.status, 303);
    assert.strictEqual(certa.headers.location, '/central/');
    assert.match(certa.headers['set-cookie'][0], /HttpOnly; SameSite=Strict; Path=\/central/);
});

test('entrada também pelo formulário (POST)', async () => {
    const r = await pedir('/central/entrar', { metodo: 'POST', corpo: `chave=${CHAVE}`, tipo: 'application/x-www-form-urlencoded' });
    assert.strictEqual(r.status, 303);
});

test('Host estranho é recusado (DNS rebinding)', async () => {
    const r = await pedir('/central/api/estado', { host: `atacante.exemplo:${porta}`, cookie: await entrar() });
    assert.strictEqual(r.status, 421);
});

test('estado lista só câmeras que o retransmissor conhece', async () => {
    const r = await pedir('/central/api/estado', { cookie: await entrar() });
    const j = JSON.parse(r.corpo);
    assert.deepStrictEqual(j.cameras.map(c => c.id), ['cam1']);
});

test('WebRTC: repassa a oferta e recusa câmera desconhecida ou SDP inválido', async () => {
    const cookie = await entrar();
    const ok = await pedir('/central/api/camera/cam1/webrtc?qualidade=foco', { metodo: 'POST', cookie, corpo: 'v=0 oferta', tipo: 'application/sdp' });
    assert.strictEqual(ok.status, 201);
    assert.match(ok.corpo, /resposta-foco/);
    assert.strictEqual((await pedir('/central/api/camera/outra/webrtc', { metodo: 'POST', cookie, corpo: 'v=0' })).status, 404);
    assert.strictEqual((await pedir('/central/api/camera/cam1/webrtc', { metodo: 'POST', cookie, corpo: 'lixo' })).status, 400);
});

test('caixas: alvo da watchlist sai marcado com motivo e nível; fora da lista sai sem marca', async () => {
    const cookie = await entrar();
    central.definirAlvos([]);
    let j = JSON.parse((await pedir('/central/api/caixas?foco=cam1', { cookie })).corpo);
    assert.strictEqual(j.cameras.cam1.caixas[0].pessoa.watchlist, null);

    central.definirAlvos([{ pessoa_id: 'p-alvo', motivo: 'Teste', nivel: 'critico' }]);
    j = JSON.parse((await pedir('/central/api/caixas?foco=cam1', { cookie })).corpo);
    const p = j.cameras.cam1.caixas[0].pessoa;
    assert.deepStrictEqual(p.watchlist, { motivo: 'Teste', nivel: 'critico' });
    assert.strictEqual(p.nome, 'Fulano');
    // O recorte do rosto não vai nas caixas (é pesado e não é usado no desenho)
    assert.ok(!('face_crop_base64' in j.cameras.cam1.caixas[0]));
});

test('alerta só com reconhecimento confiável: alerta_ok do motor chega à tela; motor antigo vale como confiável', async () => {
    const cookie = await entrar();
    central.definirAlvos([{ pessoa_id: 'p-alvo', motivo: 'Teste', nivel: 'alto' }]);
    pessoa.alerta_ok = false;
    let p = JSON.parse((await pedir('/central/api/caixas?foco=cam1', { cookie })).corpo).cameras.cam1.caixas[0].pessoa;
    assert.strictEqual(p.alerta_ok, false);
    assert.ok(p.watchlist, 'continua marcado como alvo, para a tela mostrar "possível"');
    delete pessoa.alerta_ok;
    p = JSON.parse((await pedir('/central/api/caixas?foco=cam1', { cookie })).corpo).cameras.cam1.caixas[0].pessoa;
    assert.strictEqual(p.alerta_ok, true);
});

test('alvos ficam em disco (Central segue alertando sem internet)', () => {
    central.definirAlvos([{ pessoa_id: 'p9', nivel: 'alto' }]);
    const salvo = JSON.parse(fs.readFileSync(process.env.CENTRAL_ALVOS_ARQ, 'utf8'));
    assert.deepStrictEqual(salvo.alvos.map(a => a.pessoa_id), ['p9']);
});

test('ids de câmera com caracteres estranhos não chegam ao motor', async () => {
    const cookie = await entrar();
    const r = await pedir('/central/api/caixas?foco=..%2F..%2Fx,cam1', { cookie });
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(Object.keys(JSON.parse(r.corpo).cameras), ['cam1']);
});

test('sair encerra a sessão', async () => {
    const cookie = await entrar();
    assert.strictEqual((await pedir('/central/sair', { metodo: 'POST', cookie })).status, 200);
    assert.strictEqual((await pedir('/central/api/estado', { cookie })).status, 401);
});

test('Tailscale: aceita o IP 100.x, o nome do PC e *.ts.net; continua recusando outros nomes', async () => {
    const cookie = await entrar();
    central.iniciar({ log: () => {}, fetchIa, porta, soLocal: true, tailscale: { ip: '100.70.1.2', nome: 'pc-evento' } });
    for (const host of [`100.70.1.2:${porta}`, `pc-evento:${porta}`, `pc-evento.tail1234.ts.net:${porta}`]) {
        assert.strictEqual((await pedir('/central/api/estado', { host, cookie })).status, 200, host);
    }
    for (const host of [`atacante.exemplo:${porta}`, `ts.net.atacante.exemplo:${porta}`, `pc-evento.tail1234.ts.net:9999`]) {
        assert.strictEqual((await pedir('/central/api/estado', { host, cookie })).status, 421, host);
    }
    // Sem Tailscale, só localhost
    central.iniciar({ log: () => {}, fetchIa, porta, soLocal: true });
    assert.strictEqual((await pedir('/central/api/estado', { host: `100.70.1.2:${porta}`, cookie })).status, 421);
});

const pedirControle = (cookie, acao) => pedir('/central/api/controle', { metodo: 'POST', cookie, corpo: JSON.stringify({ acao }), tipo: 'application/json' });

test('controle: uma tela por vez; só quem tem o controle fala com a câmera', async () => {
    const a = await entrar();
    const b = await entrar();
    assert.deepStrictEqual(JSON.parse((await pedir('/central/api/estado', { cookie: a })).corpo).controle, { meu: false, ocupado: false, quem: null });

    const assumiu = await pedirControle(a, 'assumir');
    assert.strictEqual(assumiu.status, 200);
    assert.deepStrictEqual(JSON.parse(assumiu.corpo), { meu: true, ocupado: true, quem: 'Acesso pela chave' });

    // Outra tela não assume enquanto a primeira tem o controle
    const negado = await pedirControle(b, 'assumir');
    assert.strictEqual(negado.status, 409);
    assert.deepStrictEqual(JSON.parse(negado.corpo).meu, false);
    assert.deepStrictEqual(JSON.parse((await pedir('/central/api/estado', { cookie: b })).corpo).controle, { meu: false, ocupado: true, quem: 'Acesso pela chave' });

    // Falar: sem controle é recusado; com controle chega ao retransmissor
    const falaNegada = await pedir('/central/api/camera/cam1/webrtc?qualidade=foco&fala=1', { metodo: 'POST', cookie: b, corpo: 'v=0 oferta', tipo: 'application/sdp' });
    assert.strictEqual(falaNegada.status, 403);
    const falaOk = await pedir('/central/api/camera/cam1/webrtc?qualidade=foco&fala=1', { metodo: 'POST', cookie: a, corpo: 'v=0 oferta', tipo: 'application/sdp' });
    assert.strictEqual(falaOk.status, 201);
    // Ouvir (sem fala) continua livre para as duas telas
    const ouvirOutra = await pedir('/central/api/camera/cam1/webrtc?qualidade=foco', { metodo: 'POST', cookie: b, corpo: 'v=0 oferta', tipo: 'application/sdp' });
    assert.strictEqual(ouvirOutra.status, 201);

    // Quem não tem o controle não consegue liberá-lo
    assert.strictEqual((await pedirControle(b, 'liberar')).status, 403);
    // Quem tem o controle libera; a outra tela assume
    const liberou = await pedirControle(a, 'liberar');
    assert.deepStrictEqual(JSON.parse(liberou.corpo), { meu: false, ocupado: false, quem: null });
    assert.strictEqual((await pedirControle(b, 'assumir')).status, 200);
    assert.strictEqual((await pedirControle(b, 'liberar')).status, 200);
    assert.strictEqual((await pedirControle(a, 'nada')).status, 400);
});

test('giro: sem controle o comando nem chega à câmera (403)', async () => {
    const original = [{ id: 'cam1', nome: 'Portaria', ia_ativa: true }, { id: 'fora', nome: 'Fora do retransmissor' }];
    central.configurarCameras([{ id: 'cam1', nome: 'Portaria', ia_ativa: true, ptz: { ip: '10.0.0.9', porta: 2020 } }]);
    try {
        const sem = await pedir('/central/api/camera/cam1/ptz', { metodo: 'POST', cookie: await entrar(), corpo: JSON.stringify({ acao: 'mover', pan: 0.1 }), tipo: 'application/json' });
        assert.strictEqual(sem.status, 403);
        assert.strictEqual(JSON.parse(sem.corpo).sem_controle, true);
    } finally {
        central.configurarCameras(original);
    }
});

test('controle: sair da sessão libera o controle de quem saiu', async () => {
    const a = await entrar();
    const b = await entrar();
    assert.strictEqual((await pedirControle(a, 'assumir')).status, 200);
    assert.strictEqual((await pedirControle(b, 'assumir')).status, 409);
    await pedir('/central/sair', { metodo: 'POST', cookie: a });
    assert.strictEqual((await pedirControle(b, 'assumir')).status, 200);
    await pedirControle(b, 'liberar');
});

test('senha da conta do app: só quem tem o controle grava; nunca volta na resposta', async () => {
    const a = await entrar();
    const b = await entrar();
    const corpo = JSON.stringify({ senha: 'Nuvem@1' });
    const tipo = 'application/json';
    assert.strictEqual((await pedir('/central/api/camera/cam1/conta-tapo', { metodo: 'POST', cookie: b, corpo, tipo })).status, 403);
    assert.strictEqual(senhasTapo.length, 0);
    assert.strictEqual((await pedirControle(a, 'assumir')).status, 200);
    const ok = await pedir('/central/api/camera/cam1/conta-tapo', { metodo: 'POST', cookie: a, corpo, tipo });
    assert.strictEqual(ok.status, 200);
    assert.ok(!ok.corpo.includes('Nuvem@1'));
    assert.deepStrictEqual(senhasTapo, [['cam1', 'Nuvem@1']]);
    await pedirControle(a, 'liberar');
});

test('operadores: login e senha substituem a chave; cada ação fica registrada com o nome', async () => {
    const salt = 'ab'.repeat(16);
    const hash = `scrypt$${salt}$${crypto.scryptSync('Senha@123', salt, 64).toString('hex')}`;
    const form = 'application/x-www-form-urlencoded';
    central.definirOperadores([{ id: 'op-1', nome: 'Maria Operadora', login: 'maria', senha_hash: hash }]);
    try {
        const antes = central.auditoriaPendente(100000).length;
        // A chave deixa de valer: o atalho com a chave só mostra a tela de login (sem contar tentativa)
        const pelaChave = await pedir(`/central/entrar?chave=${CHAVE}`);
        assert.strictEqual(pelaChave.status, 200);
        assert.match(pelaChave.corpo, /name="usuario"/);
        assert.ok(!pelaChave.headers['set-cookie']);
        assert.strictEqual((await pedir('/central/entrar', { metodo: 'POST', corpo: `chave=${CHAVE}`, tipo: form })).status, 401);

        const errada = await pedir('/central/entrar', { metodo: 'POST', corpo: 'usuario=maria&senha=errada', tipo: form });
        assert.strictEqual(errada.status, 401);
        assert.ok(!errada.headers['set-cookie']);

        // Login sem diferenciar maiúsculas
        const certa = await pedir('/central/entrar', { metodo: 'POST', corpo: 'usuario=Maria&senha=Senha%40123', tipo: form });
        assert.strictEqual(certa.status, 303);
        const cookie = String(certa.headers['set-cookie'][0]).split(';')[0];
        assert.deepStrictEqual(JSON.parse((await pedir('/central/api/estado', { cookie })).corpo).operador, { nome: 'Maria Operadora', login: 'maria' });
        assert.strictEqual(JSON.parse((await pedirControle(cookie, 'assumir')).corpo).quem, 'Maria Operadora');
        await pedir('/central/api/camera/cam1/webrtc?qualidade=foco', { metodo: 'POST', cookie, corpo: 'v=0 oferta', tipo: 'application/sdp' });
        // Reconexão do mesmo vídeo não vira outro registro
        await pedir('/central/api/camera/cam1/webrtc?qualidade=foco', { metodo: 'POST', cookie, corpo: 'v=0 oferta', tipo: 'application/sdp' });
        await pedirControle(cookie, 'liberar');

        const novos = central.auditoriaPendente(100000).slice(antes);
        assert.deepStrictEqual(novos.map(r => r.acao), ['entrar_falhou', 'entrar', 'assumir_controle', 'assistir', 'liberar_controle']);
        assert.strictEqual(novos[0].operador_nome, 'login tentado: maria');
        assert.ok(novos.slice(1).every(r => r.operador_id === 'op-1' && r.operador_nome === 'Maria Operadora'));
        assert.strictEqual(novos[3].camera_id, 'cam1');
        assert.ok(!JSON.stringify(novos).includes('Senha@123') && !JSON.stringify(novos).includes('errada'), 'senha nunca vai para o registro');

        // VPS confirmou: sai da fila
        central.confirmarAuditoria(novos.map(r => r.uid));
        assert.strictEqual(central.auditoriaPendente(100000).length, antes);

        // Operador desativado no painel: a sessão dele cai na hora
        central.definirOperadores([]);
        assert.strictEqual((await pedir('/central/api/estado', { cookie })).status, 401);
    } finally {
        central.definirOperadores([]);
    }
});

test('muitas chaves erradas seguidas bloqueiam por 1 minuto', async () => {
    for (let i = 0; i < 10; i++) await pedir('/central/entrar?chave=errada');
    const r = await pedir(`/central/entrar?chave=${CHAVE}`);
    assert.strictEqual(r.status, 429);
});
