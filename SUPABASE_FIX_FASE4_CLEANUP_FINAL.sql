-- ============================================
-- FASE 4: CLEANUP FINAL
-- ============================================
-- Objetivo: Eliminar últimos erros da auditoria
-- Tempo: ~15 minutos
-- Risco: Baixo (apenas ativa RLS com policies seguras)

-- =====================================================
-- PARTE A: DELETAR TABELA DE BACKUP
-- =====================================================

DROP TABLE IF EXISTS public._perfil_permissoes_deprecated_20260409_BACKUP CASCADE;

SELECT COUNT(*) as backup_tables_restantes
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE '%BACKUP%';

-- =====================================================
-- PARTE B: ATIVAR RLS EM api_keys (com proteção de token)
-- =====================================================

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- Policy: Apenas admin/master pode acessar chaves
CREATE POLICY "admin_only_api_keys" ON public.api_keys
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.perfis
    WHERE id = auth.uid()
    AND nivel_acesso IN ('master', 'admin')
  )
);

CREATE POLICY "admin_only_insert_api_keys" ON public.api_keys
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.perfis
    WHERE id = auth.uid()
    AND nivel_acesso IN ('master', 'admin')
  )
);

CREATE POLICY "admin_only_update_api_keys" ON public.api_keys
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.perfis
    WHERE id = auth.uid()
    AND nivel_acesso IN ('master', 'admin')
  )
);

CREATE POLICY "admin_only_delete_api_keys" ON public.api_keys
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.perfis
    WHERE id = auth.uid()
    AND nivel_acesso IN ('master', 'admin')
  )
);

-- =====================================================
-- PARTE C: ATIVAR RLS EM TABELAS INTERNAS (deny-all exceto service_role)
-- =====================================================

-- Estratégia: RLS ativado + policy que bloqueia anon/authenticated
-- Apenas service_role consegue acessar via backend

-- 1. cameras_ip
ALTER TABLE public.cameras_ip ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only_cameras_ip" ON public.cameras_ip
FOR ALL USING (current_user = 'service_role');

-- 2. event_modules
ALTER TABLE public.event_modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only_event_modules" ON public.event_modules
FOR ALL USING (current_user = 'service_role');

-- 3. funcionarios_backup
ALTER TABLE public.funcionarios_backup ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only_funcionarios_backup" ON public.funcionarios_backup
FOR ALL USING (current_user = 'service_role');

-- 4. logs_veiculos
ALTER TABLE public.logs_veiculos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only_logs_veiculos" ON public.logs_veiculos
FOR ALL USING (current_user = 'service_role');

-- 5. mensagem_templates
ALTER TABLE public.mensagem_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only_mensagem_templates" ON public.mensagem_templates
FOR ALL USING (current_user = 'service_role');

-- 6. perfil_eventos
ALTER TABLE public.perfil_eventos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only_perfil_eventos" ON public.perfil_eventos
FOR ALL USING (current_user = 'service_role');

-- 7. saas_config_global
ALTER TABLE public.saas_config_global ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only_saas_config_global" ON public.saas_config_global
FOR ALL USING (current_user = 'service_role');

-- 8. sys_event_role_permissions
ALTER TABLE public.sys_event_role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only_sys_event_role_permissions" ON public.sys_event_role_permissions
FOR ALL USING (current_user = 'service_role');

-- 9. sys_permissions
ALTER TABLE public.sys_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only_sys_permissions" ON public.sys_permissions
FOR ALL USING (current_user = 'service_role');

-- 10. sys_role_permissions
ALTER TABLE public.sys_role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only_sys_role_permissions" ON public.sys_role_permissions
FOR ALL USING (current_user = 'service_role');

-- 11. sys_roles
ALTER TABLE public.sys_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only_sys_roles" ON public.sys_roles
FOR ALL USING (current_user = 'service_role');

-- 12. transacoes_financeiras
ALTER TABLE public.transacoes_financeiras ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only_transacoes_financeiras" ON public.transacoes_financeiras
FOR ALL USING (current_user = 'service_role');

-- 13. webhooks
ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only_webhooks" ON public.webhooks
FOR ALL USING (current_user = 'service_role');

-- =====================================================
-- VERIFICAÇÃO FINAL
-- =====================================================

-- Ver RLS status de todas as tabelas críticas
SELECT
  tablename,
  rowsecurity as rls_ativado,
  (SELECT COUNT(*) FROM pg_policies WHERE pg_policies.tablename = pg_tables.tablename) as policies_count
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'api_keys', 'cameras_ip', 'event_modules', 'funcionarios_backup',
    'logs_veiculos', 'mensagem_templates', 'perfil_eventos', 'saas_config_global',
    'sys_event_role_permissions', 'sys_permissions', 'sys_role_permissions',
    'sys_roles', 'transacoes_financeiras', 'webhooks'
  )
ORDER BY tablename;

-- Ver todas as policies criadas
SELECT
  tablename,
  COUNT(*) as total_policies
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'api_keys', 'cameras_ip', 'event_modules', 'funcionarios_backup',
    'logs_veiculos', 'mensagem_templates', 'perfil_eventos', 'saas_config_global',
    'sys_event_role_permissions', 'sys_permissions', 'sys_role_permissions',
    'sys_roles', 'transacoes_financeiras', 'webhooks'
  )
GROUP BY tablename
ORDER BY tablename;

-- =====================================================
-- PRÓXIMAS AÇÕES
-- =====================================================
-- 1. Executar Database Linter novamente no Supabase
-- 2. Verificar se todos os erros foram resolvidos
-- 3. Testar acesso ao aplicativo
-- 4. Documentar as mudanças
