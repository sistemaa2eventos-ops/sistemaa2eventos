-- Migração: Remover CPF de perfis e simplificar estrutura
-- Data: 2026-04-27
-- Motivo: CPF é exclusivo de pessoas (participantes), não de operadores
-- LGPD: Garantir isolamento de dados por evento

-- 1. Remover coluna CPF da tabela perfis
ALTER TABLE public.perfis DROP COLUMN IF EXISTS cpf CASCADE;

-- 2. Confirmar que telefone e avatar_url estão presentes
ALTER TABLE public.perfis ADD COLUMN IF NOT EXISTS telefone VARCHAR(20);
ALTER TABLE public.perfis ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 3. Adicionar coluna para rastreamento de quem criou o operador
ALTER TABLE public.perfis ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- 4. Adicionar coluna para rastreamento de quem aprovou
ALTER TABLE public.perfis ADD COLUMN IF NOT EXISTS aprovado_por UUID REFERENCES auth.users(id);
ALTER TABLE public.perfis ADD COLUMN IF NOT EXISTS aprovado_em TIMESTAMP;

-- 5. Adicionar coluna status se não existir
ALTER TABLE public.perfis ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'ativo', 'inativo'));

-- 6. Simplificar nivel_acesso: apenas admin_master e operador
ALTER TABLE public.perfis DROP CONSTRAINT IF EXISTS perfis_nivel_acesso_check;
ALTER TABLE public.perfis ADD CONSTRAINT perfis_nivel_acesso_check
    CHECK (nivel_acesso IN ('admin_master', 'operador'));

-- 7. Garantir que email é único (via foreign key de auth.users)
-- Já é garantido, pois id referencia auth.users(id)

-- 8. Comentário da tabela atualizado
COMMENT ON TABLE public.perfis IS 'Perfis de operadores/admin do painel. CPF é exclusivo de participantes (tabela pessoas).';
COMMENT ON COLUMN public.perfis.cpf IS 'REMOVIDO - CPF é exclusivo de pessoas (participantes do evento)';
COMMENT ON COLUMN public.perfis.nivel_acesso IS 'admin_master (único, irrestrito) ou operador (vinculado a evento, permissões customizáveis)';
COMMENT ON COLUMN public.perfis.permissions IS 'Permissões customizáveis por evento. Padrão: tudo desligado. Admin master ativa conforme precisa.';
COMMENT ON COLUMN public.perfis.status IS 'pendente (aguarda aprovação) → ativo (pode acessar) → inativo (bloqueado)';

-- 9. Criar índice para query de operadores por evento
CREATE INDEX IF NOT EXISTS idx_perfis_evento_status ON public.perfis(evento_id, status);

-- 10. Garantir integridade: apenas operadores têm evento_id
-- (admin_master pode ter NULL ou múltiplos via contexto)
-- Isso é validado na aplicação, não no DB

COMMIT;
