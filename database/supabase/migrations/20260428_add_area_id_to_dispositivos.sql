-- ============================================================================
-- Migration: 20260428_add_area_id_to_dispositivos.sql
-- Purpose: Add area_id column to dispositivos_acesso table with foreign key
-- Database: Supabase PostgreSQL
-- ============================================================================

-- Add area_id column to dispositivos_acesso
ALTER TABLE public.dispositivos_acesso
  ADD COLUMN IF NOT EXISTS area_id UUID REFERENCES public.evento_areas(id) ON DELETE SET NULL;

-- Create index on area_id for better query performance
CREATE INDEX IF NOT EXISTS idx_dispositivos_area_id
  ON public.dispositivos_acesso(area_id);

-- Create index on evento_id + area_id for multi-tenant queries
CREATE INDEX IF NOT EXISTS idx_dispositivos_evento_area
  ON public.dispositivos_acesso(evento_id, area_id);
