const DigestFetchLib = require('digest-fetch');
const DigestFetch = DigestFetchLib.default || DigestFetchLib;

async function testAuth() {
    const ip = '192.168.1.17';
    const user = 'admin';
    const pass = 'admin123';
    const client = new DigestFetch(user, pass);

    const url = `http://${ip}/cgi-bin/accessControl.cgi?action=addUser&UserID=999&UserName=Test&Authority=2&UserType=0`;

    console.log(`📡 Testando GET em: ${url}`);
    try {
        const res = await client.fetch(url);
        const text = await res.text();
        console.log(`📊 Status Code: ${res.status}`);
        console.log(`📊 Response: ${text}`);
    } catch (error) {
        console.error('❌ Erro:', error.message);
    }
    process.exit(0);
}

testAuth();
