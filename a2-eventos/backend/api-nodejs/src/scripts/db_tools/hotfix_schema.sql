-- 🩹 NUCLEAR REPAIR: TOTAL SCHEMA ALIGNMENT (Phase 14)

-- 1. Reparar tabela de Eventos
ALTER TABLE public.eventos 
ADD COLUMN IF NOT EXISTS created_by uuid,
ADD COLUMN IF NOT EXISTS capacidade_total integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS horario_reset time DEFAULT '00:00:00',
ADD COLUMN IF NOT EXISTS datas_montagem text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS datas_evento text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS datas_desmontagem text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- 2. Reparo Total: Empresas
ALTER TABLE public.empresas
ADD COLUMN IF NOT EXISTS email text,
ADD COLUMN IF NOT EXISTS responsavel text,
ADD COLUMN IF NOT EXISTS servico text,
ADD COLUMN IF NOT EXISTS observacao text,
ADD COLUMN IF NOT EXISTS max_colaboradores integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS registration_token uuid DEFAULT gen_random_uuid(),
ADD COLUMN IF NOT EXISTS datas_presenca text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS created_by uuid,
ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
ADD COLUMN IF NOT EXISTS ativo boolean DEFAULT true;

-- 3. Reparo Total: Funcionários
ALTER TABLE public.funcionarios
ADD COLUMN IF NOT EXISTS numero_pulseira text,
ADD COLUMN IF NOT EXISTS fase_montagem boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS fase_showday boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS fase_desmontagem boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS status_acesso text DEFAULT 'pendente',
ADD COLUMN IF NOT EXISTS nome_mae text,
ADD COLUMN IF NOT EXISTS data_nascimento date,
ADD COLUMN IF NOT EXISTS dias_trabalho text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS qr_code text,
ADD COLUMN IF NOT EXISTS credencial_impressa boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS ativo boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS created_by uuid,
ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
ADD COLUMN IF NOT EXISTS observacao text,
ADD COLUMN IF NOT EXISTS funcao text;
-- 4. Corrigir Inconsistência de Status (Fase 19)
ALTER TABLE public.funcionarios 
DROP CONSTRAINT IF EXISTS funcionarios_status_acesso_check;

ALTER TABLE public.funcionarios 
ADD CONSTRAINT funcionarios_status_acesso_check 
CHECK (status_acesso IN (
    'pendente',      -- Aguardando validação
    'autorizado',    -- Cadastro interno aprovado
    'verificacao',   -- Cadastro externo aguardando moderação
    'checkin_feito', -- Atualmente no evento
    'checkout_feito',-- Já saiu do evento
    'bloqueado',     -- Acesso negado por segurança
    'expulso',       -- Removido à força
    'checkin',       -- Legado/Compatibilidade
    'checkout'       -- Legado/Compatibilidade
));

-- 5. Reparo Dispositivos (Fase 20)
ALTER TABLE public.dispositivos_acesso
ADD COLUMN IF NOT EXISTS marca text DEFAULT 'intelbras',
ADD COLUMN IF NOT EXISTS user_device text,
ADD COLUMN IF NOT EXISTS password_device text;
