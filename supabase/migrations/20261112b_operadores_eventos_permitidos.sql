-- ==============================================================================
-- MIGRATION: Operadores com vínculo "global" passam a ter a lista explícita de eventos
-- Data: 2026-11-12
-- Idempotente. Não apaga nada. Afeta SOMENTE perfis de nivel_acesso = 'operador'.
--
-- Motivo: operador com vínculo global operava qualquer evento. A partir de agora ele só opera os
-- eventos da sua lista (permissions.eventos_permitidos). Supervisores com vínculo global e
-- administradores NÃO são alterados.
--
-- Ordem: rode ANTES de publicar a versão nova do sistema. Antes da migration, operadores globais
-- ficariam sem evento algum.
-- ==============================================================================

-- Conferência (rode antes, opcional): quantos operadores serão convertidos
-- SELECT count(*) FROM public.perfis p
-- WHERE p.nivel_acesso = 'operador'
--   AND COALESCE(p.permissions->>'vinculo_tipo',
--                CASE WHEN p.evento_id IS NULL THEN 'global' ELSE 'especifico' END) = 'global';

UPDATE public.perfis p
SET permissions = jsonb_set(
        jsonb_set(COALESCE(p.permissions, '{}'::jsonb), '{vinculo_tipo}', '"especifico"'::jsonb, true),
        '{eventos_permitidos}',
        (SELECT COALESCE(jsonb_agg(e.id::text), '[]'::jsonb) FROM public.eventos e),
        true)
WHERE p.nivel_acesso = 'operador'
  AND COALESCE(p.permissions->>'vinculo_tipo',
               CASE WHEN p.evento_id IS NULL THEN 'global' ELSE 'especifico' END) = 'global';
