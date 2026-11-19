-- =====================================================================================================
-- Fila dos leitores: empresa bloqueada ou desbloqueada (19/11/2026)
--
-- Bloquear uma empresa (empresas.ativo = false) já negava os funcionários na decisão online, mas os
-- leitores só eram corrigidos na varredura das 01:00: sem internet o leitor ainda liberaria.
-- Agora a mudança anota todos os funcionários da empresa na fila_sync_leitores (migration
-- 20261119_fila_sync_leitores.sql, que precisa estar aplicada). A API suspende cada um nos leitores
-- (rosto mantido, acesso negado) e, ao desbloquear a empresa, devolve o acesso.
--
-- Idempotente: pode rodar mais de uma vez.
-- =====================================================================================================

CREATE OR REPLACE FUNCTION public.fila_sync_leitores_empresa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.ativo IS NOT DISTINCT FROM OLD.ativo THEN
        RETURN NEW;
    END IF;

    INSERT INTO public.fila_sync_leitores (pessoa_id, evento_id, motivo)
    SELECT p.id, p.evento_id, 'empresa'
      FROM public.pessoas p
     WHERE p.empresa_id = NEW.id
    ON CONFLICT (pessoa_id) WHERE processado_em IS NULL DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fila_sync_leitores_empresa ON public.empresas;
CREATE TRIGGER trg_fila_sync_leitores_empresa
    AFTER UPDATE OF ativo ON public.empresas
    FOR EACH ROW EXECUTE FUNCTION public.fila_sync_leitores_empresa();

REVOKE ALL ON FUNCTION public.fila_sync_leitores_empresa() FROM PUBLIC, anon, authenticated;
