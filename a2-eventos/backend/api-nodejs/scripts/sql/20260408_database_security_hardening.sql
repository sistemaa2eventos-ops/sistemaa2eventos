-- ============================================================
-- 🛡️ A2 EVENTOS - SCRIPT DE HARDENING DE SEGURANÇA (DATABASE)
-- ============================================================
-- Instruções: Execute este script no SQL Editor do Supabase Dashboard.
-- Ele resolve falhas de RLS, Search Path e remove Backdoors.

-- 1. 📦 ORGANIZAÇÃO DE EXTENSÕES
-- Mover extensões para um schema próprio para evitar poluição no Public
CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION btree_gist SET SCHEMA extensions;
ALTER EXTENSION pg_trgm SET SCHEMA extensions;

-- 2. 🔐 ROW LEVEL SECURITY (RLS)
-- Ativar RLS na tabela de Matriz de Permissões
ALTER TABLE public.sys_event_role_permissions ENABLE ROW LEVEL SECURITY;

-- Política: Master e Admin podem fazer TUDO
CREATE POLICY "Gerenciamento total para Master e Admin" 
ON public.sys_event_role_permissions
FOR ALL
TO authenticated
USING (
    (auth.jwt() -> 'app_metadata' ->> 'nivel_acesso' = 'master') OR 
    (auth.jwt() -> 'app_metadata' ->> 'nivel_acesso' = 'admin')
);

-- Política: Leitura restrita para outros usuários autenticados (apenas do seu evento)
CREATE POLICY "Leitura de permissões do evento" 
ON public.sys_event_role_permissions
FOR SELECT
TO authenticated
USING (
    evento_id = (auth.jwt() -> 'user_metadata' ->> 'evento_id')::uuid
);

-- 3. 🧹 REMOÇÃO DE BACKDOORS E VULNERABILIDADES
-- Removendo a função exec_sql que permite injeção arbitrária
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'exec_sql' AND pronamespace = 'public'::regnamespace) THEN
        DROP FUNCTION public.exec_sql(TEXT);
    END IF;
END $$;

-- 4. 🛡️ PROTEÇÃO DE SEARCH PATH (FUNÇÕES DINÂMICAS)
-- Este bloco varre as funções do sistema e corrige o search_path automaticamente,
-- sem precisar que a gente saiba a assinatura (parâmetros) exata de cada uma.
DO $$
DECLARE
    r RECORD;
    v_func_names TEXT[] := ARRAY[
        'atualizar_timestamp',
        'buscar_pessoa_por_id_prefixo',
        'check_pulseira_area_evento_match',
        'get_occupancy_flow',
        'handle_new_event_modules',
        'handle_sync_user_claims',
        'handle_updated_at',
        'record_audit_log',
        'registrar_acesso_atomico',
        'update_updated_at_column'
    ];
    v_name TEXT;
BEGIN
    FOREACH v_name IN ARRAY v_func_names
    LOOP
        FOR r IN 
            SELECT oid::regprocedure::text as sig 
            FROM pg_proc 
            WHERE proname = v_name 
            AND pronamespace = 'public'::regnamespace
        LOOP
            EXECUTE format('ALTER FUNCTION %s SET search_path = public, extensions, pg_catalog', r.sig);
            RAISE NOTICE 'Endurecimento aplicado em: %', r.sig;
        END LOOP;
    END LOOP;
END $$;

-- ============================================================
-- ✅ HARDENING CONCLUÍDO COM SUCESSO
-- ============================================================
