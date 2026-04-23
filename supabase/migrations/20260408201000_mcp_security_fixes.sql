-- Script 1: MCP Security Advisor Fixes

-- 1. Enable RLS on Public Tables leaking data
ALTER TABLE IF EXISTS public.webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.consent_records ENABLE ROW LEVEL SECURITY;

-- 2. Basic Restricted Policies for them (Admin Only)
-- If these tables are inserted by a webhook/service role, RLS is bypassed anyway.
-- If users need to read their consents, we would need to know the structure, but making it Admin-only prevents public unauthorized access.
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'webhook_events' AND policyname = 'Restricted access to webhook_events'
    ) THEN
        CREATE POLICY "Restricted access to webhook_events" ON public.webhook_events
            FOR ALL 
            USING ( (SELECT auth.jwt() ->> 'role') = 'service_role' OR (SELECT auth.uid()) IN (SELECT id FROM public.usuarios WHERE role IN ('admin', 'master', 'master_manager')) );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'consent_records' AND policyname = 'Restricted access to consent_records'
    ) THEN
        CREATE POLICY "Restricted access to consent_records" ON public.consent_records
            FOR ALL 
            USING ( (SELECT auth.jwt() ->> 'role') = 'service_role' OR (SELECT auth.uid()) IN (SELECT id FROM public.usuarios WHERE role IN ('admin', 'master', 'master_manager')) );
    END IF;
END $$;

-- 3. Fix Mutable search_path in Functions (Prevents Search Path Injection)
-- We alter them explicitly.
ALTER FUNCTION public.fn_audit_log_trigger() SET search_path = public;
ALTER FUNCTION public.fn_update_inscritos_count() SET search_path = public;
-- Handle reconcile_transaction safely in case its signature varies or missing.
DO $$ 
BEGIN
    -- We dynamically alter any function named reconcile_transaction
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'reconcile_transaction') THEN
        EXECUTE 'ALTER FUNCTION public.reconcile_transaction SET search_path = public;';
    END IF;
END $$;

-- 4. Fix Security Definer View
-- Security_invoker guarantees that the view executes with the permissions of the calling user.
ALTER VIEW public.view_pessoas_listagem SET (security_invoker = true);
