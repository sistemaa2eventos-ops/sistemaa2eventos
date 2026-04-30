-- ============================================
-- FASE 3: LIMPEZA SIMPLIFICADA
-- ============================================
-- Versão: Adaptada para estrutura real das tabelas
-- Risco: Baixo (policies baseadas em evento_id)

-- =====================================================
-- PARTE A: DELETAR TABELAS DEPRECATED
-- =====================================================

-- 1. Fazer backup
CREATE TABLE public._perfil_permissoes_deprecated_20260409_BACKUP AS
SELECT * FROM public._perfil_permissoes_deprecated_20260409;

-- 2. Deletar
DROP TABLE IF EXISTS public._perfil_permissoes_deprecated_20260409 CASCADE;

-- 3. Verificar
SELECT COUNT(*) as deprecated_restantes
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE '%deprecated%';

-- =====================================================
-- PARTE B: DESABILITAR RLS EM TABELAS INTERNAS
-- =====================================================

ALTER TABLE public.api_keys DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.cameras_ip DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_modules DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.funcionarios_backup DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.logs_veiculos DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.mensagem_templates DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfil_eventos DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_config_global DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.sys_event_role_permissions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.sys_permissions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.sys_role_permissions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.sys_roles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.transacoes_financeiras DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhooks DISABLE ROW LEVEL SECURITY;

-- =====================================================
-- PARTE C: CRIAR RLS POLICIES NAS TABELAS ATIVAS
-- =====================================================

-- 1. backups_acesso_diario
-- Política: Usuários de um evento veem backups daquele evento
CREATE POLICY "evento_members_see_backups" ON public.backups_acesso_diario
FOR SELECT USING (
  evento_id IN (SELECT evento_id FROM public.perfis WHERE id = auth.uid())
);

CREATE POLICY "evento_members_insert_backups" ON public.backups_acesso_diario
FOR INSERT WITH CHECK (
  evento_id IN (SELECT evento_id FROM public.perfis WHERE id = auth.uid())
);

CREATE POLICY "evento_members_update_backups" ON public.backups_acesso_diario
FOR UPDATE USING (
  evento_id IN (SELECT evento_id FROM public.perfis WHERE id = auth.uid())
);

CREATE POLICY "evento_members_delete_backups" ON public.backups_acesso_diario
FOR DELETE USING (
  evento_id IN (SELECT evento_id FROM public.perfis WHERE id = auth.uid())
);

-- 2. watchlist
-- Política: Usuário vê watchlists que ele adicionou, ou públicas do seu evento
CREATE POLICY "users_see_own_watchlist" ON public.watchlist
FOR SELECT USING (
  adicionado_por = auth.uid() OR
  evento_id IN (SELECT evento_id FROM public.perfis WHERE id = auth.uid())
);

CREATE POLICY "users_create_watchlist" ON public.watchlist
FOR INSERT WITH CHECK (
  adicionado_por = auth.uid() AND
  evento_id IN (SELECT evento_id FROM public.perfis WHERE id = auth.uid())
);

CREATE POLICY "users_update_own_watchlist" ON public.watchlist
FOR UPDATE USING (adicionado_por = auth.uid());

CREATE POLICY "users_delete_own_watchlist" ON public.watchlist
FOR DELETE USING (adicionado_por = auth.uid());

-- 3. watchlist_alertas
-- Política: Usuário vê alertas de watchlists que ele criou
CREATE POLICY "watchlist_owner_sees_alerts" ON public.watchlist_alertas
FOR SELECT USING (
  watchlist_id IN (
    SELECT id FROM public.watchlist WHERE adicionado_por = auth.uid()
  )
);

CREATE POLICY "watchlist_owner_manages_alerts" ON public.watchlist_alertas
FOR INSERT WITH CHECK (
  watchlist_id IN (
    SELECT id FROM public.watchlist WHERE adicionado_por = auth.uid()
  )
);

CREATE POLICY "watchlist_owner_updates_alerts" ON public.watchlist_alertas
FOR UPDATE USING (
  watchlist_id IN (
    SELECT id FROM public.watchlist WHERE adicionado_por = auth.uid()
  )
);

CREATE POLICY "watchlist_owner_deletes_alerts" ON public.watchlist_alertas
FOR DELETE USING (
  watchlist_id IN (
    SELECT id FROM public.watchlist WHERE adicionado_por = auth.uid()
  )
);

-- 4. watchlist_contatos
-- Política: Usuários de um evento veem contatos daquele evento
CREATE POLICY "evento_members_see_contacts" ON public.watchlist_contatos
FOR SELECT USING (
  evento_id IN (SELECT evento_id FROM public.perfis WHERE id = auth.uid())
);

CREATE POLICY "evento_members_create_contacts" ON public.watchlist_contatos
FOR INSERT WITH CHECK (
  evento_id IN (SELECT evento_id FROM public.perfis WHERE id = auth.uid())
);

CREATE POLICY "evento_members_update_contacts" ON public.watchlist_contatos
FOR UPDATE USING (
  evento_id IN (SELECT evento_id FROM public.perfis WHERE id = auth.uid())
);

CREATE POLICY "evento_members_delete_contacts" ON public.watchlist_contatos
FOR DELETE USING (
  evento_id IN (SELECT evento_id FROM public.perfis WHERE id = auth.uid())
);

-- =====================================================
-- VERIFICAÇÃO FINAL
-- =====================================================

-- Verificar policies criadas
SELECT
  tablename,
  COUNT(*) as total_policies
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('backups_acesso_diario', 'watchlist', 'watchlist_alertas', 'watchlist_contatos')
GROUP BY tablename
ORDER BY tablename;

-- Verificar RLS status
SELECT
  tablename,
  rowsecurity as rls_ativado,
  (SELECT COUNT(*) FROM pg_policies WHERE pg_policies.tablename = pg_tables.tablename) as policies_count
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('backups_acesso_diario', 'watchlist', 'watchlist_alertas', 'watchlist_contatos')
ORDER BY tablename;

-- =====================================================
-- PRÓXIMAS AÇÕES
-- =====================================================
-- 1. Testar acesso às tabelas no aplicativo
-- 2. Verificar logs por erros de RLS (403 Forbidden)
-- 3. Se houver bloqueios, ajustar as policies
-- 4. Monitorar por 24h
