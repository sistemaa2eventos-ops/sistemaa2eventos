require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function createTable() {
    console.log('Criando tabela evento_etiqueta_layouts...');

    // Tentar inserir um registro dummy para forçar criação via REST
    // Se a tabela não existir, o Supabase retorna erro específico
    const { data, error } = await supabase
        .from('evento_etiqueta_layouts')
        .select('id')
        .limit(0);

    if (error) {
        console.log('Tabela NÃO existe. Erro:', error.message);
        console.log('');
        console.log('=== SQL PARA CRIAR A TABELA ===');
        console.log('Execute este SQL no Supabase SQL Editor (https://supabase.com/dashboard):');
        console.log('');
        console.log(`
CREATE TABLE IF NOT EXISTS evento_etiqueta_layouts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    evento_id UUID NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
    papel_config JSONB NOT NULL DEFAULT '{}',
    elementos JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(evento_id)
);

-- Ativar RLS com política restrita
ALTER TABLE evento_etiqueta_layouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access labels" ON evento_etiqueta_layouts
    FOR ALL TO authenticated USING ( (SELECT nivel_acesso FROM public.perfis WHERE id = auth.uid()) IN ('admin', 'master') );

CREATE POLICY "Event staff read labels" ON evento_etiqueta_layouts
    FOR SELECT TO authenticated USING ( evento_id = (SELECT evento_id FROM public.perfis WHERE id = auth.uid()) );
`);
    } else {
        console.log('✅ Tabela evento_etiqueta_layouts JÁ EXISTE!');
    }
}

createTable().then(() => process.exit(0));
