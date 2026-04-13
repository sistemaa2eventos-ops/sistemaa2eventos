-- SQL Supabase: Função RPC para buscar pessoa por prefixo de UUID
-- Execute este script no SQL Editor do Supabase Dashboard

CREATE OR REPLACE FUNCTION public.buscar_pessoa_por_id_prefixo(prefixo TEXT)
RETURNS TABLE (
    id UUID,
    evento_id UUID,
    nome TEXT,
    empresa_id UUID,
    foto_url TEXT
)
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT p.id, p.evento_id, p.nome, p.empresa_id, p.foto_url
    FROM public.pessoas p
    WHERE p.id::text LIKE prefixo || '%'
    LIMIT 1;
$$;

-- Conceder permissão para o service_role acessar
GRANT EXECUTE ON FUNCTION public.buscar_pessoa_por_id_prefixo(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.buscar_pessoa_por_id_prefixo(TEXT) TO anon;
