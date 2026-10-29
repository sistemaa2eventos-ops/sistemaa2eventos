-- ==============================================================================
-- MIGRATION: Regras de remuneração (diárias, meia diária, horas extras, dobra)
-- Data: 2026-10-29
--
-- Rodar inteira no SQL Editor do Supabase. Idempotente. Não altera dados existentes.
--
--   Cada evento tem regras reutilizáveis ("Padrão 8h", "12x36 com dobra"...).
--   A empresa escolhe uma regra padrão e, se precisar, uma regra por função
--   (empresas.regras_por_funcao = {"SEGURANÇA": "<id da regra>"}).
--   Horas do dia = primeiro check-in → último check-out do turno.
--
--   Cálculo de um dia trabalhado (horas = h):
--     h >= horas_minimas_diaria                  → 1 diária
--     meia_diaria e h >= horas_minimas_meia      → ½ diária
--     senão                                      → 0
--     excedente_modo = 'horas_extras': minutos acima da jornada viram hora extra
--         (só se passar da tolerância); valor = valor_hora_extra ou
--         (valor_diaria / jornada) × (1 + percentual_hora_extra/100)
--     excedente_modo = 'dobra': passou de horas_para_dobra (+ tolerância) → 2 diárias
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.regras_remuneracao (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evento_id UUID NOT NULL REFERENCES public.eventos(id) ON DELETE CASCADE,
    nome VARCHAR(100) NOT NULL,
    jornada_horas NUMERIC(5,2) NOT NULL DEFAULT 8 CHECK (jornada_horas > 0 AND jornada_horas <= 24),
    valor_diaria NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (valor_diaria >= 0),
    horas_minimas_diaria NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (horas_minimas_diaria >= 0),
    meia_diaria BOOLEAN NOT NULL DEFAULT false,
    horas_minimas_meia NUMERIC(5,2) NOT NULL DEFAULT 4 CHECK (horas_minimas_meia >= 0),
    excedente_modo VARCHAR(20) NOT NULL DEFAULT 'nenhum'
        CHECK (excedente_modo IN ('nenhum', 'horas_extras', 'dobra')),
    percentual_hora_extra NUMERIC(6,2) NOT NULL DEFAULT 50 CHECK (percentual_hora_extra >= 0),
    valor_hora_extra NUMERIC(12,2) CHECK (valor_hora_extra IS NULL OR valor_hora_extra >= 0),
    horas_para_dobra NUMERIC(5,2) CHECK (horas_para_dobra IS NULL OR horas_para_dobra > 0),
    tolerancia_minutos INTEGER NOT NULL DEFAULT 15 CHECK (tolerancia_minutos >= 0),
    observacao TEXT,
    ativo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (evento_id, nome)
);
CREATE INDEX IF NOT EXISTS idx_regras_remuneracao_evento ON public.regras_remuneracao (evento_id);

ALTER TABLE public.empresas
    ADD COLUMN IF NOT EXISTS regra_remuneracao_id UUID REFERENCES public.regras_remuneracao(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS regras_por_funcao JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Acesso só pelo backend (service role ignora RLS)
ALTER TABLE public.regras_remuneracao ENABLE ROW LEVEL SECURITY;

-- Atualiza o cache de schema do PostgREST
NOTIFY pgrst, 'reload schema';
