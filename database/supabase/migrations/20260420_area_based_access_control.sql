-- ============================================
-- MIGRATION: Controle de Acesso por Área (Biometria)
-- Data: 2026-04-20
-- Objetivo: Implementar acesso granular a dispositivos baseado em áreas
-- ============================================

-- ============================================
-- PASSO 1: Criar tabela de relacionamento pessoa_areas_acesso
-- ============================================
-- Esta tabela vincula uma pessoa a múltiplas áreas de acesso
-- Mais flexível do que um array e permite auditoria melhor

CREATE TABLE IF NOT EXISTS public.pessoa_areas_acesso (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pessoa_id UUID NOT NULL REFERENCES public.pessoas(id) ON DELETE CASCADE,
    area_id UUID NOT NULL REFERENCES public.evento_areas(id) ON DELETE CASCADE,
    evento_id UUID NOT NULL REFERENCES public.eventos(id) ON DELETE CASCADE,

    -- Metadados
    criado_em TIMESTAMPTZ DEFAULT now(),
    criado_por UUID REFERENCES auth.users(id),

    -- Garantir que a mesma pessoa não tem 2x acesso na mesma área
    UNIQUE(pessoa_id, area_id),

    -- Índices para queries rápidas
    CONSTRAINT fk_pessoa_evento CHECK (evento_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_pessoa_areas_pessoa_id
    ON public.pessoa_areas_acesso(pessoa_id);

CREATE INDEX IF NOT EXISTS idx_pessoa_areas_area_id
    ON public.pessoa_areas_acesso(area_id);

CREATE INDEX IF NOT EXISTS idx_pessoa_areas_evento_id
    ON public.pessoa_areas_acesso(evento_id);

-- Índice composto para query: "Quais áreas esta pessoa tem acesso?"
CREATE INDEX IF NOT EXISTS idx_pessoa_areas_composite
    ON public.pessoa_areas_acesso(pessoa_id, evento_id, area_id);

-- ============================================
-- PASSO 2: Adicionar colunas auxiliares em 'pessoas'
-- ============================================
-- Cache para auditoria/referência rápida (opcional, redundante com tabela acima)
ALTER TABLE public.pessoas
ADD COLUMN IF NOT EXISTS areas_autorizadas UUID[] DEFAULT '{}';

-- Índice GIN para queries em array
CREATE INDEX IF NOT EXISTS idx_pessoas_areas_autorizadas
    ON public.pessoas USING GIN(areas_autorizadas);

-- ============================================
-- PASSO 3: Adicionar campo offline_mode em dispositivos_acesso
-- ============================================
-- Controla comportamento quando dispositivo fica offline
-- 'fail_closed': Não abre ninguém (mais seguro)
-- 'fail_open': Abre se tiver acesso anterior (menos seguro, mas conveniência)

ALTER TABLE public.dispositivos_acesso
ADD COLUMN IF NOT EXISTS offline_mode VARCHAR(20)
    DEFAULT 'fail_closed'
    CHECK (offline_mode IN ('fail_closed', 'fail_open'));

-- ============================================
-- PASSO 4: Adicionar campos de sincronização em dispositivos_acesso
-- ============================================
-- Para rastrear última sincronização de rostos

ALTER TABLE public.dispositivos_acesso
ADD COLUMN IF NOT EXISTS ultima_sincronizacao TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS faces_cadastradas INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS sync_status VARCHAR(50) DEFAULT 'pendente'
    CHECK (sync_status IN ('pendente', 'sincronizando', 'sucesso', 'erro'));

-- ============================================
-- PASSO 5: Criar tabela de auditoria de sync de faces
-- ============================================
-- Para rastrear quem foi cadastrado/removido em qual leitor e quando

CREATE TABLE IF NOT EXISTS public.dispositivo_sync_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispositivo_id UUID NOT NULL REFERENCES public.dispositivos_acesso(id) ON DELETE CASCADE,
    pessoa_id UUID NOT NULL REFERENCES public.pessoas(id) ON DELETE CASCADE,
    area_id UUID REFERENCES public.evento_areas(id) ON DELETE SET NULL,
    evento_id UUID NOT NULL REFERENCES public.eventos(id) ON DELETE CASCADE,

    -- Tipo de operação
    operacao VARCHAR(50) NOT NULL CHECK (operacao IN ('enroll', 'delete', 'verify')),

    -- Resultado
    status VARCHAR(50) NOT NULL CHECK (status IN ('sucesso', 'falha', 'pendente')),
    mensagem_erro TEXT,

    -- Rastreamento
    criado_em TIMESTAMPTZ DEFAULT now(),

    -- Metadados
    metadados JSONB DEFAULT '{}' -- pode conter: { "hardware_id": "...", "confidence": 0.95 }
);

CREATE INDEX IF NOT EXISTS idx_dispositivo_sync_log_dispositivo
    ON public.dispositivo_sync_log(dispositivo_id, criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_dispositivo_sync_log_pessoa
    ON public.dispositivo_sync_log(pessoa_id, criado_em DESC);

-- ============================================
-- PASSO 6: Ativar RLS nas novas tabelas
-- ============================================

ALTER TABLE public.pessoa_areas_acesso ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispositivo_sync_log ENABLE ROW LEVEL SECURITY;

-- Política para pessoa_areas_acesso
CREATE POLICY "service_role_bypass_paa" ON public.pessoa_areas_acesso
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "master_full_access_paa" ON public.pessoa_areas_acesso
    FOR ALL USING (
        COALESCE(
            auth.jwt() -> 'app_metadata' ->> 'nivel_acesso',
            auth.jwt() -> 'user_metadata' ->> 'nivel_acesso'
        ) IN ('master', 'admin_master')
    );

CREATE POLICY "tenant_isolation_paa" ON public.pessoa_areas_acesso
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

-- Política para dispositivo_sync_log
CREATE POLICY "service_role_bypass_dsl" ON public.dispositivo_sync_log
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "master_full_access_dsl" ON public.dispositivo_sync_log
    FOR ALL USING (
        COALESCE(
            auth.jwt() -> 'app_metadata' ->> 'nivel_acesso',
            auth.jwt() -> 'user_metadata' ->> 'nivel_acesso'
        ) IN ('master', 'admin_master')
    );

CREATE POLICY "tenant_isolation_dsl" ON public.dispositivo_sync_log
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

-- ============================================
-- PASSO 7: Verificação final
-- ============================================

SELECT
    'pessoa_areas_acesso' as tabela,
    COUNT(*) as total_registros
FROM public.pessoa_areas_acesso
UNION ALL
SELECT
    'pessoas com areas' as tabela,
    COUNT(*) as total_registros
FROM public.pessoas
WHERE array_length(areas_autorizadas, 1) > 0
UNION ALL
SELECT
    'dispositivos com offline_mode' as tabela,
    COUNT(*) as total_registros
FROM public.dispositivos_acesso
WHERE offline_mode IS NOT NULL;
