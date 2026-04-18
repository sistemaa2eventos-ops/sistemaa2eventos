/**
 * Script para aplicar migration de áreas no Supabase
 * Use: npx node src/scripts/run_migration.js
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ VITE_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configuradas');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const migrationSQL = `
-- MIGRATION: Controle de Acesso por Área (Biometria)

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

ALTER TABLE public.pessoas ADD COLUMN IF NOT EXISTS areas_autorizadas UUID[] DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_pessoas_areas_autorizadas ON public.pessoas USING GIN(areas_autorizadas);

ALTER TABLE public.dispositivos_acesso ADD COLUMN IF NOT EXISTS offline_mode VARCHAR(20) DEFAULT 'fail_closed' CHECK (offline_mode IN ('fail_closed', 'fail_open'));
ALTER TABLE public.dispositivos_acesso ADD COLUMN IF NOT EXISTS ultima_sincronizacao TIMESTAMPTZ;
ALTER TABLE public.dispositivos_acesso ADD COLUMN IF NOT EXISTS faces_cadastradas INTEGER DEFAULT 0;
ALTER TABLE public.dispositivos_acesso ADD COLUMN IF NOT EXISTS sync_status VARCHAR(50) DEFAULT 'pendente' CHECK (sync_status IN ('pendente', 'sincronizando', 'sucesso', 'erro'));

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

ALTER TABLE public.pessoa_areas_acesso ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispositivo_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "service_role_bypass_paa" ON public.pessoa_areas_acesso FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "master_full_access_paa" ON public.pessoa_areas_acesso FOR ALL USING (COALESCE(auth.jwt() -> 'app_metadata' ->> 'nivel_acesso', auth.jwt() -> 'user_metadata' ->> 'nivel_acesso') IN ('master', 'admin_master'));
CREATE POLICY IF NOT EXISTS "tenant_isolation_paa" ON public.pessoa_areas_acesso FOR ALL USING (COALESCE(auth.jwt() -> 'app_metadata' ->> 'nivel_acesso', auth.jwt() -> 'user_metadata' ->> 'nivel_acesso') IN ('admin', 'supervisor', 'operador', 'admin_master') AND evento_id::text = COALESCE(auth.jwt() -> 'app_metadata' ->> 'evento_id', auth.jwt() -> 'user_metadata' ->> 'evento_id'));

CREATE POLICY IF NOT EXISTS "service_role_bypass_dsl" ON public.dispositivo_sync_log FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "master_full_access_dsl" ON public.dispositivo_sync_log FOR ALL USING (COALESCE(auth.jwt() -> 'app_metadata' ->> 'nivel_acesso', auth.jwt() -> 'user_metadata' ->> 'nivel_acesso') IN ('master', 'admin_master'));
CREATE POLICY IF NOT EXISTS "tenant_isolation_dsl" ON public.dispositivo_sync_log FOR ALL USING (COALESCE(auth.jwt() -> 'app_metadata' ->> 'nivel_acesso', auth.jwt() -> 'user_metadata' ->> 'nivel_acesso') IN ('admin', 'supervisor', 'operador', 'admin_master') AND evento_id::text = COALESCE(auth.jwt() -> 'app_metadata' ->> 'evento_id', auth.jwt() -> 'user_metadata' ->> 'evento_id'));
`;

async function runMigration() {
    try {
        console.log('🚀 Iniciando migration de controle de acesso por área...\n');
        
        // Executar via RPC (pode não funcionar se não houver função de execução SQL)
        // Alternativa: Usar postgres-js ou libpq-node
        
        console.log('⚠️  Nota: O Supabase não permite execução de SQL arbitrary via SDK.');
        console.log('📋 Copie e cole o SQL abaixo no Editor SQL do Supabase Dashboard:\n');
        console.log('═'.repeat(80));
        console.log(migrationSQL);
        console.log('═'.repeat(80));
        console.log('\n✅ SQL gerado. Cole no Supabase Dashboard > SQL Editor > Execute\n');
        
    } catch (error) {
        console.error('❌ Erro:', error.message);
        process.exit(1);
    }
}

runMigration();
