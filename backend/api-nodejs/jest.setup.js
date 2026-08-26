// Configurações globais para que os testes não quebrem por falta de .env
process.env.SUPABASE_URL = 'http://dummy.supabase.co';
process.env.SUPABASE_ANON_KEY = 'dummy_anon_key';
process.env.JWT_SECRET = 'dummy_secret';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'dummy_role';
process.env.TZ = 'America/Sao_Paulo';
