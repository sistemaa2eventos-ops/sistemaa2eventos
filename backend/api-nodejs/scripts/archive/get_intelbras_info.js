const DigestFetchLib = require('digest-fetch');
const DigestFetch = DigestFetchLib.default || DigestFetchLib;

async function getDeviceInfo() {
    const ip = '192.168.1.17';
    const user = 'admin';
    const pass = 'admin123';
    const client = new DigestFetch(user, pass);

    const urls = [
        `http://${ip}/cgi-bin/magicBox.cgi?action=getDeviceType`,
        `http://${ip}/cgi-bin/magicBox.cgi?action=getSoftwareVersion`,
        `http://${ip}/cgi-bin/magicBox.cgi?action=getSerialNo`
    ];

    for (const url of urls) {
        console.log(`📡 GET: ${url}`);
        try {
            const res = await client.fetch(url);
            const text = await res.text();
            console.log(`📊 Result [${res.status}]: ${text}`);
        } catch (error) {
            console.error(`❌ Erro:`, error.message);
        }
    }
    process.exit(0);
}

getDeviceInfo();
