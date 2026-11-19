-- =====================================================================================================
-- Câmeras com giro (PTZ, ONVIF) — 19/11/2026
--
-- ptz_ativo: a câmera tem giro e o painel mostra os controles (setas, posições salvas).
-- ptz_porta: porta do serviço ONVIF da câmera (Mercusys/Tapo: 2020).
-- Idempotente. Sem esta migration o sistema continua funcionando; só não mostra os controles de giro.
-- =====================================================================================================

ALTER TABLE public.cameras_ip ADD COLUMN IF NOT EXISTS ptz_ativo BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.cameras_ip ADD COLUMN IF NOT EXISTS ptz_porta INTEGER NOT NULL DEFAULT 2020
    CHECK (ptz_porta BETWEEN 1 AND 65535);
