-- ==============================================================================
-- Migration: 20261127_relatorios_diarios_fechados_unique.sql
-- Objetivo: Garantir unicidade de snapshots diários por evento, data de referência e tipo de reset.
-- Evita duplicidade causada por concorrência de cron ou múltiplos resets no mesmo dia.
-- ==============================================================================

-- 1. Deduplicação prévia: mantém apenas o registro mais completo (maior total_checkins e mais recente)
DELETE FROM public.relatorios_diarios_fechados
WHERE id IN (
    SELECT id FROM (
        SELECT id,
               row_number() OVER (
                   PARTITION BY evento_id, data_referencia, tipo_reset
                   ORDER BY total_checkins DESC, created_at DESC, id
               ) as rn
        FROM public.relatorios_diarios_fechados
    ) t
    WHERE t.rn > 1
);

-- 2. Adição da Constraint Única
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.relatorios_diarios_fechados'::regclass
          AND (conname = 'relatorios_diarios_fechados_evento_data_tipo_unico' 
            OR conname = 'relatorios_diarios_fechados_evento_data_tipo_key')
    ) THEN
        ALTER TABLE public.relatorios_diarios_fechados
        ADD CONSTRAINT relatorios_diarios_fechados_evento_data_tipo_unico
        UNIQUE (evento_id, data_referencia, tipo_reset);
    END IF;
END $$;

COMMENT ON CONSTRAINT relatorios_diarios_fechados_evento_data_tipo_unico ON public.relatorios_diarios_fechados IS 
    'Garante apenas um snapshot por evento, dia de referência e tipo de reset (manual ou automático).';
