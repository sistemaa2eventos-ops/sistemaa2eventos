-- ==============================================================================
-- MIGRATION: Tabela de Relatórios Diários Fechados (Reset Diário Automático e Manual)
-- Data: 2026-10-06
-- Objetivo: Armazenar o snapshot completo do relatório diário gerado no reset diário
-- (Empresa, Colaborador, CPF, Função, Pulseira, Check-in, Check-out, Permanência).
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.relatorios_diarios_fechados (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evento_id UUID NOT NULL REFERENCES public.eventos(id) ON DELETE CASCADE,
    data_referencia DATE NOT NULL,
    hora_fechamento TIMESTAMPTZ DEFAULT NOW(),
    tipo_reset VARCHAR(20) DEFAULT 'manual', -- 'manual' ou 'automatico'
    executado_por UUID,
    total_colaboradores INTEGER DEFAULT 0,
    total_checkins INTEGER DEFAULT 0,
    total_checkouts INTEGER DEFAULT 0,
    dados_relatorio JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para busca rápida
CREATE INDEX IF NOT EXISTS idx_relatorios_diarios_evento_data 
    ON public.relatorios_diarios_fechados (evento_id, data_referencia DESC);

CREATE INDEX IF NOT EXISTS idx_relatorios_diarios_hora 
    ON public.relatorios_diarios_fechados (hora_fechamento DESC);

-- RLS
ALTER TABLE public.relatorios_diarios_fechados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_bypass_relatorios_diarios" 
    ON public.relatorios_diarios_fechados 
    FOR ALL TO service_role 
    USING (true) 
    WITH CHECK (true);

CREATE POLICY "authenticated_relatorios_diarios_select" 
    ON public.relatorios_diarios_fechados 
    FOR SELECT 
    USING (auth.role() = 'authenticated');

CREATE POLICY "authenticated_relatorios_diarios_insert" 
    ON public.relatorios_diarios_fechados 
    FOR INSERT 
    WITH CHECK (auth.role() = 'authenticated');

COMMENT ON TABLE public.relatorios_diarios_fechados IS 'Histórico arquivado de relatórios diários gerados no fechamento/reset de turno diário.';
