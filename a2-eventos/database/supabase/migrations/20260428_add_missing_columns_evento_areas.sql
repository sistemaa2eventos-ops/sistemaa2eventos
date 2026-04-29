-- ============================================================================
-- Migration: 20260428_add_missing_columns_evento_areas.sql
-- Purpose: Add missing columns to evento_areas table
-- Database: Supabase PostgreSQL
-- ============================================================================

-- Add missing columns to evento_areas
ALTER TABLE public.evento_areas
  ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS capacidade_maxima INTEGER;

-- Create index on evento_id for better query performance
CREATE INDEX IF NOT EXISTS idx_evento_areas_evento_id
  ON public.evento_areas(evento_id);
