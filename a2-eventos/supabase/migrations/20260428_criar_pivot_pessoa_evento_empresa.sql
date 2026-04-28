-- ============================================
-- Migração: Criar tabela pivot pessoa_evento_empresa
-- Data: 2026-04-28
-- Descrição: Tabela N:N entre pessoas, eventos e empresas
--            com status de aprovação e função
-- ============================================

-- 1. Verificar se a tabela já existe
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pessoa_evento_empresa') THEN
        RAISE NOTICE 'Tabela pessoa_evento_empresa não existe. Criando...';
    ELSE
        RAISE NOTICE 'Tabela pessoa_evento_empresa já existe. Pulando criação.';
    END IF;
END $$;

-- 2. Criar tabela
CREATE TABLE IF NOT EXISTS pessoa_evento_empresa (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    pessoa_id UUID NOT NULL REFERENCES pessoas(id) ON DELETE CASCADE,
    evento_id UUID NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    status_aprovacao VARCHAR(20) DEFAULT 'pendente'
        CHECK (status_aprovacao IN ('pendente', 'aprovado', 'recusado')),
    cargo_funcao VARCHAR(255) DEFAULT 'Participante',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Garantir que uma pessoa não pode ser vinculada 2x ao mesmo evento/empresa
    UNIQUE(pessoa_id, evento_id, empresa_id)
);

-- 3. Criar índices para performance (se não existirem)
CREATE INDEX IF NOT EXISTS idx_pee_pessoa_id ON pessoa_evento_empresa(pessoa_id);
CREATE INDEX IF NOT EXISTS idx_pee_evento_id ON pessoa_evento_empresa(evento_id);
CREATE INDEX IF NOT EXISTS idx_pee_empresa_id ON pessoa_evento_empresa(empresa_id);
CREATE INDEX IF NOT EXISTS idx_pee_status ON pessoa_evento_empresa(status_aprovacao);
CREATE INDEX IF NOT EXISTS idx_pee_pessoa_evento ON pessoa_evento_empresa(pessoa_id, evento_id);

-- 4. Habilitar Row Level Security (RLS)
ALTER TABLE pessoa_evento_empresa ENABLE ROW LEVEL SECURITY;

-- 5. Remover policies antigas se existirem (para recriá-las)
DROP POLICY IF EXISTS "evento_isolation" ON pessoa_evento_empresa;
DROP POLICY IF EXISTS "users_can_view_own_event" ON pessoa_evento_empresa;
DROP POLICY IF EXISTS "users_can_insert_own_event" ON pessoa_evento_empresa;
DROP POLICY IF EXISTS "users_can_update_own_event" ON pessoa_evento_empresa;

-- 6. Policy: SELECT - Usuários só veem dados do seu próprio evento
CREATE POLICY "users_can_view_own_event" ON pessoa_evento_empresa
    FOR SELECT
    USING (evento_id = (auth.jwt() ->> 'evento_id')::uuid);

-- 7. Policy: INSERT - Usuários só podem inserir no seu próprio evento
CREATE POLICY "users_can_insert_own_event" ON pessoa_evento_empresa
    FOR INSERT
    WITH CHECK (evento_id = (auth.jwt() ->> 'evento_id')::uuid);

-- 8. Policy: UPDATE - Usuários só podem atualizar dados do seu próprio evento
CREATE POLICY "users_can_update_own_event" ON pessoa_evento_empresa
    FOR UPDATE
    USING (evento_id = (auth.jwt() ->> 'evento_id')::uuid)
    WITH CHECK (evento_id = (auth.jwt() ->> 'evento_id')::uuid);

-- 9. Policy: DELETE - Apenas admin_master pode deletar
CREATE POLICY "admin_can_delete" ON pessoa_evento_empresa
    FOR DELETE
    USING ((auth.jwt() ->> 'nivel_acesso') = 'admin_master');

-- 10. Criar função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_pessoa_evento_empresa_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 11. Remover trigger antigo se existir
DROP TRIGGER IF EXISTS trigger_update_pessoa_evento_empresa_timestamp ON pessoa_evento_empresa;

-- 12. Criar trigger para atualizar timestamp
CREATE TRIGGER trigger_update_pessoa_evento_empresa_timestamp
BEFORE UPDATE ON pessoa_evento_empresa
FOR EACH ROW
EXECUTE FUNCTION update_pessoa_evento_empresa_timestamp();

-- 13. Logar sucesso
DO $$
BEGIN
    RAISE NOTICE '✅ Tabela pessoa_evento_empresa criada/atualizada com sucesso';
    RAISE NOTICE '✅ Índices criados';
    RAISE NOTICE '✅ RLS configurado';
    RAISE NOTICE '✅ Policies aplicadas';
END $$;
