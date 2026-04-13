const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
require('dotenv').config({ path: './.env' });

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
);

async function testIntelbrasPush() {
    try {
        console.log('--- Iniciando Teste da API Intelbras ---');

        // 1. Criar um evento mock
        console.log('1. Criando Evento de Teste...');
        const { data: evento, error: evErr } = await supabase
            .from('eventos')
            .insert({
                nome: 'Evento Teste Intelbras',
                slug: `teste-intelbras-${Date.now()}`,
                status: 'ativo'
            }).select().single();
        if (evErr) throw evErr;

        // 2. Criar uma pessoa mock
        console.log('2. Criando Pessoa de Teste...');
        const mockCpf = '123' + Math.floor(Math.random() * 100000000).toString().padStart(8, '0');
        const { data: pessoa, error: peErr } = await supabase
            .from('pessoas')
            .insert({
                evento_id: evento.id,
                nome: 'João Teste Face',
                cpf: mockCpf,
                foto_url: 'https://exemplo.com/foto.jpg',
                status_acesso: 'liberado',
                fase_montagem: true,
                fase_showday: true,
                fase_desmontagem: true
            }).select().single();
        if (peErr) {
            console.error('Erro pessoa:', peErr);
            throw peErr;
        }

        console.log(`Pessoa criada: ${pessoa.nome} (ID: ${pessoa.id}, CPF: ${pessoa.cpf})`);

        // 3. Simular o POST do dispositivo Intelbras (Check-in via Rosto)
        console.log('3. Simulando Push do Leitor Intelbras (Check-in)...');
        // O Intelbras envia UserID que pode ser CPF ou o ID do DB.
        const intelbrasPayload = {
            Action: 'Pulse',
            Code: 'AccessControl',
            Data: {
                UserID: pessoa.cpf,
                Event: 'Entry',
                Method: 'Face',
                ReaderID: 'Terminal_01',
                Time: new Date().toISOString(),
                Similarity: 98.5
            }
        };

        const res = await axios.post('http://localhost:3001/api/intelbras/events', intelbrasPayload, {
            headers: { 'Content-Type': 'application/json' }
        });

        console.log('Resposta da API Intelbras:', res.data);

        // 4. Verificar no DB se o status mudou para 'checkin_feito' e se o log foi criado
        console.log('4. Verificando Logs e Status no DB...');

        // Verifica Pessoa
        const { data: checkPessoa } = await supabase.from('pessoas').select('status_acesso').eq('id', pessoa.id).single();
        console.log(`Status atual da Pessoa no DB: ${checkPessoa.status_acesso}`);

        // Verifica Log
        const { data: logs } = await supabase.from('logs_acesso').select('*').eq('pessoa_id', pessoa.id);
        console.log(`Logs registrados na base: ${logs.length}`);
        if (logs.length > 0) {
            console.log(`Último log: Tipo=${logs[0].tipo}, Metodo=${logs[0].metodo}, Dispositivo=${logs[0].dispositivo_id}`);
        }

        // LIMPEZA
        await supabase.from('eventos').delete().eq('id', evento.id);
        console.log('--- Teste Concluído e Dados Limpos ---');

    } catch (err) {
        console.error('\n--- ERRO NO TESTE ---');
        if (err.response) {
            console.error('Status:', err.response.status);
            console.error('Data:', JSON.stringify(err.response.data, null, 2));
        } else {
            console.error('Erro:', err.message);
        }
    }
}

testIntelbrasPush();
