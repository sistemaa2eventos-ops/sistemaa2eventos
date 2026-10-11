-- ==============================================================================
-- MIGRATION: Registro de Sessões de Login / Turno do Operador com Relatório
-- Data: 2026-10-06
-- Objetivo: Salvar o log consolidado de cada sessão do operador ao deslogar,
-- contendo horário de login, logout, tempo online, contagem de criações
-- (pessoas, empresas), exclusões, check-ins, notas de turno e resumo auditado.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.sessoes_login_operador (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operador_id UUID,
    operador_nome VARCHAR(255),
    operador_email VARCHAR(255),
    nivel_acesso VARCHAR(50),
    evento_id UUID REFERENCES public.eventos(id) ON DELETE SET NULL,
    login_at TIMESTAMPTZ NOT NULL,
    logout_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    tempo_online_segundos INTEGER DEFAULT 0,
    tempo_online_formatado VARCHAR(50),
    pessoas_criadas INTEGER DEFAULT 0,
    empresas_criadas INTEGER DEFAULT 0,
    itens_apagados INTEGER DEFAULT 0,
    checkins_realizados INTEGER DEFAULT 0,
    total_acoes INTEGER DEFAULT 0,
    notas TEXT,
    resumo_acoes JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para busca rápida
CREATE INDEX IF NOT EXISTS idx_sessao_login_operador ON public.sessoes_login_operador (operador_id);
CREATE INDEX IF NOT EXISTS idx_sessao_login_evento ON public.sessoes_login_operador (evento_id);
CREATE INDEX IF NOT EXISTS idx_sessao_login_data ON public.sessoes_login_operador (created_at DESC);

-- RLS
ALTER TABLE public.sessoes_login_operador ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_bypass_sessoes_login" 
    ON public.sessoes_login_operador 
    FOR ALL TO service_role 
    USING (true) 
    WITH CHECK (true);

CREATE POLICY "master_sessoes_login_all" 
    ON public.sessoes_login_operador 
    FOR ALL 
    USING (
        COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role') IN ('master', 'admin_master', 'admin', 'supervisor')
    )
    WITH CHECK (true);

CREATE POLICY "operador_proprias_sessoes_login" 
    ON public.sessoes_login_operador 
    FOR ALL 
    USING (operador_id = auth.uid())
    WITH CHECK (operador_id = auth.uid());

COMMENT ON TABLE public.sessoes_login_operador IS 'Histórico consolidado de turnos/sessões de operadores com métricas e notas para auditoria.';
