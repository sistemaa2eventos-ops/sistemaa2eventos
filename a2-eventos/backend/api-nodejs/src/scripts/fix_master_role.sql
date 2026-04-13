-- =============================================================
-- SCRIPT DE SOBERANIA MASTER (NZT v1.0)
-- Execute este script no SQL Editor do Supabase para garantir
-- que o administrador principal tenha privilégios totais.
-- =============================================================

DO $$
DECLARE
    target_email TEXT := 'sistemaa2eventos@gmail.com';
    target_user_id UUID;
BEGIN
    -- 1. Buscar o ID do usuário pelo e-mail
    SELECT id INTO target_user_id FROM auth.users WHERE email = target_email;

    IF target_user_id IS NULL THEN
        RAISE NOTICE 'Usuário % não encontrado. Certifique-se de que ele já se cadastrou.', target_email;
    ELSE
        -- 2. Garantir que o nível de acesso é 'master' na tabela de perfis
        -- O UPSERT garante que o registro exista mesmo se o perfil ainda não foi criado
        -- O nome_completo é obrigatório (NOT NULL)
        INSERT INTO public.perfis (id, nome_completo, nivel_acesso, ativo, updated_at)
        VALUES (target_user_id, 'Administrador NZT', 'master', true, now())
        ON CONFLICT (id) DO UPDATE 
        SET nivel_acesso = 'master', 
            ativo = true, 
            updated_at = now();

        -- 3. Injetar a role nos metadados do Supabase Auth (para persistência no JWT)
        -- Isso garante que o middleware authenticate() leia a role 'master' das claims.
        -- Nota: Usamos raw_app_meta_data e raw_user_meta_data conforme o padrão do Supabase
        UPDATE auth.users 
        SET raw_app_meta_data = raw_app_meta_data || '{"role": "master", "nivel_acesso": "master"}'::jsonb,
            raw_user_meta_data = raw_user_meta_data || '{"nivel_acesso": "master"}'::jsonb
        WHERE id = target_user_id;

        RAISE NOTICE 'Soberania Master aplicada com sucesso para %', target_email;
    END IF;
END $$;
