-- ============================================
-- FASE 1: CRÍTICA - Executar Imediatamente
-- ============================================
-- Tempo: ~15 minutos
-- Risco: Baixo (testes recomendados antes)

-- 1️⃣  CORRIGIR VIEW COM SECURITY DEFINER
-- =====================================================
-- Este comando recria a view com SECURITY INVOKER
-- Alternativamente, pode usar: WITH (security_invoker=true)

-- Primeiro, veja a definição atual
SELECT view_definition FROM information_schema.views
WHERE table_name = 'view_documentos_pendentes';

-- Depois, recrie com SECURITY INVOKER
CREATE OR REPLACE VIEW public.view_documentos_pendentes WITH (security_invoker=true) AS
SELECT d.id,
    'pessoa'::text AS entity_type,
    d.pessoa_id AS entity_id,
    p.evento_id,
    d.titulo,
    d.tipo_doc,
    d.url_arquivo,
    d.status,
    d.data_inclusao AS created_at,
    p.nome_completo AS entidade_nome,
    p.cpf AS entidade_doc
   FROM (pessoa_documentos d
     LEFT JOIN pessoas p ON ((p.id = d.pessoa_id)))
  WHERE ((d.status)::text = 'pendente'::text)
UNION ALL
 SELECT d.id,
    'empresa'::text AS entity_type,
    d.empresa_id AS entity_id,
    e.evento_id,
    d.titulo,
    d.tipo_doc,
    d.url_arquivo,
    d.status,
    d.data_inclusao AS created_at,
    e.nome AS entidade_nome,
    e.cnpj AS entidade_doc
   FROM (empresa_documentos d
     LEFT JOIN empresas e ON ((e.id = d.empresa_id)))
  WHERE ((d.status)::text = 'pendente'::text);

-- 2️⃣  ADICIONAR search_path NAS FUNÇÕES TRIGGER
-- =====================================================

-- Corrigir: update_pessoa_evento_empresa_timestamp
CREATE OR REPLACE FUNCTION public.update_pessoa_evento_empresa_timestamp()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- Verificar se foi atualizado
SELECT routine_name, routine_definition
FROM information_schema.routines
WHERE routine_name = 'update_pessoa_evento_empresa_timestamp';

-- Corrigir: camera_update_updated_at
CREATE OR REPLACE FUNCTION public.camera_update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- Verificar se foi atualizado
SELECT routine_name, routine_definition
FROM information_schema.routines
WHERE routine_name = 'camera_update_updated_at';

-- 3️⃣  ADICIONAR VALIDAÇÃO EM FUNÇÕES CRÍTICAS
-- =====================================================

-- ⚠️  Antes de aplicar, verifique o código atual da função!
-- Isso é um EXEMPLO genérico para registrar_acesso_atomico

-- Ver a função atual primeiro:
SELECT routine_definition
FROM information_schema.routines
WHERE routine_name = 'registrar_acesso_atomico';

-- Depois, você pode adicionar validação no início da função:
-- IF auth.uid() IS NULL THEN
--   RAISE EXCEPTION 'Autenticação necessária para registrar acesso';
-- END IF;

-- =====================================================
-- VERIFICAÇÃO FINAL
-- =====================================================
-- Execute isso para confirmar que as mudanças foram aplicadas

SELECT
  'view_documentos_pendentes' as objeto,
  'VIEW' as tipo,
  'SECURITY_INVOKER' as status
UNION ALL
SELECT
  'update_pessoa_evento_empresa_timestamp',
  'FUNCTION',
  'search_path SET'
UNION ALL
SELECT
  'camera_update_updated_at',
  'FUNCTION',
  'search_path SET';

-- =====================================================
-- PRÓXIMO PASSO
-- =====================================================
-- Após executar:
-- 1. Testar as views/funções no aplicativo
-- 2. Monitorar logs por erros
-- 3. Executar FASE 2 na próxima semana
