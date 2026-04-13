-- ========================================================================================
-- SPRINT 19: TRILHA DE AUDITORIA UNIVERSAL (COMPLIANCE E LGPD)
-- ========================================================================================

-- 1. Criação da Tabela de Logs de Auditoria
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tabela_nome VARCHAR(255) NOT NULL,
    acao VARCHAR(20) NOT NULL CHECK (acao IN ('INSERT', 'UPDATE', 'DELETE')),
    registro_id UUID NOT NULL,
    old_data JSONB,
    new_data JSONB,
    changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    changed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices de Performance Analítica para varreduras de Forense Digital
CREATE INDEX IF NOT EXISTS idx_audit_logs_tabela ON public.audit_logs(tabela_nome);
CREATE INDEX IF NOT EXISTS idx_audit_logs_registro ON public.audit_logs(registro_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_data ON public.audit_logs(changed_at DESC);

-- 2. Função de Gatilho de Auditoria Universal
CREATE OR REPLACE FUNCTION record_audit_log()
RETURNS TRIGGER AS $$
DECLARE
    v_user_id UUID;
    v_old_data JSONB := NULL;
    v_new_data JSONB := NULL;
    v_record_id UUID;
BEGIN
    -- Obter ID do usuário autenticado no JWT do Supabase (auth.uid())
    -- Retorna NULL caso venha de um Service Role interno ou Backend Node autônomo.
    v_user_id := auth.uid();

    IF TG_OP = 'INSERT' THEN
        v_new_data := row_to_json(NEW)::JSONB;
        v_record_id := NEW.id;
    ELSIF TG_OP = 'UPDATE' THEN
        v_old_data := row_to_json(OLD)::JSONB;
        v_new_data := row_to_json(NEW)::JSONB;
        v_record_id := NEW.id;
        
        -- Evita preencher o disco com updates falsos (ex: touch na row sem alterar dado)
        IF v_old_data = v_new_data THEN
            RETURN NEW;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        v_old_data := row_to_json(OLD)::JSONB;
        v_record_id := OLD.id;
    END IF;

    -- Inserir Log na Trilha
    INSERT INTO public.audit_logs (
        tabela_nome, 
        acao, 
        registro_id, 
        old_data, 
        new_data, 
        changed_by
    ) VALUES (
        TG_TABLE_NAME,
        TG_OP,
        v_record_id,
        v_old_data,
        v_new_data,
        v_user_id
    );

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Aplicação do Gatilho nas Tabelas Sensíveis (Regras Estritas LGPD e IAM)

-- A) Entidades Pessoas (Dados Pessoais, Biometria, Documentos Pessoais)
DROP TRIGGER IF EXISTS trg_audit_pessoas ON public.pessoas;
CREATE TRIGGER trg_audit_pessoas
    AFTER INSERT OR UPDATE OR DELETE ON public.pessoas
    FOR EACH ROW EXECUTE FUNCTION record_audit_log();

-- B) Gestão Eletrônica de Docs (Vencimentos, Aprovações, NRs, ASOs)
-- Identificador vital para a questão de "Quem aprovou esse acidente de trabalho?"
DROP TRIGGER IF EXISTS trg_audit_pessoa_documentos ON public.pessoa_documentos;
CREATE TRIGGER trg_audit_pessoa_documentos
    AFTER INSERT OR UPDATE OR DELETE ON public.pessoa_documentos
    FOR EACH ROW EXECUTE FUNCTION record_audit_log();

-- C) Configuração de Eventos
DROP TRIGGER IF EXISTS trg_audit_eventos ON public.eventos;
CREATE TRIGGER trg_audit_eventos
    AFTER INSERT OR UPDATE OR DELETE ON public.eventos
    FOR EACH ROW EXECUTE FUNCTION record_audit_log();

-- D) Vínculos B2B Pivot (Quem deu a agência A acesso ao Prestador B?)
-- IMPORTANTE: Exige que a migração "10_pessoa_empresa_pivot.sql" já tenha sido executada!
DROP TRIGGER IF EXISTS trg_audit_pessoa_evento_empresa ON public.pessoa_evento_empresa;
CREATE TRIGGER trg_audit_pessoa_evento_empresa
    AFTER INSERT OR UPDATE OR DELETE ON public.pessoa_evento_empresa
    FOR EACH ROW EXECUTE FUNCTION record_audit_log();

-- E) Perfis IAM (Quem subiu esse operador para Admin?)
DROP TRIGGER IF EXISTS trg_audit_perfis ON public.perfis;
CREATE TRIGGER trg_audit_perfis
    AFTER INSERT OR UPDATE OR DELETE ON public.perfis
    FOR EACH ROW EXECUTE FUNCTION record_audit_log();

-- 4. Blindagem do Registro contra Modificação (Append-Only)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Admins podem ler a trilha
CREATE POLICY "Ler Trilha Auditoria" ON public.audit_logs
    FOR SELECT 
    USING ((auth.jwt() -> 'app_metadata' ->> 'role')::text = 'admin');

-- Mas NINGUÉM via POSTGREST (API) pode DELETAR ou ALTERAR um log
CREATE POLICY "Deny Delete Audit Logs" ON public.audit_logs FOR DELETE USING (false);
CREATE POLICY "Deny Update Audit Logs" ON public.audit_logs FOR UPDATE USING (false);
