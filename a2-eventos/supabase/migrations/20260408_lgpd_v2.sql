-- 🛡️ A2 Eventos - Migração LGPD & Rastreabilidade v2
-- Data: 2026-04-08

-- 1. Tabela de Registros de Consentimento Detalhado
CREATE TABLE IF NOT EXISTS public.consent_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pessoa_id UUID NOT NULL REFERENCES public.pessoas(id) ON DELETE CASCADE,
    evento_id UUID NOT NULL REFERENCES public.eventos(id) ON DELETE CASCADE,
    policy_version VARCHAR(20) DEFAULT '1.0',
    accepted_at TIMESTAMPTZ DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT,
    revoked_at TIMESTAMPTZ, -- Caso o usuário retire o consentimento (Art. 8, § 5º)
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consent_pessoa ON public.consent_records(pessoa_id);
CREATE INDEX IF NOT EXISTS idx_consent_evento ON public.consent_records(evento_id);

-- 2. Adicionar URL de Política de Privacidade ao Evento
ALTER TABLE public.eventos ADD COLUMN IF NOT EXISTS politica_privacidade_url TEXT;

-- 3. Adequação da Tabela de Auditoria
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS evento_id UUID;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS nivel_acesso VARCHAR(50);
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS recurso VARCHAR(255);
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS recurso_id UUID;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS detalhes JSONB;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS ip_origem INET;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Remover obrigatoriedade das colunas legadas (já que usamos 'recurso' e 'recurso_id' nas triggers novas)
ALTER TABLE public.audit_logs ALTER COLUMN tabela_nome DROP NOT NULL;
ALTER TABLE public.audit_logs ALTER COLUMN registro_id DROP NOT NULL;
ALTER TABLE public.audit_logs ALTER COLUMN changed_by DROP NOT NULL;
ALTER TABLE public.audit_logs ALTER COLUMN acao DROP NOT NULL;

-- 4. Sistema de Auditoria Automática (Triggers)

-- Função para capturar o autor da mudança (definido via middleware no Node.js)
-- SET LOCAL app.current_user_id = 'uuid';
-- SET LOCAL app.current_user_role = 'admin';

CREATE OR REPLACE FUNCTION public.fn_audit_log_trigger()
RETURNS TRIGGER AS $$
DECLARE
    v_user_id UUID;
    v_user_role TEXT;
    v_evento_id UUID;
    v_detalhes JSONB;
BEGIN
    -- Capturar contexto definido pelo Middleware
    BEGIN
        v_user_id := current_setting('app.current_user_id', true)::UUID;
        v_user_role := current_setting('app.current_user_role', true);
    EXCEPTION WHEN OTHERS THEN
        v_user_id := NULL;
        v_user_role := 'system';
    END;

    -- Tentar capturar o evento_id do registro (depende da tabela)
    IF (TG_OP = 'DELETE') THEN
        BEGIN
            v_evento_id := OLD.evento_id;
        EXCEPTION WHEN OTHERS THEN
            v_evento_id := NULL;
        END;
    ELSE
        BEGIN
            v_evento_id := NEW.evento_id;
        EXCEPTION WHEN OTHERS THEN
            v_evento_id := NULL;
        END;
    END IF;

    -- Montar JSON de detalhes (Antes vs Depois)
    IF (TG_OP = 'INSERT') THEN
         v_detalhes := jsonb_build_object('new', to_jsonb(NEW));
    ELSIF (TG_OP = 'UPDATE') THEN
         v_detalhes := jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW));
    ELSIF (TG_OP = 'DELETE') THEN
         v_detalhes := jsonb_build_object('old', to_jsonb(OLD));
    END IF;

    -- Inserir log
    INSERT INTO public.audit_logs (
        evento_id,
        user_id,
        nivel_acesso,
        acao,
        recurso,
        recurso_id,
        detalhes,
        ip_origem,
        created_at
    ) VALUES (
        COALESCE(v_evento_id, '00000000-0000-0000-0000-000000000000'),
        v_user_id,
        v_user_role,
        TG_OP,
        TG_TABLE_NAME::TEXT,
        COALESCE(NEW.id, OLD.id),
        v_detalhes,
        NULL,
        NOW()
    );

    IF (TG_OP = 'DELETE') THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar Triggers em tabelas sensíveis
DO $$
BEGIN
    -- 1. Pessoas
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'pessoas') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_audit_pessoas') THEN
            CREATE TRIGGER tr_audit_pessoas
            AFTER INSERT OR UPDATE OR DELETE ON public.pessoas
            FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();
        END IF;
    END IF;

    -- 2. Transações Financeiras (Pagamentos)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'transacoes_financeiras') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_audit_transacoes') THEN
            CREATE TRIGGER tr_audit_transacoes
            AFTER INSERT OR UPDATE OR DELETE ON public.transacoes_financeiras
            FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();
        END IF;
    END IF;

    -- 3. Perfis (Usuários)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'perfis') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_audit_perfis') THEN
            CREATE TRIGGER tr_audit_perfis
            AFTER INSERT OR UPDATE OR DELETE ON public.perfis
            FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();
        END IF;
    END IF;
END $$;
