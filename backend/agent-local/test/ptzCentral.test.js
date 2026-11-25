'use strict';
/**
 * Central: quais câmeras têm giro, de onde vêm o usuário e a senha (a própria URL da câmera), e o aviso
 * de porta ocupada do retransmissor. Sem câmera, sem rede.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'ptz-central-'));
fs.writeFileSync(path.join(pasta, 'chave'), 'k'.repeat(48));
process.env.CENTRAL_CHAVE_ARQ = path.join(pasta, 'chave');
process.env.CENTRAL_ALVOS_ARQ = path.join(pasta, 'alvos.json');
process.env.CENTRAL_OPERADORES_ARQ = path.join(pasta, 'operadores.json');
process.env.CENTRAL_AUDITORIA_ARQ = path.join(pasta, 'auditoria.json');

const central = require('../src/central');

test('usuário e senha vêm da URL da câmera, com a senha decodificada', () => {
    assert.deepStrictEqual(central._credenciaisDoStream('rtsp://op:Senha%40123@192.168.1.88:554/stream1'), { usuario: 'op', senha: 'Senha@123' });
    assert.deepStrictEqual(central._credenciaisDoStream('lixo'), { usuario: '', senha: '' });
});

test('só as câmeras com giro ligado entram no mapa de giro', () => {
    central.configurarCameras([
        { id: 'c1', nome: 'Entrada', stream_url: 'rtsp://op:s@192.168.1.88:554/stream1', ptz: { ip: '192.168.1.88', porta: 2020 } },
        { id: 'c2', nome: 'Fixa', stream_url: 'rtsp://op:s@192.168.1.90:554/stream1', ptz: null }
    ]);
    assert.ok(central._camerasComGiro.has('c1'));
    assert.strictEqual(central._camerasComGiro.get('c1').ip_address, '192.168.1.88');
    assert.strictEqual(central._camerasComGiro.get('c1').ptz_porta, 2020);
    assert.strictEqual(central._camerasComGiro.get('c1').usuario, 'op');
    assert.ok(!central._camerasComGiro.has('c2'));
});

test('a lista atualizada troca o mapa (câmera que perdeu o giro sai)', () => {
    central.configurarCameras([{ id: 'c1', nome: 'Entrada', stream_url: 'rtsp://op:s@h/x', ptz: null }]);
    assert.strictEqual(central._camerasComGiro.size, 0);
});
