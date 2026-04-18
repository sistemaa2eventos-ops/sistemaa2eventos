/**
 * Script para aplicar migration de controle de acesso por área
 * Executa via Supabase
 */
const { supabase } = require('../config/supabase');
const logger = require('../services/logger');

async function applyMigration() {
    try {
        logger.info('🚀 Iniciando migration de controle de acesso por área...');

        // PART 1: Criar tabelas
        logger.info('📋 PART 1: Criando tabelas pessoa_areas_acesso e dispositivo_sync_log...');
        const { error: err1 } = await supabase.rpc('exec_sql', {
            sql: `
CREATE TABLE IF NOT EXISTS public.pessoa_areas_acesso (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pessoa_id UUID NOT NULL REFERENCES public.pessoas(id) ON DELETE CASCADE,
    area_id UUID NOT NULL REFERENCES public.evento_areas(id) ON DELETE CASCADE,
    evento_id UUID NOT NULL REFERENCES public.eventos(id) ON DELETE CASCADE,
    criado_em TIMESTAMPTZ DEFAULT now(),
    criado_por UUID REFERENCES auth.users(id),
    UNIQUE(pessoa_id, area_id),
    CONSTRAINT fk_pessoa_evento CHECK (evento_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_pessoa_areas_pessoa_id ON public.pessoa_areas_acesso(pessoa_id);
CREATE INDEX IF NOT EXISTS idx_pessoa_areas_area_id ON public.pessoa_areas_acesso(area_id);
CREATE INDEX IF NOT EXISTS idx_pessoa_areas_evento_id ON public.pessoa_areas_acesso(evento_id);
CREATE INDEX IF NOT EXISTS idx_pessoa_areas_composite ON public.pessoa_areas_acesso(pessoa_id, evento_id, area_id);
            `
        });

        if (err1 && !err1.message.includes('already exists')) {
            logger.error('❌ Erro ao criar tabela pessoa_areas_acesso:', err1);
        } else {
            logger.info('✅ Tabela pessoa_areas_acesso criada/validada');
        }

        // PART 2: Adicionar colunas em pessoas
        logger.info('📋 PART 2: Adicionando colunas em pessoas...');
        const { error: err2 } = await supabase.rpc('exec_sql', {
            sql: `
ALTER TABLE public.pessoas ADD COLUMN IF NOT EXISTS areas_autorizadas UUID[] DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_pessoas_areas_autorizadas ON public.pessoas USING GIN(areas_autorizadas);
            `
        });

        if (err2 && !err2.message.includes('already exists')) {
            logger.error('❌ Erro ao adicionar colunas:', err2);
        } else {
            logger.info('✅ Colunas em pessoas criadas/validadas');
        }

        // PART 3: Adicionar colunas em dispositivos_acesso
        logger.info('📋 PART 3: Adicionando colunas em dispositivos_acesso...');
        const { error: err3 } = await supabase.rpc('exec_sql', {
            sql: `
ALTER TABLE public.dispositivos_acesso ADD COLUMN IF NOT EXISTS offline_mode VARCHAR(20) DEFAULT 'fail_closed' CHECK (offline_mode IN ('fail_closed', 'fail_open'));
ALTER TABLE public.dispositivos_acesso ADD COLUMN IF NOT EXISTS ultima_sincronizacao TIMESTAMPTZ;
ALTER TABLE public.dispositivos_acesso ADD COLUMN IF NOT EXISTS faces_cadastradas INTEGER DEFAULT 0;
ALTER TABLE public.dispositivos_acesso ADD COLUMN IF NOT EXISTS sync_status VARCHAR(50) DEFAULT 'pendente' CHECK (sync_status IN ('pendente', 'sincronizando', 'sucesso', 'erro'));
            `
        });

        if (err3 && !err3.message.includes('already exists')) {
            logger.error('❌ Erro ao adicionar colunas em dispositivos:', err3);
        } else {
            logger.info('✅ Colunas em dispositivos_acesso criadas/validadas');
        }

        // PART 4: Criar tabela dispositivo_sync_log
        logger.info('📋 PART 4: Criando tabela dispositivo_sync_log...');
        const { error: err4 } = await supabase.rpc('exec_sql', {
            sql: `
CREATE TABLE IF NOT EXISTS public.dispositivo_sync_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispositivo_id UUID NOT NULL REFERENCES public.dispositivos_acesso(id) ON DELETE CASCADE,
    pessoa_id UUID NOT NULL REFERENCES public.pessoas(id) ON DELETE CASCADE,
    area_id UUID REFERENCES public.evento_areas(id) ON DELETE SET NULL,
    evento_id UUID NOT NULL REFERENCES public.eventos(id) ON DELETE CASCADE,
    operacao VARCHAR(50) NOT NULL CHECK (operacao IN ('enroll', 'delete', 'verify')),
    status VARCHAR(50) NOT NULL CHECK (status IN ('sucesso', 'falha', 'pendente')),
    mensagem_erro TEXT,
    criado_em TIMESTAMPTZ DEFAULT now(),
    metadados JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_dispositivo_sync_log_dispositivo ON public.dispositivo_sync_log(dispositivo_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_dispositivo_sync_log_pessoa ON public.dispositivo_sync_log(pessoa_id, criado_em DESC);
            `
        });

        if (err4 && !err4.message.includes('already exists')) {
            logger.error('❌ Erro ao criar tabela dispositivo_sync_log:', err4);
        } else {
            logger.info('✅ Tabela dispositivo_sync_log criada/validada');
        }

        // PART 5: Ativar RLS
        logger.info('📋 PART 5: Ativando RLS nas novas tabelas...');
        const { error: err5 } = await supabase.rpc('exec_sql', {
            sql: `
ALTER TABLE public.pessoa_areas_acesso ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispositivo_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "service_role_bypass_paa" ON public.pessoa_areas_acesso
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "master_full_access_paa" ON public.pessoa_areas_acesso
    FOR ALL USING (
        COALESCE(
            auth.jwt() -> 'app_metadata' ->> 'nivel_acesso',
            auth.jwt() -> 'user_metadata' ->> 'nivel_acesso'
        ) IN ('master', 'admin_master')
    );

CREATE POLICY IF NOT EXISTS "tenant_isolation_paa" ON public.pessoa_areas_acesso
    FOR ALL USING (
        COALESCE(
            auth.jwt() -> 'app_metadata' ->> 'nivel_acesso',
            auth.jwt() -> 'user_metadata' ->> 'nivel_acesso'
        ) IN ('admin', 'supervisor', 'operador', 'admin_master')
        AND evento_id::text = COALESCE(
            auth.jwt() -> 'app_metadata' ->> 'evento_id',
            auth.jwt() -> 'user_metadata' ->> 'evento_id'
        )
    );

CREATE POLICY IF NOT EXISTS "service_role_bypass_dsl" ON public.dispositivo_sync_log
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "master_full_access_dsl" ON public.dispositivo_sync_log
    FOR ALL USING (
        COALESCE(
            auth.jwt() -> 'app_metadata' ->> 'nivel_acesso',
            auth.jwt() -> 'user_metadata' ->> 'nivel_acesso'
        ) IN ('master', 'admin_master')
    );

CREATE POLICY IF NOT EXISTS "tenant_isolation_dsl" ON public.dispositivo_sync_log
    FOR ALL USING (
        COALESCE(
            auth.jwt() -> 'app_metadata' ->> 'nivel_acesso',
            auth.jwt() -> 'user_metadata' ->> 'nivel_acesso'
        ) IN ('admin', 'supervisor', 'operador', 'admin_master')
        AND evento_id::text = COALESCE(
            auth.jwt() -> 'app_metadata' ->> 'evento_id',
            auth.jwt() -> 'user_metadata' ->> 'evento_id'
        )
    );
            `
        });

        if (err5) {
            logger.error('❌ Erro ao ativar RLS:', err5);
        } else {
            logger.info('✅ RLS ativado em todas as tabelas');
        }

        logger.info('✅ Migration concluída com sucesso!');
        return { success: true };

    } catch (error) {
        logger.error('❌ Erro ao aplicar migration:', error);
        throw error;
    }
}

// Executar se for chamado direto
if (require.main === module) {
    applyMigration()
        .then(result => {
            logger.info('Resultado:', result);
            process.exit(0);
        })
        .catch(err => {
            logger.error('Falha:', err);
            process.exit(1);
        });
}

module.exports = { applyMigration };
