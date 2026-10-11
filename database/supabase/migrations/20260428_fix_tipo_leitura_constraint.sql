-- ============================================================================
-- Migration: 20260428_fix_tipo_leitura_constraint.sql
-- Purpose: Fix tipo_leitura CHECK constraint to accept all barcode types
-- Database: Supabase PostgreSQL
-- ============================================================================

-- Remove old constraint if it exists
ALTER TABLE public.evento_tipos_pulseira
  DROP CONSTRAINT IF EXISTS evento_tipos_pulseira_tipo_leitura_check;

-- Add new constraint with all supported barcode types
ALTER TABLE public.evento_tipos_pulseira
  ADD CONSTRAINT evento_tipos_pulseira_tipo_leitura_check
  CHECK (tipo_leitura IN ('qr_code', 'number_only', 'barcode_ean13', 'barcode_128', 'barcode_39'));
