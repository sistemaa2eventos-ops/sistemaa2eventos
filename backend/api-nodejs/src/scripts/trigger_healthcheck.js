const path = require('path');
require('dotenv').config();

const deviceHealthCheck = require('../modules/devices/deviceHealthCheck.service');

async function test() {
    console.log('--- TESTANDO HEALTH CHECK DE DISPOSITIVOS ---');
    try {
        const result = await deviceHealthCheck.checkAllDevices();
        console.log('Resultado:', JSON.stringify(result, null, 2));
    } catch (err) {
        console.error('Erro Crítico:', err);
    }
}

test();
