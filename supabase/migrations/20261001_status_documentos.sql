-- ==============================================================================
-- MIGRATION: Status Documental e Auditoria de Colaboradores
-- Data: 2026-10-01
-- Objetivo: Rastrear status individual de conformidade documental das pessoas
-- (Pré-evento e Dia do Evento: Aprovado, Reprovado, Reenvio Solicitado)
-- ==============================================================================

-- 1. Campo status_documentos na tabela pessoas
ALTER TABLE public.pessoas 
    ADD COLUMN IF NOT EXISTS status_documentos VARCHAR(30) DEFAULT 'pendente'
    CHECK (status_documentos IN ('pendente', 'em_analise', 'aprovado', 'reprovado', 'reenvio_solicitado'));

-- Índice para consultas rápidas na auditoria e credenciamento
CREATE INDEX IF NOT EXISTS idx_pessoas_status_documentos 
    ON public.pessoas (evento_id, status_documentos);

-- 2. Atualizar constraint de status em pessoa_documentos se necessário
DO $$ 
BEGIN
    ALTER TABLE public.pessoa_documentos 
        DROP CONSTRAINT IF EXISTS pessoa_documentos_status_check;
    
    ALTER TABLE public.pessoa_documentos 
        ADD CONSTRAINT pessoa_documentos_status_check 
        CHECK (status IN ('pendente', 'em_analise', 'aprovado', 'rejeitado', 'reprovado', 'reenvio_solicitado'));
EXCEPTION
    WHEN OTHERS THEN
        NULL;
END $$;

COMMENT ON COLUMN public.pessoas.status_documentos IS 'Status da auditoria documental (pendente, em_analise, aprovado, reprovado, reenvio_solicitado)';
