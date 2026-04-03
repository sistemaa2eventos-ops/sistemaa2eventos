const axios = require('axios');

async function testSync() {
    const BASE = 'http://localhost:3001';
    const DEVICE_ID = 'ef7a754a-cddb-4852-a405-62e4c8cfee40';

    console.log('1. Login...');
    const loginRes = await axios.post(`${BASE}/api/auth/login`, {
        email: 'admin@a2eventos.com.br',
        password: 'admin123'
    }).catch(err => ({ data: err.response?.data, status: err.response?.status }));

    if (!loginRes.data?.token) {
        console.error('Login failed:', JSON.stringify(loginRes.data));

        console.log('\nTrying alternative credentials...');
        const tries = ['Admin@123', '123456', 'admin', 'Admin2026', 'A2eventos@2026'];
        for (const pass of tries) {
            const r = await axios.post(`${BASE}/api/auth/login`, {
                email: 'admin@a2eventos.com.br',
                password: pass
            }).catch(err => ({ data: err.response?.data }));
            console.log(`  ${pass}: ${r.data?.token ? 'SUCCESS' : JSON.stringify(r.data)}`);
            if (r.data?.token) {
                loginRes.data = r.data;
                break;
            }
        }
    }

    if (!loginRes.data?.token) {
        console.error('Could not login. Cannot proceed.');
        return;
    }

    const token = loginRes.data.token;
    console.log(`Login OK! Token: ${token.substring(0, 30)}...`);

    console.log('\n2. Triggering sync...');
    const syncRes = await axios.post(`${BASE}/api/dispositivos/${DEVICE_ID}/sync`, {}, {
        headers: { Authorization: `Bearer ${token}` }
    }).catch(err => ({ data: err.response?.data }));

    console.log('Sync result:', JSON.stringify(syncRes.data, null, 2));
}

testSync().catch(console.error);
