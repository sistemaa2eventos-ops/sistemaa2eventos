-- 0. Garantir Coluna de nome amigável (Caso não exista)
ALTER TABLE public.sys_permissions 
ADD COLUMN IF NOT EXISTS nome_humanizado VARCHAR(255);

-- 1. Criar a Tabela de Matriz por Evento (Se não existir)
CREATE TABLE IF NOT EXISTS public.sys_event_role_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    evento_id UUID NOT NULL REFERENCES public.eventos(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES public.sys_roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES public.sys_permissions(id) ON DELETE CASCADE,
    autorizado BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(evento_id, role_id, permission_id)
);

-- 2. Garantir que todos os Perfis solicitados existam em sys_roles
INSERT INTO public.sys_roles (nome, descricao, is_system_role)
VALUES 
    ('master', 'Soberania absoluta do sistema A2/NZT', true),
    ('admin', 'Dono de Agência/Cliente com todos eventos', true),
    ('supervisor', 'Líder operacional de evento', true),
    ('tecnico', 'Responsável técnico por dispositivos', true),
    ('analista', 'Analista de dados e relatórios', true),
    ('operador', 'Operador de terminal e recepção', true),
    ('monitor', 'Monitoramento passivo de acessos', true),
    ('portaria', 'Controle básico de entrada/saída', true),
    ('estacionamento', 'Controle de veículos e cancelas', true),
    ('cliente_tecnico', 'Responsável técnico do cliente final', true)
ON CONFLICT (nome) DO UPDATE SET descricao = EXCLUDED.descricao;

-- 3. Garantir os Recursos (Permissions) base
INSERT INTO public.sys_permissions (recurso, acao, nome_humanizado, descricao)
VALUES 
    ('monitor', 'visualizar', 'Ver Monitor', 'Acesso às telas de tempo real'),
    ('pessoas', 'gerenciar', 'Gestão Pessoas', 'Criar/Editar credenciados'),
    ('eventos', 'configurar', 'Config Evento', 'Alterar dados do evento'),
    ('empresas', 'gerenciar', 'Gestão Empresas', 'Acesso ao cadastro de parceiros'),
    ('relatorios', 'gerar', 'Ver Relatórios', 'Exportar dados e dashboards'),
    ('financeiro', 'visualizar', 'Ver Financeiro', 'Acesso a métricas de venda/consumo'),
    ('dispositivos', 'operar', 'Operar Hardware', 'Configurar catracas e câmeras'),
    ('configuracoes', 'ajustar', 'Ajustar Sistema', 'Acesso ao menu de configs globais')
ON CONFLICT (recurso, acao) DO UPDATE SET nome_humanizado = EXCLUDED.nome_humanizado;
