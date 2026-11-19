-- =====================================================================================================
-- Fila de sincronização dos leitores faciais (19/11/2026)
--
-- Problema: várias telas mudam o acesso de uma pessoa sem avisar os leitores (expulsar, recusar, áreas
-- gravadas no check-in, troca de pulseira/lote, áreas de um lote). O leitor só era corrigido na varredura
-- das 01:00: quem ganhava uma área não era reconhecido na porta nova, e sem internet o leitor decidiria
-- com uma lista desatualizada (expulso ainda cadastrado).
--
-- Solução: os gatilhos abaixo anotam a pessoa nesta fila a cada mudança que afeta o acesso, venha de
-- qualquer tela ou rotina. A API (filaSyncLeitores.service.js) esvazia a fila a cada 3 s: cadastra a
-- pessoa nos leitores das áreas dela e remove dos demais (ou de todos, se bloqueada/expulsa/inativa).
-- Leitor fora do ar: o comando vai para a fila do próprio leitor e é aplicado quando ele voltar.
--
-- Idempotente: pode rodar mais de uma vez.
-- =====================================================================================================

CREATE TABLE IF NOT EXISTS public.fila_sync_leitores (
    id            BIGSERIAL PRIMARY KEY,
    pessoa_id     UUID        NOT NULL,
    evento_id     UUID,
    evento_anterior UUID,     -- pessoa trocou de evento: sai dos leitores do evento antigo
    motivo        TEXT        NOT NULL,
    criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
    processado_em TIMESTAMPTZ,
    erro          TEXT
);

-- Uma pendência por pessoa: mudar 5 áreas de um lote com 300 pessoas gera 300 linhas, não 3.000
ALTER TABLE public.fila_sync_leitores ADD COLUMN IF NOT EXISTS evento_anterior UUID;

CREATE UNIQUE INDEX IF NOT EXISTS fila_sync_leitores_pendente_por_pessoa
    ON public.fila_sync_leitores (pessoa_id) WHERE processado_em IS NULL;
CREATE INDEX IF NOT EXISTS fila_sync_leitores_pendentes
    ON public.fila_sync_leitores (id) WHERE processado_em IS NULL;
CREATE INDEX IF NOT EXISTS fila_sync_leitores_processados
    ON public.fila_sync_leitores (processado_em) WHERE processado_em IS NOT NULL;

-- Só a API (service role) lê e grava; nenhum acesso pelo navegador
ALTER TABLE public.fila_sync_leitores ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fila_sync_leitores FROM anon, authenticated;

-- ----------------------------------------------------------------------------- pessoas
CREATE OR REPLACE FUNCTION public.fila_sync_leitores_pessoa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_motivo TEXT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_motivo := 'cadastro';
    ELSIF NEW.status_acesso IS DISTINCT FROM OLD.status_acesso
       OR NEW.bloqueado IS DISTINCT FROM OLD.bloqueado
       OR NEW.ativo IS DISTINCT FROM OLD.ativo THEN
        v_motivo := 'status';
    ELSIF NEW.tipo_pulseira_id IS DISTINCT FROM OLD.tipo_pulseira_id THEN
        v_motivo := 'pulseira';
    ELSIF NEW.areas_autorizadas IS DISTINCT FROM OLD.areas_autorizadas THEN
        v_motivo := 'areas';
    ELSIF NEW.foto_url IS DISTINCT FROM OLD.foto_url THEN
        v_motivo := 'foto';
    ELSIF NEW.evento_id IS DISTINCT FROM OLD.evento_id THEN
        v_motivo := 'evento';
    ELSE
        RETURN NEW; -- mudança que não afeta os leitores (telefone, observação...)
    END IF;

    INSERT INTO public.fila_sync_leitores (pessoa_id, evento_id, evento_anterior, motivo)
    VALUES (NEW.id, NEW.evento_id,
            CASE WHEN TG_OP = 'UPDATE' AND NEW.evento_id IS DISTINCT FROM OLD.evento_id THEN OLD.evento_id END,
            v_motivo)
    ON CONFLICT (pessoa_id) WHERE processado_em IS NULL
    DO UPDATE SET evento_anterior = COALESCE(public.fila_sync_leitores.evento_anterior, EXCLUDED.evento_anterior),
                  evento_id = EXCLUDED.evento_id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fila_sync_leitores_pessoa ON public.pessoas;
CREATE TRIGGER trg_fila_sync_leitores_pessoa
    AFTER INSERT OR UPDATE ON public.pessoas
    FOR EACH ROW EXECUTE FUNCTION public.fila_sync_leitores_pessoa();

-- ----------------------------------------------------------------------------- áreas da pessoa
CREATE OR REPLACE FUNCTION public.fila_sync_leitores_area_pessoa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_pessoa UUID := COALESCE(NEW.pessoa_id, OLD.pessoa_id);
BEGIN
    INSERT INTO public.fila_sync_leitores (pessoa_id, evento_id, motivo)
    SELECT p.id, p.evento_id, 'areas_da_pessoa' FROM public.pessoas p WHERE p.id = v_pessoa
    ON CONFLICT (pessoa_id) WHERE processado_em IS NULL DO NOTHING;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_fila_sync_leitores_area_pessoa ON public.pessoa_areas_acesso;
CREATE TRIGGER trg_fila_sync_leitores_area_pessoa
    AFTER INSERT OR UPDATE OR DELETE ON public.pessoa_areas_acesso
    FOR EACH ROW EXECUTE FUNCTION public.fila_sync_leitores_area_pessoa();

-- ----------------------------------------------------------------------------- áreas do lote (pulseira)
-- Vale para todas as pessoas com aquela pulseira
CREATE OR REPLACE FUNCTION public.fila_sync_leitores_area_lote()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_lote UUID := COALESCE(NEW.pulseira_id, OLD.pulseira_id);
BEGIN
    INSERT INTO public.fila_sync_leitores (pessoa_id, evento_id, motivo)
    SELECT p.id, p.evento_id, 'areas_do_lote' FROM public.pessoas p WHERE p.tipo_pulseira_id = v_lote
    ON CONFLICT (pessoa_id) WHERE processado_em IS NULL DO NOTHING;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_fila_sync_leitores_area_lote ON public.pulseira_areas_permitidas;
CREATE TRIGGER trg_fila_sync_leitores_area_lote
    AFTER INSERT OR UPDATE OR DELETE ON public.pulseira_areas_permitidas
    FOR EACH ROW EXECUTE FUNCTION public.fila_sync_leitores_area_lote();

-- Funções só para os gatilhos (ninguém chama pela API REST)
REVOKE ALL ON FUNCTION public.fila_sync_leitores_pessoa() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fila_sync_leitores_area_pessoa() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fila_sync_leitores_area_lote() FROM PUBLIC, anon, authenticated;
