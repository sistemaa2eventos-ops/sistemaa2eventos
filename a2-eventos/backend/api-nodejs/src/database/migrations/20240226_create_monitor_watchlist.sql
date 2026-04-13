-- Create monitor_watchlist table
CREATE TABLE IF NOT EXISTS public.monitor_watchlist (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    evento_id UUID NOT NULL REFERENCES public.eventos(id) ON DELETE CASCADE,
    pessoa_id UUID REFERENCES public.pessoas(id) ON DELETE SET NULL,
    cpf VARCHAR(14),
    nome VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.monitor_watchlist ENABLE ROW LEVEL SECURITY;

-- Policy (simplificada para o contexto do projeto)
CREATE POLICY "Allow all for authenticated users" ON public.monitor_watchlist
    FOR ALL USING (auth.role() = 'authenticated');

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON public.monitor_watchlist
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();
