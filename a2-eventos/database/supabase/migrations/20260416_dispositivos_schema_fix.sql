-- ============================================================================
-- Migration: 20260416_dispositivos_schema_fix.sql
-- Purpose: Add missing columns to dispositivos_acesso and create terminal_sync_queue table
-- Database: Supabase PostgreSQL
-- ============================================================================

-- Adicionar colunas faltantes em dispositivos_acesso
-- Estas colunas são referenciadas pelo código de sync mas não existem
ALTER TABLE public.dispositivos_acesso
  ADD COLUMN IF NOT EXISTS status_online VARCHAR(20) DEFAULT 'offline',
  ADD COLUMN IF NOT EXISTS modo VARCHAR(20) DEFAULT 'ambos' CHECK (modo IN ('checkin', 'checkout', 'ambos')),
  ADD COLUMN IF NOT EXISTS ultimo_ping TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS area_nome VARCHAR(100);

-- Criar tabela de fila de sincronização de terminais
-- Esta tabela garante que comandos (enroll_face, delete_face) não se percam
-- quando um terminal está offline
CREATE TABLE IF NOT EXISTS public.terminal_sync_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispositivo_id UUID NOT NULL REFERENCES public.dispositivos_acesso(id) ON DELETE CASCADE,
  tipo_comando VARCHAR(50) NOT NULL,
  pessoa_id UUID,
  payload JSONB,
  status VARCHAR(20) DEFAULT 'pendente' CHECK (status IN ('pendente', 'sucesso', 'erro')),
  attempt_count INTEGER DEFAULT 0,
  error_message TEXT,
  last_attempt TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance (busca e processamento de fila)
CREATE INDEX IF NOT EXISTS idx_tsq_dispositivo_status
  ON public.terminal_sync_queue(dispositivo_id, status);

CREATE INDEX IF NOT EXISTS idx_tsq_pendente
  ON public.terminal_sync_queue(status)
  WHERE status = 'pendente';

CREATE INDEX IF NOT EXISTS idx_disp_evento_online
  ON public.dispositivos_acesso(evento_id, status_online);

-- Criar função para manter updated_at atualizado
CREATE OR REPLACE FUNCTION update_terminal_sync_queue_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar trigger para updated_at
DROP TRIGGER IF EXISTS trigger_terminal_sync_queue_updated_at ON public.terminal_sync_queue;
CREATE TRIGGER trigger_terminal_sync_queue_updated_at
  BEFORE UPDATE ON public.terminal_sync_queue
  FOR EACH ROW
  EXECUTE FUNCTION update_terminal_sync_queue_updated_at();
