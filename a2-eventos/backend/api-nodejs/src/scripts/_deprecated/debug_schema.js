const { supabase } = require('../config/supabase');

(async () => {
    try {
        const { data, error } = await supabase.from('dispositivos_acesso').select('*').limit(1);
        if (error) {
            console.error('Erro:', error);
        } else if (data && data.length > 0) {
            console.log('Colunas:', Object.keys(data[0]));
        } else {
            console.log('Tabela vazia ou sem retorno.');
        }
    } catch (e) {
        console.error(e);
    }
})();
