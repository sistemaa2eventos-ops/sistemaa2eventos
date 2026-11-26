-- Portal da empresa (empresa.nzt.app.br): login do responsável e solicitações para o operador.
--
-- Login: e-mail do responsável (empresas.email) + chave de acesso gerada no painel.
--   portal_chave_hash      scrypt da chave (é o que o login confere)
--   portal_chave_cifrada   chave cifrada (AES-256-GCM) com segredo do servidor, para o painel mostrar
--                          e enviar junto com o link; sem o segredo do servidor não dá para ler
--   portal_chave_gerada_em gerar outra chave encerra as sessões abertas no portal
--
-- Solicitações: o que o responsável não pode fazer sozinho (excluir, editar dados já cadastrados)
-- fica pendente até um operador com permissão aprovar ou recusar no painel.

ALTER TABLE public.empresas
    ADD COLUMN IF NOT EXISTS portal_chave_hash text,
    ADD COLUMN IF NOT EXISTS portal_chave_cifrada text,
    ADD COLUMN IF NOT EXISTS portal_chave_gerada_em timestamptz,
    ADD COLUMN IF NOT EXISTS portal_ultimo_acesso timestamptz;

-- Login por e-mail (sem diferenciar maiúsculas)
CREATE INDEX IF NOT EXISTS idx_empresas_email_lower ON public.empresas (lower(email));

CREATE TABLE IF NOT EXISTS public.empresa_solicitacoes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    evento_id uuid NOT NULL REFERENCES public.eventos(id) ON DELETE CASCADE,
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    tipo text NOT NULL CHECK (tipo IN (
        'excluir_participante', 'editar_participante', 'excluir_documento', 'editar_empresa', 'outro'
    )),
    alvo_tipo text CHECK (alvo_tipo IN ('empresa', 'pessoa', 'documento_pessoa', 'documento_empresa')),
    alvo_id uuid,
    alvo_resumo text,                       -- nome do participante/documento na hora do pedido
    dados jsonb NOT NULL DEFAULT '{}'::jsonb, -- mudanças pedidas (edições)
    motivo text,
    status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovada', 'recusada', 'cancelada')),
    resposta text,
    decidida_por uuid,
    decidida_em timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_empresa_solicitacoes_evento ON public.empresa_solicitacoes (evento_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_empresa_solicitacoes_empresa ON public.empresa_solicitacoes (empresa_id, created_at DESC);

-- Só o servidor (service role) lê e grava: o portal e o painel passam pela API
ALTER TABLE public.empresa_solicitacoes ENABLE ROW LEVEL SECURITY;
