-- Script corrigido - ignora políticas existentes
-- Execute por partes no SQL Editor

-- PARTE 1: Remover todas as políticas allow_all e velhas
DO $$ DECLARE r RECORD; BEGIN FOR r IN (SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public' AND policyname IN ('allow_all', 'master_all_access')) LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename); END LOOP; END $$;

-- PARTE 2: Criar políticas para tabelas principais (execute uma de cada vez se needed)

-- eventos
DROP POLICY IF EXISTS master_access ON eventos; DROP POLICY IF EXISTS staff_access ON eventos; DROP POLICY IF EXISTS service_access ON eventos;
CREATE POLICY "master_access" ON eventos FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY "staff_access" ON eventos FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador'));
CREATE POLICY "service_access" ON eventos FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');

-- pessoas
DROP POLICY IF EXISTS master_access ON pessoas; DROP POLICY IF EXISTS staff_access ON pessoas; DROP POLICY IF EXISTS service_access ON pessoas;
CREATE POLICY "master_access" ON pessoas FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY "staff_access" ON pessoas FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador'));
CREATE POLICY "service_access" ON pessoas FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');

-- empresas
DROP POLICY IF EXISTS master_access ON empresas; DROP POLICY IF EXISTS staff_access ON empresas; DROP POLICY IF EXISTS service_access ON empresas;
CREATE POLICY "master_access" ON empresas FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY "staff_access" ON empresas FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador'));
CREATE POLICY "service_access" ON empresas FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');

-- logs_acesso
DROP POLICY IF EXISTS master_access ON logs_acesso; DROP POLICY IF EXISTS staff_access ON logs_acesso; DROP POLICY IF EXISTS service_access ON logs_acesso;
CREATE POLICY "master_access" ON logs_acesso FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY "staff_access" ON logs_acesso FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor', 'operador'));
CREATE POLICY "service_access" ON logs_acesso FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');

-- perfis
DROP POLICY IF EXISTS master_access ON perfis; DROP POLICY IF EXISTS service_access ON perfis;
CREATE POLICY "master_access" ON perfis FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master');
CREATE POLICY "service_access" ON perfis FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');

-- PARTE 3: Tabelas secundárias (execute só se necessário)
-- pessoa_documentos, empresa_documentos, dispositivos_acesso, quotas_diarias, pessoa_evento_empresa, evento_areas, evento_tipos_pulseira, pulseira_areas_permitidas, veiculos, evento_etiqueta_layouts, monitor_watchlist

-- Resultado
SELECT 'OK - Verifique o resultado abaixo' AS msg, 
(SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public') AS total_politicas;
