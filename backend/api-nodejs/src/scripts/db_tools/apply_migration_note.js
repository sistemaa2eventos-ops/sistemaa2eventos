const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function applyMigration() {
    console.log('🚀 Tentando criar as tabelas faltantes no Supabase...');

    const queries = [
        `CREATE TABLE IF NOT EXISTS public.evento_areas (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            evento_id UUID NOT NULL REFERENCES public.eventos(id) ON DELETE CASCADE,
            nome_area VARCHAR(100) NOT NULL,
            criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );`,
        `CREATE TABLE IF NOT EXISTS public.evento_tipos_pulseira (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            evento_id UUID NOT NULL REFERENCES public.eventos(id) ON DELETE CASCADE,
            nome_tipo VARCHAR(100) NOT NULL,
            cor_hex VARCHAR(7) NOT NULL,
            numero_inicial INTEGER NOT NULL,
            numero_final INTEGER NOT NULL,
            criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            CONSTRAINT valid_range CHECK (numero_inicial <= numero_final)
        );`,
        `CREATE TABLE IF NOT EXISTS public.pulseira_areas_permitidas (
            pulseira_id UUID NOT NULL REFERENCES public.evento_tipos_pulseira(id) ON DELETE CASCADE,
            area_id UUID NOT NULL REFERENCES public.evento_areas(id) ON DELETE CASCADE,
            PRIMARY KEY (pulseira_id, area_id)
        );`,
        `ALTER TABLE public.evento_areas ENABLE ROW LEVEL SECURITY;`,
        `ALTER TABLE public.evento_tipos_pulseira ENABLE ROW LEVEL SECURITY;`,
        `ALTER TABLE public.pulseira_areas_permitidas ENABLE ROW LEVEL SECURITY;`
    ];

    // Note: Supabase JS library doesn't support direct SQL execution without an RPC.
    // If the tables are missing, we usually recommend the SQL Editor.
    // However, I will check if there's any table I can "hack" create 
    // but honestly, if they don't have exec_sql, I can't do much from JS.

    console.log('⚠️ Aviso: O cliente JS não pode executar comandos DDL (CREATE TABLE) diretamente.');
    console.log('Você DEVE executar o SQL abaixo no Dashboard do Supabase:');
    console.log('https://supabase.com/dashboard/project/' + process.env.SUPABASE_URL.split('.')[0].split('//')[1] + '/sql');
    console.log('\n--- SQL ---');
    console.log(queries.join('\n'));
}

applyMigration();
