-- =====================================================================================================
-- Modelos de câmera editáveis no painel (19/11/2026)
--
-- Antes os endereços RTSP de cada fabricante estavam fixos no código (4 modelos). Em cada evento aparece
-- câmera diferente; agora a equipe cadastra o modelo em Configurações > Modelos de câmera, sem código.
--
-- Endereço: modelo com marcadores trocados pelo cadastro da câmera:
--   {auth}  → "usuario:senha@" (vazio se a câmera não tem senha)   {ip} → IP   {porta} → porta RTSP
--   {canal} → canal (padrão 1)
-- Ex.: rtsp://{auth}{ip}:{porta}/cam/realmonitor?channel={canal}&subtype=0
--
-- Idempotente: pode rodar mais de uma vez (os modelos de fábrica não são duplicados nem sobrescritos).
-- =====================================================================================================

CREATE TABLE IF NOT EXISTS public.modelos_camera (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome           TEXT NOT NULL UNIQUE CHECK (char_length(nome) BETWEEN 2 AND 60),
    porta_padrao   INTEGER NOT NULL DEFAULT 554 CHECK (porta_padrao BETWEEN 1 AND 65535),
    rtsp_principal TEXT CHECK (rtsp_principal IS NULL OR rtsp_principal ~* '^rtsps?://'),
    rtsp_sub       TEXT CHECK (rtsp_sub IS NULL OR rtsp_sub ~* '^rtsps?://'),
    observacoes    TEXT CHECK (observacoes IS NULL OR char_length(observacoes) <= 500),
    ativo          BOOLEAN NOT NULL DEFAULT TRUE,
    de_fabrica     BOOLEAN NOT NULL DEFAULT FALSE, -- veio com o sistema: pode ser editado, não apagado
    ordem          INTEGER NOT NULL DEFAULT 100,
    criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Só a API (service role) lê e grava
ALTER TABLE public.modelos_camera ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.modelos_camera FROM anon, authenticated;

INSERT INTO public.modelos_camera (nome, porta_padrao, rtsp_principal, rtsp_sub, observacoes, de_fabrica, ordem) VALUES
 ('Mercusys / Tapo', 554, 'rtsp://{auth}{ip}:{porta}/stream1', 'rtsp://{auth}{ip}:{porta}/stream2',
  'Usuário e senha são a "Conta da câmera" criada no app. Sub-stream em 720p e 8 a 10 fps.', TRUE, 10),
 ('Intelbras', 554, 'rtsp://{auth}{ip}:{porta}/cam/realmonitor?channel={canal}&subtype=0', 'rtsp://{auth}{ip}:{porta}/cam/realmonitor?channel={canal}&subtype=1',
  'Também serve para leitores Intelbras usados como câmera.', TRUE, 20),
 ('Dahua', 554, 'rtsp://{auth}{ip}:{porta}/cam/realmonitor?channel={canal}&subtype=0', 'rtsp://{auth}{ip}:{porta}/cam/realmonitor?channel={canal}&subtype=1',
  NULL, TRUE, 30),
 ('Hikvision', 554, 'rtsp://{auth}{ip}:{porta}/Streaming/Channels/{canal}01', 'rtsp://{auth}{ip}:{porta}/Streaming/Channels/{canal}02',
  NULL, TRUE, 40),
 ('Genérica', 554, NULL, NULL,
  'Informe o endereço RTSP completo no cadastro da câmera (manual do fabricante ou ONVIF Device Manager).', TRUE, 90)
ON CONFLICT (nome) DO NOTHING;
