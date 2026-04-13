-- ========================================================================================
-- TABELAS (DDL)
-- ========================================================================================

-- Tabela: veiculos
CREATE TABLE IF NOT EXISTS public.veiculos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    placa VARCHAR(20) NOT NULL UNIQUE,
    modelo VARCHAR(100) NOT NULL,
    empresa_id UUID NOT NULL REFERENCES public.empresas(id),
    motorista_id UUID REFERENCES public.pessoas(id),
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela: logs_acesso_veiculos
CREATE TABLE IF NOT EXISTS public.logs_acesso_veiculos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    veiculo_id UUID NOT NULL REFERENCES public.veiculos(id) ON DELETE CASCADE,
    tipo_acesso VARCHAR(20) NOT NULL CHECK (tipo_acesso IN ('entrada', 'saida')),
    equipamento_id UUID,
    registrado_por UUID REFERENCES auth.users(id),
    data_hora TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela: historico_bloqueios
CREATE TABLE IF NOT EXISTS public.historico_bloqueios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pessoa_id UUID NOT NULL REFERENCES public.pessoas(id),
    acao_tipo VARCHAR(20) NOT NULL CHECK (acao_tipo IN ('bloqueio', 'desbloqueio')),
    justificativa TEXT NOT NULL,
    executado_por_admin_id UUID NOT NULL REFERENCES auth.users(id),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_historico_bloqueios_pessoa ON public.historico_bloqueios(pessoa_id);

-- Tabela: saas_config_global
CREATE TABLE IF NOT EXISTS public.saas_config_global (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome_plataforma VARCHAR(100) NOT NULL DEFAULT 'A2 Eventos',
    logo TEXT,
    max_eventos_ativos INTEGER NOT NULL DEFAULT 10,
    retencao_dados_meses INTEGER NOT NULL DEFAULT 12,
    atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    atualizado_por UUID REFERENCES auth.users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS singleton_saas_config ON public.saas_config_global((true));


-- ========================================================================================
-- RLS (Row Level Security)
-- ========================================================================================

ALTER TABLE public.veiculos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logs_acesso_veiculos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_bloqueios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_config_global ENABLE ROW LEVEL SECURITY;

-- VEÍCULOS
CREATE POLICY "Visualização de veículos permitida para autenticados" 
ON public.veiculos FOR SELECT TO authenticated USING (true);

CREATE POLICY "Gestão de veículos por Admins e Operadores" 
ON public.veiculos FOR ALL 
TO authenticated 
USING ( (auth.jwt() ->> 'role') IN ('admin', 'operador', 'supervisor') );

-- LOGS VEÍCULOS
CREATE POLICY "Leitura de logs de veículos" 
ON public.logs_acesso_veiculos FOR SELECT TO authenticated USING (true);

CREATE POLICY "Inserção de logs por operadores" 
ON public.logs_acesso_veiculos FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Deleção de logs restrita a administradores" 
ON public.logs_acesso_veiculos FOR DELETE 
TO authenticated USING ( (auth.jwt() ->> 'role') = 'admin' );

-- HISTÓRICO DE BLOQUEIOS (AUDITORIA RIGOROSA)
CREATE POLICY "Leitura do histórico por autenticados"
ON public.historico_bloqueios FOR SELECT TO authenticated USING (true);

CREATE POLICY "Registro de bloqueios por admins/supervisores"
ON public.historico_bloqueios FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Bloqueio absoluto de UPDATE no histórico"
ON public.historico_bloqueios FOR UPDATE TO authenticated USING (false);

CREATE POLICY "Apenas Admin pode excluir históricos de bloqueio"
ON public.historico_bloqueios FOR DELETE TO authenticated USING ( (auth.jwt() ->> 'role') = 'admin' );

-- SAAS CONFIG
CREATE POLICY "Configurações SaaS são públicas para leitura"
ON public.saas_config_global FOR SELECT USING (true);

CREATE POLICY "Apenas Super Admins podem alterar configs do SaaS"
ON public.saas_config_global FOR UPDATE 
TO authenticated USING ( (auth.jwt() ->> 'role') = 'super_admin' );
