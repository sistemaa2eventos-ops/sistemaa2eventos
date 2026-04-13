const { supabase } = require('./src/config/supabase');

async function debugSync() {
    console.log('🔍 Buscando dispositivos...');
    const { data: terminais, error: tError } = await supabase
        .from('dispositivos_acesso')
        .select('id, nome, evento_id, marca')
        .eq('tipo', 'terminal_facial');

    if (tError) {
        console.error('❌ Erro dispositivos:', tError.message);
        return;
    }

    console.log(`✅ Encontrados ${terminais.length} terminais faciais.`);

    for (const t of terminais) {
        console.log(`\nTerminal: ${t.nome} (Evento: ${t.evento_id})`);

        const { count, error: cError } = await supabase
            .from('funcionarios')
            .select('*', { count: 'exact', head: true })
            .eq('evento_id', t.evento_id)
            .eq('ativo', true);

        if (cError) {
            console.error(`❌ Erro contagem (ativo=true):`, cError.message);
        } else {
            console.log(`👥 Funcionários Ativos: ${count}`);
        }

        const { count: countWithFoto, error: cfError } = await supabase
            .from('funcionarios')
            .select('*', { count: 'exact', head: true })
            .eq('evento_id', t.evento_id)
            .eq('ativo', true)
            .not('foto_url', 'is', null);

        if (cfError) {
            console.error(`❌ Erro contagem (com foto):`, cfError.message);
        } else {
            console.log(`📸 Funcionários Ativos com Foto: ${countWithFoto}`);
        }

        if (countWithFoto > 0) {
            const { data: sample } = await supabase
                .from('funcionarios')
                .select('id, nome, foto_url')
                .eq('evento_id', t.evento_id)
                .eq('ativo', true)
                .not('foto_url', 'is', null)
                .limit(1);
            console.log(`👤 Exemplo: ${sample[0].nome} (${sample[0].id}) - Foto: ${sample[0].foto_url}`);
        }
    }
    process.exit(0);
}

debugSync();
