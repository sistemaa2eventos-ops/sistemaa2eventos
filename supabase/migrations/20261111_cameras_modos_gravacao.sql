-- ==============================================================================
-- MIGRATION: Câmeras sob demanda (vídeo sem IA, IA por câmera, gravação local, leitores)
-- Data: 2026-11-11
-- Idempotente: pode ser executada mais de uma vez. Não remove dados.
--
-- Câmeras já cadastradas mantêm a IA e a vigilância como estão; só as NOVAS nascem em
-- "Só monitorar" (ia_ativa = false). Modo de IA de cada câmera:
--   ia_ativa = false                         → Só monitorar (não usa o motor)
--   ia_ativa = true,  vigilancia_ativa=false → IA ao assistir
--   ia_ativa = true,  vigilancia_ativa=true  → IA 24 h
-- ==============================================================================

ALTER TABLE public.cameras_ip ALTER COLUMN ia_ativa SET DEFAULT FALSE;
ALTER TABLE public.cameras_ip ALTER COLUMN vigilancia_ativa SET DEFAULT FALSE;

ALTER TABLE public.cameras_ip
    ADD COLUMN IF NOT EXISTS gravacao_modo TEXT NOT NULL DEFAULT 'desligada',  -- desligada · continua · alertas
    ADD COLUMN IF NOT EXISTS gravacao_stream TEXT NOT NULL DEFAULT 'sub',      -- sub (leve) · principal (nítido)
    ADD COLUMN IF NOT EXISTS gravacao_drive BOOLEAN NOT NULL DEFAULT FALSE,    -- copia os trechos de ALERTA ao Drive
    ADD COLUMN IF NOT EXISTS dispositivo_id UUID;                              -- câmera de um leitor facial

ALTER TABLE public.cameras_ip DROP CONSTRAINT IF EXISTS cameras_ip_gravacao_modo_check;
ALTER TABLE public.cameras_ip ADD CONSTRAINT cameras_ip_gravacao_modo_check
    CHECK (gravacao_modo IN ('desligada', 'continua', 'alertas'));
ALTER TABLE public.cameras_ip DROP CONSTRAINT IF EXISTS cameras_ip_gravacao_stream_check;
ALTER TABLE public.cameras_ip ADD CONSTRAINT cameras_ip_gravacao_stream_check
    CHECK (gravacao_stream IN ('sub', 'principal'));

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cameras_ip_dispositivo_id_fkey') THEN
        ALTER TABLE public.cameras_ip ADD CONSTRAINT cameras_ip_dispositivo_id_fkey
            FOREIGN KEY (dispositivo_id) REFERENCES public.dispositivos_acesso(id) ON DELETE CASCADE;
    END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS idx_cameras_ip_dispositivo ON public.cameras_ip (dispositivo_id) WHERE dispositivo_id IS NOT NULL;

-- Chaves gerais do evento (topo da tela de câmeras). Sem linha = padrão abaixo.
CREATE TABLE IF NOT EXISTS public.cameras_evento_config (
    evento_id UUID PRIMARY KEY REFERENCES public.eventos(id) ON DELETE CASCADE,
    motor_ia_ativo BOOLEAN NOT NULL DEFAULT TRUE,         -- desligado: o agente para o motor de IA do PC
    gravacao_ativa BOOLEAN NOT NULL DEFAULT TRUE,         -- desligado: nenhuma câmera grava (escolhas mantidas)
    gravacao_limite_gb INTEGER NOT NULL DEFAULT 40 CHECK (gravacao_limite_gb BETWEEN 2 AND 4000),
    gravacao_retencao_dias INTEGER NOT NULL DEFAULT 30 CHECK (gravacao_retencao_dias BETWEEN 1 AND 365),
    atualizado_por TEXT,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Gravações guardadas no PC do agente que gravou (o arquivo nunca sai do PC, exceto
-- trechos de alerta de câmeras com gravacao_drive = true).
CREATE TABLE IF NOT EXISTS public.gravacoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evento_id UUID NOT NULL,
    camera_id UUID,
    camera_nome TEXT,
    agent_id UUID,
    arquivo TEXT NOT NULL,                    -- caminho relativo à pasta de gravações do PC
    motivo TEXT NOT NULL DEFAULT 'continua',  -- continua · alerta
    alerta_descricao TEXT,
    inicio TIMESTAMPTZ NOT NULL,
    fim TIMESTAMPTZ,
    tamanho_bytes BIGINT,
    status TEXT NOT NULL DEFAULT 'local',     -- local · apagada
    drive_file_id TEXT,
    drive_erro TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (agent_id, arquivo)
);
CREATE INDEX IF NOT EXISTS idx_gravacoes_evento_inicio ON public.gravacoes (evento_id, inicio DESC);
CREATE INDEX IF NOT EXISTS idx_gravacoes_camera_inicio ON public.gravacoes (camera_id, inicio DESC);

-- Quem abriu ou baixou cada gravação (LGPD: imagem de pessoas)
CREATE TABLE IF NOT EXISTS public.gravacoes_acessos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gravacao_id UUID NOT NULL REFERENCES public.gravacoes(id) ON DELETE CASCADE,
    usuario_id UUID,
    usuario_email TEXT,
    acao TEXT NOT NULL,                       -- assistir · baixar
    ip TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gravacoes_acessos_gravacao ON public.gravacoes_acessos (gravacao_id, created_at DESC);

-- Sem políticas: só o servidor (service role) lê e grava
ALTER TABLE public.cameras_evento_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gravacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gravacoes_acessos ENABLE ROW LEVEL SECURITY;

-- Biometria para o motor de IA sem a chave de serviço no PC do evento: a API envia ao agente só o
-- que mudou desde a última sincronização (nome, bloqueio, status ou rosto).
ALTER TABLE public.pessoas ADD COLUMN IF NOT EXISTS biometria_atualizada_em TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_pessoas_evento_biometria ON public.pessoas (evento_id, biometria_atualizada_em)
    WHERE face_encoding IS NOT NULL;

CREATE OR REPLACE FUNCTION public.pessoas_marcar_biometria()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    -- status_acesso muda a cada check-in: só conta quando entra ou sai de 'bloqueado' (o motor só
    -- usa isso). clock_timestamp(): carimbo diferente por linha mesmo num UPDATE em massa (o
    -- agente pagina por esse carimbo; now() repetia o mesmo valor e travava a paginação).
    IF TG_OP = 'INSERT'
       OR NEW.face_encoding IS DISTINCT FROM OLD.face_encoding
       OR NEW.nome_completo IS DISTINCT FROM OLD.nome_completo
       OR NEW.cpf IS DISTINCT FROM OLD.cpf
       OR NEW.bloqueado IS DISTINCT FROM OLD.bloqueado
       OR ((NEW.status_acesso = 'bloqueado') IS DISTINCT FROM (OLD.status_acesso = 'bloqueado'))
       OR NEW.foto_url IS DISTINCT FROM OLD.foto_url
       OR NEW.evento_id IS DISTINCT FROM OLD.evento_id THEN
        NEW.biometria_atualizada_em := clock_timestamp();
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pessoas_marcar_biometria ON public.pessoas;
CREATE TRIGGER trg_pessoas_marcar_biometria
    BEFORE INSERT OR UPDATE ON public.pessoas
    FOR EACH ROW EXECUTE FUNCTION public.pessoas_marcar_biometria();
