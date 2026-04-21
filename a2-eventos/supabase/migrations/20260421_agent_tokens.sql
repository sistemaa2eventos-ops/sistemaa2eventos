-- Tabela de tokens para agentes locais
CREATE TABLE IF NOT EXISTS public.agent_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome VARCHAR(100) NOT NULL,
    token TEXT UNIQUE NOT NULL,
    evento_id UUID REFERENCES public.eventos(id) ON DELETE CASCADE,
    ativo BOOLEAN DEFAULT true,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_connected_at TIMESTAMPTZ
);

-- Coluna agent_id na tabela dispositivos_acesso
ALTER TABLE public.dispositivos_acesso
    ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES public.agent_tokens(id) ON DELETE SET NULL;

-- RLS: só admins gerenciam tokens
ALTER TABLE public.agent_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "master_access" ON public.agent_tokens
    FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');

CREATE POLICY "staff_access" ON public.agent_tokens
    FOR SELECT USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor'));

COMMENT ON TABLE public.agent_tokens IS 'Tokens de autenticação para agentes locais (agent-local) em redes privadas';
COMMENT ON COLUMN public.dispositivos_acesso.agent_id IS 'Agente local responsável por este dispositivo. NULL = conexão direta da VPS';
