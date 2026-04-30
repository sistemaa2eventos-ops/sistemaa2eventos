-- ============================================
-- FASE 3: LIMPEZA - Quando tiver Downtime
-- ============================================
-- Tempo: ~45 minutos
-- Risco: Médio-Alto (afeta acesso a dados)
-- Recomendação: Executar em janela de manutenção

-- ============================================
-- PARTE A: DELETAR TABELAS DEPRECATED
-- ============================================

-- 1. Verificar antes de deletar
SELECT
  table_name,
  table_schema,
  (SELECT count(*) FROM information_schema.tables t2
   WHERE t2.table_schema = 'public' AND t2.table_name LIKE '%deprecated%') as deprecated_tables_total
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE '%deprecated%';

-- 2. Contar registros na tabela deprecated (antes de deletar)
SELECT COUNT(*) as total_registros
FROM public._perfil_permissoes_deprecated_20260409;

-- 3. BACKUP (execute antes de deletar)
-- Opção A: Criar tabela de backup
CREATE TABLE public._perfil_permissoes_deprecated_20260409_BACKUP AS
SELECT * FROM public._perfil_permissoes_deprecated_20260409;

-- Opção B: Exportar como CSV via Supabase Dashboard (recomendado)
-- Dashboard → SQL Editor → Clicar em "Download as CSV"

-- 4. ⚠️  DELETAR (depois de fazer backup)
DROP TABLE IF EXISTS public._perfil_permissoes_deprecated_20260409 CASCADE;

-- Verificar se foi deletada
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE '%deprecated%';

-- ============================================
-- PARTE B: DESABILITAR RLS EM TABELAS INTERNAS
-- ============================================
-- Estas tabelas não precisam de RLS porque:
-- 1. Não são expostas via PostgREST API
-- 2. São acessadas apenas via funções backend
-- 3. RLS sem políticas = ninguém consegue acessar

-- Desabilitar RLS em 14 tabelas internas
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

-- Verificar que foi desabilitado
SELECT
  table_name,
  rowsecurity as rls_ativado
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'api_keys', 'cameras_ip', 'event_modules', 'funcionarios_backup',
    'logs_veiculos', 'mensagem_templates', 'perfil_eventos', 'saas_config_global',
    'sys_event_role_permissions', 'sys_permissions', 'sys_role_permissions',
    'sys_roles', 'transacoes_financeiras', 'webhooks'
  )
ORDER BY table_name;

-- ============================================
-- PARTE C: ADICIONAR RLS POLICIES NAS TABELAS ATIVAS
-- ============================================

-- 1. backups_acesso_diario
-- Política: Cada usuário só vê seus próprios backups

CREATE POLICY "users_see_own_backups" ON public.backups_acesso_diario
FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "users_insert_own_backups" ON public.backups_acesso_diario
FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "users_update_own_backups" ON public.backups_acesso_diario
FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "users_delete_own_backups" ON public.backups_acesso_diario
FOR DELETE USING (user_id = auth.uid());

-- 2. watchlist
-- Política: Cada usuário só vê sua própria watchlist

CREATE POLICY "users_see_own_watchlist" ON public.watchlist
FOR SELECT USING (owner_id = auth.uid());

CREATE POLICY "users_manage_own_watchlist" ON public.watchlist
FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "users_update_own_watchlist" ON public.watchlist
FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "users_delete_own_watchlist" ON public.watchlist
FOR DELETE USING (owner_id = auth.uid());

-- 3. watchlist_alertas
-- Política: Apenas owner da watchlist pode ver alertas

CREATE POLICY "watchlist_owner_sees_alerts" ON public.watchlist_alertas
FOR SELECT USING (
  watchlist_id IN (
    SELECT id FROM public.watchlist WHERE owner_id = auth.uid()
  )
);

CREATE POLICY "watchlist_owner_manages_alerts" ON public.watchlist_alertas
FOR INSERT WITH CHECK (
  watchlist_id IN (
    SELECT id FROM public.watchlist WHERE owner_id = auth.uid()
  )
);

CREATE POLICY "watchlist_owner_updates_alerts" ON public.watchlist_alertas
FOR UPDATE USING (
  watchlist_id IN (
    SELECT id FROM public.watchlist WHERE owner_id = auth.uid()
  )
);

CREATE POLICY "watchlist_owner_deletes_alerts" ON public.watchlist_alertas
FOR DELETE USING (
  watchlist_id IN (
    SELECT id FROM public.watchlist WHERE owner_id = auth.uid()
  )
);

-- 4. watchlist_contatos
-- Política: Apenas owner da watchlist pode ver contatos

CREATE POLICY "watchlist_owner_sees_contacts" ON public.watchlist_contatos
FOR SELECT USING (
  watchlist_id IN (
    SELECT id FROM public.watchlist WHERE owner_id = auth.uid()
  )
);

CREATE POLICY "watchlist_owner_manages_contacts" ON public.watchlist_contatos
FOR INSERT WITH CHECK (
  watchlist_id IN (
    SELECT id FROM public.watchlist WHERE owner_id = auth.uid()
  )
);

CREATE POLICY "watchlist_owner_updates_contacts" ON public.watchlist_contatos
FOR UPDATE USING (
  watchlist_id IN (
    SELECT id FROM public.watchlist WHERE owner_id = auth.uid()
  )
);

CREATE POLICY "watchlist_owner_deletes_contacts" ON public.watchlist_contatos
FOR DELETE USING (
  watchlist_id IN (
    SELECT id FROM public.watchlist WHERE owner_id = auth.uid()
  )
);

-- ============================================
-- VERIFICAÇÃO FINAL
-- ============================================

-- Ver quantas policies foram criadas
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  qual as condition
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename;

-- Ver RLS status em todas as tabelas
SELECT
  table_name,
  CASE WHEN rowsecurity THEN 'ATIVADO' ELSE 'DESATIVADO' END as rls_status,
  (SELECT COUNT(*) FROM pg_policies WHERE pg_policies.tablename = tables.table_name) as policies_count
FROM information_schema.tables tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- ============================================
-- ROLLBACK (em caso de problema)
-- ============================================

-- Se algo der errado, execute:
/*
-- Reabilitar RLS nas tabelas internas
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cameras_ip ENABLE ROW LEVEL SECURITY;
-- ... (repetir para todas as 14 tabelas)

-- Deletar policies criadas
DROP POLICY IF EXISTS "users_see_own_backups" ON public.backups_acesso_diario;
DROP POLICY IF EXISTS "users_see_own_watchlist" ON public.watchlist;
-- ... (deletar todas as policies criadas)

-- Restaurar tabela deprecated (se tiver backup)
CREATE TABLE public._perfil_permissoes_deprecated_20260409 AS
SELECT * FROM public._perfil_permissoes_deprecated_20260409_BACKUP;
*/

-- ============================================
-- PRÓXIMOS PASSOS
-- ============================================
-- Após completar FASE 3:
-- 1. Testar acesso a dados em staging
-- 2. Monitorar logs por erros de RLS
-- 3. Confirmar que backups e watchlist funcionam
-- 4. Executar auditoria novamente no Supabase Dashboard
-- 5. Documentar mudanças para o time
