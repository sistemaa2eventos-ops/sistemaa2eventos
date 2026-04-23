-- Verificar usuário no Supabase Auth e perfil
-- Execute este SQL no SQL Editor do Supabase

-- 1. Verificar se o usuário existe no Auth
SELECT id, email, email_confirmed_at, created_at, last_sign_in_at
FROM auth.users 
WHERE email = 'sistemaa2eventos@gmail.com';

-- 2. Verificar perfil vinculado
SELECT p.id, p.nome_completo, p.email, p.nivel_acesso, p.evento_id, p.ativo
FROM perfis p
WHERE p.email = 'sistemaa2eventos@gmail.com'
   OR p.id IN (SELECT id FROM auth.users WHERE email = 'sistemaa2eventos@gmail.com');

-- 3. Se não existir perfil, criar
-- INSERT INTO perfis (id, nome_completo, email, nivel_acesso, evento_id, ativo)
-- VALUES ('ID_DO_USUARIO_AQUI', 'Administrador', 'sistemaa2eventos@gmail.com', 'master', NULL, true);
