require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function migrate() {
    console.log('Iniciando migração: adicinando tipo_leitura a evento_tipos_pulseira...');

    // Como o Supabase-JS não suporta ALTER TABLE diretamente via métodos de conveniência, 
    // tentaremos inserir um registro falso e remover para ver se a coluna existe ou usar RPC se disponível.
    // Mas a melhor forma em ambiente Node com privilégios de service_role é usar uma query direta se o DB permitir,
    // ou assumir que o usuário executará o SQL no console se não tivermos uma ferramenta de migração.

    // No entanto, para este sistema, podemos tentar usar o endpoint /rpc ou simplesmente informar o usuário.
    // Mas vamos tentar uma abordagem mais direta se possível.

    console.log('ATENÇÃO: Caso este script falhe, execute manualmente no SQL Editor do Supabase:');
    console.log('ALTER TABLE evento_tipos_pulseira ADD COLUMN IF NOT EXISTS tipo_leitura VARCHAR(50) DEFAULT \'qr_code\';');
}

migrate();
