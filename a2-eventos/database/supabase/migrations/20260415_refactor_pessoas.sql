-- ============================================
-- MIGRATION: Refatorar Sistema de Pessoas (Credenciamento)
-- Data: 2026-04-15
-- Objetivo: Novo sistema de tipos e fluxo de aprovação
-- ============================================

-- ============================================
-- PASSO 1: Renomear coluna 'nome' para 'nome_completo'
-- ============================================
ALTER TABLE public.pessoas RENAME COLUMN nome TO nome_completo;

-- ============================================
-- PASSO 2: Adicionar novas colunas
-- ============================================
-- documento_foto (para validação via link público)
ALTER TABLE public.pessoas 
ADD COLUMN IF NOT EXISTS documento_foto TEXT;

-- Códigos para participante
ALTER TABLE public.pessoas 
ADD COLUMN IF NOT EXISTS codigo_ingresso VARCHAR(50);

ALTER TABLE public.pessoas 
ADD COLUMN IF NOT EXISTS origem_pagamento VARCHAR(50);

-- Novas fases de acesso (substitui dias_trabalho)
ALTER TABLE public.pessoas 
ADD COLUMN IF NOT EXISTS fases_acesso JSONB DEFAULT '[]'::jsonb;

ALTER TABLE public.pessoas 
ADD COLUMN IF NOT EXISTS dias_acesso JSONB DEFAULT '[]'::jsonb;

-- Documentos de trabalho (contrato, EPI, ASO, etc)
ALTER TABLE public.pessoas 
ADD COLUMN IF NOT EXISTS documentos_trabalho JSONB DEFAULT '[]'::jsonb;

-- ============================================
-- PASSO 3: Migrar dados existentes para novas colunas
-- ============================================
-- Migrar dias_trabalho para fases_acesso e dias_acesso
UPDATE public.pessoas SET
    fases_acesso = (
        SELECT jsonb_agg(
            CASE 
                WHEN VALUE::text = 'true' THEN key
                ELSE NULL
            END
        )
        FROM jsonb_each(
            jsonb_build_object(
                'montagem', fase_montagem::boolean,
                'evento', fase_showday::boolean,
                'desmontagem', fase_desmontagem::boolean
            )
        )
        WHERE value = 'true'
    )::jsonb
WHERE fase_montagem = true OR fase_showday = true OR fase_desmontagem = true;

-- Atualizar dias_acesso com dias_trabalho existente
UPDATE public.pessoas SET
    dias_acesso = dias_trabalho
WHERE jsonb_array_length(dias_trabalho) > 0;

-- ============================================
-- PASSO 4: Atualizar ENUM de tipo_pessoa (3 novos valores)
-- ============================================
-- Primeiro: remover constraint antiga
ALTER TABLE public.pessoas DROP CONSTRAINT IF EXISTS pessoas_tipo_pessoa_check;

-- Segundo: mapear tipos antigos para novos
-- Tercestro → Visitante
UPDATE public.pessoas SET tipo_pessoa = 'visitante' WHERE tipo_pessoa = 'terceiro';
-- VIP / Imprensal → Participante
UPDATE public.pessoas SET tipo_pessoa = 'participante' WHERE tipo_pessoa IN ('vip', 'imprensa');
-- Fornecedor → Visitante
UPDATE public.pessoas SET tipo_pessoa = 'visitante' WHERE tipo_pessoa = 'fornecedor';
-- Padrão existente → Colaborador
UPDATE public.pessoas SET tipo_pessoa = 'colaborador' WHERE tipo_pessoa = 'colaborador' OR tipo_pessoa IS NULL;

-- Terceiro: criar nova constraint
ALTER TABLE public.pessoas 
ADD CONSTRAINT pessoas_tipo_pessoa_check 
CHECK (tipo_pessoa IN ('colaborador', 'visitante', 'participante'));

-- ============================================
-- PASSO 5: Atualizar ENUM de status_acesso (adicionar 'verificacao')
-- ============================================
ALTER TABLE public.pessoas DROP CONSTRAINT IF EXISTS pessoas_status_acesso_check;

ALTER TABLE public.pessoas 
ADD CONSTRAINT pessoas_status_acesso_check 
CHECK (status_acesso IN ('pendente', 'autorizado', 'recusado', 'bloqueado', 'verificacao', 'checkin_feito', 'checkout_feito'));

-- ============================================
-- PASSO 6: Remover colunas redundantes (APÓS migração)
-- ============================================
-- ALTER TABLE public.pessoas DROP COLUMN IF EXISTS fase_montagem;
-- ALTER TABLE public.pessoas DROP COLUMN IF EXISTS fase_showday;
-- ALTER TABLE public.pessoas DROP COLUMN IF EXISTS fase_desmontagem;
-- ALTER TABLE public.pessoas DROP COLUMN IF EXISTS dias_trabalho;

-- ============================================
-- PASSO 7: Criar constraint de unicidade (cpf + evento)
-- ============================================
-- Primeiro: remover constraint de cpf único global
ALTER TABLE public.pessoas DROP CONSTRAINT IF EXISTS pessoas_cpf_key;

-- Depois: criar índice único por (cpf, evento_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_pessoas_cpf_evento 
ON public.pessoas(cpf, evento_id) 
WHERE cpf IS NOT NULL;

-- ============================================
-- VERIFICAÇÃO FINAL
-- ============================================
SELECT 
    tipo_pessoa,
    status_acesso,
    COUNT(*) as total
FROM public.pessoas 
GROUP BY tipo_pessoa, status_acesso
ORDER BY tipo_pessoa;

-- Verificar nova estrutura
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'pessoas' AND table_schema = 'public'
ORDER BY ordinal_position;