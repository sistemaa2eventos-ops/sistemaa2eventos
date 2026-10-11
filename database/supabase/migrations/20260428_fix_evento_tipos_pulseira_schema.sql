-- ============================================================================
-- Migration: 20260428_fix_evento_tipos_pulseira_schema.sql
-- Purpose: Add missing columns to evento_tipos_pulseira table
-- Database: Supabase PostgreSQL
-- ============================================================================

-- Add missing columns to evento_tipos_pulseira
ALTER TABLE public.evento_tipos_pulseira
  ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS prefixo_codigo VARCHAR(50),
  ADD COLUMN IF NOT EXISTS alerta_duplicidade BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS tempo_confirmacao_checkout INTEGER DEFAULT 5;

-- Create index on evento_id for better query performance
CREATE INDEX IF NOT EXISTS idx_evento_tipos_pulseira_evento_id
  ON public.evento_tipos_pulseira(evento_id);
