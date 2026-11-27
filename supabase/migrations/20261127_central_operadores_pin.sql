-- Migration: Adicionar suporte a PIN rápido para operadores da Central de Monitoramento
ALTER TABLE public.central_operadores 
ADD COLUMN IF NOT EXISTS pin_hash text CHECK (pin_hash IS NULL OR pin_hash LIKE 'scrypt$%');

COMMENT ON COLUMN public.central_operadores.pin_hash IS 'Hash scrypt do PIN rápido (4 a 6 dígitos) para troca ágil de turno e desbloqueio por inatividade na Central.';
