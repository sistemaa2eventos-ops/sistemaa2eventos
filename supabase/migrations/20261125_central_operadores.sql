-- Central de Monitoramento local: operadores com login e senha, e registro de quem operou as câmeras.
--
-- Por quê: a Central era aberta com uma chave única, sem saber quem estava do outro lado. Com operadores
-- nomeados, cada acesso e cada ação (assistir, girar, falar, assumir o controle) fica registrada com o
-- nome e o horário (LGPD: rastreabilidade do tratamento de imagens; LAI: prestação de contas).
--
-- Acesso: só a API (service role). RLS ligado sem políticas: nenhum cliente lê essas tabelas direto.
-- A senha nunca é guardada: só o hash scrypt (scrypt$salt$hash). O agente do evento recebe os hashes
-- dos operadores ativos para o login funcionar no PC mesmo sem internet.

CREATE TABLE IF NOT EXISTS public.central_operadores (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    evento_id     uuid NOT NULL REFERENCES public.eventos(id) ON DELETE CASCADE,
    nome          text NOT NULL CHECK (char_length(nome) BETWEEN 2 AND 80),
    login         text NOT NULL CHECK (login ~ '^[a-z0-9._-]{3,40}$'),
    senha_hash    text NOT NULL CHECK (senha_hash LIKE 'scrypt$%'),
    ativo         boolean NOT NULL DEFAULT true,
    criado_por    uuid,
    ultimo_acesso timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT central_operadores_login_evento_unico UNIQUE (evento_id, login)
);

CREATE INDEX IF NOT EXISTS central_operadores_evento_idx ON public.central_operadores (evento_id);

ALTER TABLE public.central_operadores ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.central_auditoria (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- Identificador gerado no PC: reenvio do mesmo registro (internet caiu no meio) não duplica
    uid            text NOT NULL UNIQUE CHECK (char_length(uid) BETWEEN 8 AND 64),
    evento_id      uuid NOT NULL REFERENCES public.eventos(id) ON DELETE CASCADE,
    -- Conta excluída: o registro fica, com o nome e o login gravados na hora da ação
    operador_id    uuid REFERENCES public.central_operadores(id) ON DELETE SET NULL,
    operador_nome  text NOT NULL,
    operador_login text,
    acao           text NOT NULL CHECK (char_length(acao) BETWEEN 2 AND 40),
    camera_id      text,
    detalhe        jsonb NOT NULL DEFAULT '{}'::jsonb,
    ocorrido_em    timestamptz NOT NULL,
    recebido_em    timestamptz NOT NULL DEFAULT now(),
    agente_id      uuid
);

CREATE INDEX IF NOT EXISTS central_auditoria_evento_data_idx ON public.central_auditoria (evento_id, ocorrido_em DESC);
CREATE INDEX IF NOT EXISTS central_auditoria_operador_idx ON public.central_auditoria (operador_id);

ALTER TABLE public.central_auditoria ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.central_operadores IS 'Operadores da Central de Monitoramento local (login próprio, por evento). Só a API acessa.';
COMMENT ON TABLE public.central_auditoria IS 'Quem operou a Central e quando (assistir, girar, falar, controle). Só a API acessa.';
