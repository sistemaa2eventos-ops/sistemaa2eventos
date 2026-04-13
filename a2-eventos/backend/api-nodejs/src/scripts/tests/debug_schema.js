const { supabase } = require('./src/config/supabase');

async function checkSchema() {
    console.log('🔍 Tentando inserção de teste em dispositivos_acesso...');
    try {
        const testData = {
            nome: 'TESTE_DEBUG',
            tipo: 'terminal_facial',
            marca: 'intelbras',
            ip_address: '0.0.0.0',
            user_device: 'test',
            password_device: 'test'
            // Removido evento_id pois pode dar erro de FK
        };

        const { data, error } = await supabase
            .from('dispositivos_acesso')
            .insert([testData]);

        if (error) {
            console.error('❌ Resposta do Supabase:', error.message);
            if (error.message.includes('column') && error.message.includes('does not exist')) {
                console.log('🚨 DIAGNÓSTICO: Colunas da Fase 20 estão faltando no banco!');
            }
        } else {
            console.log('✅ Inserção de teste funcionou! As colunas existem.');
            // Limpar teste
            await supabase.from('dispositivos_acesso').delete().eq('nome', 'TESTE_DEBUG');
        }
    } catch (err) {
        console.error('💥 Erro fatal:', err.message);
    }
}

checkSchema();
