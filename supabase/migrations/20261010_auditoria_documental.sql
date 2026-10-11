-- ==============================================================================
-- MIGRATION: Auditoria Documental — obrigatórios por função, validade,
--            liberação manual por turno e notificações de vencimento
-- Data: 2026-10-10
-- Idempotente: pode ser executada mais de uma vez. Não remove dados.
-- ==============================================================================

-- 1. Validade, emissão e tipo nos documentos ----------------------------------
ALTER TABLE public.pessoa_documentos
    ADD COLUMN IF NOT EXISTS data_emissao DATE,
    ADD COLUMN IF NOT EXISTS data_validade DATE,
    ADD COLUMN IF NOT EXISTS tipo_documento_id UUID;

ALTER TABLE public.empresa_documentos
    ADD COLUMN IF NOT EXISTS data_emissao DATE,
    ADD COLUMN IF NOT EXISTS data_validade DATE,
    ADD COLUMN IF NOT EXISTS tipo_documento_id UUID;

-- Status 'vencido' (documento aprovado cuja validade passou)
ALTER TABLE public.pessoa_documentos DROP CONSTRAINT IF EXISTS pessoa_documentos_status_check;
ALTER TABLE public.pessoa_documentos ADD CONSTRAINT pessoa_documentos_status_check
    CHECK (status IN ('pendente', 'em_analise', 'aprovado', 'rejeitado', 'reprovado', 'reenvio_solicitado', 'vencido'));

ALTER TABLE public.empresa_documentos DROP CONSTRAINT IF EXISTS empresa_documentos_status_check;
ALTER TABLE public.empresa_documentos ADD CONSTRAINT empresa_documentos_status_check
    CHECK (status IN ('pendente', 'em_analise', 'aprovado', 'rejeitado', 'reprovado', 'reenvio_solicitado', 'vencido'));

CREATE INDEX IF NOT EXISTS idx_pessoa_documentos_pessoa ON public.pessoa_documentos (pessoa_id);
CREATE INDEX IF NOT EXISTS idx_pessoa_documentos_validade ON public.pessoa_documentos (data_validade) WHERE data_validade IS NOT NULL;

-- 2. Catálogo de tipos de documento por evento ---------------------------------
CREATE TABLE IF NOT EXISTS public.evento_tipos_documento (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evento_id UUID NOT NULL REFERENCES public.eventos(id) ON DELETE CASCADE,
    nome VARCHAR(120) NOT NULL,
    exige_validade BOOLEAN NOT NULL DEFAULT false,
    ativo BOOLEAN NOT NULL DEFAULT true,
    ordem INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (evento_id, nome)
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'pessoa_documentos_tipo_documento_fk'
    ) THEN
        ALTER TABLE public.pessoa_documentos
            ADD CONSTRAINT pessoa_documentos_tipo_documento_fk
            FOREIGN KEY (tipo_documento_id) REFERENCES public.evento_tipos_documento(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 3. Documentos obrigatórios por função ('*' = padrão para todos) --------------
CREATE TABLE IF NOT EXISTS public.evento_documentos_funcao (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evento_id UUID NOT NULL REFERENCES public.eventos(id) ON DELETE CASCADE,
    funcao VARCHAR(100) NOT NULL,           -- normalizada em MAIÚSCULAS e sem espaços extras
    tipo_documento_id UUID NOT NULL REFERENCES public.evento_tipos_documento(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (evento_id, funcao, tipo_documento_id)
);
CREATE INDEX IF NOT EXISTS idx_evento_documentos_funcao ON public.evento_documentos_funcao (evento_id, funcao);

-- Catálogo inicial para cada evento existente (sem regras: nada muda até configurar)
INSERT INTO public.evento_tipos_documento (evento_id, nome, exige_validade, ordem)
SELECT e.id, t.nome, t.exige_validade, t.ordem
FROM public.eventos e
CROSS JOIN (VALUES
    ('RG/CNH - Frente', false, 1),
    ('RG/CNH - Verso', false, 2),
    ('ASO', true, 3),
    ('NR-10', true, 4),
    ('NR-35', true, 5),
    ('Certificado/Treinamento', true, 6)
) AS t(nome, exige_validade, ordem)
ON CONFLICT (evento_id, nome) DO NOTHING;

-- 4. Liberação manual por turno ------------------------------------------------
ALTER TABLE public.pessoas
    ADD COLUMN IF NOT EXISTS liberacao_manual_ate TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS liberacao_manual_por UUID,
    ADD COLUMN IF NOT EXISTS liberacao_manual_motivo TEXT;

-- 5. Notificações persistentes do painel ---------------------------------------
CREATE TABLE IF NOT EXISTS public.notificacoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evento_id UUID REFERENCES public.eventos(id) ON DELETE CASCADE,
    tipo VARCHAR(50) NOT NULL,              -- ex.: DOC_VENCIDO, DOC_A_VENCER
    severidade VARCHAR(20) NOT NULL DEFAULT 'warning',
    titulo VARCHAR(200) NOT NULL,
    mensagem TEXT,
    referencia_tipo VARCHAR(50),
    referencia_id UUID,
    chave_dedupe VARCHAR(200) UNIQUE,       -- evita repetir o mesmo aviso
    lida_em TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notificacoes_evento ON public.notificacoes (evento_id, lida_em, created_at DESC);

-- Acesso só pelo backend (service role ignora RLS)
ALTER TABLE public.evento_tipos_documento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evento_documentos_funcao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;

-- 6. Expiração: documento vencido vira 'vencido' (antes virava 'rejeitado') ----
CREATE OR REPLACE FUNCTION public.revogar_documentos_vencidos()
RETURNS void AS $$
BEGIN
    UPDATE public.pessoa_documentos
    SET status = 'vencido', notas_auditoria = 'DOCUMENTO VENCIDO AUTOMATICAMENTE'
    WHERE status = 'aprovado' AND data_validade < CURRENT_DATE;

    UPDATE public.empresa_documentos
    SET status = 'vencido', notas_auditoria = 'DOCUMENTO VENCIDO AUTOMATICAMENTE'
    WHERE status = 'aprovado' AND data_validade < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.revogar_documentos_vencidos() FROM anon, authenticated;

-- Atualiza o cache de schema do PostgREST
NOTIFY pgrst, 'reload schema';
