-- ==============================================================================
-- MIGRATION: Correção de lançamento de pulseira e histórico de empresa
-- Data: 2026-11-12
-- Idempotente. Não apaga dados. Rodar ANTES de publicar a versão nova do sistema.
--
-- O que muda:
--   1. pulseira_vinculos.motivo_encerramento aceita 'anulada' (lançamento errado, desfeito pelo
--      operador). Vínculo anulado fica no histórico para auditoria, mas não bloqueia o número.
--   2. pulseira_vinculos.empresa_id: empresa da pessoa no momento da entrega (snapshot).
--   3. pessoa_empresa_historico: cada troca de empresa vira um período (inicio → fim).
--   4. logs_acesso.empresa_id: empresa do acesso, gravada na hora (por período, inclusive
--      acessos offline com horário antigo). Os relatórios por empresa usam esse campo.
--   5. RPC anular_ultimo_lancamento_pulseira: desfaz a última entrega (ou a última marcação de
--      perdida/devolvida) em uma transação, restaurando a pulseira anterior quando for o caso.
--   6. RPC ajustar_areas_pulseira: ao trocar de lote, tira as áreas do lote antigo que o novo
--      não libera (antes elas ficavam para sempre).
--
-- Antes desta migration, os acessos antigos recebem a empresa atual da pessoa (aproximação:
-- não há registro de quando a empresa mudou). Por isso o UPDATE abaixo roda uma vez; em evento
-- com muito acesso, rode fora do horário de operação.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Motivo 'anulada'
-- ------------------------------------------------------------------------------
ALTER TABLE public.pulseira_vinculos DROP CONSTRAINT IF EXISTS pulseira_vinculos_motivo_encerramento_check;
ALTER TABLE public.pulseira_vinculos ADD CONSTRAINT pulseira_vinculos_motivo_encerramento_check
    CHECK (motivo_encerramento IS NULL OR motivo_encerramento IN ('substituida', 'devolvida', 'perdida', 'desvinculada', 'anulada'));

-- ------------------------------------------------------------------------------
-- 2. Empresa do vínculo
-- ------------------------------------------------------------------------------
ALTER TABLE public.pulseira_vinculos ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES public.empresas(id) ON DELETE SET NULL;

UPDATE public.pulseira_vinculos v
   SET empresa_id = p.empresa_id
  FROM public.pessoas p
 WHERE p.id = v.pessoa_id AND v.empresa_id IS NULL;

-- ------------------------------------------------------------------------------
-- 3. Histórico de empresa por pessoa
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pessoa_empresa_historico (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evento_id UUID NOT NULL REFERENCES public.eventos(id) ON DELETE CASCADE,
    pessoa_id UUID NOT NULL REFERENCES public.pessoas(id) ON DELETE CASCADE,
    empresa_id UUID REFERENCES public.empresas(id) ON DELETE SET NULL,
    inicio TIMESTAMPTZ NOT NULL DEFAULT now(),
    fim TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (fim IS NULL OR fim >= inicio)
);
CREATE INDEX IF NOT EXISTS idx_pessoa_empresa_hist_pessoa ON public.pessoa_empresa_historico (pessoa_id, inicio);
CREATE INDEX IF NOT EXISTS idx_pessoa_empresa_hist_evento_fim ON public.pessoa_empresa_historico (evento_id, fim);

-- Acesso só pelo backend (service role ignora RLS), igual às demais tabelas de pulseira
ALTER TABLE public.pessoa_empresa_historico ENABLE ROW LEVEL SECURITY;

-- Pessoas que já existem: um período aberto desde o início dos tempos com a empresa atual
INSERT INTO public.pessoa_empresa_historico (evento_id, pessoa_id, empresa_id, inicio)
SELECT p.evento_id, p.id, p.empresa_id, '-infinity'::timestamptz
  FROM public.pessoas p
 WHERE p.evento_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.pessoa_empresa_historico h WHERE h.pessoa_id = p.id);

CREATE OR REPLACE FUNCTION public.registrar_troca_empresa()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.evento_id IS NULL THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' THEN
        IF NEW.empresa_id IS NOT DISTINCT FROM OLD.empresa_id AND NEW.evento_id IS NOT DISTINCT FROM OLD.evento_id THEN
            RETURN NEW;
        END IF;
        UPDATE public.pessoa_empresa_historico SET fim = now() WHERE pessoa_id = NEW.id AND fim IS NULL;
    END IF;
    INSERT INTO public.pessoa_empresa_historico (evento_id, pessoa_id, empresa_id, inicio)
    VALUES (NEW.evento_id, NEW.id, NEW.empresa_id, now());
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- o histórico nunca pode impedir o cadastro de salvar
    RAISE WARNING 'registrar_troca_empresa: %', SQLERRM;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_troca_empresa ON public.pessoas;
CREATE TRIGGER trg_troca_empresa
    AFTER INSERT OR UPDATE OF empresa_id, evento_id ON public.pessoas
    FOR EACH ROW EXECUTE FUNCTION public.registrar_troca_empresa();

-- ------------------------------------------------------------------------------
-- 4. Empresa do acesso e do vínculo: pelo período em que a pessoa estava na empresa
-- ------------------------------------------------------------------------------
ALTER TABLE public.logs_acesso ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES public.empresas(id) ON DELETE SET NULL;

-- Acessos antigos (uma vez): empresa atual da pessoa
UPDATE public.logs_acesso l
   SET empresa_id = p.empresa_id
  FROM public.pessoas p
 WHERE p.id = l.pessoa_id AND l.evento_id = p.evento_id AND l.empresa_id IS NULL;

CREATE OR REPLACE FUNCTION public.empresa_do_registro(p_pessoa_id UUID, p_instante TIMESTAMPTZ)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT h.empresa_id
      FROM public.pessoa_empresa_historico h
     WHERE h.pessoa_id = p_pessoa_id
       AND h.inicio <= COALESCE(p_instante, now())
       AND (h.fim IS NULL OR COALESCE(p_instante, now()) < h.fim)
     ORDER BY h.inicio DESC
     LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.empresa_do_acesso()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.empresa_id IS NULL AND NEW.pessoa_id IS NOT NULL THEN
        NEW.empresa_id := public.empresa_do_registro(NEW.pessoa_id, NEW.created_at);
    END IF;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'empresa_do_acesso: %', SQLERRM;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_empresa_do_acesso ON public.logs_acesso;
CREATE TRIGGER trg_empresa_do_acesso
    BEFORE INSERT ON public.logs_acesso
    FOR EACH ROW EXECUTE FUNCTION public.empresa_do_acesso();

CREATE OR REPLACE FUNCTION public.empresa_do_vinculo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.empresa_id IS NULL THEN
        NEW.empresa_id := public.empresa_do_registro(NEW.pessoa_id, NEW.entregue_em);
    END IF;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'empresa_do_vinculo: %', SQLERRM;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_empresa_do_vinculo ON public.pulseira_vinculos;
CREATE TRIGGER trg_empresa_do_vinculo
    BEFORE INSERT ON public.pulseira_vinculos
    FOR EACH ROW EXECUTE FUNCTION public.empresa_do_vinculo();

-- ------------------------------------------------------------------------------
-- 5. Histórico de pulseira: o trigger respeita a correção feita pela RPC
--    (a RPC já fechou/reabriu os vínculos; o trigger não pode criar outro)
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
    IF current_setting('a2.vinculo_manual', true) = 'on' THEN
        RETURN NEW;
    END IF;
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

-- ------------------------------------------------------------------------------
-- 6. Áreas: ao trocar de lote, sai o que só o lote antigo liberava
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ajustar_areas_pulseira(p_evento_id UUID, p_pessoa_id UUID, p_tipo_saiu UUID, p_tipo_entrou UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_tipo_saiu IS NOT DISTINCT FROM p_tipo_entrou THEN
        RETURN;
    END IF;

    DELETE FROM public.pessoa_areas_acesso pa
     WHERE pa.pessoa_id = p_pessoa_id
       AND pa.evento_id = p_evento_id
       AND pa.area_id IN (SELECT area_id FROM public.pulseira_areas_permitidas WHERE pulseira_id = p_tipo_saiu)
       AND pa.area_id NOT IN (SELECT area_id FROM public.pulseira_areas_permitidas WHERE pulseira_id = p_tipo_entrou);

    INSERT INTO public.pessoa_areas_acesso (pessoa_id, area_id, evento_id, criado_por)
    SELECT p_pessoa_id, area_id, p_evento_id, NULL
      FROM public.pulseira_areas_permitidas
     WHERE pulseira_id = p_tipo_entrou
    ON CONFLICT (pessoa_id, area_id) DO NOTHING;

    UPDATE public.pessoas
       SET areas_autorizadas = COALESCE(ARRAY(SELECT area_id FROM public.pessoa_areas_acesso WHERE pessoa_id = p_pessoa_id), '{}'::uuid[]),
           updated_at = now()
     WHERE id = p_pessoa_id AND evento_id = p_evento_id;
END $$;

-- ------------------------------------------------------------------------------
-- 7. Anulação do último lançamento (operador errou a pulseira)
--    A) pulseira em uso está errada → anula o vínculo; se foi troca, reabre a anterior
--    B) não há pulseira em uso, mas a última marcação foi perdida/devolvida por engano
--       → marca a marcação como anulada e reabre a pulseira com a mesma hora de entrega
--    Códigos de erro: P0002 = não encontrado (404), P0003 = conflito, p.ex. número em uso (409)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.anular_ultimo_lancamento_pulseira(
    p_evento_id UUID,
    p_pessoa_id UUID,
    p_usuario UUID DEFAULT NULL,
    p_observacao TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v public.pulseira_vinculos%ROWTYPE;
    ant public.pulseira_vinculos%ROWTYPE;
    tem_ant BOOLEAN := FALSE;
    agora TIMESTAMPTZ := now();
    nota TEXT := COALESCE(NULLIF(btrim(COALESCE(p_observacao, '')), ''), 'sem motivo informado');
    numero_restaurado TEXT := NULL;
    numero_anulado TEXT := NULL;
BEGIN
    PERFORM set_config('a2.vinculo_manual', 'on', true);

    SELECT * INTO v FROM public.pulseira_vinculos
     WHERE evento_id = p_evento_id AND pessoa_id = p_pessoa_id AND encerrado_em IS NULL
     FOR UPDATE;

    IF FOUND THEN
        -- A) anula a pulseira em uso
        SELECT * INTO ant FROM public.pulseira_vinculos
         WHERE evento_id = p_evento_id AND pessoa_id = p_pessoa_id
           AND motivo_encerramento = 'substituida' AND encerrado_em = v.entregue_em
         ORDER BY entregue_em DESC
         LIMIT 1;
        tem_ant := FOUND;

        IF tem_ant AND EXISTS (
            SELECT 1 FROM public.pessoas
             WHERE evento_id = p_evento_id AND id <> p_pessoa_id AND numero_pulseira = ant.numero_pulseira
        ) THEN
            RAISE EXCEPTION 'A pulseira % já está com outra pessoa neste evento; não é possível restaurá-la.', ant.numero_pulseira
                USING ERRCODE = 'P0003';
        END IF;

        UPDATE public.pulseira_vinculos
           SET encerrado_em = agora,
               motivo_encerramento = 'anulada',
               encerrado_por = p_usuario,
               observacao = concat_ws(' • ', NULLIF(observacao, ''), 'Lançamento anulado: ' || nota)
         WHERE id = v.id;

        numero_anulado := v.numero_pulseira;

        IF tem_ant THEN
            UPDATE public.pulseira_vinculos
               SET encerrado_em = NULL, motivo_encerramento = NULL, encerrado_por = NULL
             WHERE id = ant.id;
            UPDATE public.pessoas
               SET numero_pulseira = ant.numero_pulseira, tipo_pulseira_id = ant.tipo_pulseira_id, updated_at = agora
             WHERE id = p_pessoa_id AND evento_id = p_evento_id;
            numero_restaurado := ant.numero_pulseira;
        ELSE
            UPDATE public.pessoas
               SET numero_pulseira = NULL, updated_at = agora
             WHERE id = p_pessoa_id AND evento_id = p_evento_id;
        END IF;

        PERFORM public.ajustar_areas_pulseira(p_evento_id, p_pessoa_id, v.tipo_pulseira_id,
            CASE WHEN tem_ant THEN ant.tipo_pulseira_id END);

        RETURN jsonb_build_object('acao', 'entrega_anulada', 'numero_anulado', numero_anulado,
                                  'numero_restaurado', numero_restaurado);
    END IF;

    -- B) última marcação de perdida/devolvida por engano
    SELECT * INTO v FROM public.pulseira_vinculos
     WHERE evento_id = p_evento_id AND pessoa_id = p_pessoa_id AND encerrado_em IS NOT NULL
     ORDER BY encerrado_em DESC, entregue_em DESC
     LIMIT 1;

    IF NOT FOUND OR v.motivo_encerramento NOT IN ('perdida', 'devolvida') THEN
        RAISE EXCEPTION 'Não há pulseira em uso nem marcação de perdida/devolvida para desfazer.'
            USING ERRCODE = 'P0002';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.pessoas
         WHERE evento_id = p_evento_id AND id <> p_pessoa_id AND numero_pulseira = v.numero_pulseira
    ) THEN
        RAISE EXCEPTION 'A pulseira % já está com outra pessoa neste evento; não é possível reabri-la.', v.numero_pulseira
            USING ERRCODE = 'P0003';
    END IF;

    UPDATE public.pulseira_vinculos
       SET motivo_encerramento = 'anulada',
           encerrado_por = p_usuario,
           observacao = concat_ws(' • ', NULLIF(observacao, ''), 'Marcação de ' || v.motivo_encerramento || ' desfeita: ' || nota)
     WHERE id = v.id;

    -- nova linha com a mesma hora de entrega original: a permanência não muda
    INSERT INTO public.pulseira_vinculos (evento_id, pessoa_id, numero_pulseira, tipo_pulseira_id, entregue_em, entregue_por, empresa_id, origem, observacao)
    VALUES (p_evento_id, p_pessoa_id, v.numero_pulseira, v.tipo_pulseira_id, v.entregue_em, v.entregue_por, v.empresa_id, 'sistema',
            'Reaberta após desfazer ' || v.motivo_encerramento);

    UPDATE public.pessoas
       SET numero_pulseira = v.numero_pulseira, tipo_pulseira_id = v.tipo_pulseira_id, updated_at = agora
     WHERE id = p_pessoa_id AND evento_id = p_evento_id;

    RETURN jsonb_build_object('acao', 'marcacao_desfeita', 'numero_restaurado', v.numero_pulseira,
                              'motivo_desfeito', v.motivo_encerramento);
END $$;

-- Só o backend (service role) chama as RPCs de pulseira
REVOKE EXECUTE ON FUNCTION public.anular_ultimo_lancamento_pulseira(UUID, UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ajustar_areas_pulseira(UUID, UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.anular_ultimo_lancamento_pulseira(UUID, UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.ajustar_areas_pulseira(UUID, UUID, UUID, UUID) TO service_role;

-- Atualiza o cache de schema do PostgREST
NOTIFY pgrst, 'reload schema';
