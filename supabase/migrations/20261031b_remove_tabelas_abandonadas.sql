-- Remove tabelas abandonadas (31/10/2026): duplicatas antigas que o sistema não usa.
-- Conferido antes: nenhuma é lida ou gravada pelo código, nenhuma tabela, view ou função
-- depende delas, e todas estão vazias (camera_settings tem só a linha de configuração da IA antiga).
--   webhooks, api_keys          → o sistema usa system_webhooks e system_api_keys
--   camera_*                    → IA antiga; hoje: cameras_ip + motor local + watchlist
--   monitor_watchlist           → watchlist
--   logs_acesso_veiculos        → logs_veiculos
--   funcionarios_backup         → cópia antiga de pessoas
-- Proteção: se alguma tabela tiver dados, nada é apagado e a migração para com erro.

do $$
declare
    t text;
    n bigint;
begin
    foreach t in array array['webhooks', 'api_keys', 'camera_watchlist_cpf', 'camera_watchlist_placa',
                             'camera_devices', 'camera_face_embeddings', 'camera_detections', 'camera_known_plates',
                             'monitor_watchlist', 'logs_acesso_veiculos', 'funcionarios_backup'] loop
        if to_regclass('public.' || t) is not null then
            execute format('select count(*) from public.%I', t) into n;
            if n > 0 then
                raise exception 'A tabela % tem % linha(s): nada foi apagado. Confira antes de remover.', t, n;
            end if;
        end if;
    end loop;
end $$;

drop table if exists public.webhooks;
drop table if exists public.api_keys;
drop table if exists public.camera_watchlist_cpf;
drop table if exists public.camera_watchlist_placa;
drop table if exists public.camera_detections;
drop table if exists public.camera_face_embeddings;
drop table if exists public.camera_known_plates;
drop table if exists public.camera_devices;
drop table if exists public.camera_settings;
drop table if exists public.monitor_watchlist;
drop table if exists public.logs_acesso_veiculos;
drop table if exists public.funcionarios_backup;
