-- MIGRAÇÃO: FUNCIONARIOS -> PESSOAS
-- Objetivo: Generalizar a entidade para suportar B2B e B2C

BEGIN;

-- 1. Criar a nova tabela PESSOAS baseada na estrutura de funcionarios
CREATE TABLE IF NOT EXISTS public.pessoas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evento_id UUID REFERENCES public.eventos(id) ON DELETE CASCADE,
    empresa_id UUID REFERENCES public.empresas(id) ON DELETE SET NULL, -- Opcional para B2C
    nome TEXT NOT NULL,
    cpf TEXT,
    nome_mae TEXT,
    data_nascimento DATE,
    funcao TEXT DEFAULT 'Participante',
    tipo_pessoa TEXT NOT NULL DEFAULT 'colaborador', -- 'colaborador', 'visitante', 'convidado', 'vip', 'staff'
    dias_trabalho TEXT[] DEFAULT '{}',
    foto_url TEXT,
    tipo_fluxo TEXT DEFAULT 'checkin_checkout',
    qr_code TEXT UNIQUE,
    barcode TEXT UNIQUE,
    rfid_tag TEXT UNIQUE,
    numero_pulseira TEXT,
    status_acesso TEXT DEFAULT 'pendente',
    origem_cadastro TEXT DEFAULT 'interno',
    fase_montagem BOOLEAN DEFAULT FALSE,
    fase_showday BOOLEAN DEFAULT TRUE,
    fase_desmontagem BOOLEAN DEFAULT FALSE,
    bloqueado BOOLEAN DEFAULT FALSE,
    motivo_bloqueio TEXT,
    alerta_ativo BOOLEAN DEFAULT FALSE,
    observacao TEXT,
    ativo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID
);

-- 2. Migrar dados de funcionarios para pessoas
-- Ajuste: Casting de jsonb para text[] para a coluna dias_trabalho
INSERT INTO public.pessoas (
    id, evento_id, empresa_id, nome, cpf, nome_mae, data_nascimento, funcao,
    tipo_pessoa, dias_trabalho, foto_url, tipo_fluxo, qr_code,
    numero_pulseira, status_acesso, origem_cadastro, fase_montagem,
    fase_showday, fase_desmontagem, observacao, created_by, ativo, created_at
)
SELECT 
    id, evento_id, empresa_id, nome, cpf, nome_mae, data_nascimento, funcao,
    'colaborador', 
    dias_trabalho,
    foto_url, tipo_fluxo, qr_code,
    numero_pulseira, status_acesso, origem_cadastro, fase_montagem,
    fase_showday, fase_desmontagem, observacao, created_by, ativo, created_at
FROM public.funcionarios
ON CONFLICT (id) DO NOTHING;

-- 3. Atualizar referências em logs_acesso (Mapeia para a nova tabela 'pessoas')
ALTER TABLE public.logs_acesso 
    DROP CONSTRAINT IF EXISTS logs_acesso_funcionario_id_fkey,
    ADD CONSTRAINT logs_acesso_funcionario_id_fkey 
    FOREIGN KEY (funcionario_id) REFERENCES public.pessoas(id) ON DELETE CASCADE;

-- 4. Habilitar RLS na nova tabela 'pessoas'
ALTER TABLE public.pessoas ENABLE ROW LEVEL SECURITY;

-- 5. Replicar as políticas de segurança (Baseadas em hardened_policies.sql)
CREATE POLICY "Admin All Access" ON public.pessoas
    FOR ALL TO authenticated
    USING ( (SELECT nivel_acesso FROM public.perfis WHERE id = auth.uid()) = 'admin' );

CREATE POLICY "Supervisor Full Access" ON public.pessoas
    FOR ALL TO authenticated
    USING ( (SELECT nivel_acesso FROM public.perfis WHERE id = auth.uid()) = 'supervisor' );

CREATE POLICY "Public Registration Insert" ON public.pessoas
    FOR INSERT TO anon
    WITH CHECK ( true );

-- 6. Renomear a tabela antiga para backup para liberar o nome para a VIEW
DO $$ 
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'funcionarios') THEN
        ALTER TABLE public.funcionarios RENAME TO funcionarios_backup;
    END IF;
END $$;

-- 7. Criar VIEW para compatibilidade TOTAL com relatórios antigos
-- Nota: Usamos 'WITH (security_invoker = true)' para respeitar o RLS de quem consulta
CREATE OR REPLACE VIEW public.funcionarios 
WITH (security_invoker = true)
AS
SELECT 
    id, evento_id, empresa_id, nome, cpf, nome_mae, data_nascimento, funcao,
    dias_trabalho, foto_url, tipo_fluxo, qr_code, barcode, rfid_tag,
    numero_pulseira, status_acesso, origem_cadastro, fase_montagem,
    fase_showday, fase_desmontagem, bloqueado, motivo_bloqueio,
    alerta_ativo, observacao, ativo, created_at, updated_at, created_by
FROM public.pessoas 
WHERE tipo_pessoa = 'colaborador';

COMMIT;
