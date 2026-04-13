const { supabase } = require('./src/config/supabase');

async function migrate() {
    console.log('🚀 Inciando migração de banco de dados...');

    const sql = `
    -- Adicionar campos à tabela funcionarios
    ALTER TABLE public.funcionarios 
    ADD COLUMN IF NOT EXISTS origem_cadastro text DEFAULT 'interno',
    ADD COLUMN IF NOT EXISTS nome_mae text,
    ADD COLUMN IF NOT EXISTS data_nascimento date,
    ADD COLUMN IF NOT EXISTS dias_trabalho jsonb DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS tipo_fluxo text DEFAULT 'checkin_checkout',
    ADD COLUMN IF NOT EXISTS motivo_bloqueio text,
    ADD COLUMN IF NOT EXISTS foto_url text,
    ADD COLUMN IF NOT EXISTS bloqueado boolean DEFAULT false,
    ADD COLUMN IF NOT EXISTS datas_montagem jsonb DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS datas_evento jsonb DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS datas_desmontagem jsonb DEFAULT '[]'::jsonb;

    -- Adicionar campos à tabela perfis
    ALTER TABLE public.perfis
    ADD COLUMN IF NOT EXISTS nome_mae text,
    ADD COLUMN IF NOT EXISTS data_nascimento date,
    ADD COLUMN IF NOT EXISTS cpf text;

    -- Adicionar campos à tabela eventos
    ALTER TABLE public.eventos
    ADD COLUMN IF NOT EXISTS datas_montagem jsonb DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS datas_evento jsonb DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS datas_desmontagem jsonb DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS horario_reset time DEFAULT '00:00:00',
    ADD COLUMN IF NOT EXISTS capacidade_total integer DEFAULT 0;

    -- Criar tabela de quotas
    CREATE TABLE IF NOT EXISTS public.quotas_diarias (
        id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        evento_id uuid REFERENCES public.eventos(id) ON DELETE CASCADE,
        empresa_id uuid REFERENCES public.empresas(id) ON DELETE CASCADE,
        data date NOT NULL,
        quota integer DEFAULT 0,
        UNIQUE(evento_id, empresa_id, data)
    );

    -- Criar tabela de backups
    CREATE TABLE IF NOT EXISTS public.backups_acesso_diario (
        id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        evento_id uuid REFERENCES public.eventos(id) ON DELETE CASCADE,
        data date NOT NULL,
        dados jsonb NOT NULL,
        created_at timestamptz DEFAULT now()
    );
    `;

    try {
        // Nota: O cliente Supabase JS não tem um método .rpc() para SQL arbitrário sem uma função definida.
        // Se não houver uma função 'exec_sql' no Supabase, teremos que rodar via SQL Editor ou criar a função.
        // Como não posso garantir a função rpc, vou tentar rodar os comandos via Alter Table individualmente se falhar.

        console.log('⚠️ Tentando aplicar via RPC exec_sql...');
        const { error: rpcError } = await supabase.rpc('exec_sql', { sql_query: sql });

        if (rpcError) {
            console.log('❌ RPC exec_sql não disponível ou falhou. Tentando via script individual...');
            console.error(rpcError.message);
            console.log('\n💡 Por favor, execute o SQL acima diretamente no SQL Editor do Supabase se este script falhar.');
        } else {
            console.log('✅ Migração concluída com sucesso via RPC!');
        }
    } catch (err) {
        console.error('❌ Erro inesperado:', err.message);
    }
}

migrate();
