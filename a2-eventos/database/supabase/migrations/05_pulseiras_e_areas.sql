-- ========================================================================================
-- GESTÃO DE ÁREAS E PULSEIRAS (DDL)
-- ========================================================================================

-- Tabela: evento_areas
CREATE TABLE IF NOT EXISTS public.evento_areas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    evento_id UUID NOT NULL REFERENCES public.eventos(id) ON DELETE CASCADE,
    nome_area VARCHAR(100) NOT NULL,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela: evento_tipos_pulseira
CREATE TABLE IF NOT EXISTS public.evento_tipos_pulseira (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    evento_id UUID NOT NULL REFERENCES public.eventos(id) ON DELETE CASCADE,
    nome_tipo VARCHAR(100) NOT NULL,
    cor_hex VARCHAR(7) NOT NULL, -- Ex: #FF0000
    numero_inicial INTEGER NOT NULL,
    numero_final INTEGER NOT NULL,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT valid_range CHECK (numero_inicial <= numero_final)
);

-- Tabela Pivô: pulseira_areas_permitidas (Quais áreas a pulseira pode acessar)
CREATE TABLE IF NOT EXISTS public.pulseira_areas_permitidas (
    pulseira_id UUID NOT NULL REFERENCES public.evento_tipos_pulseira(id) ON DELETE CASCADE,
    area_id UUID NOT NULL REFERENCES public.evento_areas(id) ON DELETE CASCADE,
    PRIMARY KEY (pulseira_id, area_id)
);

-- ========================================================================================
-- RLS (Row Level Security)
-- ========================================================================================

ALTER TABLE public.evento_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evento_tipos_pulseira ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pulseira_areas_permitidas ENABLE ROW LEVEL SECURITY;

-- EVENTO AREAS
CREATE POLICY "Leitura de áreas permitida para autenticados" 
ON public.evento_areas FOR SELECT TO authenticated USING (true);

CREATE POLICY "Gestão de áreas por Admins e Supervisores" 
ON public.evento_areas FOR ALL 
TO authenticated 
USING ( (auth.jwt() ->> 'role') IN ('admin', 'supervisor') );

-- TIPOS DE PULSEIRA
CREATE POLICY "Leitura de tipos de pulseira" 
ON public.evento_tipos_pulseira FOR SELECT TO authenticated USING (true);

CREATE POLICY "Gestão de tipos de pulseira por Admins e Supervisores" 
ON public.evento_tipos_pulseira FOR ALL 
TO authenticated 
USING ( (auth.jwt() ->> 'role') IN ('admin', 'supervisor') );

-- PULSEIRA AREAS PERMITIDAS
CREATE POLICY "Leitura das permissões de área da pulseira" 
ON public.pulseira_areas_permitidas FOR SELECT TO authenticated USING (true);

CREATE POLICY "Gestão de permissões de área por Admins e Supervisores" 
ON public.pulseira_areas_permitidas FOR ALL 
TO authenticated 
USING ( (auth.jwt() ->> 'role') IN ('admin', 'supervisor') );
