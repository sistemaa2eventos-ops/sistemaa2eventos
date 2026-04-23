-- ============================================================
-- 👑 A2 EVENTOS - SCRIPT DE SOBERANIA MASTER (ADMIN)
-- ============================================================
-- Instruções: Execute no SQL Editor do Supabase Dashboard.
-- E-mail Alvo: sistemaa2eventos@gmail.com

DO $$
DECLARE
    v_user_id UUID;
BEGIN
    -- 1. Buscar o ID do usuário pelo e-mail na tabela oficial de autenticação
    SELECT id INTO v_user_id FROM auth.users WHERE email = 'sistemaa2eventos@gmail.com';

    IF v_user_id IS NULL THEN
        RAISE NOTICE '❌ Erro: Usuário sistemaa2eventos@gmail.com não encontrado no Auth do Supabase.';
    ELSE
        -- 2. Atualizar Metadata do Usuário (JWT Claims)
        -- Isso garante que o NodeJS reconheça o usuário como Master via Token.
        UPDATE auth.users 
        SET raw_app_meta_data = raw_app_meta_data || '{"nivel_acesso": "master"}'::jsonb
        WHERE id = v_user_id;

        -- 3. Atualizar Tabela de Perfis (Database Records)
        -- Usamos COALESCE para garantir que o nome_completo não seja nulo (evita erro 23502)
        INSERT INTO public.perfis (id, nome_completo, nivel_acesso, updated_at)
        SELECT 
            id, 
            COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'nome_completo', 'Administrador Master'),
            'master', 
            now()
        FROM auth.users WHERE id = v_user_id
        ON CONFLICT (id) DO UPDATE SET 
            nivel_acesso = 'master',
            updated_at = now();

        -- 4. Rebaixar outros Master (Opcional, para unicidade conforme pedido)
        UPDATE public.perfis 
        SET nivel_acesso = 'admin' 
        WHERE id != v_user_id AND nivel_acesso = 'master';

        RAISE NOTICE '✅ SUCESSO: sistemaa2eventos@gmail.com agora é o ÚNICO MASTER SOBERANO do sistema.';
    END IF;
END $$;
