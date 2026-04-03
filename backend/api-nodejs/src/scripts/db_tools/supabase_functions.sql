-- ============================================================
-- 📊 FUNÇÃO: get_occupancy_flow
-- Retorna o fluxo de check-ins e check-outs agrupados por hora
-- para as últimas N horas de um evento específico.
-- 
-- Como usar no Supabase Dashboard:
--   1. Acesse: Database > SQL Editor
--   2. Cole e execute este script
--   3. O endpoint /api/monitor/dashboard vai funcionar automaticamente
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_occupancy_flow(
    p_evento_id uuid,
    p_days int DEFAULT 1
)
RETURNS TABLE (
    hora int,
    checkins bigint,
    checkouts bigint
)
LANGUAGE sql
STABLE
AS $$
    WITH 
    -- Série de horas das últimas N*24 horas
    horas AS (
        SELECT
            date_trunc('hour', now() - (generate_series(0, p_days * 24 - 1) * INTERVAL '1 hour')) AS hora_inicio
    ),
    -- Logs agrupados por hora
    logs_por_hora AS (
        SELECT
            date_trunc('hour', created_at) AS hora_inicio,
            tipo,
            COUNT(*) AS total
        FROM public.logs_acesso
        WHERE
            evento_id = p_evento_id
            AND created_at >= now() - (p_days * INTERVAL '1 day')
        GROUP BY date_trunc('hour', created_at), tipo
    )
    SELECT
        EXTRACT(HOUR FROM h.hora_inicio)::int            AS hora,
        COALESCE(ci.total, 0)                            AS checkins,
        COALESCE(co.total, 0)                            AS checkouts
    FROM horas h
    LEFT JOIN logs_por_hora ci
        ON ci.hora_inicio = h.hora_inicio AND ci.tipo = 'checkin'
    LEFT JOIN logs_por_hora co
        ON co.hora_inicio = h.hora_inicio AND co.tipo = 'checkout'
    ORDER BY h.hora_inicio ASC;
$$;

-- Conceder permissão de execução para usuários autenticados
GRANT EXECUTE ON FUNCTION public.get_occupancy_flow(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_occupancy_flow(uuid, int) TO service_role;

-- Teste rápido (substitua pelo evento_id real):
-- SELECT * FROM public.get_occupancy_flow('SEU-EVENTO-ID-AQUI', 1);
