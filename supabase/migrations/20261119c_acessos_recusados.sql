-- ============================================================================
-- Migration: 20261119c_acessos_recusados.sql
-- Objetivo: LISTA VISÍVEL DE RECUSAS da fila de retentativa.
--
-- Quando o CloudSyncWorker (backend/api-nodejs/src/workers/cloud_sync_worker.js) recebe P0409 (entrada com a
-- pessoa já dentro, ou saída sem liberação) ou 23505 (duplicidade) para uma passagem que o operador já viu
-- como "ok", grava a recusa aqui, e não em logs_acesso. O painel lista as pendentes (GET /api/checkin/recusados)
-- e o operador marca como resolvida (POST /api/checkin/recusados/:id/resolver).
--
-- O que esta migration faz:
--   1. Guarda: exige public.eventos (chave estrangeira). Se a tabela já existir com outro formato
--      (faltam colunas usadas pelo backend), recusa rodar. Não altera tabela existente.
--   2. CREATE TABLE IF NOT EXISTS public.acessos_recusados.
--   3. Índice (evento_id, resolvido_em): a lista de pendentes do evento.
--   4. RLS ligada SEM políticas: anon e authenticated não leem nem gravam. Só o backend (service_role,
--      que ignora RLS) acessa.
--   5. REVOKE de PUBLIC, anon e authenticated; GRANT para service_role.
--   6. NOTIFY pgrst para o PostgREST enxergar a tabela.
--
-- Segurança de dados:
--   - NÃO apaga nada: sem DROP, sem DELETE, sem ALTER em tabela existente. Só CREATE (tabela e índice).
--   - Se a tabela já existir, só é aceita com as colunas esperadas; caso contrário a guarda recusa e nada muda.
--   - Tudo em BEGIN/COMMIT com lock_timeout de 3 s.
--   - Idempotente: pode rodar mais de uma vez.
--
-- Efeito enquanto esta migration NÃO estiver aplicada: o worker só registra a recusa no log do servidor
--   (aviso "Tabela acessos_recusados ausente") e confirma a mensagem, sem travar a fila. Os endpoints
--   respondem 503. Nada além disso muda.
--
-- Código que depende disto:
--   backend/api-nodejs/src/workers/cloud_sync_worker.js (registrarRecusa)
--   backend/api-nodejs/src/modules/checkin/recusados.controller.js (GET e POST)
--   backend/api-nodejs/src/modules/checkin/checkin.routes.js
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '3s';

-- ----------------------------------------------------------------------------
-- 0. Guarda: eventos existe; se acessos_recusados já existir, tem as colunas que o backend usa.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_faltando text[];
BEGIN
    IF to_regclass('public.eventos') IS NULL THEN
        RAISE EXCEPTION 'Migration 20261119c_acessos_recusados recusada: tabela public.eventos não existe. Nada foi alterado.';
    END IF;

    IF to_regclass('public.acessos_recusados') IS NOT NULL THEN
        SELECT array_agg(c) INTO v_faltando
          FROM unnest(ARRAY['evento_id','pessoa_id','area_id','etapa','tipo','metodo','motivo','dados','criado_em','resolvido_em','resolvido_por']) AS c
         WHERE NOT EXISTS (
               SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'acessos_recusados' AND column_name = c);
        IF v_faltando IS NOT NULL THEN
            RAISE EXCEPTION 'Migration 20261119c_acessos_recusados recusada: public.acessos_recusados já existe com outro formato (faltam: %). Nada foi alterado.', v_faltando;
        END IF;
    END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 1. Tabela. Uma linha por passagem recusada pela fila (o log original não é alterado).
--    pessoa_id e area_id sem chave estrangeira: a recusa é auditoria e não some se a pessoa ou área for removida.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.acessos_recusados (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evento_id    UUID NOT NULL REFERENCES public.eventos(id) ON DELETE CASCADE,
    pessoa_id    UUID NULL,
    area_id      UUID NULL,
    etapa        VARCHAR(30) NULL,
    tipo         VARCHAR(20) NOT NULL,
    metodo       VARCHAR(30) NULL,
    motivo       TEXT NOT NULL,
    dados        JSONB NULL,
    criado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolvido_em TIMESTAMPTZ NULL,
    resolvido_por UUID NULL
);

-- ----------------------------------------------------------------------------
-- 2. Índice da lista de pendentes do evento
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_acessos_recusados_evento_resolvido
    ON public.acessos_recusados (evento_id, resolvido_em);

-- ----------------------------------------------------------------------------
-- 3. Acesso: RLS ligada sem políticas (nada para anon/authenticated); só o backend com service_role
-- ----------------------------------------------------------------------------
ALTER TABLE public.acessos_recusados ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.acessos_recusados FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.acessos_recusados TO service_role;

-- Recarrega o cache de esquema do PostgREST (entregue no COMMIT)
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ==============================================================================
-- DESFAZER (rodar fora do pico; APAGA as recusas gravadas, só depois de conferir):
--
-- BEGIN;
-- SET LOCAL lock_timeout = '3s';
-- SELECT count(*) FROM public.acessos_recusados;   -- conferir: se houver linhas, exportar antes
-- DROP TABLE IF EXISTS public.acessos_recusados;
-- NOTIFY pgrst, 'reload schema';
-- COMMIT;
--
-- Depois de desfazer, o worker volta a só logar a recusa (aviso de tabela ausente) e os endpoints dão 503.
-- ==============================================================================
