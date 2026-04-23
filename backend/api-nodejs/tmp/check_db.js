require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkAreas() {
    // Tentar buscar 1 área qualquer para ver colunas
    const { data: areas, error: areasErr } = await supabase.from('evento_areas').select('*').limit(1);
    if (areasErr) {
        console.log(`❌ Erro ao consultar [evento_areas]:`, areasErr.message);
    } else if (areas.length > 0) {
        console.log(`✅ Colunas detectadas:`, Object.keys(areas[0]).join(', '));
    } else {
        // Se estiver vazia, tentar inserir uma temporária e deletar para ver colunas
        console.log('ℹ️ Tabela vazia. Tentando inserção de teste...');
        const { data: evento } = await supabase.from('eventos').select('id').limit(1).single();
        const { data: inserted, error: insErr } = await supabase
            .from('evento_areas')
            .insert({ evento_id: evento.id, nome_area: 'TESTE_DIAGNOSTICO' })
            .select()
            .single();

        if (insErr) {
            console.log('❌ Erro na inserção de teste:', insErr.message);
        } else {
            console.log('✅ Inserção ok. Colunas:', Object.keys(inserted).join(', '));
            await supabase.from('evento_areas').delete().eq('id', inserted.id);
        }
    }
}

checkAreas();
