-- ===================================================================================
-- SPRINT 24: ANTI-SCALPER TICKET TRANSFER (TRANSFERÊNCIA SEGURA DE TITULARIDADE)
-- ===================================================================================

-- Tabela para gerenciar o ciclo de vida e auditoria das transferências de ingresso B2C
CREATE TABLE IF NOT EXISTS public.transferencias_ingresso (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pessoa_origem_id UUID NOT NULL REFERENCES public.pessoas(id) ON DELETE CASCADE,
    evento_id UUID NOT NULL REFERENCES public.eventos(id) ON DELETE CASCADE,
    
    -- Token Criptográfico Temporário para a URL de aceite
    token VARCHAR(100) UNIQUE NOT NULL,
    
    -- Status da Transferência
    status VARCHAR(20) DEFAULT 'pendente' 
        CHECK (status IN ('pendente', 'concluida', 'cancelada', 'expirada')),
        
    -- Histórico do recebedor (preenchido após conclusão)
    pessoa_destino_id UUID REFERENCES public.pessoas(id) ON DELETE SET NULL,
    
    -- Controle de Tempo Estrito (Hot-Time Limit)
    expira_em TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Índices de Performance para a API de Validação
CREATE INDEX IF NOT EXISTS idx_transfer_token ON public.transferencias_ingresso(token);
CREATE INDEX IF NOT EXISTS idx_transfer_origem ON public.transferencias_ingresso(pessoa_origem_id);
CREATE INDEX IF NOT EXISTS idx_transfer_status ON public.transferencias_ingresso(status);

-- Adicionar flag de Transferência na Tabela Pessoas (Invalida o ingresso localmente)
ALTER TABLE public.pessoas
    ADD COLUMN IF NOT EXISTS status_ingresso VARCHAR(30) DEFAULT 'ativo' 
        CHECK (status_ingresso IN ('ativo', 'transferencia_pendente', 'transferido', 'cancelado'));

-- RLS para Transferências (Apenas o Cliente dono pode ver suas transferências ou o Admin global)
ALTER TABLE public.transferencias_ingresso ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Transfers: Cliente Origem Access" ON public.transferencias_ingresso
    FOR SELECT
    USING (
        auth.jwt() ->> 'sub' = pessoa_origem_id::text
        OR auth.jwt() ->> 'sub' = pessoa_destino_id::text
    );

CREATE POLICY "Transfers: Admin Access" ON public.transferencias_ingresso
    FOR ALL
    USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor')
    );
