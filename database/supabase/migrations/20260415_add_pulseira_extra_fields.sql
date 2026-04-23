-- ============================================
-- Migration: Adicionar campos extras em evento_tipos_pulseira
-- Execute no Supabase SQL Editor
-- ============================================

-- Adicionar campos que estiverem faltando na tabela de tipos de pulseira
ALTER TABLE public.evento_tipos_pulseira 
ADD COLUMN IF NOT EXISTS tipo_leitura VARCHAR(20) DEFAULT 'combinada' 
CHECK (tipo_leitura IN ('numerada','qrcode','barcode','combinada'));

ALTER TABLE public.evento_tipos_pulseira 
ADD COLUMN IF NOT EXISTS prefixo_codigo VARCHAR(20);

ALTER TABLE public.evento_tipos_pulseira 
ADD COLUMN IF NOT EXISTS alerta_duplicidade BOOLEAN DEFAULT true;

ALTER TABLE public.evento_tipos_pulseira 
ADD COLUMN IF NOT EXISTS tempo_confirmacao_checkout INTEGER DEFAULT 3;

-- Verificar estrutura final
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'evento_tipos_pulseira' AND table_schema = 'public'
ORDER BY ordinal_position;