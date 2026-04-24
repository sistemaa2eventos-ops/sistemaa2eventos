/**
 * test-api.js
 * Script de teste completo da API A2 Eventos.
 * Uso: node test-api.js [email] [senha]
 */

const http = require('http');

const BASE_URL = 'http://localhost:3001';
const EMAIL = process.argv[2] || 'admin@a2eventos.com.br';
const SENHA = process.argv[3] || process.env.TEST_PASSWORD;
if (!SENHA) { console.error('Uso: node test-api.js [email] <senha>  ou defina TEST_PASSWORD'); process.exit(1); }

let token = null;
let passed = 0;
let failed = 0;

function request(method, path, body, authToken) {
    return new Promise((resolve) => {
        const data = body ? JSON.stringify(body) : null;
        const options = {
            hostname: 'localhost',
            port: 3001,
            path,
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
                ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
            }
        };
        const req = http.request(options, (res) => {
            let raw = '';
            res.on('data', chunk => raw += chunk);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
                catch { resolve({ status: res.statusCode, body: raw }); }
            });
        });
        req.on('error', (e) => resolve({ status: 0, body: { error: e.message } }));
        if (data) req.write(data);
        req.end();
    });
}

function ok(label, condition, detail = '') {
    if (condition) {
        console.log(`  ✅ ${label}${detail ? ' — ' + detail : ''}`);
        passed++;
    } else {
        console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`);
        failed++;
    }
}

async function run() {
    console.log('\n╔══════════════════════════════════════╗');
    console.log('║   TESTE DE API — A2 EVENTOS          ║');
    console.log('╚══════════════════════════════════════╝\n');

    // 1. Rotas públicas — sem auth
    console.log('📋 [1/4] Rotas Públicas (sem autenticação)');
    const noAuth = await request('GET', '/api/empresas');
    ok('GET /api/empresas retorna 401 sem token', noAuth.status === 401, `HTTP ${noAuth.status}`);

    const noAuth2 = await request('GET', '/api/funcionarios');
    ok('GET /api/funcionarios retorna 401 sem token', noAuth2.status === 401, `HTTP ${noAuth2.status}`);

    // 2. Login
    console.log('\n🔐 [2/4] Autenticação');
    const login = await request('POST', '/api/auth/login', { email: EMAIL, password: SENHA });
    ok(`POST /api/auth/login (${EMAIL})`, login.status === 200 && login.body.session, `HTTP ${login.status}`);

    if (login.body.session) {
        token = login.body.session.access_token;
        console.log(`     👤 Usuário: ${login.body.user?.email || EMAIL}`);
        console.log(`     🎫 Token: ${token.substring(0, 30)}...`);
    } else {
        console.log(`     ⚠️  Login falhou: ${JSON.stringify(login.body)}`);
        console.log(`     ℹ️  Verifique o email/senha: node test-api.js <email> <senha>`);
    }

    // 3. Endpoints autenticados
    console.log('\n🏢 [3/4] Endpoints Autenticados');
    if (token) {
        const empresas = await request('GET', '/api/empresas', null, token);
        ok('GET /api/empresas', empresas.status === 200, `HTTP ${empresas.status} — ${empresas.body?.data?.length ?? 0} registros`);

        const funcs = await request('GET', '/api/funcionarios', null, token);
        ok('GET /api/funcionarios', funcs.status === 200, `HTTP ${funcs.status} — ${funcs.body?.data?.length ?? 0} registros`);

        const devices = await request('GET', '/api/devices', null, token);
        ok('GET /api/devices', devices.status === 200, `HTTP ${devices.status} — ${devices.body?.data?.length ?? 0} registros`);

        const profile = await request('GET', '/api/auth/profile', null, token);
        ok('GET /api/auth/profile', profile.status === 200, `HTTP ${profile.status}`);
    } else {
        console.log('  ⏭️  Pulando testes autenticados (sem token)');
        failed += 4;
    }

    // 4. Rota inválida
    console.log('\n🛡️  [4/4] Segurança');
    const notFound = await request('GET', '/api/rota-inexistente');
    ok('Rota inexistente retorna 404', notFound.status === 404, `HTTP ${notFound.status}`);

    // Resumo
    console.log('\n══════════════════════════════════════');
    console.log(`  RESULTADO: ${passed} passou | ${failed} falhou`);
    console.log(`  STATUS: ${failed === 0 ? '🟢 SISTEMA OK' : failed <= 2 ? '🟡 PARCIALMENTE OK' : '🔴 ATENÇÃO'}`);
    console.log('══════════════════════════════════════\n');
}

run().catch(console.error);
