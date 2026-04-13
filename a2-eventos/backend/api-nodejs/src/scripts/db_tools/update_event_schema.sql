-- 🚀 AGREGANDO CONFIGURAÇÕES DE FLUXO AOS EVENTOS
ALTER TABLE public.eventos 
ADD COLUMN IF NOT EXISTS tipos_checkin text[] DEFAULT '{"qrcode", "barcode", "manual"}',
ADD COLUMN IF NOT EXISTS impressao_etiquetas boolean DEFAULT false;

-- Comentários para documentação
COMMENT ON COLUMN public.eventos.tipos_checkin IS 'Lista de métodos de check-in permitidos (qrcode, barcode, manual, rfid, face)';
COMMENT ON COLUMN public.eventos.impressao_etiquetas IS 'Define se o evento utiliza impressão de etiquetas no check-in';
