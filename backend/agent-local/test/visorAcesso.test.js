'use strict';
/**
 * Quem pode abrir a Central (escolhido no painel): troca sem reiniciar o agente e fica gravado no PC.
 * Usa uma porta livre e arquivos temporários; não precisa de câmera nem motor.
 */
const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'visor-acesso-'));
fs.writeFileSync(path.join(pasta, 'chave'), 'k'.repeat(48));
process.env.CENTRAL_CHAVE_ARQ = path.join(pasta, 'chave');
process.env.CENTRAL_ALVOS_ARQ = path.join(pasta, 'alvos.json');
process.env.CENTRAL_ACESSO_ARQ = path.join(pasta, 'acesso.json');
delete process.env.CENTRAL_REDE;
delete process.env.CENTRAL_TAILSCALE;

const videoPath = require.resolve('../src/video');
require.cache[videoPath] = { id: videoPath, filename: videoPath, loaded: true, exports: { conhece: () => false, disponivel: () => true } };

async function portaLivre() {
    const s = net.createServer().listen(0, '127.0.0.1');
    await new Promise(r => s.once('listening', r));
    const p = s.address().port;
    await new Promise(r => s.close(r));
    return p;
}

let visor;
after(async () => { await visor?.parar(); });

test('padrão só este PC; painel troca para rede local e a escolha fica gravada', async () => {
    process.env.VISOR_LOCAL_PORTA = String(await portaLivre());
    visor = require('../src/visor-local');
    const inicio = await visor.iniciar(() => {});
    assert.strictEqual(inicio.acesso, 'local');
    assert.strictEqual(inicio.origem, 'padrao');

    const r = await visor.aplicarAcesso('rede', { salvar: true });
    assert.strictEqual(r.acesso, 'rede');
    assert.strictEqual(r.origem, 'painel');
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(process.env.CENTRAL_ACESSO_ARQ, 'utf8')).acesso, 'rede');

    // Continua atendendo depois de reabrir o servidor
    const res = await fetch(`http://127.0.0.1:${visor.PORTA}/health`);
    assert.strictEqual(res.status, 200);

    const volta = await visor.aplicarAcesso('local', { salvar: true });
    assert.strictEqual(volta.enderecos.length, 1);
    assert.strictEqual((await fetch(`http://127.0.0.1:${visor.PORTA}/health`)).status, 200);
});

test('gerar nova chave: grava no PC e derruba quem entrou com a antiga', () => {
    const central = require('../src/central');
    const antiga = central.chaveDeAcesso();
    central._estado.sessoes.set('x'.repeat(48), Date.now() + 60000);
    const nova = central.gerarNovaChave();
    assert.notStrictEqual(nova, antiga);
    assert.strictEqual(nova.length, 48);
    assert.strictEqual(fs.readFileSync(process.env.CENTRAL_CHAVE_ARQ, 'utf8'), nova);
    assert.strictEqual(central.chaveDeAcesso(), nova);
    assert.strictEqual(central._estado.sessoes.size, 0);
});

test('modo inválido é recusado', async () => {
    await assert.rejects(() => visor.aplicarAcesso('internet'), /inválido/);
});
