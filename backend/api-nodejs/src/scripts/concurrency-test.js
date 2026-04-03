require('dotenv').config();
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const API_URL = process.env.API_URL || 'http://localhost:3001/api';
// Pegamos um token interno válido, ou usar a key de ambiente se tivermos
const API_KEY = process.env.INTERNAL_API_KEY || 'a2eventos_sync_2026';

// Precisaremos simular alguns QR Codes válidos ou fazer chamadas para o access/checkin
async function runConcurrencyTest(numRequests = 50) {
    console.log(`🚀 Iniciando teste de carga com ${numRequests} requisições simultâneas...`);

    // Obter um evento e testar manual checkin (que recebe CPF ou Nome) ou Barcode
    // Vamos simular chamadas offline (sync logs) ou chamadas manuais (para gerar concorrência no banco)

    // Supondo rota: POST /api/access/sync/logs
    // E payload: { logs: [ ... ] }

    // Vamos criar lotes de logs simulando dispositivos offline enviando logs todos de uma vez
    const simulatedLogs = Array.from({ length: numRequests }).map((_, i) => ({
        id: uuidv4(),
        evento_id: 'd9b2d63d-a233-4123-8478-f3b1dc33b1e5', // Um uuid de mentira ou precisamos pegar o atual
        pessoa_id: uuidv4(), // Usando UUID aleatório (vai dar erro de FK, mas testa o rate limit/banco)
        tipo: 'checkin',
        metodo: 'qrcode',
        dispositivo_id: `term_test_${i % 5}`,
        created_at: new Date().toISOString()
    }));

    const payloads = [];
    const batchSize = 10;
    for (let i = 0; i < simulatedLogs.length; i += batchSize) {
        payloads.push(simulatedLogs.slice(i, i + batchSize));
    }

    console.log(`📦 Enviando ${payloads.length} lotes de sincronização quase ao mesmo tempo...`);

    const startTime = Date.now();
    try {
        const requests = payloads.map(batch =>
            axios.post(`${API_URL}/sync/logs/batch`, { logs: batch }, {
                headers: { 'X-API-Key': API_KEY }
            }).then(r => r.data).catch(e => e.response?.data || e.message)
        );

        const results = await Promise.all(requests);
        const endTime = Date.now();

        console.log(`\n✅ Teste finalizado em ${endTime - startTime}ms`);
        console.log(`Resultados das ${requests.length} requisições de batch (total ${numRequests} logs):`);

        results.forEach((r, idx) => {
            console.log(`- Batch ${idx + 1}:`, JSON.stringify(r).substring(0, 100));
        });

    } catch (error) {
        console.error('❌ Erro no teste de carga:', error);
    }
}

runConcurrencyTest(50);
