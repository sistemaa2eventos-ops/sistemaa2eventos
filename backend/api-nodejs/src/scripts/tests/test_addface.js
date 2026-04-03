const DigestFetchLib = require('digest-fetch');
const DigestFetch = DigestFetchLib.default || DigestFetchLib;
const fs = require('fs');

async function testAddFace() {
    const ip = '192.168.1.17';
    const user = 'admin';
    const pass = 'admin123';
    const client = new DigestFetch(user, pass);

    // Creating a dummy valid-ish binary if possible, or just some bytes
    // For a real test we need a JPEG.
    const faceData = Buffer.alloc(100, 0xFF);

    const url = `http://${ip}/cgi-bin/FaceRecognitionServer.cgi?action=addFace&UserID=888`;

    console.log(`📡 Testando POST em: ${url}`);
    try {
        const res = await client.fetch(url, {
            method: 'POST',
            body: faceData,
            headers: { 'Content-Type': 'image/jpeg' }
        });
        const text = await res.text();
        console.log(`📊 Status Code: ${res.status}`);
        console.log(`📊 Response: ${text}`);
    } catch (error) {
        console.error('❌ Erro:', error.message);
    }
    process.exit(0);
}

testAddFace();
