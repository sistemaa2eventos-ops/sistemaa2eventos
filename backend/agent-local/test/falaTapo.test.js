'use strict';
/** Canal de voz de volta (Falar): endereço da fonte Tapo do go2rtc, só para Mercusys/Tapo. */
const { test } = require('node:test');
const assert = require('node:assert');
const { urlFalaTapo } = require('../src/video');

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
