-- Correção: CPF deve ser único por evento, não globalmente
-- Permite mesmo CPF em eventos diferentes

-- 1. Remover ALL constraints e índices únicos de CPF simples
ALTER TABLE public.pessoas DROP CONSTRAINT IF EXISTS pessoas_cpf_key;
ALTER TABLE public.pessoas DROP CONSTRAINT IF EXISTS pessoas_evento_cpf_key;
DROP INDEX IF EXISTS idx_pessoas_cpf_unico;
DROP INDEX IF EXISTS idx_pessoas_evento_cpf_unique;

-- 2. Adicionar constraint UNIQUE composto (evento_id, cpf)
-- Isso permite mesmo CPF em eventos diferentes
ALTER TABLE public.pessoas ADD CONSTRAINT pessoas_evento_cpf_key UNIQUE(evento_id, cpf);

-- 3. Criar índice para performance
CREATE INDEX IF NOT EXISTS idx_pessoas_evento_cpf ON public.pessoas(evento_id, cpf)
WHERE evento_id IS NOT NULL AND cpf IS NOT NULL;

COMMENT ON CONSTRAINT pessoas_evento_cpf_key ON public.pessoas IS 'CPF único por evento - permite reutilizar CPF em eventos diferentes';
