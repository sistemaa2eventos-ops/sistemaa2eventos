-- ========================================================================================
-- VERIFICAR TOKEN NO BANCO
-- Execute no SQL Editor do Supabase
-- ========================================================================================

-- Verificar se existe empresa com registration_token
SELECT id, nome, registration_token, registration_token_expires_at 
FROM empresas 
WHERE registration_token IS NOT NULL
ORDER BY created_at DESC
LIMIT 10;

-- Verificar total de empresas com token
SELECT COUNT(*) as total_com_token
FROM empresas 
WHERE registration_token IS NOT NULL;

-- Verificar se a coluna registration_token existe
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'empresas' 
AND column_name = 'registration_token';