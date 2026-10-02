-- ==============================================================================
-- MIGRATION: Vínculo Leitor Facial ↔ Operador (Sessões de Operador)
-- Data: 2026-10-01
-- Objetivo: Permitir que operadores de credenciamento se vinculem a estações/leitores
-- faciais físicos para abertura automática de cadastros via WebSocket.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.sessoes_operador (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operador_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    dispositivo_id UUID NOT NULL REFERENCES public.dispositivos_acesso(id) ON DELETE CASCADE,
    evento_id UUID NOT NULL REFERENCES public.eventos(id) ON DELETE CASCADE,
    estacao_nome VARCHAR(100),
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Garantir que 1 dispositivo só possa ter 1 operador ativo simultaneamente
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessao_dispositivo_ativo 
    ON public.sessoes_operador (dispositivo_id) 
    WHERE (ativo = true);

-- Garantir que 1 operador só possa estar vinculado a 1 dispositivo ativo simultaneamente
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessao_operador_ativo 
    ON public.sessoes_operador (operador_id) 
    WHERE (ativo = true);

-- Índices para busca rápida por evento e operador
CREATE INDEX IF NOT EXISTS idx_sessao_evento_ativo 
    ON public.sessoes_operador (evento_id, ativo);

CREATE INDEX IF NOT EXISTS idx_sessao_operador_busca 
    ON public.sessoes_operador (operador_id);

-- RLS (Row Level Security)
ALTER TABLE public.sessoes_operador ENABLE ROW LEVEL SECURITY;

-- 1. Service role tem acesso irrestrito
CREATE POLICY "service_role_bypass_sessoes_operador" 
    ON public.sessoes_operador 
    FOR ALL TO service_role 
    USING (true) 
    WITH CHECK (true);

-- 2. Master / Admin tem acesso completo
CREATE POLICY "master_sessoes_operador" 
    ON public.sessoes_operador 
    FOR ALL 
    USING (
        COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role') IN ('master', 'admin_master', 'admin')
    )
    WITH CHECK (
        COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role') IN ('master', 'admin_master', 'admin')
    );

-- 3. Operador pode visualizar e gerenciar sua própria sessão
CREATE POLICY "operador_propria_sessao" 
    ON public.sessoes_operador 
    FOR ALL 
    USING (operador_id = auth.uid())
    WITH CHECK (operador_id = auth.uid());

-- 4. Usuários autenticados do evento podem consultar sessões ativas (para saber quais leitores estão ocupados)
CREATE POLICY "operadores_ver_sessoes_evento" 
    ON public.sessoes_operador 
    FOR SELECT 
    USING (auth.role() = 'authenticated');

COMMENT ON TABLE public.sessoes_operador IS 'Vínculo temporário em tempo real entre operadores de credenciamento e leitores faciais/terminais';
COMMENT ON COLUMN public.sessoes_operador.estacao_nome IS 'Nome descritivo da estação de trabalho (ex: Baia 01, Guichê A)';
