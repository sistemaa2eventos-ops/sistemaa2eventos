-- ============================================
-- MIGRATION: Índices de Performance
-- Data: 2026-04-16
-- Audit ref: M-01 — queries frequentes sem índices
-- ============================================

-- logs_acesso: filtro mais comum é por evento_id + pessoa_id
CREATE INDEX IF NOT EXISTS idx_logs_acesso_evento
    ON public.logs_acesso(evento_id);

CREATE INDEX IF NOT EXISTS idx_logs_acesso_pessoa
    ON public.logs_acesso(pessoa_id);

-- Index composto para queries que filtram por evento E ordenam por data
CREATE INDEX IF NOT EXISTS idx_logs_acesso_evento_created
    ON public.logs_acesso(evento_id, created_at DESC);

-- pessoas: busca por pulseira é crítica no fluxo de checkout
CREATE INDEX IF NOT EXISTS idx_pessoas_pulseira
    ON public.pessoas(numero_pulseira)
    WHERE numero_pulseira IS NOT NULL;

-- pessoas: busca por evento (o mais frequente)
CREATE INDEX IF NOT EXISTS idx_pessoas_evento
    ON public.pessoas(evento_id);

-- empresas: busca/filtro por evento
CREATE INDEX IF NOT EXISTS idx_empresas_evento
    ON public.empresas(evento_id);

-- CNPJ único por evento (fix I-11, caso não tenha sido criado ainda)
ALTER TABLE public.empresas DROP CONSTRAINT IF EXISTS empresas_cnpj_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_empresas_cnpj_evento
    ON public.empresas(cnpj, evento_id)
    WHERE cnpj IS NOT NULL;

-- ============================================
-- VERIFICAÇÃO
-- ============================================
SELECT indexname, tablename, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('logs_acesso', 'pessoas', 'empresas')
ORDER BY tablename, indexname;
