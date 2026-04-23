-- SQL para conformidade LGPD (A2 Eventos)
-- Adiciona rastreabilidade de consentimento e proteção de dados biômétricos

-- 1. Consentimento na tabela Pessoas
ALTER TABLE IF EXISTS public.pessoas 
ADD COLUMN IF NOT EXISTS aceite_lgpd BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS data_aceite_lgpd TIMESTAMPTZ;

COMMENT ON COLUMN public.pessoas.aceite_lgpd IS 'Flag de consentimento LGPD para coleta de dados biômétricos e pessoais.';

-- 2. Reforçar o Isalamento de Tenant (RLS)
-- Garante que o evento_id seja sempre validado contra o token do usuário

ALTER TABLE IF EXISTS public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Política para Audit Logs: Apenas Master vê tudo, Supervisor vê do seu evento.
DROP POLICY IF EXISTS "Access Audit Logs" ON audit_logs;
CREATE POLICY "Access Audit Logs" ON audit_logs
    FOR SELECT
    TO authenticated
    USING (
        (SELECT nivel_acesso FROM perfis WHERE id = auth.uid()) = 'master'
        OR 
        (
            (SELECT nivel_acesso FROM perfis WHERE id = auth.uid()) = 'supervisor'
            AND evento_id = (SELECT evento_id FROM perfis WHERE id = auth.uid())
        )
    );

-- 3. Máscara de Dados (Otimização Face Encoding)
-- Criamos uma VIEW se necessário, ou apenas omitimos no query do backend (escolhido backend para maior controle).
