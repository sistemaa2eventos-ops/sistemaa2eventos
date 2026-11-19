'use strict';

/**
 * O agente do PC do evento leva uma cópia do código de giro (ONVIF), porque é instalado sozinho no PC.
 * Este teste garante que a cópia continua igual à original (só o caminho do require muda).
 */
const fs = require('fs');
const path = require('path');

const AGENTE = path.join(__dirname, '..', '..', 'agent-local', 'src');
const API = path.join(__dirname, '..', 'src');

test('onvif.js do agente é igual ao do servidor', () => {
    expect(fs.readFileSync(path.join(AGENTE, 'onvif.js'), 'utf8')).toBe(fs.readFileSync(path.join(API, 'services', 'onvif.js'), 'utf8'));
});

test('ptz.js do agente é igual ao ptz.service do servidor (exceto o caminho do onvif)', () => {
    const origem = fs.readFileSync(path.join(API, 'modules', 'system', 'ptz.service.js'), 'utf8')
        .replace("require('../../services/onvif')", "require('./onvif')");
    expect(fs.readFileSync(path.join(AGENTE, 'ptz.js'), 'utf8')).toBe(origem);
});
