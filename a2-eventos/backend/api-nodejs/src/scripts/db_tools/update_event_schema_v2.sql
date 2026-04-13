-- 🩹 REPARO DE SCHEMA: ADICIONAR MÉTODOS DE CHECK-OUT
ALTER TABLE public.eventos 
ADD COLUMN IF NOT EXISTS tipos_checkout text[] DEFAULT '{qrcode,barcode,manual}';

-- COMENTÁRIO PARA DOCUMENTAÇÃO
COMMENT ON COLUMN public.eventos.tipos_checkout IS 'Métodos permitidos para check-out no dashboard';
