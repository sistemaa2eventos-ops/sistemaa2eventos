const { supabase } = require('../config/supabase');

(async () => {
    console.log('🔍 Verificando tabela "eventos"...');
    const { data: eventos, error: errEventos } = await supabase.from('eventos').select('*').limit(1);

    if (errEventos) console.error('❌ Erro em eventos:', errEventos.message);
    else console.log('✅ Tabela "eventos" existe.');

    console.log('\n🔍 Verificando tabela "dispositivos_acesso"...');
    const { data: disp, error: errDisp } = await supabase.from('dispositivos_acesso').select('*').limit(1);

    if (errDisp) {
        console.error('❌ Erro em dispositivos_acesso:', errDisp.message);

        console.log('\n🔍 Tentando "dispositivos"...');
        const { data: disp2, error: errDisp2 } = await supabase.from('dispositivos').select('*').limit(1);

        if (errDisp2) console.error('❌ Erro em dispositivos:', errDisp2.message);
        else console.log('✅ Tabela "dispositivos" encontrada!');
    } else {
        console.log('✅ Tabela "dispositivos_acesso" existe.');
    }
})();
