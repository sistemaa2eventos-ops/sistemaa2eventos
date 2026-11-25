'use strict';
/** Canal de voz de volta (Falar): endereço da fonte Tapo do go2rtc, só para Mercusys/Tapo. */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Arquivo de senhas da conta do app só para o teste (nunca o do PC)
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'tapo-teste-'));
process.env.TAPO_CONTAS_ARQ = path.join(pasta, 'contas.json');
const video = require('../src/video');
const { urlFalaTapo } = video;

test('com a senha da conta do app, usa tapo://senha@ip (sem o usuário do RTSP)', () => {
    assert.strictEqual(
        urlFalaTapo('rtsp://Camera_A2:local@192.168.1.88:554/stream1', 'Mercusys / Tapo', 'Nuvem@123'),
        'tapo://Nuvem%40123@192.168.1.88?backchannel=1&audio=pcma'
    );
    // Com a senha da nuvem, a URL RTSP nem precisa de senha
    assert.strictEqual(urlFalaTapo('rtsp://192.168.1.88/stream1', 'Tapo', 'x'), 'tapo://x@192.168.1.88?backchannel=1&audio=pcma');
});

test('senha da conta do app fica no arquivo do PC, por IP; vazia apaga; câmera errada é recusada', async () => {
    await video.configurarCameras([
        { id: 'm1', stream_url: 'rtsp://cam:x@192.168.1.88:554/stream1', fabricante: 'Mercusys' },
        { id: 'i1', stream_url: 'rtsp://a:b@192.168.1.90/x', fabricante: 'Intelbras' }
    ]);
    await video.definirSenhaTapo('m1', 'Nuvem@1');
    assert.deepStrictEqual(video.lerContasTapo(), { '192.168.1.88': 'Nuvem@1' });
    await video.definirSenhaTapo('m1', '');
    assert.deepStrictEqual(video.lerContasTapo(), {});
    await assert.rejects(video.definirSenhaTapo('nao-existe', 's'), (e) => e.status === 404);
    await assert.rejects(video.definirSenhaTapo('i1', 's'), (e) => e.status === 409);
    fs.rmSync(pasta, { recursive: true, force: true });
});

test('monta a fonte Tapo com usuário e senha da própria URL da câmera', () => {
    assert.strictEqual(
        urlFalaTapo('rtsp://admin:Senha%40123@192.168.1.88:554/stream1', 'Mercusys / Tapo'),
        'tapo://admin:Senha%40123@192.168.1.88?backchannel=1&audio=pcma'
    );
});

test('senha com caracteres especiais continua correta', () => {
    const url = urlFalaTapo('rtsp://op:a%2Fb%3Fc@10.0.0.5:554/x', 'Tapo');
    assert.strictEqual(url, 'tapo://op:a%2Fb%3Fc@10.0.0.5?backchannel=1&audio=pcma');
    assert.strictEqual(decodeURIComponent(new URL(url.replace('tapo://', 'rtsp://')).password), 'a/b?c');
});

test('câmera que não é Mercusys/Tapo não ganha a fonte', () => {
    assert.strictEqual(urlFalaTapo('rtsp://admin:s@10.0.0.5/x', 'Intelbras'), null);
    assert.strictEqual(urlFalaTapo('rtsp://admin:s@10.0.0.5/x', undefined), null);
});

test('sem senha ou URL inválida: nada', () => {
    assert.strictEqual(urlFalaTapo('rtsp://10.0.0.5/x', 'Mercusys'), null);
    assert.strictEqual(urlFalaTapo('lixo', 'Mercusys'), null);
    assert.strictEqual(urlFalaTapo('webcam', 'Mercusys'), null);
});
