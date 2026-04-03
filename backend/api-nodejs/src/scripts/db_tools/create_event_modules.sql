-- 🧩 SISTEMA DE MÓDULOS CONFIGURÁVEIS POR EVENTO

-- 1. Criar a tabela de módulos
CREATE TABLE IF NOT EXISTS public.event_modules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evento_id UUID NOT NULL REFERENCES public.eventos(id) ON DELETE CASCADE,
    module_key TEXT NOT NULL,
    is_enabled BOOLEAN DEFAULT true,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(evento_id, module_key)
);

-- 2. Função para inicializar módulos padrão para um evento
CREATE OR REPLACE FUNCTION public.initialize_event_modules()
RETURNS TRIGGER AS $$
BEGIN
    -- Métodos de Check-in
    INSERT INTO public.event_modules (evento_id, module_key, is_enabled) VALUES
    (NEW.id, 'checkin_qrcode', true),
    (NEW.id, 'checkin_barcode', true),
    (NEW.id, 'checkin_manual', true),
    (NEW.id, 'checkin_rfid', true),
    (NEW.id, 'checkin_face', true);

    -- Métodos de Check-out
    INSERT INTO public.event_modules (evento_id, module_key, is_enabled) VALUES
    (NEW.id, 'checkout_qrcode', true),
    (NEW.id, 'checkout_barcode', true),
    (NEW.id, 'checkout_manual', true),
    (NEW.id, 'checkout_rfid', true),
    (NEW.id, 'checkout_face', true);

    -- Funcionalidades Extras
    INSERT INTO public.event_modules (evento_id, module_key, is_enabled) VALUES
    (NEW.id, 'print_badge', NEW.impressao_etiquetas),
    (NEW.id, 'self_registration', true);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Trigger para novos eventos
DROP TRIGGER IF EXISTS tr_initialize_event_modules ON public.eventos;
CREATE TRIGGER tr_initialize_event_modules
AFTER INSERT ON public.eventos
FOR EACH ROW EXECUTE FUNCTION public.initialize_event_modules();

-- 4. Inicializar módulos para eventos existentes
DO $$
DECLARE
    event_rec RECORD;
BEGIN
    FOR event_rec IN SELECT id, impressao_etiquetas FROM public.eventos LOOP
        -- Verificar se já existem módulos para este evento para evitar duplicidade
        IF NOT EXISTS (SELECT 1 FROM public.event_modules WHERE evento_id = event_rec.id) THEN
            INSERT INTO public.event_modules (evento_id, module_key, is_enabled) VALUES
            (event_rec.id, 'checkin_qrcode', true),
            (event_rec.id, 'checkin_barcode', true),
            (event_rec.id, 'checkin_manual', true),
            (event_rec.id, 'checkin_rfid', true),
            (event_rec.id, 'checkin_face', true),
            (event_rec.id, 'checkout_qrcode', true),
            (event_rec.id, 'checkout_barcode', true),
            (event_rec.id, 'checkout_manual', true),
            (event_rec.id, 'checkout_rfid', true),
            (event_rec.id, 'checkout_face', true),
            (event_rec.id, 'print_badge', event_rec.impressao_etiquetas),
            (event_rec.id, 'self_registration', true);
        END IF;
    END LOOP;
END $$;
