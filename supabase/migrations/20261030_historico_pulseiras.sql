-- ==============================================================================
-- MIGRATION: Histórico de pulseiras (entregue, trocada, devolvida, perdida)
-- Data: 2026-10-30
--
-- Rodar inteira no SQL Editor do Supabase. Idempotente. Não altera dados existentes
-- (só lê pessoas e logs_acesso para montar o histórico que já aconteceu).
--
--   Antes, a pulseira ficava só em pessoas.numero_pulseira: ao trocar, a anterior
--   sumia. Agora cada vínculo pessoa ↔ pulseira vira uma linha com início e fim.
--
--   Um trigger em pessoas registra toda mudança de numero_pulseira, venha de onde
--   vier (credenciamento, check-in por pulseira, edição do cadastro, portal):
--     pulseira nova      → fecha a anterior como "substituida" e abre a nova
--     pulseira apagada   → fecha a atual como "desvinculada"
--   Devolvida e perdida são marcadas pelo painel (Relatórios → Pulseiras).
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.pulseira_vinculos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evento_id UUID NOT NULL REFERENCES public.eventos(id) ON DELETE CASCADE,
    pessoa_id UUID NOT NULL REFERENCES public.pessoas(id) ON DELETE CASCADE,
    numero_pulseira VARCHAR(100) NOT NULL,
    tipo_pulseira_id UUID,
    entregue_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    entregue_por UUID,
    encerrado_em TIMESTAMPTZ,
    encerrado_por UUID,
    motivo_encerramento VARCHAR(20)
        CHECK (motivo_encerramento IS NULL OR motivo_encerramento IN ('substituida', 'devolvida', 'perdida', 'desvinculada')),
    observacao TEXT,
    -- 'historico' = reconstruído dos logs na criação desta tabela (horários aproximados)
    origem VARCHAR(20) NOT NULL DEFAULT 'sistema' CHECK (origem IN ('sistema', 'historico')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (encerrado_em IS NULL OR motivo_encerramento IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_pulseira_vinculos_evento ON public.pulseira_vinculos (evento_id, entregue_em DESC);
CREATE INDEX IF NOT EXISTS idx_pulseira_vinculos_numero ON public.pulseira_vinculos (evento_id, numero_pulseira);
-- no máximo uma pulseira em uso por pessoa
CREATE UNIQUE INDEX IF NOT EXISTS uq_pulseira_vinculos_aberto ON public.pulseira_vinculos (pessoa_id) WHERE encerrado_em IS NULL;

-- Acesso só pelo backend (service role ignora RLS)
ALTER TABLE public.pulseira_vinculos ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- Histórico que já aconteceu: cada pulseira vista nos logs de uma pessoa, na ordem
-- do primeiro uso; a seguinte encerra a anterior. Só roda com a tabela vazia.
-- logs_acesso.created_at é TIMESTAMP (UTC sem fuso).
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.pulseira_vinculos) THEN
        RETURN;
    END IF;

    WITH usos AS (
        SELECT l.pessoa_id, p.evento_id, btrim(l.numero_pulseira) AS numero,
               MIN(l.created_at AT TIME ZONE 'UTC') AS primeiro_uso
        FROM public.logs_acesso l
        JOIN public.pessoas p ON p.id = l.pessoa_id
        WHERE l.numero_pulseira IS NOT NULL AND btrim(l.numero_pulseira) NOT IN ('', '—')
        GROUP BY l.pessoa_id, p.evento_id, btrim(l.numero_pulseira)
    ), ordenados AS (
        SELECT u.*, LEAD(u.primeiro_uso) OVER (PARTITION BY u.pessoa_id ORDER BY u.primeiro_uso) AS proximo
        FROM usos u
    )
    INSERT INTO public.pulseira_vinculos (evento_id, pessoa_id, numero_pulseira, entregue_em, encerrado_em, motivo_encerramento, origem)
    SELECT o.evento_id, o.pessoa_id, o.numero, o.primeiro_uso,
           CASE WHEN o.proximo IS NOT NULL THEN o.proximo
                WHEN btrim(COALESCE(p.numero_pulseira, '')) = o.numero THEN NULL
                ELSE COALESCE(p.updated_at, now()) END,
           CASE WHEN o.proximo IS NOT NULL THEN 'substituida'
                WHEN btrim(COALESCE(p.numero_pulseira, '')) = o.numero THEN NULL
                ELSE 'desvinculada' END,
           'historico'
    FROM ordenados o
    JOIN public.pessoas p ON p.id = o.pessoa_id;

    -- pulseira atual que ainda não apareceu em nenhum log
    INSERT INTO public.pulseira_vinculos (evento_id, pessoa_id, numero_pulseira, tipo_pulseira_id, entregue_em, origem)
    SELECT p.evento_id, p.id, btrim(p.numero_pulseira), p.tipo_pulseira_id, COALESCE(p.updated_at, now()), 'historico'
    FROM public.pessoas p
    WHERE p.evento_id IS NOT NULL
      AND p.numero_pulseira IS NOT NULL AND btrim(p.numero_pulseira) <> ''
      AND NOT EXISTS (SELECT 1 FROM public.pulseira_vinculos v WHERE v.pessoa_id = p.id AND v.encerrado_em IS NULL);

    UPDATE public.pulseira_vinculos v SET tipo_pulseira_id = p.tipo_pulseira_id
    FROM public.pessoas p
    WHERE v.pessoa_id = p.id AND v.encerrado_em IS NULL AND v.tipo_pulseira_id IS NULL;
END $$;

-- ------------------------------------------------------------------------------
-- Trigger: toda mudança de pessoas.numero_pulseira vira histórico.
-- SECURITY DEFINER: grava mesmo quando quem altera a pessoa não tem acesso à tabela
-- (portal, RLS); sem isso a mudança da pessoa falharia junto.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_vinculo_pulseira()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    novo TEXT := NULLIF(btrim(COALESCE(NEW.numero_pulseira, '')), '');
    antigo TEXT := CASE WHEN TG_OP = 'UPDATE' THEN NULLIF(btrim(COALESCE(OLD.numero_pulseira, '')), '') END;
BEGIN
    IF novo IS NOT DISTINCT FROM antigo OR NEW.evento_id IS NULL THEN
        RETURN NEW;
    END IF;

    UPDATE public.pulseira_vinculos
       SET encerrado_em = now(),
           motivo_encerramento = CASE WHEN novo IS NULL THEN 'desvinculada' ELSE 'substituida' END
     WHERE pessoa_id = NEW.id AND encerrado_em IS NULL;

    IF novo IS NOT NULL THEN
        INSERT INTO public.pulseira_vinculos (evento_id, pessoa_id, numero_pulseira, tipo_pulseira_id)
        VALUES (NEW.evento_id, NEW.id, novo, NEW.tipo_pulseira_id);
    END IF;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- o histórico nunca pode impedir o credenciamento
    RAISE WARNING 'registrar_vinculo_pulseira: %', SQLERRM;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_vinculo_pulseira ON public.pessoas;
CREATE TRIGGER trg_vinculo_pulseira
    AFTER INSERT OR UPDATE OF numero_pulseira ON public.pessoas
    FOR EACH ROW EXECUTE FUNCTION public.registrar_vinculo_pulseira();

-- Atualiza o cache de schema do PostgREST
NOTIFY pgrst, 'reload schema';
