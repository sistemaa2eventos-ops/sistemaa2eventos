-- ============================================================
-- 🛡️ HARDENING 3.0 & UNIFICAÇÃO RBAC (SOBERANIA TOTAL)
-- ============================================================
-- Data: 08/Abr/2026
-- Descrição: Unifica permissões, menus e segurança de infraestrutura.
-- SANEAMENTO: Remove o legado da NZT para consolidar o Hub A2 Eventos.

-- 0. 🧹 SANEAMENTO (LIMPEZA DO LEGADO)
-- CUIDADO: Este comando remove a tabela antiga que guardava menus em JSON.
-- Agora tudo será baseado na sys_event_role_permissions.
DROP TABLE IF EXISTS public.perfil_permissoes CASCADE;

-- 1. 🧩 EVOLUÇÃO DO SCHEMA RBAC
ALTER TABLE public.sys_permissions 
ADD COLUMN IF NOT EXISTS is_menu_item BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS menu_order INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS menu_icon TEXT,
ADD COLUMN IF NOT EXISTS plataforma TEXT DEFAULT 'web',
ADD COLUMN IF NOT EXISTS recurso_frontend TEXT;

-- 2. 🔐 HARDENING 3.0: Infraestrutura & SaaS Config
-- Ativar RLS em tabelas que não estavam protegidas
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_config_global ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_webhooks ENABLE ROW LEVEL SECURITY;

-- Polícias para Configuração Global (Soberania Master)
CREATE POLICY "Soberania Master Config" ON public.saas_config_global
    FOR ALL TO authenticated USING ( (SELECT nivel_acesso FROM public.perfis WHERE id = auth.uid()) = 'master' );

CREATE POLICY "Admin read global config" ON public.saas_config_global
    FOR SELECT TO authenticated USING ( (SELECT nivel_acesso FROM public.perfis WHERE id = auth.uid()) IN ('admin', 'master') );

-- Polícias para Configurações do Sistema
CREATE POLICY "Admin full access settings" ON public.system_settings
    FOR ALL TO authenticated USING ( (SELECT nivel_acesso FROM public.perfis WHERE id = auth.uid()) IN ('admin', 'master') );

CREATE POLICY "ReadOnly settings staff" ON public.system_settings
    FOR SELECT TO authenticated USING ( true ); -- Todos autenticados podem ver settings básicas

-- Polícias para Logs de Auditoria (ReadOnly)
CREATE POLICY "Admin read logs" ON public.audit_logs
    FOR SELECT TO authenticated USING ( (SELECT nivel_acesso FROM public.perfis WHERE id = auth.uid()) IN ('admin', 'master', 'supervisor') );

-- 3. ⚡ ÍNDICES DE ALTA PERFORMANCE
-- Otimização para SmartAccess e Dashboards
CREATE INDEX IF NOT EXISTS idx_logs_acesso_metrics ON public.logs_acesso (evento_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pessoas_status_metrics ON public.pessoas (evento_id, status_acesso);
CREATE INDEX IF NOT EXISTS idx_quotas_diarias_lookup ON public.quotas_diarias (evento_id, data, empresa_id);

-- 4. 🤖 TRIGGERS DE INTEGRIDADE AUTOMÁTICA
-- Função para sincronizar o status da pessoa com o último log
CREATE OR REPLACE FUNCTION public.sync_pessoa_status_trigger()
RETURNS TRIGGER AS $$
BEGIN
    -- Se for checkin ou checkout, atualiza o status na tabela principal
    -- Isso garante integridade mesmo se a API falhar no meio do processo
    IF (NEW.tipo IN ('checkin', 'checkout')) THEN
        UPDATE public.pessoas 
        SET 
            status_acesso = (CASE WHEN NEW.tipo = 'checkin' THEN 'checkin_feito' ELSE 'checkout_feito' END),
            updated_at = now()
        WHERE id = NEW.pessoa_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar o trigger na tabela de logs
DROP TRIGGER IF EXISTS trg_sync_status ON public.logs_acesso;
CREATE TRIGGER trg_sync_status
AFTER INSERT ON public.logs_acesso
FOR EACH ROW EXECUTE FUNCTION public.sync_pessoa_status_trigger();

-- 5. 🧱 MATEIALIZAÇÃO DAS PERMISSÕES DE MENU (Semente Inicial)
-- Inserindo os itens de menu principais na nova matriz (Exemplo)
INSERT INTO public.sys_permissions (recurso, acao, nome_humanizado, is_menu_item, menu_order, recurso_frontend, menu_icon)
VALUES 
('dashboard', 'view', 'Painel de Controle', true, 1, '/', 'DashboardIcon'),
('eventos', 'view', 'Eventos', true, 2, '/eventos', 'EventIcon'),
('pessoas', 'view', 'Pessoas / Participantes', true, 3, '/pessoas', 'PeopleIcon'),
('empresas', 'view', 'Empresas / Expositores', true, 4, '/empresas', 'BusinessIcon'),
('checkin', 'view', 'Portaria / Check-in', true, 5, '/checkin', 'LoginIcon'),
('monitor', 'view', 'Monitoramento RT', true, 6, '/monitor', 'MonitorIcon'),
('configuracoes', 'view', 'Configurações', true, 10, '/configuracoes', 'SettingsIcon')
ON CONFLICT (recurso, acao) DO NOTHING;
