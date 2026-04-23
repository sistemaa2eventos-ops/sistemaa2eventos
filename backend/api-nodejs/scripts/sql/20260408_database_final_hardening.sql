-- ============================================================
-- 🛡️ A2 EVENTOS - SCRIPT DE HARDENING FINAL (RLS & PRIVACIDADE)
-- ============================================================
-- Resolve falhas críticas: Metadados Inseguros e Políticas 'Always True'.
-- Execute no SQL Editor do Supabase.

-- 1. 📂 LIMPEZA DE POLÍTICAS ANTIGAS (Garantir Novo Estado)
DROP POLICY IF EXISTS "Leitura de permissões do evento" ON public.sys_event_role_permissions;
DROP POLICY IF EXISTS "Gerenciamento total para Master e Admin" ON public.sys_event_role_permissions;
DROP POLICY IF EXISTS "Service role full access" ON public.evento_etiqueta_layouts;
DROP POLICY IF EXISTS "Public Read Access" ON public.perfil_permissoes;
DROP POLICY IF EXISTS "Allow All" ON public.pessoa_documentos;

-- 2. 🔐 REFORÇO: sys_event_role_permissions
-- Migrando de user_metadata (inseguro) para perfis (banco/seguro)
ALTER TABLE public.sys_event_role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/Master Full Access matrix" 
ON public.sys_event_role_permissions
FOR ALL
TO authenticated
USING (
    (SELECT nivel_acesso FROM public.perfis WHERE id = auth.uid()) IN ('admin', 'master')
);

CREATE POLICY "Event-specific read only matrix" 
ON public.sys_event_role_permissions
FOR SELECT
TO authenticated
USING (
    evento_id = (SELECT evento_id FROM public.perfis WHERE id = auth.uid())
);

-- 3. 🔐 CORREÇÃO: evento_etiqueta_layouts (Always True -> Restricted)
ALTER TABLE public.evento_etiqueta_layouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access labels"
ON public.evento_etiqueta_layouts
FOR ALL
TO authenticated
USING ( (SELECT nivel_acesso FROM public.perfis WHERE id = auth.uid()) IN ('admin', 'master') );

CREATE POLICY "Event staff read labels"
ON public.evento_etiqueta_layouts
FOR SELECT
TO authenticated
USING ( evento_id = (SELECT evento_id FROM public.perfis WHERE id = auth.uid()) );

-- 4. 🔐 CORREÇÃO: perfil_permissoes (Always True -> Restricted)
ALTER TABLE public.perfil_permissoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access permissions"
ON public.perfil_permissoes
FOR ALL
TO authenticated
USING ( (SELECT nivel_acesso FROM public.perfis WHERE id = auth.uid()) IN ('admin', 'master') );

CREATE POLICY "Self role read only"
ON public.perfil_permissoes
FOR SELECT
TO authenticated
USING ( nivel_acesso = (SELECT nivel_acesso FROM public.perfis WHERE id = auth.uid()) );

-- 5. 🔐 CORREÇÃO: pessoa_documentos (Always True -> Restricted)
ALTER TABLE public.pessoa_documentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view event documents"
ON public.pessoa_documentos
FOR ALL
TO authenticated
USING ( 
    (SELECT nivel_acesso FROM public.perfis WHERE id = auth.uid()) IN ('admin', 'master', 'supervisor', 'tecnico')
    AND
    pessoa_id IN (SELECT id FROM public.pessoas WHERE evento_id = (SELECT evento_id FROM public.perfis WHERE id = auth.uid()))
);

-- 6. 🛡️ RE-APLICAR INFRA (Se não foi feito anteriormente)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'extensions') THEN
        CREATE SCHEMA extensions;
    END IF;
END $$;
-- ============================================================
-- ✅ HARDENING 2.0 FINALIZADO
-- ============================================================
