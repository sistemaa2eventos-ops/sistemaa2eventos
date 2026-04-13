const DigestFetchLib = require('digest-fetch');
const DigestFetch = DigestFetchLib.default || DigestFetchLib;

async function testRPC() {
    const ip = '192.168.1.17';
    const user = 'admin';
    const pass = 'admin123';
    const client = new DigestFetch(user, pass);

    const url = `http://${ip}/cgi-bin/RPC2`;
    const body = {
        id: 1,
        method: "magicBox.getDeviceType",
        params: {},
        session: 0
    };

    console.log(`📡 Testando JSON-RPC em: ${url}`);
    try {
        const res = await client.fetch(url, {
            method: 'POST',
            body: JSON.stringify(body),
            headers: { 'Content-Type': 'application/json' }
        });
        const text = await res.text();
        console.log(`📊 Status Code: ${res.status}`);
        console.log(`📊 Response: ${text}`);
    } catch (error) {
        console.error('❌ Erro:', error.message);
    }
    process.exit(0);
}

testRPC();
